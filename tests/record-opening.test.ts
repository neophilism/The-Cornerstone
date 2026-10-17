import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CaseRecord } from '@cornerstone/contracts';
import { verifiedRecordOpening, verifiedRecordPage } from '../packages/ui/src/record-opening.js';

function fixture() {
  const actor = { id: randomUUID(), realm: 'simulation' as const };
  // A scoped reader need not own the record. Never replace authorization with ownership.
  const record: CaseRecord = {
    id: randomUUID(),
    ownerId: randomUUID(),
    kind: 'dossier',
    realm: 'simulation',
    version: 3,
    state: 'draft',
    title: 'Invented authorized reference',
    data: {},
    policyVersion: 'synthetic',
    institutionId: null,
    jurisdiction: null,
    createdAt: '2026-10-17T12:00:00Z',
    updatedAt: '2026-10-17T12:00:00Z',
  };
  const capability = { recordId: record.id, version: 3, actions: [] };
  const response = {
    context: { actorId: actor.id, realm: actor.realm },
    records: [record],
    capabilities: [capability],
    nextCursor: null,
  };
  return { actor, record, capability, response };
}

describe('authenticated direct record opening', () => {
  it('accepts one exact current record and its read-only capabilities for an authorized reader', () => {
    const { actor, record, response } = fixture();
    expect(verifiedRecordOpening(response, ' ' + record.id + ' ', actor, 2)).toEqual({
      record,
      capabilities: response.capabilities,
    });
  });
  it('rejects another record, older content, ambiguous pages and malformed responses', () => {
    const { actor, record, response } = fixture();
    for (const raw of [
      null,
      {},
      { ...response, records: [] },
      { ...response, records: [record, record] },
      { ...response, nextCursor: 'abc' },
      { ...response, records: [{ ...record, id: randomUUID() }] },
    ])
      expect(() => verifiedRecordOpening(raw, record.id, actor)).toThrow();
    expect(() => verifiedRecordOpening(response, randomUUID(), actor)).toThrow();
    expect(() => verifiedRecordOpening(response, record.id, actor, 4)).toThrow();
    expect(() => verifiedRecordOpening(response, 'not-a-record-reference', actor)).toThrow();
  });
  it('rejects actor substitution, realm substitution and mixed-realm content', () => {
    const { actor, record, response } = fixture();
    for (const raw of [
      { ...response, context: { ...response.context, actorId: randomUUID() } },
      { ...response, context: { ...response.context, realm: 'program' } },
      { ...response, records: [{ ...record, realm: 'program' }] },
      { ...response, context: undefined },
    ])
      expect(() => verifiedRecordOpening(raw, record.id, actor)).toThrow();
  });
  it('refuses missing, duplicate, foreign or wrong-version capabilities before displaying controls', () => {
    const { actor, record, capability, response } = fixture();
    for (const capabilities of [
      [],
      [capability, capability],
      [{ ...capability, recordId: randomUUID() }],
      [{ ...capability, version: 2 }],
      [{ ...capability, version: 4 }],
    ])
      expect(() =>
        verifiedRecordOpening({ ...response, capabilities }, record.id, actor),
      ).toThrow();
  });
  it('validates every page row and capability while preserving a legitimate continuation', () => {
    const { actor, record, response } = fixture();
    const second = { ...record, id: randomUUID(), version: 5 };
    const page = {
      ...response,
      records: [record, second],
      capabilities: [
        ...response.capabilities,
        { recordId: second.id, version: 5, actions: ['save_draft'] },
      ],
      nextCursor: 'valid_cursor-123',
    };
    expect(verifiedRecordPage(page, actor)).toEqual({
      records: page.records,
      capabilities: page.capabilities,
      nextCursor: page.nextCursor,
    });
    expect(() =>
      verifiedRecordPage({ ...page, records: [record, { ...second, realm: 'proposal' }] }, actor),
    ).toThrow();
    expect(() =>
      verifiedRecordPage({ ...page, nextCursor: 'https://not-a-cursor.invalid/' }, actor),
    ).toThrow();
    expect(() => verifiedRecordPage({ ...page, nextCursor: undefined }, actor)).toThrow();
  });
  it('accepts an empty authorized list without making it a successful reference lookup', () => {
    const { actor, record, response } = fixture();
    const empty = { ...response, records: [], capabilities: [] };
    expect(verifiedRecordPage(empty, actor).records).toEqual([]);
    expect(() => verifiedRecordOpening(empty, record.id, actor)).toThrow();
  });
});
