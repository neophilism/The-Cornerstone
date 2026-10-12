import { schemaInventory } from './schema-inventory.js';
export { schemaInventory } from './schema-inventory.js';

type Entry = Readonly<{ name: string; sha256: string }>;
export class SchemaReadinessError extends Error {
  readonly code = 'SCHEMA_NOT_READY';
  constructor() {
    super(
      'Database schema is not verified for this application build. Apply the checked migrations with separate owner credentials and deploy the matching build.',
    );
    this.name = 'SchemaReadinessError';
  }
}

/** Strict compatibility, not a security assessment or a certificate of deployed SQL definitions. */
export function assertSchemaInventory(
  actual: unknown,
  expected: readonly Entry[] = schemaInventory,
) {
  if (!Array.isArray(actual) || actual.length !== expected.length || expected.length === 0)
    throw new SchemaReadinessError();
  for (const [index, entry] of expected.entries()) {
    const row = actual[index];
    if (
      !row ||
      typeof row !== 'object' ||
      Array.isArray(row) ||
      Object.keys(row).sort().join(',') !== 'name,sha256' ||
      row.name !== entry.name ||
      row.sha256 !== entry.sha256
    )
      throw new SchemaReadinessError();
  }
}

export async function verifySchema(connection: {
  query(sql: string): Promise<{ rows: unknown[] }>;
}) {
  let rows: unknown[];
  try {
    // No session, private row, SQL definition, or credential is returned by this function.
    rows = (await connection.query('SELECT name,sha256 FROM public.runtime_schema_inventory()'))
      .rows;
  } catch {
    // Old databases do not have the reader. Avoid exporting provider/connection error details.
    throw new SchemaReadinessError();
  }
  assertSchemaInventory(rows);
}
