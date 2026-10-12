import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';

async function run(env: Record<string, string>, signal?: 'SIGTERM' | 'SIGINT') {
  const child = spawn(process.execPath, ['apps/worker/dist/main.js'], {
    env: { PATH: process.env['PATH'], ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '',
    stderr = '';
  let ready!: () => void;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  child.stdout.on('data', (chunk: Buffer) => {
    stdout = (stdout + chunk.toString()).slice(-8000);
    if (stdout.includes('Activity worker ready: disabled.')) ready();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-8000);
  });
  const done = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      child.once('exit', (code, signal) => resolve({ code, signal }));
      child.once('error', reject);
    },
  );
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try {
    if (signal) {
      await Promise.race([
        started,
        done.then(() => {
          throw Error('Worker exited before readiness.');
        }),
      ]);
      child.kill(signal);
    }
    return { ...(await done), stdout, stderr };
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await done;
    }
  }
}
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  const result = await run({ NOTIFICATION_PROVIDER: 'disabled' }, signal);
  assert.equal(result.code, 0);
  assert.equal(result.signal, null);
  assert.match(result.stdout, /Activity worker ready: disabled/);
}
for (const env of [
  { NOTIFICATION_PROVIDER: 'not-an-approved-provider' },
  {
    NOTIFICATION_PROVIDER: 'in-app',
    NODE_ENV: 'production',
    DATA_REALM: 'simulation',
    CORNERSTONE_MODE: 'simulation',
    WORKER_DATABASE_URL: 'synthetic-value-never-log-this',
  },
  {
    NOTIFICATION_PROVIDER: 'in-app',
    NODE_ENV: 'development',
    DATA_REALM: 'simulation',
    CORNERSTONE_MODE: 'simulation',
  },
]) {
  const result = await run(env);
  assert.equal(result.code, 1);
  assert.equal(result.signal, null);
  assert.equal(result.stdout.includes('Activity worker ready:'), false);
  assert.match(result.stderr, /Activity worker stopped before readiness or during cleanup/);
  assert.equal(result.stderr.includes('synthetic-value-never-log-this'), false);
  assert.equal(result.stderr.includes('not-an-approved-provider'), false);
}
console.log(
  'Compiled worker process acceptance passed: both signals, disabled mode and three startup gates. No providers or database connections were used.',
);
