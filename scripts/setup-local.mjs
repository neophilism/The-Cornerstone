import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ensureLocalConfig, localChildEnv } from './local-config.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error || result.status !== 0)
    throw Error(
      `Local setup step failed: ${command} ${args[0] ?? ''}. Existing files and database were retained.`,
    );
}
try {
  run('docker', ['compose', 'version'], localChildEnv({}));
  const settings = ensureLocalConfig(root + '.env');
  const env = localChildEnv(settings.values);
  console.log(
    settings.created
      ? 'Created private local settings with unique credentials.'
      : 'Using existing validated local settings without changing credentials.',
  );
  run(
    'docker',
    [
      'compose',
      '--project-name',
      'cornerstone-local',
      '--env-file',
      root + '.env',
      '-f',
      'infra/compose.yaml',
      'up',
      '-d',
      '--wait',
      '--wait-timeout',
      '90',
    ],
    env,
  );
  run('pnpm', ['build:packages'], localChildEnv({}));
  run('node', ['--import', 'tsx', 'scripts/create-runtime-role.ts'], env);
  run('node', ['--import', 'tsx', 'scripts/migrate.ts'], env);
  run('node', ['--import', 'tsx', 'scripts/seed-simulation.ts'], env);
  console.log(
    'Local synthetic setup is ready. Run pnpm dev, then open http://localhost:3001. No hosted identity keys are needed for local synthetic personas.',
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Local setup failed.');
  process.exitCode = 1;
}
