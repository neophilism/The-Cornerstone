/** Server-side transport only. Authorization and transaction receipts remain the API's responsibility. */
export type PrivateProxyConfig = {
  apiOrigin?: string | undefined;
  browserOrigin: string;
  internalKey?: string | undefined;
};
export const privateProxyLimits = {
  requestBytes: 2 * 1024 * 1024,
  responseBytes: 16 * 1024 * 1024,
  timeoutMs: 15000,
} as const;
const routes = new Set([
  'status',
  'me',
  'workflows',
  'records',
  'published-offers',
  'receipts',
  'commands',
  'memberships',
  'memberships/roll',
  'memberships/respond',
  'governance',
  'access',
  'access/grant',
  'access/revoke',
  'evidence',
  'evidence/upload',
  'evidence/validate',
  'evidence/download',
  'notifications',
  'notifications/read',
  'auth/local',
  'auth/logout',
  'auth/sessions',
  'auth/sessions/revoke',
  'auth/sessions/revoke-others',
  'auth/sessions/revoke-selected',
  'auth/start',
  'auth/callback',
]);
const privateHeaders = {
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
  Expires: '0',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
class BodyLimitError extends Error {}
class EncodingError extends Error {}
function failure(status: number, code: string, message: string): Response {
  return Response.json({ code, message }, { status, headers: privateHeaders });
}
function origin(value: string): string {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw Error('Invalid private service origin.');
  return url.origin;
}
function pending<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  discard?: (value: T) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let finished = false;
    const abort = () => {
      if (finished) return;
      finished = true;
      signal.removeEventListener('abort', abort);
      reject(Error('Private request interrupted.'));
    };
    signal.addEventListener('abort', abort, { once: true });
    // Always observe the promise, including when the signal was already aborted.
    promise.then(
      (value) => {
        if (finished) {
          discard?.(value);
          return;
        }
        finished = true;
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        if (finished) return;
        finished = true;
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
    if (signal.aborted) abort();
  });
}
function cancelResponse(response: Response): void {
  if (response.body && !response.body.locked) void response.body.cancel().catch(() => {});
}
function decode(body: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    throw new EncodingError();
  }
}
async function bytes(body: ReadableStream<Uint8Array> | null, limit: number, signal: AbortSignal) {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await pending(reader.read(), signal);
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new BodyLimitError();
      parts.push(value);
    }
  } catch (error) {
    // A disconnected or uncooperative source must not hold the response open during cleanup.
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* cancellation owns an outstanding read */
    }
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}
function copyResponseHeaders(source: Response, target: Response) {
  for (const cookie of source.headers.getSetCookie()) target.headers.append('Set-Cookie', cookie);
  for (const name of ['content-disposition', 'retry-after']) {
    const value = source.headers.get(name);
    if (value) target.headers.set(name, value);
  }
}
function unknownOutcome(): Response {
  return failure(
    503,
    'REQUEST_OUTCOME_UNKNOWN',
    'The service response could not be confirmed. The request may already have completed. For a save, retry the same request and retry key; do not assume it failed.',
  );
}

/** No automatic retries, caller-selected destinations, or caller-supplied internal credentials. */
export async function forwardPrivateRequest(
  request: Request,
  segments: readonly string[],
  config: PrivateProxyConfig,
  send: typeof fetch = fetch,
): Promise<Response> {
  if (typeof window !== 'undefined') throw Error('Private proxy is server-only.');
  if (!['GET', 'POST'].includes(request.method)) {
    const response = failure(405, 'METHOD_NOT_ALLOWED', 'Use a supported request method.');
    response.headers.set('Allow', 'GET, POST');
    return response;
  }
  const route = segments.join('/');
  if (!routes.has(route)) return failure(404, 'NOT_FOUND', 'Endpoint not found.');
  let api: string, expected: string;
  try {
    if (!config.apiOrigin) throw Error('Unavailable');
    api = origin(config.apiOrigin);
    expected = origin(config.browserOrigin);
  } catch {
    return failure(
      503,
      'SERVICE_UNAVAILABLE',
      'Protected services are not open. The private API is not configured correctly.',
    );
  }
  if (request.method === 'POST' && request.headers.get('origin') !== expected)
    return failure(403, 'ORIGIN_REQUIRED', 'Submit from the approved website origin.');
  const control = new AbortController();
  const interrupt = () => control.abort();
  const timer = setTimeout(interrupt, privateProxyLimits.timeoutMs);
  request.signal.addEventListener('abort', interrupt, { once: true });
  if (request.signal.aborted) control.abort();
  let forwarded = false;
  let upstream: Response | undefined;
  try {
    const headers = new Headers();
    for (const name of ['content-type', 'cookie', 'x-csrf-token']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set('Origin', expected);
    if (config.internalKey) headers.set('X-Internal-Key', config.internalKey);
    const body =
      request.method === 'POST'
        ? decode(await bytes(request.body, privateProxyLimits.requestBytes, control.signal))
        : undefined;
    if (control.signal.aborted) throw Error('Interrupted before forwarding.');
    const target = new URL('/' + route, api);
    target.search = new URL(request.url).search;
    // Once handed to fetch, neither an abort nor a lost response proves rollback.
    forwarded = true;
    upstream = await pending(
      send(target, {
        method: request.method,
        headers,
        cache: 'no-store',
        redirect: 'manual',
        signal: control.signal,
        ...(body === undefined ? {} : { body }),
      }),
      control.signal,
      cancelResponse,
    );
    if (upstream.status === 401) {
      const response = failure(401, 'SESSION_EXPIRED', 'Your session expired. Sign in again.');
      copyResponseHeaders(upstream, response);
      cancelResponse(upstream);
      return response;
    }
    if (request.method === 'POST' && upstream.status >= 500) {
      const response = unknownOutcome();
      copyResponseHeaders(upstream, response);
      cancelResponse(upstream);
      return response;
    }
    const location = upstream.headers.get('location');
    if (location && location !== '/') {
      const redirect = new URL(location);
      if (redirect.protocol !== 'https:' || redirect.username || redirect.password)
        throw Error('Unexpected authentication redirect.');
    }
    const content = await bytes(upstream.body, privateProxyLimits.responseBytes, control.signal);
    const response = new Response([204, 205, 304].includes(upstream.status) ? null : content, {
      status: upstream.status,
      headers: {
        ...privateHeaders,
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
      },
    });
    copyResponseHeaders(upstream, response);
    if (location) response.headers.set('Location', location);
    return response;
  } catch (error) {
    control.abort();
    if (upstream) cancelResponse(upstream);
    if (forwarded && request.method === 'POST') return unknownOutcome();
    if (!forwarded && error instanceof BodyLimitError)
      return failure(
        413,
        'REQUEST_TOO_LARGE',
        'Request exceeds the two MiB limit. Nothing was forwarded.',
      );
    if (!forwarded && !request.signal.aborted && error instanceof EncodingError)
      return failure(
        422,
        'INVALID_REQUEST_BODY',
        'The request body must be valid UTF-8. Nothing was forwarded.',
      );
    return failure(
      503,
      'SERVICE_UNAVAILABLE',
      forwarded
        ? 'The service response is unavailable. Refresh to check current information.'
        : 'The request was interrupted before it reached the private API.',
    );
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', interrupt);
  }
}
