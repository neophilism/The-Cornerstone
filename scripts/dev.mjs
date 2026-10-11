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
if (process.env['NOTIFICATION_PROVIDER'] === 'in-app')
  services.push(['@cornerstone/worker', 'dev']);
function envFor(service) {
  const ui = [
    'PATH',
    'NODE_ENV',
    'PUBLIC_ORIGIN',
    'PORTAL_ORIGIN',
    'STAFF_ORIGIN',
    'API_INTERNAL_URL',
    'INTERNAL_API_KEY',
  ];
  const keys =
    service === '@cornerstone/worker'
      ? [
          'PATH',
          'NODE_ENV',
          'CORNERSTONE_MODE',
          'DATA_REALM',
          'WORKER_DATABASE_URL',
          'NOTIFICATION_PROVIDER',
        ]
      : service === '@cornerstone/api'
        ? Object.keys(process.env).filter(
            (k) => !['MIGRATION_DATABASE_URL', 'WORKER_DATABASE_URL'].includes(k),
          )
        : service === '@cornerstone/web'
          ? ['PATH', 'NODE_ENV', 'PUBLIC_ORIGIN']
          : ui;
  return {
    ...Object.fromEntries(keys.filter((k) => process.env[k]).map((k) => [k, process.env[k]])),
    NEXT_TELEMETRY_DISABLED: '1',
  };
}
const children = services.map((args) =>
  spawn('pnpm', ['--filter', ...args], {
    stdio: 'inherit',
    env: envFor(args[0]),
  }),
);
const stop = () => children.forEach((c) => c.kill('SIGTERM'));
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
for (const c of children)
  c.on('exit', (code) => {
    if (code) stop();
  });
