import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { parseEnv } from 'node:util';
const secret = () => randomBytes(32).toString('hex');
export function createLocalConfig() {
  const owner = secret(),
    runtime = secret(),
    worker = secret();
  const url = (role, password) => `postgresql://${role}:${password}@localhost:5432/cornerstone`;
  return {
    NODE_ENV: 'development',
    CORNERSTONE_MODE: 'simulation',
    DATA_REALM: 'simulation',
    LOCAL_DATABASE_PASSWORD: owner,
    MIGRATION_DATABASE_URL: url('cornerstone_migration', owner),
    DATABASE_URL: url('cornerstone_runtime', runtime),
    WORKER_DATABASE_URL: url('cornerstone_worker', worker),
    API_PORT: '4010',
    API_INTERNAL_URL: 'http://localhost:4010',
    PORTAL_ORIGIN: 'http://localhost:3001',
    STAFF_ORIGIN: 'http://localhost:3002',
    PUBLIC_ORIGIN: 'http://localhost:3000',
    LOCAL_AUTH_ENABLED: 'true',
    LOCAL_AUTH_HOST: 'localhost',
    SESSION_KEY: randomBytes(32).toString('base64'),
    FIELD_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    INTERNAL_API_KEY: secret(),
    SENSITIVE_INTAKE_ENABLED: 'false',
    EVIDENCE_STORAGE_PROVIDER: 'synthetic-postgres',
    NOTIFICATION_PROVIDER: 'in-app',
    RANKING_CUSTODY_PROVIDER: 'disabled',
    RECOVERY_JOURNAL_PROVIDER: 'disabled',
    NEXT_TELEMETRY_DISABLED: '1',
  };
}
export function validateLocalConfig(value) {
  const fixed = {
    NODE_ENV: 'development',
    CORNERSTONE_MODE: 'simulation',
    DATA_REALM: 'simulation',
    API_PORT: '4010',
    API_INTERNAL_URL: 'http://localhost:4010',
    PORTAL_ORIGIN: 'http://localhost:3001',
    STAFF_ORIGIN: 'http://localhost:3002',
    PUBLIC_ORIGIN: 'http://localhost:3000',
    LOCAL_AUTH_ENABLED: 'true',
    LOCAL_AUTH_HOST: 'localhost',
    SENSITIVE_INTAKE_ENABLED: 'false',
    EVIDENCE_STORAGE_PROVIDER: 'synthetic-postgres',
    NOTIFICATION_PROVIDER: 'in-app',
    RANKING_CUSTODY_PROVIDER: 'disabled',
    RECOVERY_JOURNAL_PROVIDER: 'disabled',
  };
  if (Object.entries(fixed).some(([key, expected]) => value[key] !== expected))
    throw Error(
      'Automatic setup requires the documented loopback-only synthetic configuration. Existing settings were preserved.',
    );
  const passwords = [];
  for (const [key, role] of [
    ['MIGRATION_DATABASE_URL', 'cornerstone_migration'],
    ['DATABASE_URL', 'cornerstone_runtime'],
    ['WORKER_DATABASE_URL', 'cornerstone_worker'],
  ]) {
    let parsed;
    try {
      parsed = new URL(value[key]);
    } catch {
      throw Error('Local database configuration is incomplete.');
    }
    if (
      parsed.protocol !== 'postgresql:' ||
      parsed.hostname !== 'localhost' ||
      parsed.port !== '5432' ||
      parsed.pathname !== '/cornerstone' ||
      parsed.username !== role ||
      parsed.search ||
      parsed.hash ||
      !/^[a-f0-9]{64}$/.test(parsed.password)
    )
      throw Error(
        'Automatic setup accepts only the documented local database and separate generated roles.',
      );
    passwords.push(parsed.password);
  }
  if (new Set(passwords).size !== 3 || passwords[0] !== value.LOCAL_DATABASE_PASSWORD)
    throw Error(
      'Local owner/runtime/worker credentials must be distinct and match the local container configuration.',
    );
  for (const name of ['SESSION_KEY', 'FIELD_ENCRYPTION_KEY']) {
    const key = value[name];
    if (
      typeof key !== 'string' ||
      Buffer.from(key, 'base64').length !== 32 ||
      Buffer.from(key, 'base64').toString('base64') !== key
    )
      throw Error('Local encryption/session keys must be independently generated 32-byte values.');
  }
  if (
    value.SESSION_KEY === value.FIELD_ENCRYPTION_KEY ||
    !/^[a-f0-9]{64}$/.test(value.INTERNAL_API_KEY ?? '')
  )
    throw Error('Separate local session, field and internal credentials are required.');
  const allowed = new Set([
    ...Object.keys(fixed),
    'NEXT_TELEMETRY_DISABLED',
    'LOCAL_DATABASE_PASSWORD',
    'MIGRATION_DATABASE_URL',
    'DATABASE_URL',
    'WORKER_DATABASE_URL',
    'SESSION_KEY',
    'FIELD_ENCRYPTION_KEY',
    'INTERNAL_API_KEY',
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key)))
    throw Error(
      'Automatic setup does not accept additional environment settings. Use the documented manual setup instead.',
    );
  return value;
}
export function ensureLocalConfig(path) {
  let existing;
  try {
    existing = lstatSync(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (existing) {
    if (!existing.isFile() || existing.isSymbolicLink())
      throw Error('Local settings must be a regular file, not a symlink.');
    if (process.platform !== 'win32' && (existing.mode & 0o077) !== 0)
      throw Error('Restrict .env permissions to owner-only before automatic setup.');
    return { created: false, values: validateLocalConfig(parseEnv(readFileSync(path, 'utf8'))) };
  }
  const values = createLocalConfig();
  writeFileSync(
    path,
    '# Generated for isolated local synthetic development. Keep private.\n' +
      Object.entries(values)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n') +
      '\n',
    { flag: 'wx', mode: 0o600 },
  );
  return { created: true, values };
}
export function localChildEnv(values) {
  const allowed = ['PATH', 'HOME', 'SystemRoot', 'TEMP', 'TMP'];
  return {
    ...Object.fromEntries(
      allowed.filter((key) => process.env[key]).map((key) => [key, process.env[key]]),
    ),
    ...Object.fromEntries(
      Object.entries(values).filter(([key]) =>
        [
          'NODE_ENV',
          'CORNERSTONE_MODE',
          'DATA_REALM',
          'LOCAL_DATABASE_PASSWORD',
          'MIGRATION_DATABASE_URL',
          'DATABASE_URL',
          'WORKER_DATABASE_URL',
          'API_PORT',
          'API_INTERNAL_URL',
          'PORTAL_ORIGIN',
          'STAFF_ORIGIN',
          'PUBLIC_ORIGIN',
          'LOCAL_AUTH_ENABLED',
          'LOCAL_AUTH_HOST',
          'SESSION_KEY',
          'FIELD_ENCRYPTION_KEY',
          'INTERNAL_API_KEY',
          'SENSITIVE_INTAKE_ENABLED',
          'EVIDENCE_STORAGE_PROVIDER',
          'NOTIFICATION_PROVIDER',
          'RANKING_CUSTODY_PROVIDER',
          'RECOVERY_JOURNAL_PROVIDER',
        ].includes(key),
      ),
    ),
    NEXT_TELEMETRY_DISABLED: '1',
  };
}
