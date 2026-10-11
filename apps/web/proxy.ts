import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
export function proxy(request: NextRequest) {
  const nonce = randomBytes(18).toString('base64');
  const csp = `default-src 'self'; script-src 'nonce-${nonce}' 'strict-dynamic'${process.env['NODE_ENV'] === 'development' ? " 'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'${process.env['NODE_ENV'] === 'development' ? ' ws://127.0.0.1:3000 ws://localhost:3000' : ''}; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`;
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)'] };
