import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { Simulation, findings } from "./helpers/simulation.js";
import { ProgramService } from "../apps/api/src/service.js";
const w = await new Simulation().connect();
try {
  const first = await w.person(),
    second = await w.person(),
    candidate = await w.person(),
    competitor = await w.person(),
    labor = await w.person("labor");
  const { association, firstUnit, secondUnit } = await w.association(
    first,
    second,
    labor,
  );
  const resolution = await w.resolution(first, association);
  const emptyResolution = await w.resolution(
    first,
    association,
    "Invented not-yet-voted decision",
  );
  const ballot = await w.command(first, resolution, "record_vote", {
    unitId: firstUnit.id,
    choice: "yes",
  });
  const originalBallot = (
    await w.owner.query("SELECT * FROM ballots WHERE receipt_id=$1", [
      ballot.receipt.id,
    ])
  ).rows[0];
  const savedRoll = (
    await w.owner.query(
      "SELECT * FROM resolution_links WHERE resolution_id=$1",
      [resolution.id],
    )
  ).rows[0];
  const request = await w.request(candidate, firstUnit.id, labor);
  const competing = await w.request(competitor, firstUnit.id, labor);
  assert.equal(await w.get(candidate, association.id), null);
  assert.equal(await w.get(candidate, firstUnit.claim_id), null);
  await assert.rejects(
    w.command(labor, request.record, "approve", {
      ...request.input,
      undivided: false,
    }),
  );
  await assert.rejects(
    w.command(labor, request.record, "approve", {
      ...request.input,
      deathEstablished: false,
    }),
  );
  await assert.rejects(
    w.command(labor, request.record, "approve", {
      ...request.input,
      evidenceIds: [randomUUID()],
    }),
  );
  await w.owner.query(
    "UPDATE actors SET conflicts=ARRAY[$2::uuid] WHERE id=$1",
    [labor.id, association.id],
  );
  await assert.rejects(
    w.command(labor, request.record, "approve", request.input),
    {
      code: "SUCCESSION_SCOPE",
    },
  );
  await w.owner.query("UPDATE actors SET conflicts='{}' WHERE id=$1", [
    labor.id,
  ]);
  const current = (await w.get(labor, request.record.id))!;
  const approval = {
    recordId: current.id,
    expectedVersion: current.version,
    idempotencyKey: randomUUID(),
    action: "approve",
    input: request.input,
  };
  const [approved, retried] = await Promise.all([
    w.program.command(await w.actor(labor.id), approval),
    w.program.command(await w.actor(labor.id), approval),
  ]);
  assert.equal(approved.receipt.id, retried.receipt.id);
  const after = (
    await w.owner.query("SELECT * FROM founding_units WHERE id=$1", [
      firstUnit.id,
    ])
  ).rows[0];
  assert.equal(after.successor_id, candidate.id);
  assert.equal(after.person_id, first.id);
  assert.equal(after.claim_id, firstUnit.claim_id);
  assert.equal(after.holder_version, 2);
  assert.equal(after.rights_holder_id, candidate.id);
  assert.equal(after.holder_capacity, "designated_successor");
  assert.equal(
    (
      await w.owner.query(
        "SELECT count(*)::int AS n FROM founding_units WHERE association_id=$1",
        [association.id],
      )
    ).rows[0].n,
    2,
  );
  assert.equal(
    (
      await w.owner.query(
        "SELECT count(*)::int AS n FROM unit_successions WHERE request_id=$1",
        [request.record.id],
      )
    ).rows[0].n,
    1,
  );
  await assert.rejects(
    w.command(labor, competing.record, "approve", competing.input),
    {
      code: "SUCCESSION_STALE",
    },
  );
  assert.equal((await w.get(competitor, competing.record.id))!.state, "review");
  assert.equal(
    (await w.get(competitor, competing.record.id))!.version,
    competing.record.version,
  );
  assert.equal(
    (
      await w.owner.query(
        "SELECT count(*)::int AS n FROM receipts WHERE record_id=$1 AND action=$2",
        [competing.record.id, "approve"],
      )
    ).rows[0].n,
    0,
  );
  assert.ok(await w.get(candidate, association.id));
  assert.equal(
    await w.get(first, association.id),
    null,
    "original record ownership cannot restore transferred membership",
  );
  assert.equal(await w.get(first, resolution.id), null);
  assert.equal(
    await w.get(candidate, firstUnit.claim_id),
    null,
    "a unit does not transfer a personal claim file or account",
  );
  assert.ok(
    await w.get(first, firstUnit.claim_id),
    "unrelated personal access remains in its original account",
  );
  assert.equal(
    (await w.actor(candidate.id)).assurance,
    "draft",
    "a synthetic succession cannot elevate identity assurance",
  );
  const view = await w.members.ballotView(
    await w.actor(candidate.id),
    resolution.id,
  );
  assert.deepEqual(view.ownUnits, [firstUnit.id]);
  assert.deepEqual(view.castUnits, [firstUnit.id]);
  assert.deepEqual(
    view.ownBallots,
    [],
    "successor gets used-vote status, not predecessor choice",
  );
  assert.equal(
    (
      await w.store.transaction(await w.actor(candidate.id), (tx) =>
        tx.query("SELECT * FROM ballots WHERE id=$1", [originalBallot.id]),
      )
    ).rowCount,
    0,
  );
  await assert.rejects(
    w.command(candidate, resolution, "record_vote", {
      unitId: firstUnit.id,
      choice: "no",
    }),
    { code: "DUPLICATE_BALLOT" },
  );
  await assert.rejects(
    w.store.transaction(await w.actor(first.id), (tx) =>
      tx.query("SELECT simulation_lock_voting_unit($1,$2)", [
        resolution.id,
        firstUnit.id,
      ]),
    ),
    /UNIT_AUTHORITY/,
  );
  await w.command(candidate, emptyResolution, "record_vote", {
    unitId: firstUnit.id,
    choice: "abstain",
  });
  assert.equal(
    (
      await w.members.ballotView(
        await w.actor(candidate.id),
        emptyResolution.id,
      )
    ).ownBallots[0]!.choice,
    "abstain",
  );
  assert.deepEqual(
    (
      await w.owner.query("SELECT * FROM ballots WHERE id=$1", [
        originalBallot.id,
      ])
    ).rows[0],
    originalBallot,
  );
  assert.deepEqual(
    (
      await w.owner.query(
        "SELECT * FROM resolution_links WHERE resolution_id=$1",
        [resolution.id],
      )
    ).rows[0],
    savedRoll,
  );
  await assert.rejects(
    w.owner.query(
      "UPDATE unit_successions SET capacity=capacity WHERE request_id=$1",
      [request.record.id],
    ),
    /Append-only/,
  );
  await assert.rejects(
    w.store.transaction(await w.actor(candidate.id), (tx) =>
      tx.query("UPDATE founding_units SET successor_id=$1 WHERE id=$2", [
        first.id,
        firstUnit.id,
      ]),
    ),
    /permission denied/,
  );
  const collision = await w.request(second, firstUnit.id, labor);
  await assert.rejects(
    w.command(labor, collision.record, "approve", collision.input),
    {
      code: "SUCCESSION_VOTE_COLLISION",
    },
  );
  assert.equal((await w.get(second, collision.record.id))!.state, "review");
  assert.equal(
    (
      await w.owner.query(
        "SELECT successor_id FROM founding_units WHERE id=$1",
        [firstUnit.id],
      )
    ).rows[0].successor_id,
    candidate.id,
  );
  assert.equal(
    (
      await w.owner.query(
        "SELECT successor_id FROM founding_units WHERE id=$1",
        [secondUnit.id],
      )
    ).rows[0].successor_id,
    null,
  );
  const proposed = await w.create(
    competitor,
    "succession",
    "Invented consent denial",
    {
      unitId: firstUnit.id,
      transferBasis: "member_death",
      capacity: "designated_successor",
      chain: findings,
    },
  );
  await w.attach(competitor, proposed);
  await assert.rejects(
    w.command(competitor, proposed, "submit", {
      attested: true,
      rightsAcknowledged: false,
    }),
  );
  await assert.rejects(
    new ProgramService(w.store, "authorized", "program").create(
      { ...competitor, realm: "program" },
      {
        kind: "succession",
        title: "No production activation",
        input: {},
        idempotencyKey: randomUUID(),
      },
    ),
  );
  // An estate representative is a single temporary holder, not an extra unit.
  const representative = await w.person(),
    finalSuccessor = await w.person();
  const estate = await w.request(
    representative,
    firstUnit.id,
    labor,
    "member_death",
    "estate_representative",
  );
  await w.command(labor, estate.record, "approve", estate.input);
  const estateUnit = (
    await w.owner.query("SELECT * FROM founding_units WHERE id=$1", [
      firstUnit.id,
    ])
  ).rows[0];
  assert.equal(estateUnit.rights_holder_id, candidate.id);
  assert.equal(estateUnit.successor_id, representative.id);
  const final = await w.request(
    finalSuccessor,
    firstUnit.id,
    labor,
    "estate_designation",
    "designated_successor",
  );
  await w.command(labor, final.record, "approve", final.input);
  const finalUnit = (
    await w.owner.query("SELECT * FROM founding_units WHERE id=$1", [
      firstUnit.id,
    ])
  ).rows[0];
  assert.equal(finalUnit.holder_version, 4);
  assert.equal(finalUnit.rights_holder_id, finalSuccessor.id);
  assert.equal(
    (
      await w.members.ballotView(
        await w.actor(finalSuccessor.id),
        resolution.id,
      )
    ).ownBallots.length,
    0,
  );
  assert.equal(await w.get(representative, association.id), null);
  await w.command(labor, competing.record, "request_changes", {
    reasons: findings,
  });
  await w.command(competitor, competing.record, "revise_request");
  assert.equal(
    (await w.get(competitor, competing.record.id))!.data["reviewedUnit"],
    undefined,
  );
  // Competing, independently prepared requests cannot both transfer one unit.
  const left = await w.person(),
    right = await w.person();
  const leftRequest = await w.request(left, firstUnit.id, labor);
  const rightRequest = await w.request(right, firstUnit.id, labor);
  const concurrent = await Promise.allSettled([
    w.command(labor, leftRequest.record, "approve", leftRequest.input),
    w.command(labor, rightRequest.record, "approve", rightRequest.input),
  ]);
  assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
  const rejectedApproval = concurrent.find((r) => r.status === "rejected");
  assert.equal(
    rejectedApproval?.status === "rejected" && rejectedApproval.reason.code,
    "SUCCESSION_STALE",
  );
  assert.equal(
    (
      await w.owner.query(
        "SELECT holder_version FROM founding_units WHERE id=$1",
        [firstUnit.id],
      )
    ).rows[0].holder_version,
    5,
  );

  // Two different founding units cannot race into two votes for one successor.
  const voteFirst = await w.person(),
    voteSecond = await w.person(),
    voteCandidate = await w.person();
  const voteAssociation = await w.association(
    voteFirst,
    voteSecond,
    labor,
    "Invented concurrent single-vote association",
  );
  const voteFirstRequest = await w.request(
    voteCandidate,
    voteAssociation.firstUnit.id,
    labor,
  );
  const voteSecondRequest = await w.request(
    voteCandidate,
    voteAssociation.secondUnit.id,
    labor,
  );
  const voteApprovals = await Promise.allSettled([
    w.command(
      labor,
      voteFirstRequest.record,
      "approve",
      voteFirstRequest.input,
    ),
    w.command(
      labor,
      voteSecondRequest.record,
      "approve",
      voteSecondRequest.input,
    ),
  ]);
  assert.equal(
    voteApprovals.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const voteFailure = voteApprovals.find(
    (result) => result.status === "rejected",
  );
  assert.equal(
    voteFailure?.status === "rejected" && voteFailure.reason.code,
    "SUCCESSION_VOTE_COLLISION",
  );
  assert.equal(
    (
      await w.owner.query(
        "SELECT count(*)::int AS n FROM founding_units WHERE association_id=$1 AND successor_id=$2",
        [voteAssociation.association.id, voteCandidate.id],
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await w.owner.query(
        "SELECT count(*)::int AS n FROM unit_successions WHERE association_id=$1",
        [voteAssociation.association.id],
      )
    ).rows[0].n,
    1,
  );
  const deniedVoteRequest =
    voteApprovals[0]?.status === "rejected"
      ? voteFirstRequest.record
      : voteSecondRequest.record;
  assert.equal(
    (await w.get(voteCandidate, deniedVoteRequest.id))!.state,
    "review",
  );
  assert.equal(
    (
      await w.owner.query(
        "SELECT count(*)::int AS n FROM receipts WHERE record_id=$1 AND action='approve'",
        [deniedVoteRequest.id],
      )
    ).rows[0].n,
    0,
  );

  // Deliberate owner-only fixture mutation exercises the wait/recheck boundary.
  // This is not a succession path: HTTP/runtime credentials cannot update units.
  const raceFirst = await w.person(),
    raceSecond = await w.person(),
    raceTarget = await w.person();
  const race = await w.association(
    raceFirst,
    raceSecond,
    labor,
    "Invented ballot lock race",
  );
  const raceResolution = await w.resolution(raceFirst, race.association);
  const beforeRace = (await w.get(raceFirst, raceResolution.id))!;
  await w.owner.query("BEGIN");
  try {
    await w.owner.query(
      "SELECT id FROM founding_units WHERE id=$1 FOR UPDATE",
      [race.firstUnit.id],
    );
    const pendingBallot = w
      .command(raceFirst, raceResolution, "record_vote", {
        unitId: race.firstUnit.id,
        choice: "yes",
      })
      .then(
        () => ({ accepted: true, code: "" }),
        (error: { code: string }) => ({ accepted: false, code: error.code }),
      );
    let waiting = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      await w.owner.query("SELECT pg_stat_clear_snapshot()");
      const blocked = await w.owner.query(
        "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name='cornerstone-runtime' AND wait_event_type='Lock' AND query LIKE 'SELECT simulation_lock_voting_unit%'",
      );
      if (blocked.rowCount) {
        waiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(
      waiting,
      "The ballot must actually wait on the founding-unit row",
    );
    await w.owner.query(
      "UPDATE founding_units SET successor_id=$2 WHERE id=$1",
      [race.firstUnit.id, raceTarget.id],
    );
    await w.owner.query("COMMIT");
    const outcome = await pendingBallot;
    assert.deepEqual(outcome, { accepted: false, code: "UNIT_AUTHORITY" });
    assert.equal(
      (await w.get(raceFirst, raceResolution.id))!.version,
      beforeRace.version,
    );
    assert.equal(
      (
        await w.owner.query(
          "SELECT count(*)::int AS n FROM ballots WHERE resolution_id=$1",
          [raceResolution.id],
        )
      ).rows[0].n,
      0,
    );
  } catch (error) {
    await w.owner.query("ROLLBACK");
    throw error;
  } finally {
    await w.owner.query(
      "UPDATE founding_units SET successor_id=NULL WHERE id=$1",
      [race.firstUnit.id],
    );
  }
  console.log(
    "PASS: actual consented founding journey, personal succession, exact-holder approval, atomic retry, stale/conflicted/collision denial, immutable unit/claim/ballot identities, no inherited private choice or account, and single estate-representative designation.",
  );
} finally {
  await w.close();
}
