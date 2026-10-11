// Local credential handoff: one JSON line from stdin, never command arguments or files.
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
const lines = createInterface({ input: process.stdin, terminal: false });
const [env] = await new Promise((resolve, reject) => {
  lines.once('line', (l) => {
    try {
      resolve([JSON.parse(l)]);
    } catch {
      reject(new Error('Invalid environment input'));
    }
  });
});
lines.close();
const allowed = [
  'DATABASE_URL',
  'MIGRATION_DATABASE_URL',
  'FIELD_ENCRYPTION_KEY',
  'SESSION_KEY',
  'INTERNAL_API_KEY',
];
if (Object.keys(env).some((k) => !allowed.includes(k)))
  throw new Error('Unexpected environment key');
const child = spawn(process.argv[2] ?? 'pnpm', process.argv.slice(3), {
  env: { ...process.env, ...env },
  stdio: 'inherit',
});
child.once('exit', (code) => process.exit(code ?? 1));
