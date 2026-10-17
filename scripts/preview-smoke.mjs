import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export const previewOrigin = 'https://cornerstone-policy-preview.onrender.com';
const contentTypes = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  srt: 'application/x-subrip; charset=utf-8',
};

export function publicSources(manifest) {
  if (
    manifest?.publication?.scope !== 'five supplied sources and paired draft acts' ||
    !Array.isArray(manifest.sources) ||
    manifest.sources.length !== 7
  )
    throw Error('The seven-source approved publication manifest is required.');
  const seen = new Set();
  return manifest.sources.map((source) => {
    if (
      !/^policy\/[A-Za-z0-9_]+\.(docx|xlsx|srt)$/.test(source.path) ||
      !Number.isSafeInteger(source.bytes) ||
      source.bytes <= 0 ||
      source.bytes > 8 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(source.sha256)
    )
      throw Error('A public source has an invalid path, byte bound or SHA-256 digest.');
    const filename = source.path.split('/').at(-1);
    const extension = filename.split('.').at(-1);
    const slug = filename
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replaceAll('_', '-');
    if (seen.has(slug)) throw Error('The public source manifest contains a duplicate route.');
    seen.add(slug);
    return { ...source, filename, slug, contentType: contentTypes[extension] };
  });
}

async function request(fetchImpl, path, headers = {}) {
  const response = await fetchImpl(`${previewOrigin}${path}`, {
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
    redirect: 'error',
    headers: { 'Accept-Encoding': 'identity', ...headers },
  });
  if (response.redirected) throw Error('Public verification must not follow redirects.');
  return response;
}

async function consume(response, maxBytes, receive) {
  if (!response.body) throw Error('The response body is missing.');
  const reader = response.body.getReader();
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return bytes;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw Error('The response exceeds its byte bound.');
      receive(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

async function textBody(response, maxBytes) {
  const chunks = [];
  await consume(response, maxBytes, (chunk) => chunks.push(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function health(fetchImpl, expectedCommit) {
  const response = await request(fetchImpl, '/api/healthz');
  if (response.status !== 200) throw Error('The public health endpoint is unavailable.');
  const value = JSON.parse(await textBody(response, 64 * 1024));
  if (
    value.status !== 'ok' ||
    value.service !== 'cornerstone-public' ||
    value.mode !== 'proposal' ||
    value.protectedIntake !== false
  )
    throw Error('The preview health or mode does not match the public-only release.');
  if (value.commit !== expectedCommit)
    throw Error('Render has not deployed the exact checked preview commit.');
}

function sourceHeaders(response, source, requireLength) {
  if (
    response.headers.get('content-type') !== source.contentType ||
    response.headers.get('content-disposition') !== `attachment; filename="${source.filename}"` ||
    response.headers.get('x-content-type-options') !== 'nosniff' ||
    response.headers.get('x-robots-tag') !== 'noindex' ||
    response.headers.get('x-content-sha256') !== source.sha256 ||
    response.headers.get('etag') !== `"${source.sha256}"` ||
    !response.headers.get('cache-control')?.includes('must-revalidate') ||
    (requireLength && response.headers.get('content-length') !== String(source.bytes))
  )
    throw Error('The document metadata does not match the approved original.');
}

export async function verifySource(fetchImpl, source) {
  let response;
  try {
    response = await request(fetchImpl, `/documents/${source.slug}`);
    if (response.status !== 200) throw Error('The approved document is unavailable.');
    sourceHeaders(response, source, true);
    const hash = createHash('sha256');
    const bytes = await consume(response, source.bytes, (chunk) => hash.update(chunk));
    if (bytes !== source.bytes) throw Error('The document body is truncated.');
    const sha256 = hash.digest('hex');
    if (sha256 !== source.sha256) throw Error('The document body has an incorrect SHA-256 digest.');

    response = await request(fetchImpl, `/documents/${source.slug}`, {
      'If-None-Match': `"${source.sha256}"`,
    });
    if (response.status !== 304)
      throw Error('The original digest does not produce a 304 response.');
    sourceHeaders(response, source, false);
    return { path: source.path, bytes, sha256, conditionalStatus: 304 };
  } catch (error) {
    if (response?.body && !response.body.locked) await response.body.cancel().catch(() => {});
    throw Error(
      `${source.path}: ${error instanceof Error ? error.message : 'Verification failed.'}`,
    );
  }
}

async function page(fetchImpl, path) {
  const response = await request(fetchImpl, path);
  if (
    response.status !== 200 ||
    !response.headers.get('content-security-policy')?.includes("'strict-dynamic'")
  )
    throw Error(`The public page or content security policy is unavailable: ${path || '/'}.`);
  return textBody(response, 2 * 1024 * 1024);
}

export async function verifyPublicPreview({
  expectedCommit,
  manifest,
  fetchImpl = fetch,
  now = Date.now,
  wait = setTimeout,
  timeoutMs = 240000,
  pollMs = 5000,
}) {
  if (!/^[a-f0-9]{40}$/.test(expectedCommit ?? ''))
    throw Error('An exact preview commit is required.');
  const sources = publicSources(manifest);
  const deadline = now() + timeoutMs;
  let last = 'The preview is not ready.';
  let ready = false;
  while (now() < deadline) {
    try {
      await health(fetchImpl, expectedCommit);
      ready = true;
      break;
    } catch (error) {
      last = error instanceof Error ? error.message : 'Preview verification failed.';
    }
    await wait(Math.max(0, Math.min(pollMs, deadline - now())));
  }
  if (!ready) throw Error(last);

  // Retry deployment readiness only. An integrity failure on the expected release is a failure.
  if (!(await page(fetchImpl, '')).includes('When policy takes'))
    throw Error('The expected public homepage was not returned.');
  const policy = await page(fetchImpl, '/policy');
  for (const source of sources)
    if (!policy.includes(`href="/documents/${source.slug}"`))
      throw Error(`The policy page does not link the approved original: ${source.path}.`);
  const research = await page(fetchImpl, '/events/C-001');
  for (const text of [
    'C-001',
    'research only',
    'No certification or individual finding',
    'Citation audit',
    'Workbook',
    'href="/documents/event-evidence"',
  ])
    if (!research.includes(text))
      throw Error('The research page is missing its scope, provenance or original-source link.');

  const documents = [];
  for (const source of sources) documents.push(await verifySource(fetchImpl, source));
  const unknown = await request(fetchImpl, '/documents/not-a-registered-source');
  const unknownStatus = unknown.status;
  await unknown.body?.cancel();
  if (unknownStatus !== 404) throw Error('An unregistered document route was not rejected.');
  // Prevent a deployment change during the downloads from being recorded as one release.
  await health(fetchImpl, expectedCommit);
  return {
    origin: previewOrigin,
    commit: expectedCommit,
    verifiedAt: new Date(now()).toISOString(),
    mode: 'proposal',
    protectedIntake: false,
    pages: ['/', '/policy', '/events/C-001'],
    documents,
    sourceCount: documents.length,
    sourceBytes: documents.reduce((total, document) => total + document.bytes, 0),
    unknownDocumentStatus: unknownStatus,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const manifest = JSON.parse(
    await readFile(new URL('../policy/SOURCE_MANIFEST.json', import.meta.url), 'utf8'),
  );
  const result = await verifyPublicPreview({
    expectedCommit: process.env['EXPECTED_PREVIEW_COMMIT'],
    manifest,
  });
  const output = new URL('../test-results/deployed-public-preview.json', import.meta.url);
  await mkdir(new URL('.', output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `PASS: ${result.commit} serves the public proposal pages and ${result.sourceCount} approved originals (${result.sourceBytes} bytes), with matching SHA-256 digests and conditional downloads.`,
  );
}
