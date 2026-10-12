import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { addCalendarDays } from '@cornerstone/domain';
import { digest } from '@cornerstone/security';
import { type Actor, type CaseRecord } from '@cornerstone/contracts';
import { Simulation, findings } from './helpers/simulation.js';
import { RecordReader } from '../apps/api/src/records.js';
const w = await new Simulation().connect();
try {
  const first = await w.person(),
    second = await w.person(),
    outsider = await w.person('member'),
    labor = await w.persona('labor');
  const group = await w.association(
    first,
    second,
    labor,
    'Invented governed plans ' + randomUUID(),
  );
  const terms = {
    associationId: group.association.id,
    trainingPlan: 'Invented accessible optional training and first opportunities',
    capitalPlan: 'Invented enterprise-only finance; no personal obligations',
    permitPlan: 'Invented ordinary permissions not yet granted',
    voluntary: true,
    shareWithMembers: true,
  };
  const plan = await w.create(first, 'opportunity', 'Invented shared plan ' + randomUUID(), {
    trade: 'Invented trade',
    district: 'Invented district',
    feasibility: findings,
  });
  assert.equal(await w.get(second, plan.id), null);
  await assert.rejects(w.command(first, plan, 'mark_ready', { attested: false }), /Confirm/);
  await w.command(first, plan, 'mark_ready', { attested: true });
  await assert.rejects(
    w.command(first, plan, 'propose', { ...terms, voluntary: false }),
    /voluntary/,
  );
  await assert.rejects(
    w.command(first, plan, 'propose', { ...terms, shareWithMembers: false }),
    /authorize/,
  );
  const shared = (await w.command(first, plan, 'propose', terms)).record!;
  assert.equal(shared.data['operatingAuthority'], false);
  assert.ok(await w.get(second, plan.id));
  assert.equal(await w.get(outsider, plan.id), null);
  assert.equal(
    (
      await new RecordReader(w.store).read(await w.actor(second.id), { recordId: plan.id })
    ).capabilities[0]!.actions.includes('adopt_plan'),
    true,
  );
  await assert.rejects(
    w.command(second, plan, 'withdraw_plan', { reasons: findings }),
    /assigned|scoped|Only/,
  );
  await assert.rejects(
    w.command(first, plan, 'save_draft', {
      trade: 'Changed',
      district: 'Changed',
      feasibility: findings,
    }),
    /unavailable/,
  );
  await assert.rejects(
    w.store.transaction(await w.actor(first.id), (tx) =>
      tx.query(
        'UPDATE opportunity_links SET proposal_version=proposal_version+1 WHERE opportunity_id=$1',
        [plan.id],
      ),
    ),
    /permission denied/,
  );
  await assert.rejects(
    w.store.transaction(await w.actor(outsider.id), (tx) =>
      tx.query('SELECT simulation_share_opportunity($1,$2,$3,$4,$5)', [
        plan.id,
        group.association.id,
        shared.version,
        '0'.repeat(64),
        randomUUID(),
      ]),
    ),
    /current founding member/,
  );
  const vote = async (yes: boolean, title: string) => {
    const resolution = await w.create(first, 'resolution', title, {
      associationId: group.association.id,
      decision: 'opportunity_plan',
      proposal: 'Adopt the entire fixed plan with voluntary participation',
      opportunityId: plan.id,
    });
    const binding = resolution.data['opportunityBinding'] as Record<string, unknown>;
    assert.equal(binding['version'], shared.version);
    assert.equal(binding['digest'], shared.data['proposalDigest']);
    await w.command(first, resolution, 'open_vote', { closesAt: w.today });
    for (const [actor, unit, choice] of [
      [first, group.firstUnit.id, 'yes'],
      [second, group.secondUnit.id, yes ? 'yes' : 'no'],
    ] as const)
      await w.command(actor, resolution, 'record_vote', { unitId: unit, choice });
    w.day = addCalendarDays(w.today, 1);
    const result = (await w.command(labor, resolution, 'tally')).record!;
    w.day = w.today;
    assert.equal(result.data['approved'], yes);
    return result;
  };
  const rejected = await vote(false, 'Invented failed plan vote');
  await assert.rejects(
    w.command(first, plan, 'adopt_plan', { memberResolutionId: rejected.id }),
    /approved opportunity-plan/,
  );
  const approved = await vote(true, 'Invented approved plan vote');
  const other = await w.create(first, 'opportunity', 'Invented distinct plan', {
    trade: 'Different trade',
    district: 'Other district',
    feasibility: findings,
  });
  await w.command(first, other, 'mark_ready', { attested: true });
  await w.command(first, other, 'propose', terms);
  const unchanged = (await w.get(first, other.id))!;
  await assert.rejects(
    w.command(first, other, 'adopt_plan', { memberResolutionId: approved.id }),
    /exact unchanged/,
  );
  assert.equal((await w.get(first, other.id))!.version, unchanged.version);
  const pending = await w.create(second, 'resolution', 'Invented withdrawn plan vote', {
    associationId: group.association.id,
    decision: 'opportunity_plan',
    proposal: findings,
    opportunityId: other.id,
  });
  await w.command(first, other, 'withdraw_plan', { reasons: findings });
  await assert.rejects(
    w.command(second, pending, 'open_vote', { closesAt: w.today }),
    /proposed plan/,
  );
  assert.equal((await w.get(second, pending.id))!.state, 'draft');
  const a = await w.actor(second.id),
    command = {
      recordId: plan.id,
      expectedVersion: shared.version,
      action: 'adopt_plan',
      input: { memberResolutionId: approved.id },
      idempotencyKey: randomUUID(),
    };
  const adopted = await w.program.command(a, command),
    replay = await w.program.command(a, command);
  assert.equal(adopted.record!.state, 'adopted');
  assert.equal(adopted.record!.data['operatingAuthority'], false);
  assert.equal(adopted.receipt.id, replay.receipt.id);
  assert.equal(adopted.receipt.digest, digest(adopted.record));
  await assert.rejects(
    w.command(first, plan, 'adopt_plan', { memberResolutionId: approved.id }),
    /unavailable/,
  );
  const successor = await w.person();
  const succession = await w.request(successor, group.firstUnit.id, labor);
  await w.command(labor, succession.record, 'approve', succession.input);
  assert.equal(
    await w.get(first, plan.id),
    null,
    'Past author must not retain shared member access after succession',
  );
  assert.ok(await w.get(successor, plan.id), 'The current holder can inspect the plan');
  assert.equal(await w.get(first, other.id), null);
  assert.ok(await w.get(successor, other.id), 'A withdrawn shared plan remains inspectable');
  console.log(
    'PASS governed opportunities: private preparation, explicit sharing, current-holder RLS, immutable proposal, exact binding, all-unit vote, failed vote, unrelated and withdrawn plan denial, idempotent adoption and succession access. No operation or legal authority created.',
  );
} finally {
  await w.close();
}
