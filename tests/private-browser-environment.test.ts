import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { requirePrivateBrowserEnvironment } from './helpers/private-browser-environment.js';

function environment(): NodeJS.ProcessEnv {
  const uri = (role: string) =>
    'postgresql:' + '//' + role + ':invented-fixture-password@localhost:5432/cornerstone_test';
  return {
    DATA_REALM: 'simulation',
    CORNERSTONE_MODE: 'simulation',
    NODE_ENV: 'development',
    FIELD_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    MIGRATION_DATABASE_URL: uri('cornerstone_migration'),
    DATABASE_URL: uri('cornerstone_runtime'),
    WORKER_DATABASE_URL: uri('cornerstone_worker'),
  };
}
describe('isolated private browser fixture setup', () => {
  it('accepts separate local roles and a supplied ephemeral field key', () => {
    expect(() => requirePrivateBrowserEnvironment(environment())).not.toThrow();
    const env = environment();
    for (const name of ['MIGRATION_DATABASE_URL', 'DATABASE_URL', 'WORKER_DATABASE_URL'])
      env[name] = env[name]!.replace('localhost', '127.0.0.1');
    expect(() => requirePrivateBrowserEnvironment(env)).not.toThrow();
  });
  it('refuses production, other realms and absent explicit simulation mode', () => {
    for (const replacement of [
      { NODE_ENV: 'production' },
      { DATA_REALM: 'program' },
      { CORNERSTONE_MODE: 'proposal' },
      { DATA_REALM: undefined },
    ])
      expect(() =>
        requirePrivateBrowserEnvironment({ ...environment(), ...replacement }),
      ).toThrow();
  });
  it('requires the same explicit valid field key used by the browser API', () => {
    for (const key of [undefined, '', 'invalid', randomBytes(31).toString('base64')])
      expect(() =>
        requirePrivateBrowserEnvironment({ ...environment(), FIELD_ENCRYPTION_KEY: key }),
      ).toThrow();
  });
  it('rejects remote, different, owner-as-runtime and incomplete connections without exposing credentials', () => {
    const env = environment();
    for (const value of [
      undefined,
      'invalid',
      env['DATABASE_URL']!.replace('localhost', 'remote.example'),
      env['DATABASE_URL']!.replace('/cornerstone_test', '/cornerstone'),
      env['MIGRATION_DATABASE_URL'],
      env['DATABASE_URL']!.replace(':5432', ':5433'),
      env['DATABASE_URL']!.replace('localhost', '127.0.0.1'),
      env['DATABASE_URL']! + '?options=anything',
    ]) {
      expect(() => requirePrivateBrowserEnvironment({ ...env, DATABASE_URL: value })).toThrow();
      try {
        requirePrivateBrowserEnvironment({ ...env, DATABASE_URL: value });
      } catch (e) {
        expect(String(e)).not.toContain('invented-fixture-password');
      }
    }
  });
});
