import { developmentEnvironment } from '../scripts/development-environment.mjs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  symlinkSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createLocalConfig,
  ensureLocalConfig,
  validateLocalConfig,
  localChildEnv,
} from '../scripts/local-config.mjs';

const directories: string[] = [];
function path() {
  const dir = mkdtempSync(join(tmpdir(), 'cornerstone-local-'));
  directories.push(dir);
  return join(dir, '.env');
}
afterEach(() =>
  directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })),
);
describe('isolated local bootstrap', () => {
  it('generates separate random keys and least-privilege role credentials', () => {
    const first = createLocalConfig(),
      second = createLocalConfig();
    expect(validateLocalConfig(first)).toEqual(first);
    expect(first.SESSION_KEY).not.toBe(second.SESSION_KEY);
    expect(first.FIELD_ENCRYPTION_KEY).not.toBe(first.SESSION_KEY);
    expect(new URL(first.DATABASE_URL).username).toBe('cornerstone_runtime');
    expect(new URL(first.WORKER_DATABASE_URL).password).not.toBe(
      new URL(first.DATABASE_URL).password,
    );
  });
  it('writes owner-only settings once and preserves exact bytes on repeat', () => {
    const file = path();
    expect(ensureLocalConfig(file).created).toBe(true);
    const before = readFileSync(file);
    expect(ensureLocalConfig(file).created).toBe(false);
    expect(readFileSync(file)).toEqual(before);
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
  });
  it('preserves incompatible settings and never follows symlinks', () => {
    const file = path();
    writeFileSync(file, 'UNRELATED_SETTING=preserve\n', { mode: 0o600 });
    expect(() => ensureLocalConfig(file)).toThrow(/preserved/);
    expect(readFileSync(file, 'utf8')).toBe('UNRELATED_SETTING=preserve\n');
    symlinkSync(file, file + '-link');
    expect(() => ensureLocalConfig(file + '-link')).toThrow(/symlink/);
  });
  it('refuses broadly readable existing credentials', () => {
    if (process.platform === 'win32') return;
    const file = path();
    ensureLocalConfig(file);
    chmodSync(file, 0o644);
    expect(() => ensureLocalConfig(file)).toThrow(/owner-only/);
  });
  it.each([
    ['NODE_ENV', 'production'],
    ['DATA_REALM', 'production'],
    ['LOCAL_AUTH_HOST', 'example.com'],
    ['EVIDENCE_STORAGE_PROVIDER', 'remote'],
    ['NODE_OPTIONS', '--require=untrusted'],
    ['DATABASE_URL', createLocalConfig().DATABASE_URL.replace('localhost', 'example.com')],
  ])('refuses unsafe or unrecognized %s without leaking its value', (key, value) => {
    try {
      validateLocalConfig({ ...createLocalConfig(), [key]: value });
      throw Error('accepted');
    } catch (error) {
      expect((error as Error).message).not.toBe('accepted');
      expect((error as Error).message).not.toContain(value);
    }
  });
  it('rejects shared credentials and malformed encryption keys', () => {
    const config = createLocalConfig();
    expect(() =>
      validateLocalConfig({ ...config, FIELD_ENCRYPTION_KEY: config.SESSION_KEY }),
    ).toThrow(/Separate/);
    expect(() => validateLocalConfig({ ...config, SESSION_KEY: 'bad' })).toThrow(/32-byte/);
    expect(() => validateLocalConfig({ ...config, LOCAL_DATABASE_PASSWORD: 'wrong' })).toThrow(
      /distinct/,
    );
  });
  it('does not inherit ambient provider credentials or node injection', () => {
    const previous = process.env.NODE_OPTIONS;
    process.env.NODE_OPTIONS = '--require=untrusted';
    try {
      expect(localChildEnv({})).not.toHaveProperty('NODE_OPTIONS');
    } finally {
      if (previous === undefined) delete process.env.NODE_OPTIONS;
      else process.env.NODE_OPTIONS = previous;
    }
    expect(
      Object.keys(localChildEnv({})).every((key) =>
        ['PATH', 'HOME', 'SystemRoot', 'TEMP', 'TMP', 'NEXT_TELEMETRY_DISABLED'].includes(key),
      ),
    ).toBe(true);
  });
});

it('isolates migration credentials from every application and database credentials from websites', () => {
  const config = createLocalConfig();
  for (const service of [
    '@cornerstone/api',
    '@cornerstone/worker',
    '@cornerstone/web',
    '@cornerstone/portal',
    '@cornerstone/staff',
  ]) {
    const child = developmentEnvironment(service, config);
    expect(child).not.toHaveProperty('MIGRATION_DATABASE_URL');
    expect(child).not.toHaveProperty('LOCAL_DATABASE_PASSWORD');
    if (service !== '@cornerstone/worker') expect(child).not.toHaveProperty('WORKER_DATABASE_URL');
    if (service !== '@cornerstone/api') expect(child).not.toHaveProperty('DATABASE_URL');
    if (service === '@cornerstone/web') expect(child).not.toHaveProperty('INTERNAL_API_KEY');
  }
});
