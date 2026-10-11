import pg from 'pg';
import { loadMigrations, runMigrations, validateMigrationConnection } from './migration-engine.js';

const url = process.env['MIGRATION_DATABASE_URL'];
if (!url) throw new Error('A separate MIGRATION_DATABASE_URL is required.');
validateMigrationConnection(url);
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--check')) throw Error('Supported option: --check');
const sources = await loadMigrations();
const client = new pg.Client({ connectionString: url, application_name: 'cornerstone-migration' });
await client.connect();
try {
  const result = await runMigrations(client, sources, { checkOnly: args.includes('--check') });
  console.log(
    JSON.stringify(
      {
        mode: args.includes('--check') ? 'check-only' : 'apply',
        previouslyApplied: result.appliedCount,
        pending: result.pending.map(({ name, sha256 }) => ({ name, sha256 })),
        executed: result.executed,
        inventorySha256: result.inventorySha256,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
