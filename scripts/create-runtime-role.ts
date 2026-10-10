import pg from 'pg';
if (process.env['DATA_REALM'] !== 'simulation' || process.env['NODE_ENV'] === 'production')
  throw Error('Explicit synthetic database bootstrap only.');
if (!process.env['MIGRATION_DATABASE_URL'] || !process.env['DATABASE_URL'])
  throw Error('Separate migration and runtime credentials required.');
const runtime = new URL(process.env['DATABASE_URL']);
if (runtime.username !== 'cornerstone_runtime' || !runtime.password)
  throw Error('A separately authenticated cornerstone_runtime role is required.');
const client = new pg.Client({ connectionString: process.env['MIGRATION_DATABASE_URL'] });
await client.connect();
try {
  const r = await client.query("SELECT 1 FROM pg_roles WHERE rolname='cornerstone_runtime'");
  if (!r.rowCount) {
    await client.query(
      'CREATE ROLE cornerstone_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD ' +
        client.escapeLiteral(decodeURIComponent(runtime.password)),
    );
    console.log('Created restricted synthetic runtime role.');
  } else console.log('Runtime role already exists; credentials and privileges were not changed.');
} finally {
  await client.end();
}
