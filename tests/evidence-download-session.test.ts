import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import type { EvidenceView } from '@cornerstone/contracts';
import { downloadSessionEvidence } from '../packages/ui/src/evidence-download-session.js';

const content = 'Invented attachment session fixture: café.\n';
function fixture(): EvidenceView {
  return {
    id: randomUUID(),
    recordId: randomUUID(),
    uploaderId: randomUUID(),
    filename: 'invented-session.txt',
    description: 'Invented attachment for session isolation',
    plaintextSha256: createHash('sha256').update(content).digest('hex'),
    byteLength: Buffer.byteLength(content),
    state: 'clean',
    createdAt: '2026-10-17T12:00:00Z',
    checkedAt: '2026-10-17T12:01:00Z',
    checkMethod: 'synthetic_text_v1',
    rejectionCode: null,
    mediaType: 'text/plain',
    realm: 'simulation',
    classification: 'synthetic_evidence',
    securityScan: 'not_performed',
    legalAcceptance: false,
  };
}
function session() {
  let generation = 1;
  return {
    current: () => generation,
    expire: vi.fn(() => generation++),
    replace: () => generation++,
  };
}
afterEach(() => vi.restoreAllMocks());

describe('attachment downloads bound to the current workspace session', () => {
  it('returns verified bytes with the existing authenticated, uncached, abortable request', async () => {
    const item = fixture(),
      scope = session(),
      controller = new AbortController();
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(content, { headers: { 'content-type': 'text/plain; charset=utf-8' } }),
      );
    const downloaded = await downloadSessionEvidence(item, controller.signal, scope);
    expect(Buffer.from(downloaded.bytes).toString('utf8')).toBe(content);
    expect(downloaded.isCurrent()).toBe(true);
    expect(fetch).toHaveBeenCalledWith('/api/private/evidence/download?id=' + item.id, {
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    expect(scope.expire).not.toHaveBeenCalled();
  });

  it('invalidates already verified bytes before release when the session changes', async () => {
    const scope = session();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(content, { headers: { 'content-type': 'text/plain' } }),
    );
    const downloaded = await downloadSessionEvidence(
      fixture(),
      new AbortController().signal,
      scope,
    );
    expect(downloaded.isCurrent()).toBe(true);
    scope.replace();
    expect(downloaded.isCurrent()).toBe(false);
    expect(scope.expire).not.toHaveBeenCalled();
  });

  it('clears the current session on a final 401 even when the body is not JSON', async () => {
    const scope = session();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>Expired session</html>', {
        status: 401,
        headers: { 'content-type': 'text/html' },
      }),
    );
    await expect(
      downloadSessionEvidence(fixture(), new AbortController().signal, scope),
    ).rejects.toThrow();
    expect(scope.expire).toHaveBeenCalledOnce();
  });

  it('keeps the session when current attachment access alone is denied', async () => {
    const scope = session();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Denied', { status: 403 }));
    await expect(
      downloadSessionEvidence(fixture(), new AbortController().signal, scope),
    ).rejects.toThrow(/denied/);
    expect(scope.expire).not.toHaveBeenCalled();
  });

  for (const status of [200, 401])
    it('discards a held ' + status + ' without expiring the replacement session', async () => {
      const scope = session();
      let release!: (value: Response) => void;
      vi.spyOn(globalThis, 'fetch').mockReturnValue(
        new Promise<Response>((resolve) => (release = resolve)),
      );
      const pending = downloadSessionEvidence(fixture(), new AbortController().signal, scope);
      scope.replace();
      release(new Response(content, { status, headers: { 'content-type': 'text/plain' } }));
      await expect(pending).rejects.toThrow(/no longer belongs/);
      expect(scope.expire).not.toHaveBeenCalled();
    });

  for (const change of ['session replacement', 'cancellation'])
    it('cannot release verified bytes after ' + change + ' while reading the stream', async () => {
      const scope = session(),
        abort = new AbortController();
      let body!: ReadableStreamDefaultController<Uint8Array>, observed!: () => void;
      const reading = new Promise<void>((resolve) => (observed = resolve));
      const stream = new ReadableStream<Uint8Array>(
        {
          start(controller) {
            body = controller;
          },
          pull() {
            observed();
          },
        },
        { highWaterMark: 0 },
      );
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(stream, { headers: { 'content-type': 'text/plain' } }),
      );
      const pending = downloadSessionEvidence(fixture(), abort.signal, scope);
      await reading;
      if (change === 'session replacement') scope.replace();
      else abort.abort();
      body.enqueue(new TextEncoder().encode(content));
      body.close();
      await expect(pending).rejects.toThrow(/no longer belongs/);
      expect(scope.expire).not.toHaveBeenCalled();
    });
});
