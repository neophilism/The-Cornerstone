import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';

const url = process.env['MIGRATION_DATABASE_URL'];
if (!url) throw new Error('A separate MIGRATION_DATABASE_URL is required.');
const client = new pg.Client({ connectionString: url, application_name: 'cornerstone-migration' });
await client.connect();
try {
  await client.query("SELECT pg_advisory_lock(hashtext('cornerstone-schema-migrations'))");
  const existing = await client.query("SELECT to_regclass('public.schema_migrations') AS name");
  const applied = existing.rows[0]?.name
    ? await client.query('SELECT name,sha256 FROM schema_migrations')
    : { rows: [] };
  const names = (await readdir('db')).filter((n) => /^\d+-.*\.sql$/.test(n)).sort();
  for (const name of names) {
    const sql = await readFile(`db/${name}`, 'utf8'),
      sha = createHash('sha256').update(sql).digest('hex');
    const old = applied.rows.find((r) => r.name === name);
    if (old) {
      if (old.sha256 !== sha) throw new Error(`Applied migration ${name} was modified.`);
      continue;
    }
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name,sha256) VALUES($1,$2)', [name, sha]);
      await client.query('COMMIT');
      console.log(`Applied ${name}`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(hashtext('cornerstone-schema-migrations'))");
  await client.end();
}
