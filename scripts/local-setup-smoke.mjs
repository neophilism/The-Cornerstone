import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';
import { validateLocalConfig, localChildEnv } from './local-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const settings = validateLocalConfig(parseEnv(readFileSync(root + '.env', 'utf8')));
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', () =>
    reject(Error('Stop the existing API before running local setup verification.')),
  );
  probe.listen(4010, '127.0.0.1', () => probe.close(resolve));
});
const env = localChildEnv(
  Object.fromEntries(
    Object.entries(settings).filter(
      ([key]) =>
        !['MIGRATION_DATABASE_URL', 'WORKER_DATABASE_URL', 'LOCAL_DATABASE_PASSWORD'].includes(key),
    ),
  ),
);
const api = spawn(process.execPath, ['apps/api/dist/main.js'], { cwd: root, env, stdio: 'ignore' });
let exited = false;
const stopped = new Promise((resolve) => {
  api.once('exit', () => {
    exited = true;
    resolve();
  });
  api.once('error', () => {
    exited = true;
    resolve();
  });
});
const request = (path, options = {}) =>
  fetch('http://localhost:4010' + path, { ...options, signal: AbortSignal.timeout(3000) });
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (exited) throw Error('Local API exited before readiness.');
    try {
      const response = await request('/healthz');
      ready = response.ok;
    } catch {
      /* bounded startup retry */
    }
    if (ready) break;
    await delay(500);
  }
  assert(ready, 'Local API did not become ready.');
  const status = await (await request('/status')).json();
  assert.equal(status.mode, 'simulation');
  assert.equal(status.realm, 'simulation');
  assert.equal(status.localAuth, true);
  assert.equal(status.protectedIntake, false);
  assert.equal((await request('/me')).status, 401);
  const denied = await request('/auth/local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.invalid' },
    body: JSON.stringify({ persona: 'participant' }),
  });
  assert.equal(denied.status, 403);
  const login = await request('/auth/local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: settings.PORTAL_ORIGIN },
    body: JSON.stringify({ persona: 'participant' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  assert(cookie, 'Local login did not issue a session.');
  const meResponse = await request('/me', { headers: { Cookie: cookie } });
  assert.equal(meResponse.status, 200);
  const me = await meResponse.json();
  assert.equal(me.actor.realm, 'simulation');
  assert(me.actor.roles.includes('participant'));
  assert.equal((await request('/records', { headers: { Cookie: cookie } })).status, 200);
  console.log(
    'PASS: local setup starts a schema-checked restricted API, authenticates a seeded synthetic persona, and denies unauthenticated/cross-origin access.',
  );
} finally {
  if (!exited) api.kill('SIGTERM');
  await Promise.race([stopped, delay(5000)]);
  if (!exited) {
    api.kill('SIGKILL');
    await stopped;
  }
}
