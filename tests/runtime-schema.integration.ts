import pg from 'pg';
import { strict as assert } from 'node:assert';
import { schemaInventory, verifySchema, assertSchemaInventory } from '@cornerstone/store';
if (
  process.env['DATA_REALM'] !== 'simulation' ||
  !process.env['DATABASE_URL'] ||
  !process.env['WORKER_DATABASE_URL']
)
  throw Error('Separate isolated synthetic runtime and worker connections are required.');
const clients = [process.env['DATABASE_URL'], process.env['WORKER_DATABASE_URL']].map(
  (connectionString) => new pg.Client({ connectionString }),
);
try {
  for (const client of clients) {
    await client.connect();
    await verifySchema(client);
    const result = await client.query('SELECT name,sha256 FROM public.runtime_schema_inventory()');
    assert.deepEqual(result.rows, schemaInventory);
    assert.ok(result.rows.every((row) => Object.keys(row).sort().join(',') === 'name,sha256'));
    await assert.rejects(
      client.query('SELECT * FROM public.schema_migrations'),
      /permission denied/,
    );
    await assert.rejects(
      client.query("UPDATE public.schema_migrations SET sha256='changed'"),
      /permission denied/,
    );
    const p = (
      await client.query(
        `SELECT has_function_privilege('public','public.runtime_schema_inventory()','EXECUTE') AS allowed`,
      )
    ).rows[0];
    assert.equal(p.allowed, false);
    for (const rows of [
      result.rows.slice(0, -1),
      [...result.rows, { name: '999-unknown.sql', sha256: '0'.repeat(64) }],
      result.rows.map((row, i) => (i ? row : { ...row, sha256: '0'.repeat(64) })),
    ])
      assert.throws(() => assertSchemaInventory(rows), /not verified/);
  }
  console.log(
    'PASS: runtime and worker verify the exact compiled migration inventory; no raw ledger access, migration writes or PUBLIC execution; missing, newer and drifted inventories fail closed.',
  );
} finally {
  await Promise.all(clients.map((client) => client.end()));
}
