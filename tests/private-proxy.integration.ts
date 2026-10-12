import { strict as assert } from 'node:assert';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// No database, actual identity provider or external service is used by this acceptance test.
let forwarded = 0;
let seenBody = '';
const upstream = createServer((request, response) => {
  forwarded++;
  const url = new URL(request.url || '/', 'http://localhost');
  assert.equal(request.headers['x-internal-key'], 'synthetic-proxy-fixture');
  if (url.searchParams.get('scenario') === 'expired') {
    response.writeHead(401, {
      'Content-Type': 'text/html',
      'Set-Cookie': ['session=; Max-Age=0; HttpOnly', 'csrf=; Max-Age=0'],
    });
    response.end('<html>Synthetic expired session</html>');
    return;
  }
  request.setEncoding('utf8');
  let body = '';
  request.on('data', (chunk: string) => {
    body += chunk;
  });
  request.on('end', () => {
    seenBody = body;
    if (url.searchParams.get('scenario') === 'drop') {
      response.destroy();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ synthetic: true, received: body, path: url.pathname }));
  });
});
async function listen(server: Server): Promise<number> {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Missing test port.');
  return address.port;
}
async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const done = once(child, 'exit');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try {
    await done;
  } finally {
    clearTimeout(timer);
  }
}
async function ready(child: ChildProcess, url: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw Error('Private app exited before HTTP readiness.');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      await response.body?.cancel();
      if (response.ok) return;
    } catch {
      /* Startup is bounded below. */
    }
    await delay(100);
  }
  throw Error('Private app readiness timed out.');
}
function privateResponse(response: Response): void {
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}
const apiPort = await listen(upstream);
try {
  for (const app of ['portal', 'staff']) {
    const probe = createServer();
    const port = await listen(probe);
    await close(probe);
    const base = `http://127.0.0.1:${port}`;
    const child = spawn(
      process.execPath,
      [
        resolve(`apps/${app}/node_modules/next/dist/bin/next`),
        'start',
        '-H',
        '127.0.0.1',
        '-p',
        String(port),
      ],
      {
        cwd: resolve(`apps/${app}`),
        env: {
          PATH: process.env['PATH'],
          NODE_ENV: 'production',
          NEXT_TELEMETRY_DISABLED: '1',
          API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`,
          INTERNAL_API_KEY: 'synthetic-proxy-fixture',
          PORTAL_ORIGIN: base,
          STAFF_ORIGIN: base,
        },
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    );
    // Consume process diagnostics without exposing environment or request details.
    let diagnostics = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      diagnostics = (diagnostics + chunk.toString()).slice(-1000);
    });
    try {
      await ready(child, base + '/');
      let response = await fetch(base + '/api/private/not-allowed');
      assert.equal(response.status, 404);
      privateResponse(response);
      await response.body?.cancel();
      const beforeDenied = forwarded;
      response = await fetch(base + '/api/private/commands', {
        method: 'POST',
        body: '{}',
        headers: { Origin: 'https://unrelated.example' },
      });
      assert.equal(response.status, 403);
      privateResponse(response);
      await response.body?.cancel();
      assert.equal(forwarded, beforeDenied);
      const body = '{"action":"synthetic-save","idempotencyKey":"same-request"}';
      response = await fetch(base + '/api/private/commands', {
        method: 'POST',
        body,
        headers: { Origin: base, 'Content-Type': 'application/json' },
      });
      assert.equal(response.status, 200);
      privateResponse(response);
      assert.equal((await response.json()).received, body);
      response = await fetch(base + '/api/private/records?scenario=expired');
      assert.equal(response.status, 401);
      privateResponse(response);
      assert.equal((await response.json()).code, 'SESSION_EXPIRED');
      assert.equal(response.headers.getSetCookie().length, 2);
      const beforeDrop = forwarded;
      response = await fetch(base + '/api/private/commands?scenario=drop', {
        method: 'POST',
        body,
        headers: { Origin: base },
      });
      assert.equal(response.status, 503);
      privateResponse(response);
      assert.equal((await response.json()).code, 'REQUEST_OUTCOME_UNKNOWN');
      assert.equal(forwarded, beforeDrop + 1);
      assert.equal(seenBody, body);
      console.log(
        `${app}: compiled private-route HTTP acceptance passed (synthetic upstream; no browser or provider approval).`,
      );
    } catch (error) {
      // Startup diagnostics are intentionally not included in failure output.
      throw new Error(
        `${app}: private-route HTTP acceptance failed. Child diagnostics available: ${diagnostics.length > 0}.`,
        { cause: error },
      );
    } finally {
      await stop(child);
    }
  }
} finally {
  await close(upstream);
}
