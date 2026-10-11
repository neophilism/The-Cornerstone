import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
if (
  process.env['CORNERSTONE_MODE'] !== 'simulation' ||
  process.env['DATA_REALM'] !== 'simulation' ||
  !process.env['DATABASE_URL']
)
  throw Error('An isolated synthetic simulation database is required.');
const env = {
  ...process.env,
  CORNERSTONE_MODE: 'simulation',
  DATA_REALM: 'simulation',
  LOCAL_AUTH_ENABLED: 'true',
  LOCAL_AUTH_HOST: 'localhost',
  SENSITIVE_INTAKE_ENABLED: 'false',
  API_INTERNAL_URL: 'http://127.0.0.1:4010',
  PORTAL_ORIGIN: 'http://127.0.0.1:3001',
  STAFF_ORIGIN: 'http://127.0.0.1:3002',
  FIELD_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  SESSION_KEY: randomBytes(32).toString('base64'),
  NEXT_TELEMETRY_DISABLED: '1',
};
// Never propagate owner credentials into an application process.
delete env['MIGRATION_DATABASE_URL'];
delete env['WORKER_DATABASE_URL'];
const commands = [
  ['node', ['apps/api/dist/main.js'], { NODE_ENV: 'development', PORT: '4010' }],
  [
    'pnpm',
    [
      '--filter',
      '@cornerstone/portal',
      'exec',
      'next',
      'start',
      '--hostname',
      '127.0.0.1',
      '-p',
      '3001',
    ],
    { NODE_ENV: 'production' },
  ],
  [
    'pnpm',
    [
      '--filter',
      '@cornerstone/staff',
      'exec',
      'next',
      'start',
      '--hostname',
      '127.0.0.1',
      '-p',
      '3002',
    ],
    { NODE_ENV: 'production' },
  ],
];
const uiEnv = Object.fromEntries(
  [
    'PATH',
    'API_INTERNAL_URL',
    'PORTAL_ORIGIN',
    'STAFF_ORIGIN',
    'PUBLIC_ORIGIN',
    'INTERNAL_API_KEY',
    'NEXT_TELEMETRY_DISABLED',
  ]
    .filter((k) => env[k])
    .map((k) => [k, env[k]]),
);
const children = commands.map(([command, args, overrides], index) =>
  spawn(command, args, { stdio: 'inherit', env: { ...(index === 0 ? env : uiEnv), ...overrides } }),
);
if (process.env['WORKER_DATABASE_URL'])
  children.push(
    spawn('node', ['apps/worker/dist/main.js'], {
      stdio: 'inherit',
      env: {
        PATH: process.env['PATH'],
        NODE_ENV: 'development',
        CORNERSTONE_MODE: 'simulation',
        DATA_REALM: 'simulation',
        WORKER_DATABASE_URL: process.env['WORKER_DATABASE_URL'],
        NOTIFICATION_PROVIDER: 'in-app',
      },
    }),
  );
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
for (const child of children)
  child.on('exit', (code) => {
    if (!stopping) {
      process.exitCode = code || 1;
      stop();
    }
  });
