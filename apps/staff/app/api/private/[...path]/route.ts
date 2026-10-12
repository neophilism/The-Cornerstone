import type { NextRequest } from 'next/server';
import { forwardPrivateRequest } from '@cornerstone/ui/private-proxy';
export const dynamic = 'force-dynamic';
async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return forwardPrivateRequest(request, (await context.params).path, {
    apiOrigin: process.env['API_INTERNAL_URL'],
    browserOrigin: process.env['STAFF_ORIGIN'] || 'http://localhost:3002',
    internalKey: process.env['INTERNAL_API_KEY'],
  });
}
export const GET = proxy;
export const POST = proxy;
