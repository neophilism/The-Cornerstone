import { fixtureKey } from './fixture-key.js';
import pg from 'pg';
import { randomUUID, randomBytes } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { Store } from '@cornerstone/store';
import { digest } from '@cornerstone/security';
import { ProgramService } from '../apps/api/src/service.js';
import { DraftAccessService } from '../apps/api/src/access.js';
import { SessionService } from '../apps/api/src/sessions.js';
import type { Actor } from '@cornerstone/contracts';

if (
  process.env['DATA_REALM'] !== 'simulation' ||
  process.env['CORNERSTONE_MODE'] !== 'simulation' ||
  !process.env['DATABASE_URL'] ||
  !process.env['MIGRATION_DATABASE_URL']
)
  throw Error('Isolated synthetic runtime and owner connections required.');
const owner = new pg.Client({ connectionString: process.env['MIGRATION_DATABASE_URL'] });
await owner.connect();
const store = new Store(process.env['DATABASE_URL'], fixtureKey());
const a: Actor = {
  id: randomUUID(),
  realm: 'simulation',
  roles: ['participant'],
  institutionId: null,
  jurisdiction: null,
  assurance: 'draft',
  assignments: [],
  conflicts: [],
  authenticationTime: new Date().toISOString(),
};
const b = { ...a, id: randomUUID() },
  foreign = { ...a, id: randomUUID(), realm: 'proposal' as const };
const program = new ProgramService(store, 'simulation', 'simulation'),
  access = new DraftAccessService(store, 'simulation', 'simulation');
try {
  for (const actor of [a, b, foreign])
    await owner.query('INSERT INTO actors(id,realm,issuer,subject) VALUES($1,$2,$3,$4)', [
      actor.id,
      actor.realm,
      'synthetic:identity-access',
      actor.id,
    ]);
  const first = digest(randomUUID()),
    second = digest(randomUUID()),
    other = digest(randomUUID());
  for (const [id, token] of [
    [a.id, first],
    [a.id, second],
    [b.id, other],
  ])
    await store.pool.query('SELECT auth_session($1,$2,$3)', [id, token, digest(randomUUID())]);
  const sessions = await store.pool.query('SELECT * FROM auth_sessions($1)', [first]);
  assert.equal(sessions.rowCount, 2);
  assert.equal(sessions.rows.filter((s) => s.current_session).length, 1);
  assert.equal('token_hash' in sessions.rows[0], false);
  const otherSessions = await store.pool.query('SELECT * FROM auth_sessions($1)', [other]);
  assert.equal(
    (
      await store.pool.query('SELECT auth_revoke_session($1,$2) revoked', [
        first,
        otherSessions.rows[0].id,
      ])
    ).rows[0].revoked,
    false,
  );
  assert.equal((await store.pool.query('SELECT * FROM auth_lookup($1)', [other])).rowCount, 1);
  assert.equal((await store.pool.query('SELECT auth_revoke_others($1) n', [first])).rows[0].n, 1);
  assert.equal((await store.pool.query('SELECT * FROM auth_lookup($1)', [second])).rowCount, 0);
  assert.equal((await store.pool.query('SELECT * FROM auth_lookup($1)', [first])).rowCount, 1);
  assert.equal((await store.pool.query('SELECT auth_revoke_others($1) n', [first])).rows[0].n, 0);
  const current = sessions.rows.find((s) => s.current_session);
  assert.equal(
    (await store.pool.query('SELECT auth_revoke_session($1,$2) revoked', [first, current.id]))
      .rows[0].revoked,
    true,
  );
  assert.equal((await store.pool.query('SELECT * FROM auth_lookup($1)', [first])).rowCount, 0);
  assert.equal((await store.pool.query('SELECT * FROM auth_sessions($1)', [first])).rowCount, 0);
  const events = await store.transaction(a, (tx) => tx.query('SELECT * FROM session_events'));
  assert.equal(events.rowCount, 2);
  assert.equal(
    (await store.transaction(b, (tx) => tx.query('SELECT * FROM session_events'))).rowCount,
    0,
  );
  assert.equal(
    (
      await store.transaction({ ...a, realm: 'proposal' }, (tx) =>
        tx.query('SELECT * FROM session_events'),
      )
    ).rowCount,
    0,
  );
  await assert.rejects(
    owner.query('DELETE FROM session_events WHERE session_id=$1', [current.id]),
    /Append-only/,
  );

  {
    const sessions = new SessionService(store);
    async function createSession(person: Actor) {
      const token = digest(randomUUID());
      await store.pool.query('SELECT auth_session($1,$2,$3)', [
        person.id,
        token,
        digest(randomUUID()),
      ]);
      const page = await sessions.list(person, token);
      return { token, id: page.context.currentSessionId };
    }
    const caller = await createSession(a),
      one = await createSession(a),
      two = await createSession(a),
      three = await createSession(a),
      foreignActor = await createSession(b),
      foreignRealm = await createSession(foreign);
    const page = await sessions.list(a, caller.token);
    assert.deepEqual(page.context, {
      actorId: a.id,
      realm: a.realm,
      currentSessionId: caller.id,
    });
    assert.equal(page.sessions.filter((session) => session.current).length, 1);
    assert.equal(JSON.stringify(page).includes('token_hash'), false);
    assert.equal(JSON.stringify(page).includes('csrf_hash'), false);
    const first = { currentSessionId: caller.id, sessionIds: [one.id, two.id] };
    const overlapping = { currentSessionId: caller.id, sessionIds: [three.id, two.id] };
    const [firstResult, secondResult] = await Promise.all([
      sessions.revoke(a, caller.token, first),
      sessions.revoke(a, caller.token, overlapping),
    ]);
    assert.deepEqual(
      firstResult.events.find((event) => event.sessionId === two.id),
      secondResult.events.find((event) => event.sessionId === two.id),
    );
    for (const target of [one, two, three])
      assert.equal(
        (await store.pool.query('SELECT * FROM auth_lookup($1)', [target.token])).rowCount,
        0,
      );
    const events = await store.transaction(a, (tx) =>
      tx.query('SELECT * FROM session_events WHERE session_id=ANY($1::uuid[])', [
        [one.id, two.id, three.id],
      ]),
    );
    assert.equal(events.rowCount, 3);
    const later = await createSession(a);
    assert.deepEqual(await sessions.revoke(a, caller.token, first), firstResult);
    assert.equal(
      (await store.pool.query('SELECT * FROM auth_lookup($1)', [later.token])).rowCount,
      1,
    );
    assert.equal(
      (await store.pool.query('SELECT * FROM auth_lookup($1)', [caller.token])).rowCount,
      1,
    );
    assert.equal(
      (
        await store.transaction(a, (tx) =>
          tx.query('SELECT * FROM session_events WHERE session_id=ANY($1::uuid[])', [
            [one.id, two.id, three.id],
          ]),
        )
      ).rowCount,
      3,
    );
    const untouched = await createSession(a);
    for (const forbidden of [foreignActor.id, foreignRealm.id, randomUUID()]) {
      await assert.rejects(
        sessions.revoke(a, caller.token, {
          currentSessionId: caller.id,
          sessionIds: [untouched.id, forbidden],
        }),
        (error: any) => error.code === 'SESSION_NOT_FOUND' && error.status === 404,
      );
      assert.equal(
        (await store.pool.query('SELECT * FROM auth_lookup($1)', [untouched.token])).rowCount,
        1,
      );
      assert.equal(
        (
          await store.transaction(a, (tx) =>
            tx.query('SELECT * FROM session_events WHERE session_id=$1', [untouched.id]),
          )
        ).rowCount,
        0,
      );
    }
    await assert.rejects(
      sessions.revoke(a, caller.token, {
        currentSessionId: later.id,
        sessionIds: [untouched.id],
      }),
      (error: any) => error.code === 'SESSION_CONTEXT_CHANGED' && error.status === 409,
    );
    for (const invalidActor of [b, { ...a, realm: 'proposal' as const }]) {
      await assert.rejects(
        sessions.list(invalidActor, caller.token),
        (error: any) => error.code === 'SESSION_SCOPE' && error.status === 403,
      );
      await assert.rejects(
        sessions.revoke(invalidActor, caller.token, first),
        (error: any) => error.code === 'SESSION_SCOPE' && error.status === 403,
      );
    }
    await store.pool.query('SELECT auth_logout($1)', [caller.token]);
    await assert.rejects(
      sessions.revoke(a, caller.token, first),
      (error: any) => error.code === 'SESSION_EXPIRED' && error.status === 401,
    );
    await assert.rejects(
      sessions.list(a, caller.token),
      (error: any) => error.code === 'SESSION_EXPIRED' && error.status === 401,
    );
    assert.equal(
      (await store.pool.query('SELECT * FROM auth_lookup($1)', [untouched.token])).rowCount,
      1,
    );
    console.log(
      'Scoped session revocation, exact event replay, concurrent batches and rollback passed.',
    );
  }

  const input = {
    actionDescription: 'Invented action',
    livelihood: 'Invented livelihood',
    lossDescription: 'Invented direct loss',
  };
  const saved = await program.create(a, {
    kind: 'dossier',
    title: 'Invented delegated draft',
    input,
    idempotencyKey: randomUUID(),
  });
  const grant = {
    recordId: saved.record!.id,
    expectedVersion: 1,
    idempotencyKey: randomUUID(),
    subjectId: b.id,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    allowDraftEdits: false,
    consent: true,
  };
  const [one, two] = await Promise.all([access.grant(a, grant), access.grant(a, grant)]);
  assert.equal(one.receipt.id, two.receipt.id);
  assert.equal(one.record!.version, 2);
  assert.equal((await store.list(b)).length, 1);
  assert.ok(await store.transaction(b, (tx) => store.getVersion(tx, saved.record!.id, 1)));
  await assert.rejects(
    program.command(b, {
      recordId: saved.record!.id,
      expectedVersion: 2,
      action: 'save_draft',
      input,
      idempotencyKey: randomUUID(),
    }),
    /scoped member/,
  );
  await assert.rejects(access.list(b, saved.record!.id), /you own/);
  await assert.rejects(
    access.grant(
      { ...a, authenticationTime: new Date(Date.now() - 601000).toISOString() },
      { ...grant, expectedVersion: 2, idempotencyKey: randomUUID() },
    ),
    /sign in again/,
  );
  const list = await access.list(a, saved.record!.id);
  assert.equal(list.length, 1);
  const revocation = {
    recordId: saved.record!.id,
    expectedVersion: 2,
    grantId: list[0]!.id,
    idempotencyKey: randomUUID(),
  };
  const revoked = await access.revoke(a, revocation);
  assert.equal(revoked.record!.version, 3);
  assert.equal((await store.list(b)).length, 0);
  assert.equal(await store.transaction(b, (tx) => store.getVersion(tx, saved.record!.id, 1)), null);
  const olderAuthentication = {
    ...a,
    authenticationTime: new Date(Date.now() - 601000).toISOString(),
  };
  const recoveredGrant = await access.grant(olderAuthentication, grant);
  const recoveredRevocation = await access.revoke(olderAuthentication, revocation);
  assert.equal(recoveredGrant.receipt.id, one.receipt.id);
  assert.equal(recoveredGrant.record!.version, 2);
  assert.equal(recoveredRevocation.receipt.id, revoked.receipt.id);
  assert.equal((await access.list(a, saved.record!.id))[0]!.revokedAt !== null, true);
  assert.equal((await store.transaction(a, (tx) => store.get(tx, saved.record!.id)))!.version, 3);
  await assert.rejects(
    access.revoke(olderAuthentication, { ...revocation, idempotencyKey: randomUUID() }),
    /sign in again/,
  );
  await owner.query('UPDATE actors SET conflicts=ARRAY[$2::uuid] WHERE id=$1', [
    a.id,
    saved.record!.id,
  ]);
  await assert.rejects(access.grant(a, grant), /you own/);
  await assert.rejects(access.revoke(a, revocation), /you own/);
  await owner.query("UPDATE actors SET conflicts='{}' WHERE id=$1", [a.id]);

  await assert.rejects(
    access.grant(a, {
      ...grant,
      expectedVersion: 3,
      subjectId: foreign.id,
      idempotencyKey: randomUUID(),
    }),
    /unconflicted synthetic/,
  );
  await assert.rejects(
    access.grant(a, {
      ...grant,
      expectedVersion: 3,
      expiresAt: new Date(Date.now() + 91 * 86400000).toISOString(),
      idempotencyKey: randomUUID(),
    }),
    /ninety days/,
  );
  await owner.query('UPDATE actors SET conflicts=ARRAY[$2::uuid] WHERE id=$1', [
    b.id,
    saved.record!.id,
  ]);
  await assert.rejects(
    access.grant(a, { ...grant, expectedVersion: 3, idempotencyKey: randomUUID() }),
    /unconflicted synthetic/,
  );
  await owner.query("UPDATE actors SET conflicts='{}' WHERE id=$1", [b.id]);
  const editable = await access.grant(a, {
    ...grant,
    expectedVersion: 3,
    allowDraftEdits: true,
    idempotencyKey: randomUUID(),
  });
  const edit = await program.command(b, {
    recordId: saved.record!.id,
    expectedVersion: 4,
    action: 'save_draft',
    input: { ...input, lossDescription: 'Corrected invented loss' },
    idempotencyKey: randomUUID(),
  });
  assert.equal(edit.record!.version, 5);
  await assert.rejects(
    program.command(b, {
      recordId: saved.record!.id,
      expectedVersion: 5,
      action: 'mark_ready',
      input: {},
      idempotencyKey: randomUUID(),
    }),
    /scoped member/,
  );
  const grantRows = await access.list(a, saved.record!.id);
  const active = grantRows.find((g) => !g.revokedAt)!;
  assert.deepEqual(active.permissions, ['read', 'save_draft', 'attach_evidence']);
  await owner.query("UPDATE grants SET expires_at=now()-interval '1 second' WHERE id=$1", [
    active.id,
  ]);
  assert.equal((await store.list(b)).length, 0);
  assert.equal(editable.record!.state, 'draft');
  const receiptCount = await owner.query(
    'SELECT count(*)::int n FROM receipts WHERE record_id=$1',
    [saved.record!.id],
  );
  assert.equal(receiptCount.rows[0].n, 5);
  console.log(
    'PASS: session isolation/revocation/audit, scoped delegation, idempotency, read/edit limits, revocation, expiry and conflict/realm denial.',
  );
} finally {
  await store.close();
  await owner.end();
}
