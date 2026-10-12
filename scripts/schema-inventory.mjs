import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export async function renderSchemaInventory(root) {
  const names = (await readdir(resolve(root, 'db'))).filter((name) => name.endsWith('.sql')).sort();
  if (!names.length) throw Error('No schema migrations were found.');
  const entries = [];
  for (const [index, name] of names.entries()) {
    const match = /^(\d{3})-[a-z0-9]+(?:-[a-z0-9]+)*\.sql$/.exec(name);
    if (!match || Number(match[1]) !== index + 1)
      throw Error('Schema migrations must be uniquely named and contiguous from 001.');
    const bytes = await readFile(resolve(root, 'db', name));
    if (!bytes.toString('utf8').trim()) throw Error('An empty migration cannot be inventoried.');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    entries.push(`  {\n    name: '${name}',\n    sha256: '${sha256}',\n  },`);
  }
  return (
    '// Generated from db/*.sql by scripts/schema-inventory.mjs --write. Do not edit.\n' +
    'export const schemaInventory = [\n' +
    entries.join('\n') +
    '\n] as const;\n'
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['--check', '--write'].includes(args[0]))
    throw Error('Use --check or --write; schema generation never connects to a database.');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const path = resolve(root, 'packages/store/src/schema-inventory.ts');
  const expected = await renderSchemaInventory(root);
  if (args[0] === '--write') {
    await writeFile(path, expected);
    console.log('Updated the compiled schema inventory; review and commit it with the migration.');
  } else {
    const actual = await readFile(path, 'utf8').catch(() => '');
    if (actual !== expected)
      throw Error(
        'Compiled schema inventory is stale. Run node scripts/schema-inventory.mjs --write and review the change.',
      );
    console.log('Compiled schema inventory matches every migration byte.');
  }
}
