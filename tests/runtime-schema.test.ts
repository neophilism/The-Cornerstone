import { describe, expect, it } from 'vitest';
import { assertSchemaInventory, verifySchema, schemaInventory } from '@cornerstone/store';
const fixture = schemaInventory.map((row) => ({ ...row }));
describe('runtime schema compatibility', () => {
  it('accepts the exact compiled inventory without mutating it', () => {
    const before = JSON.stringify(fixture);
    expect(() => assertSchemaInventory(fixture)).not.toThrow();
    expect(JSON.stringify(fixture)).toBe(before);
  });
  it.each([null, {}, [], fixture.slice(0, -1), [...fixture, fixture[0]], [...fixture].reverse()])(
    'rejects missing, unknown, duplicate or reordered migrations',
    (rows) => {
      expect(() => assertSchemaInventory(rows)).toThrow(/not verified/);
    },
  );
  it('rejects altered checksums, renamed files and excess metadata', () => {
    for (const delta of [
      { sha256: '0'.repeat(64) },
      { name: '001-other.sql' },
      { privateData: 'unexpected' },
    ]) {
      const rows = fixture.map((row) => ({ ...row }));
      Object.assign(rows[0]!, delta);
      expect(() => assertSchemaInventory(rows)).toThrow(/not verified/);
    }
  });
  it('does not expose provider exceptions or accept query failure as readiness', async () => {
    await expect(
      verifySchema({
        query: async () => {
          throw Error('private-provider-detail');
        },
      }),
    ).rejects.toThrow('Database schema is not verified');
    try {
      await verifySchema({
        query: async () => {
          throw Error('private-provider-detail');
        },
      });
    } catch (e) {
      expect(String(e)).not.toContain('private-provider-detail');
    }
  });
  it('issues only the exact read-only inventory query', async () => {
    const statements: string[] = [];
    await verifySchema({
      query: async (sql) => {
        statements.push(sql);
        return { rows: fixture };
      },
    });
    expect(statements).toEqual(['SELECT name,sha256 FROM public.runtime_schema_inventory()']);
  });
});
