import { describe, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  researchDataset,
  researchEvents,
  researchJurisdictions,
  sourceDocuments,
  searchResearch,
  findResearchEvent,
  relatedResearch,
  publicSourceUrl,
} from '../packages/content/src/research.js';
describe('approved public research projection', () => {
  test('all seven original byte hashes match the published manifest', () => {
    expect(sourceDocuments).toHaveLength(7);
    for (const source of sourceDocuments) {
      const bytes = readFileSync(source.path);
      expect(bytes.length).toBe(source.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.sha256);
      expect(source).not.toHaveProperty('library_file_id');
    }
    expect(new Set(sourceDocuments.map((s) => s.slug)).size).toBe(7);
  });
  test('all six sheets and census IDs reconcile with independently recorded source counts', () => {
    expect(
      Object.fromEntries(researchDataset.sheets.map((s) => [s.name, s.records.length])),
    ).toEqual({
      'Event evidence': 231,
      'Citation audit': 231,
      'Workforce evidence': 128,
      Worksites: 120,
      Method: 17,
      'Coverage audit': 37,
    });
    expect(researchEvents).toHaveLength(231);
    expect(new Set(researchEvents.map((e) => e.id)).size).toBe(231);
    expect(researchEvents.map((e) => e.id).sort()).toEqual(
      researchDataset.census.map((e) => e.id).sort(),
    );
    expect(
      researchEvents.every(
        (e) => e.classification === 'research-only' && !('certificationId' in e),
      ),
    ).toBe(true);
    expect(findResearchEvent('C-036A')).toBeDefined();
    expect(findResearchEvent('C-036D')).toBeDefined();
  });
  test('provenance uses actual worksheet rows and retains uncertainty', () => {
    const prohibition = findResearchEvent('C-001')!;
    expect(prohibition.row).toBe(5);
    expect(prohibition.actionDate).toBe('1919–1933');
    expect(prohibition.limits).toContain('occupational timing');
    expect(relatedResearch('Citation audit', 'C-001')[0]?.row).toBe(5);
    expect(relatedResearch('Worksites', 'C-027').length).toBeGreaterThan(0);
    expect(relatedResearch('Worksites', 'C-001')).toEqual([]);
    for (const e of researchEvents) expect(relatedResearch('Citation audit', e.id)).toHaveLength(1);
  });
  test('search matches all words and keeps jurisdiction distinct from personal eligibility', () => {
    expect(searchResearch({ query: 'national prohibition' }).events.map((e) => e.id)).toContain(
      'C-001',
    );
    expect(searchResearch({ query: 'national prohibition', jurisdiction: 'Texas' }).count).toBe(0);
    expect(researchJurisdictions).toContain('United States');
    expect(searchResearch({ query: 'unlisted-example-that-is-not-in-source' }).count).toBe(0);
    expect(findResearchEvent('C-999')).toBeUndefined();
  });
  test('pagination cannot erase records or be broken by invalid page numbers', () => {
    const ids: string[] = [];
    for (let p = 1; p <= 12; p++) ids.push(...searchResearch({ page: p }).events.map((e) => e.id));
    expect(ids).toHaveLength(231);
    expect(new Set(ids).size).toBe(231);
    for (const page of [NaN, Infinity, -500, 0, 1.5]) expect(searchResearch({ page }).page).toBe(1);
    expect(searchResearch({ page: 100000 }).page).toBe(12);
  });
  test('chronological indexing does not manufacture an exact date or legal priority', () => {
    const first = searchResearch({ view: 'timeline' }).events;
    expect(first.map((e) => e.sortYear)).toEqual(
      [...first.map((e) => e.sortYear)].sort((a, b) => (a ?? Infinity) - (b ?? Infinity)),
    );
    expect(findResearchEvent('C-001')?.actionDate).toBe('1919–1933');
    expect(first.every((e) => !('priorityDate' in e))).toBe(true);
  });
  test('untrusted citations cannot become executable or credential-bearing links', () => {
    for (const input of [
      'javascript:alert(1)',
      'data:text/html,foo',
      'file:///etc/passwd',
      'https://user:password@example.com',
      'not a URL',
    ])
      expect(publicSourceUrl(input)).toBeNull();
    expect(publicSourceUrl('https://www.archives.gov/education/lessons/volstead-act')).toMatch(
      /^https:\/\/www.archives.gov\//,
    );
  });
});
