import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  loadMigrations,
  planMigrations,
  validateMigrationConnection,
} from '../scripts/migration-engine.js';
const source = (name: string, sql = 'SELECT 1;') => ({
  name,
  sql,
  sha256: createHash('sha256').update(sql).digest('hex'),
});
const sources = [source('001-first.sql'), source('002-second.sql'), source('003-third.sql')];
describe('complete migration preflight', () => {
  it('accepts fresh, partial, and complete contiguous inventories deterministically', () => {
    expect(planMigrations(sources, []).pending).toEqual(sources);
    expect(planMigrations([...sources].reverse(), [sources[0]!]).pending).toEqual(sources.slice(1));
    expect(planMigrations(sources, [...sources].reverse()).pending).toEqual([]);
    expect(planMigrations(sources, []).inventorySha256).toBe(
      planMigrations(sources, sources).inventorySha256,
    );
  });
  it('rejects changed checksums including a later entry before any pending execution', () => {
    expect(() =>
      planMigrations(sources, [sources[0]!, { ...sources[2]!, sha256: '0'.repeat(64) }]),
    ).toThrow(/modified/);
  });
  it('rejects deleted, duplicate and gapped applied history', () => {
    expect(() => planMigrations(sources, [source('004-unknown.sql')])).toThrow(/missing/);
    expect(() => planMigrations(sources, [sources[0]!, sources[0]!])).toThrow(/Duplicate/);
    expect(() => planMigrations(sources, [sources[0]!, sources[2]!])).toThrow(/prefix/);
  });
  it('rejects empty, duplicated, gapped, renamed and corrupt source inventories', () => {
    for (const invalid of [
      [],
      [sources[1]!],
      [sources[0]!, sources[0]!],
      [sources[0]!, sources[2]!],
      [source('../001-path.sql')],
      [{ ...sources[0]!, sql: 'SELECT 2;' }],
      [source('001-empty.sql', '')],
    ])
      expect(() => planMigrations(invalid, [])).toThrow();
  });
  it('validates the complete repository migration inventory', async () => {
    expect(planMigrations(await loadMigrations(), []).pending.length).toBeGreaterThanOrEqual(12);
  });
  it('refuses pooled or runtime connections without disclosing credentials', () => {
    for (const url of [
      'not-a-url',
      'https://localhost/db',
      'postgresql://localhost',
      'postgresql://cornerstone_runtime@localhost/test',
      'postgresql://cornerstone_worker@localhost/test',
      'postgresql://owner@ep-invented-pooler.example/test',
    ])
      expect(() => validateMigrationConnection(url)).toThrow();
    expect(() =>
      validateMigrationConnection('postgresql://migration@localhost/test'),
    ).not.toThrow();
    expect(() =>
      validateMigrationConnection(
        'postgresql://migration@ep-invented.example/test?sslmode=require',
      ),
    ).not.toThrow();
  });
});
