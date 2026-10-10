import { spawn } from 'node:child_process';
const services = [
  ['@cornerstone/web', 'exec', 'next', 'dev', '--hostname', '127.0.0.1', '--webpack', '-p', '3000'],
  [
    '@cornerstone/portal',
    'exec',
    'next',
    'dev',
    '--hostname',
    '127.0.0.1',
    '--webpack',
    '-p',
    '3001',
  ],
  [
    '@cornerstone/staff',
    'exec',
    'next',
    'dev',
    '--hostname',
    '127.0.0.1',
    '--webpack',
    '-p',
    '3002',
  ],
  ['@cornerstone/api', 'dev'],
];
const children = services.map((args) =>
  spawn('pnpm', ['--filter', ...args], {
    stdio: 'inherit',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  }),
);
const stop = () => children.forEach((c) => c.kill('SIGTERM'));
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
for (const c of children)
  c.on('exit', (code) => {
    if (code) stop();
  });
