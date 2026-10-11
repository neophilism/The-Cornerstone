import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { Store } from '@cornerstone/store';
import { ActorSchema, type Actor, type Kind } from '@cornerstone/contracts';
import { digest } from '@cornerstone/security';
import { fixtureKey } from './fixture-key.js';
import { ProgramService } from '../apps/api/src/service.js';
if (
  process.env['DATA_REALM'] !== 'simulation' ||
  !process.env['DATABASE_URL'] ||
  !process.env['MIGRATION_DATABASE_URL']
)
  throw Error('Isolated synthetic connections required.');
const owner = new pg.Client({ connectionString: process.env['MIGRATION_DATABASE_URL'] });
await owner.connect();
const store = new Store(process.env['DATABASE_URL'], fixtureKey());
const program = new ProgramService(store, 'simulation', 'simulation');
const tokens = new Map<string, string>();
async function actor(persona: string): Promise<Actor> {
  let token = tokens.get(persona);
  if (!token) {
    const row = (await store.pool.query('SELECT simulation_persona($1) AS id', [persona])).rows[0];
    assert.ok(row?.id);
    token = digest(randomUUID());
    await store.pool.query('SELECT auth_session($1,$2,$3)', [row.id, token, digest(randomUUID())]);
    tokens.set(persona, token);
  }
  return ActorSchema.parse(
    (await store.pool.query('SELECT * FROM auth_lookup($1)', [token])).rows[0]?.actor,
  );
}
async function get(persona: string, id: string) {
  return store.transaction(await actor(persona), (tx) => store.get(tx, id));
}
async function command(
  persona: string,
  id: string,
  action: string,
  input: Record<string, unknown> = {},
) {
  const a = await actor(persona),
    r = await store.transaction(a, (tx) => store.get(tx, id));
  assert.ok(r);
  return program.command(a, {
    recordId: id,
    expectedVersion: r.version,
    idempotencyKey: randomUUID(),
    action,
    input,
  });
}
async function create(persona: string, kind: Kind, title: string, input: Record<string, unknown>) {
  return (
    await program.create(await actor(persona), { kind, title, input, idempotencyKey: randomUUID() })
  ).record!;
}

try {
  const member = await actor('member'),
    fiscal = await actor('fiscal');
  const association = (await store.list(member)).find(
    (r) => r.title === 'Invented closed association',
  );
  assert.ok(association);
  const offerId = randomUUID(),
    compactId = randomUUID();
  const terms = {
    version: 'synthetic-finance-v1',
    rateActId: 'SYNTHETIC-NOT-AN-ENACTED-RATE',
    rate: { numerator: '1', denominator: '20' },
    workingCapitalMonths: 6,
    ordinaryHorizonMonths: 36,
    growthLimit: { numerator: '1', denominator: '2' },
  };
  // Isolated prerequisites only: these fixtures do not claim a real offer, match or compact execution.
  for (const [id, kind, state, title, data] of [
    [offerId, 'offer', 'published', 'Invented finance offer', { financialTerms: terms }],
    [
      compactId,
      'compact',
      'effective',
      'Invented finance compact',
      { offerId, associationId: association.id },
    ],
  ] as const) {
    await owner.query(
      `INSERT INTO case_records(id,realm,kind,state,version,owner_id,institution_id,policy_version,payload_cipher) VALUES($1,'simulation',$2,$3,1,$4,$5,'proposal-v1',$6)`,
      [
        id,
        kind,
        state,
        member.id,
        fiscal.institutionId,
        store.seal({ title, data }, `cornerstone:record:${id}:1`),
      ],
    );
  }
  await owner.query('UPDATE actors SET assignments=array_cat(assignments,$2::uuid[]) WHERE id=$1', [
    fiscal.id,
    [offerId, compactId],
  ]);
  const cost = (id: string, kind: string, amount: string) => ({
    id,
    sourceId: 'source:' + id,
    kind,
    paid: amount,
    reserved: '0.00',
    eligibleAmount: amount,
    fundFinanced: false,
    previouslyDeducted: false,
    required: true,
    armLength: true,
    irrevocablyReserved: false,
  });
  const schedule = {
    yearEnd: '2026-12-31',
    grossReceipts: '1000.00',
    financingProceeds: '0.00',
    refunds: '0.00',
    collectedTaxes: '0.00',
    recoveriesAndReleasedAllowances: '0.00',
    ordinaryAnnualOperatingCosts: '400.00',
    cashCycleShortfall: '100.00',
    priorDeductionSourceIds: [],
    costs: [
      cost('operating', 'operating', '100.00'),
      cost('fund', 'fund', '100.00'),
      cost('debt', 'debt_principal', '50.00'),
    ],
    losses: [
      {
        id: 'loss',
        year: 2025,
        original: '100.00',
        remaining: '100.00',
        enterpriseId: association.id,
      },
    ],
    allowances: [
      {
        id: 'working',
        sourceId: 'source:working',
        kind: 'working_capital',
        addition: '100.00',
        target: '100.00',
        existingDedicated: '0.00',
        insuranceGrantsOtherFinance: '0.00',
        deadline: '2027-12-31',
        originalDeadline: '2027-12-31',
        documented: true,
        verified: true,
        restricted: true,
        legallyRequiredLonger: false,
        legalRequiredAmount: '0.00',
      },
    ],
  };
  await assert.rejects(
    create('member', 'financial_schedule', 'Invented forbidden private rate', {
      compactId,
      fiscalYear: 2026,
      schedule: { ...schedule, terms },
    }),
  );
  const record = await create(
    'member',
    'financial_schedule',
    'Invented verified finance calculation',
    { compactId, fiscalYear: 2026, schedule },
  );
  await command('member', record.id, 'submit', { attested: true });
  await assert.rejects(command('member', record.id, 'calculate'), /assigned|scoped member/i);
  const calculated = (await command('fiscal', record.id, 'calculate')).record!;
  const result = calculated.data['calculation'] as Record<string, unknown>;
  assert.equal(result['shareableSurplus'], '550.00');
  assert.equal(result['statePayment'], '27.50');
  assert.equal(result['termsVersion'], terms.version);
  const duplicate = {
    ...schedule,
    costs: [
      ...schedule.costs,
      { ...cost('duplicate', 'operating', '1.00'), sourceId: 'source:operating' },
    ],
  };
  await assert.rejects(
    command('fiscal', record.id, 'correct', {
      schedule: duplicate,
      reasons: 'Invented rejected repeated source',
    }),
    /twice|deduct|source/i,
  );
  assert.equal((await get('fiscal', record.id))!.version, calculated.version);
  const zero = (
    await command('fiscal', record.id, 'correct', {
      schedule: { ...schedule, grossReceipts: '0.00' },
      reasons: 'Invented transparent receipt correction',
    })
  ).record!;
  assert.equal((zero.data['calculation'] as Record<string, unknown>)['statePayment'], '0.00');
  await command('member', record.id, 'request_review', {
    reasons: 'Invented appeal of the input classification under the unchanged published method',
  });
  assert.equal((await get('member', record.id))!.state, 'review_requested');
  const fund = await create('member', 'fund_commitment', 'Invented bounded Fund advance', {
    associationId: association.id,
    principal: '100.00',
    budget: [{ kind: 'formation', amount: '100.00' }],
  });
  await command('member', fund.id, 'submit', { attested: true });
  await command('fiscal', fund.id, 'begin_review');
  await assert.rejects(
    command('fiscal', fund.id, 'approve', {
      fixedReturn: '10.00',
      receiptRate: { numerator: '1', denominator: '10' },
      appropriationReference: 'SYNTHETIC-ONLY',
      enterpriseOnly: false,
      reasons: 'Invented terms',
    }),
    /personal guarantee/,
  );
  const approved = (
    await command('fiscal', fund.id, 'approve', {
      fixedReturn: '10.00',
      receiptRate: { numerator: '1', denominator: '10' },
      appropriationReference: 'SYNTHETIC-ONLY',
      enterpriseOnly: true,
      reasons: 'Invented finite enterprise-only commitment',
    })
  ).record!;
  assert.equal(approved.state, 'approved');
  assert.equal(approved.data['collected'], '0.00');
  assert.equal(approved.data['released'], false);
  console.log(
    'PASS financial journey: published terms only, exact ordered deductions, duplicate-source rollback, zero-surplus correction, member appeal and limited enterprise-only Fund approval. No external transfer executed.',
  );
} finally {
  await store.pool.end();
  await owner.end();
}
