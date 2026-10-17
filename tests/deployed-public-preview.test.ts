import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  previewOrigin,
  publicSources,
  verifyPublicPreview,
  verifySource,
} from '../scripts/preview-smoke.mjs';

const manifest = JSON.parse(
  readFileSync(new URL('../policy/SOURCE_MANIFEST.json', import.meta.url), 'utf8'),
);
const commit = '0123456789abcdef0123456789abcdef01234567';
const otherCommit = 'abcdef0123456789abcdef0123456789abcdef01';
const source = {
  path: 'policy/Speech.srt',
  filename: 'Speech.srt',
  slug: 'speech',
  bytes: 3,
  sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  contentType: 'application/x-subrip; charset=utf-8',
};

function headers(document = source) {
  return {
    'content-type': document.contentType,
    'content-length': String(document.bytes),
    'content-disposition': `attachment; filename="${document.filename}"`,
    'x-content-type-options': 'nosniff',
    'x-robots-tag': 'noindex',
    'x-content-sha256': document.sha256,
    etag: `"${document.sha256}"`,
    'cache-control': 'public, max-age=3600, must-revalidate',
  };
}

function html(body: string) {
  return new Response(body, {
    headers: {
      'content-security-policy': "script-src 'nonce-YWJjZGVmZ2hpamtsbW5vcHFy' 'strict-dynamic'",
    },
  });
}

function health(revision = commit, protectedIntake = false) {
  return Response.json({
    status: 'ok',
    service: 'cornerstone-public',
    mode: 'proposal',
    protectedIntake,
    commit: revision,
  });
}

function hostedFixture() {
  const documents = publicSources(manifest);
  return vi.fn(async (url: string, init: RequestInit) => {
    if (url === `${previewOrigin}/api/healthz`) return health();
    if (url === previewOrigin) return html('<h1>When policy takes</h1>');
    if (url === `${previewOrigin}/policy`)
      return html(
        documents.map((document) => `<a href="/documents/${document.slug}">Source</a>`).join(''),
      );
    if (url === `${previewOrigin}/events/C-001`)
      return html(
        'C-001 · research only · No certification or individual finding · Citation audit · Workbook <a href="/documents/event-evidence">Original</a>',
      );
    if (url === `${previewOrigin}/documents/not-a-registered-source`)
      return new Response('Document not found', { status: 404 });
    const document = documents.find((item) => url === `${previewOrigin}/documents/${item.slug}`);
    if (!document) throw Error(`Unexpected request: ${url}`);
    if (new Headers(init.headers).get('if-none-match'))
      return new Response(null, { status: 304, headers: headers(document) });
    return new Response(readFileSync(new URL(`../${document.path}`, import.meta.url)), {
      headers: headers(document),
    });
  });
}

describe('hosted original integrity', () => {
  it('hashes the actual stream and checks a conditional download at the fixed origin', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('a'));
        controller.enqueue(new TextEncoder().encode('bc'));
        controller.close();
      },
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(stream, { headers: headers() }))
      .mockResolvedValueOnce(new Response(null, { status: 304, headers: headers() }));
    expect(await verifySource(fetchImpl, source)).toEqual({
      path: 'policy/Speech.srt',
      bytes: 3,
      sha256: source.sha256,
      conditionalStatus: 304,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${previewOrigin}/documents/speech`);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({
      redirect: 'error',
      cache: 'no-store',
      headers: { 'Accept-Encoding': 'identity' },
    });
    expect(fetchImpl.mock.calls[1][1].headers['If-None-Match']).toBe(`"${source.sha256}"`);
  });

  it.each([
    ['abd', 'incorrect SHA-256'],
    ['ab', 'truncated'],
    ['abcd', 'exceeds its byte bound'],
  ])(
    'rejects incorrect body %s even when the server advertises the approved hash',
    async (body, failure) => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response(body, { headers: headers() }));
      await expect(verifySource(fetchImpl, source)).rejects.toThrow(failure);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it('cancels an oversized stream before reading the rest', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('too much'));
      },
      cancel,
    });
    await expect(
      verifySource(async () => new Response(stream, { headers: headers() }), source),
    ).rejects.toThrow('byte bound');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([
    ['content-type', 'text/html'],
    ['content-length', '2'],
    ['content-disposition', 'inline'],
    ['x-content-type-options', ''],
    ['x-robots-tag', 'index'],
    ['x-content-sha256', '0'.repeat(64)],
    ['etag', '"stale"'],
    ['cache-control', 'public, max-age=3600'],
  ])('rejects incorrect %s metadata', async (name, value) => {
    await expect(
      verifySource(
        async () =>
          new Response('abc', {
            headers: { ...headers(), [name]: value },
          }),
        source,
      ),
    ).rejects.toThrow('metadata');
  });

  it.each([200, 404, 503])('rejects an incorrect conditional status %i', async (status) => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('abc', { headers: headers() }))
      .mockResolvedValueOnce(new Response('unexpected', { status, headers: headers() }));
    await expect(verifySource(fetchImpl, source)).rejects.toThrow('304');
  });

  it('rejects unavailable originals and followed redirects', async () => {
    await expect(
      verifySource(async () => new Response('unavailable', { status: 503 }), source),
    ).rejects.toThrow('unavailable');
    const response = new Response('abc', { headers: headers() });
    Object.defineProperty(response, 'redirected', { value: true });
    await expect(verifySource(async () => response, source)).rejects.toThrow('redirect');
  });
});

describe('public release acceptance', () => {
  it('records all seven independent original hashes and brackets the run with exact revision checks', async () => {
    const fetchImpl = hostedFixture();
    const result = await verifyPublicPreview({ expectedCommit: commit, manifest, fetchImpl });
    expect(result).toMatchObject({
      commit,
      mode: 'proposal',
      protectedIntake: false,
      sourceCount: 7,
      unknownDocumentStatus: 404,
    });
    expect(result.sourceBytes).toBe(4746977);
    expect(result.documents).toEqual(
      manifest.sources.map((item) => ({
        path: item.path,
        bytes: item.bytes,
        sha256: item.sha256,
        conditionalStatus: 304,
      })),
    );
    expect(fetchImpl.mock.calls[0][0]).toBe(`${previewOrigin}/api/healthz`);
    expect(fetchImpl.mock.calls.at(-1)?.[0]).toBe(`${previewOrigin}/api/healthz`);
  });

  it('waits for the requested deployment and then verifies once', async () => {
    const fetchImpl = hostedFixture().mockResolvedValueOnce(health(otherCommit));
    const wait = vi.fn(async () => {});
    const result = await verifyPublicPreview({ expectedCommit: commit, manifest, fetchImpl, wait });
    expect(result.commit).toBe(commit);
    expect(wait).toHaveBeenCalledOnce();
  });

  it.each([health(otherCommit), health(commit, true)])(
    'fails bounded readiness for a stale or protected release',
    async (response) => {
      let clock = 0;
      const fetchImpl = vi.fn(async () => response.clone());
      await expect(
        verifyPublicPreview({
          expectedCommit: commit,
          manifest,
          fetchImpl,
          now: () => clock,
          timeoutMs: 10,
          pollMs: 5,
          wait: async (delay: number) => {
            clock += delay;
          },
        }),
      ).rejects.toThrow(/exact checked|public-only/);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    },
  );

  it('fails if a newer release replaces the checked release during verification', async () => {
    const original = hostedFixture();
    let healthCalls = 0;
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/api/healthz') && ++healthCalls === 2) return health(otherCommit);
      return original(url, init);
    });
    await expect(
      verifyPublicPreview({ expectedCommit: commit, manifest, fetchImpl }),
    ).rejects.toThrow('exact checked');
  });

  it.each([
    "script-src 'strict-dynamic'",
    "default-src 'nonce-YWJjZGVmZ2hpamtsbW5vcHFy' 'strict-dynamic'",
  ])('requires the script-src nonce rather than a CSP substring: %s', async (policy) => {
    const original = hostedFixture();
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) =>
      url === previewOrigin
        ? new Response('When policy takes', { headers: { 'content-security-policy': policy } })
        : original(url, init),
    );
    await expect(
      verifyPublicPreview({ expectedCommit: commit, manifest, fetchImpl }),
    ).rejects.toThrow('content security policy');
  });

  it.each([
    ['/policy', '<a href="/documents/speech">Only one source</a>', 'does not link'],
    ['/events/C-001', '<p>C-001: certified</p>', 'scope, provenance'],
  ])(
    'fails missing public safeguards on %s without retrying an already ready release',
    async (path, body, failure) => {
      const original = hostedFixture();
      const fetchImpl = vi.fn(async (url: string, init: RequestInit) =>
        url === `${previewOrigin}${path}` ? html(body) : original(url, init),
      );
      const wait = vi.fn();
      await expect(
        verifyPublicPreview({ expectedCommit: commit, manifest, fetchImpl, wait }),
      ).rejects.toThrow(failure);
      expect(wait).not.toHaveBeenCalled();
    },
  );

  it('rejects an unregistered download instead of treating it as another public file', async () => {
    const original = hostedFixture();
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) =>
      url.endsWith('/not-a-registered-source')
        ? new Response('unexpected file')
        : original(url, init),
    );
    await expect(
      verifyPublicPreview({ expectedCommit: commit, manifest, fetchImpl }),
    ).rejects.toThrow('unregistered');
  });

  it('rejects unsafe manifest entries and ambiguous routes before requesting the preview', async () => {
    for (const change of [
      { path: 'policy/../private.docx' },
      { path: 'https://elsewhere.example/file.docx' },
      { bytes: 0 },
      { bytes: 9 * 1024 * 1024 },
      { sha256: 'unverified' },
      { path: manifest.sources[1].path },
    ]) {
      const invalid = structuredClone(manifest);
      Object.assign(invalid.sources[0], change);
      const fetchImpl = vi.fn();
      await expect(
        verifyPublicPreview({ expectedCommit: commit, manifest: invalid, fetchImpl }),
      ).rejects.toThrow();
      expect(fetchImpl).not.toHaveBeenCalled();
    }
    expect(() => publicSources({ ...manifest, sources: manifest.sources.slice(1) })).toThrow(
      'seven-source',
    );
    expect(() => publicSources({ ...manifest, publication: {} })).toThrow('seven-source');
  });

  it.each([undefined, 'main', commit.slice(1)])(
    'requires an exact revision before making requests',
    async (expectedCommit) => {
      const fetchImpl = vi.fn();
      await expect(verifyPublicPreview({ expectedCommit, manifest, fetchImpl })).rejects.toThrow(
        'exact preview commit',
      );
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );
});
