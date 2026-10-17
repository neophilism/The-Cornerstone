import { readKey } from '@cornerstone/security';

/** This fixture writer only targets an explicitly empty loopback test database. */
export function requirePrivateBrowserEnvironment(env: NodeJS.ProcessEnv) {
  if (
    env['DATA_REALM'] !== 'simulation' ||
    env['CORNERSTONE_MODE'] !== 'simulation' ||
    env['NODE_ENV'] === 'production'
  )
    throw Error('Explicit non-production synthetic browser setup is required.');
  readKey(env['FIELD_ENCRYPTION_KEY'], 'FIELD_ENCRYPTION_KEY');
  const roles = {
    MIGRATION_DATABASE_URL: 'cornerstone_migration',
    DATABASE_URL: 'cornerstone_runtime',
    WORKER_DATABASE_URL: 'cornerstone_worker',
  };
  let address: string | undefined;
  for (const [name, role] of Object.entries(roles)) {
    let uri: URL;
    try {
      uri = new URL(env[name] ?? '');
    } catch {
      throw Error('Separate loopback test database credentials are required.');
    }
    if (
      uri.protocol !== 'postgresql:' ||
      !['localhost', '127.0.0.1'].includes(uri.hostname) ||
      uri.port !== '5432' ||
      uri.pathname !== '/cornerstone_test' ||
      uri.username !== role ||
      !uri.password ||
      uri.search ||
      uri.hash
    )
      throw Error(
        'Only separate restricted roles on the loopback cornerstone_test database are accepted.',
      );
    const current = uri.hostname + ':' + uri.port + uri.pathname;
    if (address && address !== current)
      throw Error('Every browser fixture connection must use the same isolated database.');
    address = current;
  }
}
