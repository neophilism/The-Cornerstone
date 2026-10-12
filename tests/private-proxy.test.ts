import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { forwardPrivateRequest, privateProxyLimits } from '../packages/ui/src/proxy.js';
const config = {
  apiOrigin: 'http://127.0.0.1:4010',
  browserOrigin: 'https://portal.example',
  internalKey: 'synthetic-internal-key',
};
const req = (body = '{}', extra: RequestInit = {}) =>
  new Request('https://portal.example/api/private/commands?mode=synthetic', {
    method: 'POST',
    headers: { Origin: config.browserOrigin, 'Content-Type': 'application/json' },
    body,
    ...extra,
  });
const read = (extra: RequestInit = {}) =>
  new Request('https://portal.example/api/private/records?recordId=synthetic', extra);
function send(response = Response.json({ ok: true })) {
  return vi.fn<typeof fetch>().mockResolvedValue(response);
}
function privateResponse(response: Response) {
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('pragma')).toBe('no-cache');
  expect(response.headers.get('expires')).toBe('0');
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
}
function streamed(body: ReadableStream<Uint8Array>) {
  return new Request('https://portal.example/api/private/commands', {
    method: 'POST',
    headers: { Origin: config.browserOrigin },
    body,
    duplex: 'half',
  } as RequestInit);
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('private server proxy transport', () => {
  it('preserves the exact body/query and only forwards allowlisted headers', async () => {
    const upstream = send();
    const body = '{"retryKey":"synthetic-once","text":"original"}';
    const response = await forwardPrivateRequest(
      req(body, {
        headers: {
          Origin: config.browserOrigin,
          'Content-Type': 'application/json',
          Cookie: 'test-session=invented',
          'X-CSRF-Token': 'invented-csrf',
          'X-Internal-Key': 'spoofed',
          Authorization: 'spoofed',
          'X-Forwarded-Host': 'attacker.example',
        },
      }),
      ['commands'],
      config,
      upstream,
    );
    expect(upstream).toHaveBeenCalledTimes(1);
    const [url, init] = upstream.mock.calls[0]!;
    expect(String(url)).toBe(config.apiOrigin + '/commands?mode=synthetic');
    expect(init?.body).toBe(body);
    expect(init?.redirect).toBe('manual');
    expect(init?.cache).toBe('no-store');
    const headers = new Headers(init?.headers);
    expect(Object.fromEntries(headers)).toEqual({
      'content-type': 'application/json',
      cookie: 'test-session=invented',
      origin: config.browserOrigin,
      'x-csrf-token': 'invented-csrf',
      'x-internal-key': config.internalKey,
    });
    expect(await response.json()).toEqual({ ok: true });
    privateResponse(response);
  });
  it.each([
    { segments: ['../commands'] },
    { segments: ['commands/'] },
    { segments: ['auth', '..', 'commands'] },
    { segments: ['https:', 'evil.example'] },
    { segments: [] },
  ])('rejects unknown path $segments before forwarding', async ({ segments }) => {
    const upstream = send();
    const response = await forwardPrivateRequest(req(), segments, config, upstream);
    expect(response.status).toBe(404);
    privateResponse(response);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each(['https://other.example', '', 'null'])(
    'rejects a missing or incorrect write origin %s',
    async (origin) => {
      const upstream = send();
      const response = await forwardPrivateRequest(
        req('{}', { headers: origin ? { Origin: origin } : {} }),
        ['commands'],
        config,
        upstream,
      );
      expect(response.status).toBe(403);
      privateResponse(response);
      expect(upstream).not.toHaveBeenCalled();
    },
  );
  it('rejects unsupported methods with no-store and an Allow header', async () => {
    const upstream = send();
    const response = await forwardPrivateRequest(
      read({ method: 'DELETE' }),
      ['records'],
      config,
      upstream,
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, POST');
    privateResponse(response);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([
    undefined,
    'not-a-url',
    'file:///tmp/data',
    'http://user:pass@api.example',
    'https://api.example/path',
    'https://api.example/?token=x',
  ])('rejects unsafe API configuration without disclosing it: %s', async (apiOrigin) => {
    const upstream = send();
    const response = await forwardPrivateRequest(
      read(),
      ['records'],
      { ...config, apiOrigin },
      upstream,
    );
    expect(response.status).toBe(503);
    privateResponse(response);
    expect(upstream).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain('user:pass');
  });
  it('does not send caller-provided internal credentials when no server key is configured', async () => {
    const upstream = send();
    await forwardPrivateRequest(
      read({ headers: { 'X-Internal-Key': 'spoof' } }),
      ['records'],
      { ...config, internalKey: undefined },
      upstream,
    );
    expect(new Headers(upstream.mock.calls[0]![1]?.headers).has('x-internal-key')).toBe(false);
  });
  it('allows the exact request limit and rejects the first excess byte before forwarding', async () => {
    const okay = send();
    const accepted = await forwardPrivateRequest(
      req('x'.repeat(privateProxyLimits.requestBytes)),
      ['commands'],
      config,
      okay,
    );
    expect(accepted.status).toBe(200);
    expect(okay).toHaveBeenCalledTimes(1);
    const denied = send();
    const response = await forwardPrivateRequest(
      req('x'.repeat(privateProxyLimits.requestBytes + 1)),
      ['commands'],
      config,
      denied,
    );
    expect(response.status).toBe(413);
    expect((await response.json()).code).toBe('REQUEST_TOO_LARGE');
    privateResponse(response);
    expect(denied).not.toHaveBeenCalled();
  });
  it('rejects invalid UTF-8 without forwarding', async () => {
    const upstream = send();
    const response = await forwardPrivateRequest(
      streamed(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array([0xff]));
            c.close();
          },
        }),
      ),
      ['commands'],
      config,
      upstream,
    );
    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe('INVALID_REQUEST_BODY');
    privateResponse(response);
    expect(upstream).not.toHaveBeenCalled();
  });
  it('the deadline includes an incoming body that never finishes', async () => {
    vi.useFakeTimers();
    const canceled = vi.fn();
    const upstream = send();
    const result = forwardPrivateRequest(
      streamed(new ReadableStream({ cancel: canceled })),
      ['commands'],
      config,
      upstream,
    );
    await vi.advanceTimersByTimeAsync(privateProxyLimits.timeoutMs);
    const response = await result;
    expect(response.status).toBe(503);
    privateResponse(response);
    expect(upstream).not.toHaveBeenCalled();
    expect(canceled).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('a pre-aborted request never reaches the API', async () => {
    const controller = new AbortController();
    controller.abort();
    const upstream = send();
    const response = await forwardPrivateRequest(
      req('{}', { signal: controller.signal }),
      ['commands'],
      config,
      upstream,
    );
    expect(response.status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
    privateResponse(response);
  });
  it('lost write responses are unknown outcomes, not assertions of failure; no automatic retry', async () => {
    const upstream = vi
      .fn<typeof fetch>()
      .mockRejectedValue(Error('sensitive internal stack detail'));
    const response = await forwardPrivateRequest(req(), ['commands'], config, upstream);
    expect(response.status).toBe(503);
    const error = await response.json();
    expect(error.code).toBe('REQUEST_OUTCOME_UNKNOWN');
    expect(error.message).toContain('may already have completed');
    expect(error.message).toContain('same request and retry key');
    expect(error.message).not.toContain('No successful receipt');
    expect(error.message).not.toContain('sensitive');
    privateResponse(response);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it.each([500, 502, 503, 504])(
    'an upstream %i write response is sanitized and uncertain',
    async (status) => {
      const upstream = send(
        new Response('private stack', { status, headers: { 'Retry-After': '30' } }),
      );
      const response = await forwardPrivateRequest(req(), ['commands'], config, upstream);
      expect(response.status).toBe(503);
      expect((await response.json()).code).toBe('REQUEST_OUTCOME_UNKNOWN');
      expect(response.headers.get('retry-after')).toBe('30');
      privateResponse(response);
    },
  );
  it('normalizes HTML 401 responses while preserving separate session-deletion cookies', async () => {
    const headers = new Headers({ 'Content-Type': 'text/html' });
    headers.append('Set-Cookie', 'session=; Max-Age=0; HttpOnly');
    headers.append('Set-Cookie', 'csrf=; Max-Age=0');
    const response = await forwardPrivateRequest(
      read(),
      ['records'],
      config,
      send(new Response('<html>Denied</html>', { status: 401, headers })),
    );
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe('SESSION_EXPIRED');
    expect(response.headers.getSetCookie()).toEqual(headers.getSetCookie());
    privateResponse(response);
  });
  it('preserves ordinary application rejections rather than relabeling a stale save', async () => {
    const value = { code: 'STALE_VERSION', message: 'Review the current draft.' };
    const response = await forwardPrivateRequest(
      req(),
      ['commands'],
      config,
      send(Response.json(value, { status: 409 })),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual(value);
    privateResponse(response);
  });
  it('preserves exact binary downloads and attachment headers', async () => {
    const bytes = new Uint8Array([0, 255, 128, 17]);
    const response = await forwardPrivateRequest(
      read(),
      ['evidence', 'download'],
      config,
      send(
        new Response(bytes, {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': 'attachment; filename="synthetic.bin"',
          },
        }),
      ),
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get('content-disposition')).toContain('synthetic.bin');
    privateResponse(response);
  });
  it.each([204, 205, 304])('preserves a null-body response with status %i', async (status) => {
    const response = await forwardPrivateRequest(
      read(),
      ['records'],
      config,
      send(new Response(null, { status })),
    );
    expect(response.status).toBe(status);
    expect(response.body).toBeNull();
    privateResponse(response);
  });
  it.each(['/', 'https://identity.example/authorize?state=synthetic'])(
    'preserves an allowed authentication redirect %s',
    async (location) => {
      const response = await forwardPrivateRequest(
        read(),
        ['auth', 'start'],
        config,
        send(new Response(null, { status: 302, headers: { Location: location } })),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(location);
      privateResponse(response);
    },
  );
  it.each([
    '//evil.example',
    '/unexpected',
    'javascript:alert(1)',
    'http://identity.example',
    'https://secret@identity.example',
  ])('refuses unsafe redirect %s', async (location) => {
    const response = await forwardPrivateRequest(
      read(),
      ['auth', 'start'],
      config,
      send(new Response(null, { status: 302, headers: { Location: location } })),
    );
    expect(response.status).toBe(503);
    expect(response.headers.has('location')).toBe(false);
    privateResponse(response);
  });
  it('response buffering is bounded and cancels an oversized stream', async () => {
    const cancel = vi.fn();
    const upstream = send(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array(privateProxyLimits.responseBytes + 1));
          },
          cancel,
        }),
      ),
    );
    const response = await forwardPrivateRequest(read(), ['records'], config, upstream);
    expect(response.status).toBe(503);
    expect(cancel).toHaveBeenCalledTimes(1);
    privateResponse(response);
  });
  it('a response-body failure after forwarding a write remains unknown', async () => {
    const response = await forwardPrivateRequest(
      req(),
      ['commands'],
      config,
      send(
        new Response(
          new ReadableStream({
            start(c) {
              c.error(Error('sensitive stream error'));
            },
          }),
        ),
      ),
    );
    expect((await response.json()).code).toBe('REQUEST_OUTCOME_UNKNOWN');
    privateResponse(response);
  });
  it('bounds the full exchange, including a stalled successful response body', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const upstream = send(new Response(new ReadableStream({ cancel })));
    const result = forwardPrivateRequest(req(), ['commands'], config, upstream);
    await vi.advanceTimersByTimeAsync(privateProxyLimits.timeoutMs);
    const response = await result;
    expect((await response.json()).code).toBe('REQUEST_OUTCOME_UNKNOWN');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    privateResponse(response);
  });
  it('aborts a forwarded request and discards a late response without retrying', async () => {
    vi.useFakeTimers();
    let resolve!: (response: Response) => void;
    const upstream = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const result = forwardPrivateRequest(req(), ['commands'], config, upstream);
    await vi.advanceTimersByTimeAsync(privateProxyLimits.timeoutMs);
    expect((await (await result).json()).code).toBe('REQUEST_OUTCOME_UNKNOWN');
    expect(upstream.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    const cancel = vi.fn();
    resolve(new Response(new ReadableStream({ cancel })));
    await Promise.resolve();
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('sanitizes interrupted reads without implying that a save failed', async () => {
    const upstream = vi.fn<typeof fetch>().mockRejectedValue(Error('private-url-and-stack'));
    const response = await forwardPrivateRequest(read(), ['records'], config, upstream);
    expect((await response.json()).code).toBe('SERVICE_UNAVAILABLE');
    privateResponse(response);
  });
  it('is forbidden in a browser runtime', async () => {
    vi.stubGlobal('window', {});
    await expect(forwardPrivateRequest(read(), ['records'], config, send())).rejects.toThrow(
      'server-only',
    );
  });
  it('handles a real HTTP connection loss after the upstream received the write exactly once', async () => {
    let count = 0,
      received = '';
    const server = createServer((request, response) => {
      count++;
      request.setEncoding('utf8');
      request.on('data', (chunk: string) => {
        received += chunk;
      });
      request.on('end', () => response.destroy());
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('Test server missing port');
    try {
      const body = '{"idempotencyKey":"synthetic-only","action":"save_draft"}';
      const response = await forwardPrivateRequest(req(body), ['commands'], {
        ...config,
        apiOrigin: `http://127.0.0.1:${address.port}`,
      });
      expect((await response.json()).code).toBe('REQUEST_OUTCOME_UNKNOWN');
      expect(count).toBe(1);
      expect(received).toBe(body);
      privateResponse(response);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
