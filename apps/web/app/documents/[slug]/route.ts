import { readFile } from 'node:fs/promises';
import 'server-only';
import path from 'node:path';
import { sourceDocuments } from '@cornerstone/content/research';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const types: Record<string, string> = {
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  SRT: 'application/x-subrip; charset=utf-8',
};
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const source = sourceDocuments.find((s) => s.slug === slug);
  if (!source) return new Response('Document not found', { status: 404 });
  const etag = `"${source.sha256}"`;
  const headers = {
    'Content-Type': types[source.format]!,
    'Content-Disposition': `attachment; filename="${source.path.split('/').at(-1)!}"`,
    'Cache-Control': 'public, max-age=3600, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    'X-Content-Sha256': source.sha256,
    'X-Robots-Tag': 'noindex',
    ETag: etag,
  };
  try {
    const file = await readFile(path.resolve(process.cwd(), '../..', source.path));
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(file))),
    )
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    if (file.length !== source.bytes || digest !== source.sha256)
      return new Response('Document temporarily unavailable', {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      });
    if (request.headers.get('if-none-match') === etag)
      return new Response(null, { status: 304, headers });
    return new Response(new Uint8Array(file), {
      headers: { ...headers, 'Content-Length': String(file.length) },
    });
  } catch {
    return new Response('Document temporarily unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
