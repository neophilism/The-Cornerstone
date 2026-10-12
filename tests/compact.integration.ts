import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { addCalendarDays } from '@cornerstone/domain';
import { digest } from '@cornerstone/security';
import { type CaseRecord } from '@cornerstone/contracts';
import { Simulation, findings } from './helpers/simulation.js';
import { compactPrerequisites } from './helpers/compact-fixture.js';
const w = await new Simulation().connect();
try {
  const first = await w.person(),
    second = await w.person(),
    labor = await w.persona('labor');
  const group = await w.association(first, second, labor, 'Invented compact group ' + randomUUID());
  const f = await compactPrerequisites(w, first, group.association);
  const create = (title: string, input = f.input) => w.create(first, 'compact', title, input);
  const draft = await create('Invented complete compact');
  const resolutionInput = {
    associationId: group.association.id,
    decision: 'compact',
    compactId: draft.id,
    shareCompactTerms: true,
    proposal: 'Approve this complete fixed offer and compact',
  };
  await assert.rejects(
    w.create(first, 'resolution', 'No disclosure', {
      ...resolutionInput,
      shareCompactTerms: false,
    }),
    /authorize disclosure/,
  );
  await assert.rejects(
    w.create(first, 'resolution', 'No reference', { ...resolutionInput, compactId: undefined }),
  );
  const incomplete = await create('Invented missing menu term', {
    ...f.input,
    terms: { Lease: 'Standard' },
  } as typeof f.input);
  await assert.rejects(
    w.create(first, 'resolution', 'No implicit terms', {
      ...resolutionInput,
      compactId: incomplete.id,
    }),
    /every published/,
  );
  const forbidden = await create('Invented outside control', {
    ...f.input,
    investorRights: { ...f.input.investorRights, boardSeat: true },
  });
  await assert.rejects(
    w.create(first, 'resolution', 'No outsider board', {
      ...resolutionInput,
      compactId: forbidden.id,
    }),
  );
  const vote = async (record: CaseRecord, yes = true) => {
    const resolution = await w.create(
      first,
      'resolution',
      'Invented bound compact vote ' + randomUUID(),
      { ...resolutionInput, compactId: record.id },
    );
    const binding = resolution.data['compactBinding'] as {
      version: number;
      digest: string;
      plan: unknown;
    };
    assert.equal(binding.digest, digest(binding.plan));
    assert.equal(binding.version, (await w.get(first, record.id))!.version);
    await w.command(first, resolution, 'open_vote', { closesAt: w.today });
    assert.ok(
      (await w.get(second, resolution.id))!.data['compactBinding'],
      'The member can inspect all frozen terms',
    );
    assert.equal(
      await w.get(second, record.id),
      null,
      'Voting does not disclose the private draft or attachments',
    );
    await w.command(first, resolution, 'record_vote', {
      unitId: group.firstUnit.id,
      choice: 'yes',
    });
    await w.command(second, resolution, 'record_vote', {
      unitId: group.secondUnit.id,
      choice: yes ? 'yes' : 'no',
    });
    w.day = addCalendarDays(w.today, 1);
    const tally = (await w.command(labor, resolution, 'tally')).record!;
    w.day = w.today;
    return tally;
  };
  const failed = await vote(draft, false);
  await assert.rejects(
    w.command(first, draft, 'submit', { attested: true, memberResolutionId: failed.id }),
    /majority-of-all/,
  );
  const pending = await w.create(
    first,
    'resolution',
    'Invented pending changed draft',
    resolutionInput,
  );
  await w.command(first, draft, 'save_draft', {
    ...f.input,
    services: 'Invented revised service obligations',
  });
  await assert.rejects(w.command(first, pending, 'open_vote', { closesAt: w.today }), /changed/);
  const approved = await vote(draft);
  const unrelated = await create('Invented other compact');
  await assert.rejects(
    w.command(first, unrelated, 'submit', { attested: true, memberResolutionId: approved.id }),
    /exact unchanged/,
  );
  const current = (await w.get(first, draft.id))!,
    actor = await w.actor(first.id);
  const command = {
    recordId: draft.id,
    expectedVersion: current.version,
    action: 'submit',
    input: { attested: true, memberResolutionId: approved.id },
    idempotencyKey: randomUUID(),
  };
  const submitted = await w.program.command(actor, command),
    retried = await w.program.command(actor, command);
  assert.equal(retried.receipt.id, submitted.receipt.id);
  assert.equal(
    submitted.receipt.digest,
    digest({ record: submitted.record, action: 'submit', actorId: actor.id }),
  );
  assert.equal(submitted.record!.state, 'submitted');
  assert.equal(
    await w.get(f.supervisor, approved.id),
    null,
    'Compact review does not grant access to the private resolution',
  );
  const approvalSnapshot = submitted.record!.data['compactApproval'] as Record<string, unknown>;
  assert.equal(approvalSnapshot['resolutionDigest'], digest(approved));
  assert.equal(approvalSnapshot['yes'], 2);
  for (const privateKey of ['ballots', 'choices', 'holderIds', 'history', 'roll'])
    assert.equal(Object.hasOwn(approvalSnapshot, privateKey), false);
  await assert.rejects(
    w.command(first, unrelated, 'submit', {
      attested: true,
      memberResolutionId: approved.id,
      compactApproval: approvalSnapshot,
    }),
    /Unexpected field/,
  );
  await w.command(f.supervisor, draft, 'begin_review');
  const publication = {
    withinMenu: true,
    workerControl: true,
    publishedDate: w.today,
    reasons: findings,
  };
  await assert.rejects(
    w.command(f.supervisor, draft, 'publish', { ...publication, terms: { Lease: 'Short' } }),
    /Unexpected field/,
  );
  const published = (await w.command(f.supervisor, draft, 'publish', publication)).record!;
  assert.equal(published.state, 'published');
  assert.equal(published.data['initialYears'], 30);
  assert.equal(published.data['renewalYears'], 10);
  assert.equal(
    published.data['financialTerms'] && typeof published.data['financialTerms'],
    'object',
  );
  assert.equal(published.data['approvedCompactVersion'], current.version);
  assert.equal(
    published.data['approvedCompactDigest'],
    submitted.record!.data['approvedCompactDigest'],
  );
  await assert.rejects(w.command(first, draft, 'save_draft', f.input), /unavailable/);
  const stale = await create('Invented offer later withdrawn');
  const staleResolution = await w.create(first, 'resolution', 'Invented obsolete offer decision', {
    ...resolutionInput,
    compactId: stale.id,
  });
  // Downstream fixture transition only; actual authority and exchange gates remain unchanged.
  await w.owner.query("UPDATE case_records SET state='withdrawn' WHERE id=$1", [f.offer.id]);
  await assert.rejects(
    w.command(first, staleResolution, 'open_vote', { closesAt: w.today }),
    /published offer/,
  );
  const fresh = await compactPrerequisites(w, first, group.association);
  const retiredDraft = await create('Invented former holder draft', fresh.input);
  const retiredApproval = await vote(retiredDraft);
  const successor = await w.person(),
    request = await w.request(successor, group.firstUnit.id, labor);
  await w.command(labor, request.record, 'approve', request.input);
  await assert.rejects(
    w.command(first, retiredDraft, 'submit', {
      attested: true,
      memberResolutionId: retiredApproval.id,
    }),
    /current unconflicted founding member/,
  );
  console.log(
    'PASS compact integrity: exact complete menu, no negotiated rate, disclosure consent, frozen member terms, stale and unrelated approvals, failed votes, role/RLS privacy, retry receipts, immutable publication and retired-member denial. Downstream offer/match fixtures are not actual authority or exchange acceptance.',
  );
} finally {
  await w.close();
}
