import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const allowed = new Set([
  'status',
  'me',
  'workflows',
  'records',
  'commands',
  'access',
  'access/grant',
  'access/revoke',
  'notifications',
  'notifications/read',
  'auth/local',
  'auth/logout',
  'auth/sessions',
  'auth/sessions/revoke',
  'auth/sessions/revoke-others',
  'auth/start',
  'auth/callback',
]);
async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const route = path.join('/');
  if (!allowed.has(route))
    return NextResponse.json({ message: 'Endpoint not found.' }, { status: 404 });
  const api = process.env['API_INTERNAL_URL'];
  if (!api)
    return NextResponse.json(
      { message: 'Protected services are not open. The development API is not configured.' },
      { status: 503 },
    );
  const expected = process.env['PORTAL_ORIGIN'] || 'http://localhost:3001';
  if (request.method === 'POST' && request.headers.get('origin') !== expected)
    return NextResponse.json(
      { message: 'Submit from the approved website origin.' },
      { status: 403 },
    );
  const headers = new Headers();
  for (const key of ['content-type', 'cookie', 'x-csrf-token']) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  headers.set('Origin', expected);
  if (process.env['INTERNAL_API_KEY'])
    headers.set('X-Internal-Key', process.env['INTERNAL_API_KEY']);
  try {
    const response = await fetch(`${api}/${route}${request.nextUrl.search}`, {
      method: request.method,
      headers,
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      ...(request.method === 'POST' ? { body: await request.text() } : {}),
    });
    const outgoing = new NextResponse(await response.arrayBuffer(), {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
    for (const value of response.headers.getSetCookie())
      outgoing.headers.append('Set-Cookie', value);
    const location = response.headers.get('location');
    if (location) {
      if (location.startsWith('https://') || location === '/')
        outgoing.headers.set('Location', location);
      else
        return NextResponse.json(
          { message: 'Unexpected authentication redirect.' },
          { status: 502 },
        );
    }
    return outgoing;
  } catch {
    return NextResponse.json(
      { message: 'The service is temporarily unavailable. No successful receipt was issued.' },
      { status: 503 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
