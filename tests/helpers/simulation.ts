import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { ActorSchema, type Actor, type CaseRecord, type Kind } from '@cornerstone/contracts';
import { Store } from '@cornerstone/store';
import { digest } from '@cornerstone/security';
import { addCalendarDays } from '@cornerstone/domain';
import { ProgramService } from '../../apps/api/src/service.js';
import { EvidenceService } from '../../apps/api/src/evidence.js';
import { MembershipService } from '../../apps/api/src/membership.js';
import { fixtureKey } from '../fixture-key.js';

export const findings =
  'Invented written findings, contrary evidence, notice and review route. No real legal determination.';
export class Simulation {
  readonly owner: pg.Client;
  readonly store: Store;
  readonly program: ProgramService;
  readonly evidence: EvidenceService;
  readonly members: MembershipService;
  readonly today = new Date().toISOString().slice(0, 10);
  day = this.today;
  private tokens = new Map<string, string>();
  constructor() {
    if (
      process.env['DATA_REALM'] !== 'simulation' ||
      process.env['CORNERSTONE_MODE'] !== 'simulation' ||
      !process.env['DATABASE_URL'] ||
      !process.env['MIGRATION_DATABASE_URL']
    )
      throw Error('An explicitly isolated synthetic database and owner connection are required.');
    this.owner = new pg.Client({ connectionString: process.env['MIGRATION_DATABASE_URL'] });
    this.store = new Store(process.env['DATABASE_URL'], fixtureKey());
    this.program = new ProgramService(
      this.store,
      'simulation',
      'simulation',
      () => new Date(this.day + 'T12:00:00Z'),
    );
    this.evidence = new EvidenceService(
      this.store,
      'simulation',
      'simulation',
      'synthetic-postgres',
    );
    this.members = new MembershipService(this.store, 'simulation', 'simulation');
  }
  async connect() {
    await this.owner.connect();
    await this.store.verifyRole();
    return this;
  }
  async close() {
    await this.store.close();
    await this.owner.end();
  }
  async actor(id: string): Promise<Actor> {
    if (!this.tokens.has(id)) {
      const token = digest(randomUUID());
      await this.store.pool.query('SELECT auth_session($1,$2,$3)', [
        id,
        token,
        digest(randomUUID()),
      ]);
      this.tokens.set(id, token);
    }
    return ActorSchema.parse(
      (await this.store.pool.query('SELECT * FROM auth_lookup($1)', [this.tokens.get(id)])).rows[0]
        ?.actor,
    );
  }
  async persona(name: string) {
    const id = (await this.store.pool.query('SELECT simulation_persona($1) AS id', [name])).rows[0]
      ?.id;
    assert.ok(id, 'Explicitly seed the requested synthetic persona');
    return this.actor(id);
  }
  async person(role: 'participant' | 'member' | 'labor' = 'participant') {
    const id = randomUUID();
    const institution =
      role === 'labor'
        ? (
            await this.owner.query(
              "SELECT institution_id FROM simulation_routing WHERE kind='succession'",
            )
          ).rows[0]?.institution_id
        : null;
    await this.owner.query(
      "INSERT INTO actors(id,realm,issuer,subject,roles,institution_id,jurisdiction,assurance) VALUES($1::uuid,'simulation','cornerstone:isolated-tests',$1::text,$2,$3,'EX',$4)",
      [
        id,
        role === 'member' ? ['participant', 'member'] : [role],
        institution,
        role === 'labor' ? 'privileged' : 'draft',
      ],
    );
    return this.actor(id);
  }
  async get(a: Actor, id: string) {
    return this.store.transaction(await this.actor(a.id), (tx) => this.store.get(tx, id));
  }
  async create(a: Actor, kind: Kind, title: string, input: Record<string, unknown>) {
    return (
      await this.program.create(await this.actor(a.id), {
        kind,
        title,
        input,
        idempotencyKey: randomUUID(),
      })
    ).record!;
  }
  async command(
    a: Actor,
    r: CaseRecord | string,
    action: string,
    input: Record<string, unknown> = {},
  ) {
    const id = typeof r === 'string' ? r : r.id,
      current = await this.get(a, id);
    assert.ok(current, 'Actor must read the current synthetic record');
    return this.program.command(await this.actor(a.id), {
      recordId: id,
      expectedVersion: current.version,
      action,
      input,
      idempotencyKey: randomUUID(),
    });
  }
  async attach(a: Actor, r: CaseRecord | string) {
    const id = typeof r === 'string' ? r : r.id,
      current = (await this.get(a, id))!;
    const added = await this.evidence.upload(await this.actor(a.id), {
      recordId: id,
      expectedVersion: current.version,
      idempotencyKey: randomUUID(),
      filename: 'invented-support.txt',
      description: 'Invented fixture evidence; not identity or probate proof',
      base64: Buffer.from('Invented test evidence only. No real person or finding.').toString(
        'base64',
      ),
      attestedSynthetic: true,
    });
    const item = (await this.evidence.list(await this.actor(a.id), id)).evidence[0]!;
    await this.evidence.validate(await this.actor(a.id), {
      recordId: id,
      evidenceId: item.id,
      expectedVersion: added.record!.version,
      idempotencyKey: randomUUID(),
    });
    return item.id;
  }
  async association(
    first: Actor,
    second: Actor,
    labor: Actor,
    title = 'Invented succession association',
  ) {
    const event = await this.create(
      first,
      'event_petition',
      'Invented succession event ' + randomUUID(),
      {
        actionDate: '2000-01-01',
        actionText: 'Invented implemented contraction',
        industry: 'Invented lawful trade',
        objectiveEvidence: 'Invented stated objective',
        contraryEvidence: 'Invented contrary causes considered',
      },
    );
    const e = await this.attach(first, event);
    await this.command(first, event, 'submit', { attested: true });
    await this.command(labor, event, 'open_record', {
      noticeDate: addCalendarDays(this.today, -61),
      publicDocket: 'invented-only',
    });
    await this.command(labor, event, 'close_record');
    await this.command(labor, event, 'certify', {
      implemented: true,
      lawfulIndustry: true,
      deliberateObjective: true,
      materialDirectGroup: true,
      firstLossDate: '2000-02-01',
      reasons: findings,
      evidenceIds: [e],
    });
    const units = [];
    for (const person of [first, second]) {
      const claim = await this.create(
        person,
        'claim',
        'Invented succession claim ' + randomUUID(),
        {
          eventId: event.id,
          workerType: 'employee',
          earnedIncomeShare: 0.75,
          lossDate: '2000-02-01',
          injuryDescription: 'Invented primary livelihood loss',
        },
      );
      const evidenceId = await this.attach(person, claim);
      await this.command(person, claim, 'submit', { attested: true });
      await this.command(labor, claim, 'begin_review');
      await this.command(labor, claim, 'find_eligible', {
        directInjuryProven: true,
        reasons: findings,
        evidenceIds: [evidenceId],
      });
      units.push({ claimId: claim.id, personId: person.id });
    }
    const association = await this.create(first, 'association', title, {
      eventId: event.id,
      units,
      rollOpened: this.today,
      constitution:
        'One vote and equal base rights; inspection and first opportunities; no compulsory work, relocation, capital, training or personal debt.',
    });
    await this.command(first, association, 'submit', { attested: true });
    for (const person of [first, second]) {
      const a = await this.actor(person.id),
        invitation = (await this.members.list(a)).invitations.find(
          (i) => i.associationId === association.id,
        )!;
      await this.members.respond(a, {
        recordId: association.id,
        invitationId: invitation.id,
        expectedVersion: (await this.get(a, association.id))!.version,
        idempotencyKey: randomUUID(),
        response: 'accepted',
        rightsAcknowledged: true,
      });
    }
    await this.command(labor, association, 'begin_review');
    this.day = addCalendarDays(this.today, 181);
    await this.command(labor, association, 'close_roll', {
      pendingClaims: 0,
      equalRights: true,
      voluntary: true,
      reasons: findings,
    });
    this.day = this.today;
    const rows = (
      await this.owner.query(
        'SELECT * FROM founding_units WHERE association_id=$1 ORDER BY person_id',
        [association.id],
      )
    ).rows;
    return {
      association: (await this.get(first, association.id))!,
      units: rows,
      firstUnit: rows.find((u) => u.person_id === first.id)!,
      secondUnit: rows.find((u) => u.person_id === second.id)!,
    };
  }
  async resolution(person: Actor, association: CaseRecord, title = 'Invented succession decision') {
    const r = await this.create(await this.actor(person.id), 'resolution', title, {
      associationId: association.id,
      decision: 'dissolution',
      proposal: 'Invented exact proposal; no compact is executed by this fixture.',
    });
    await this.command(person, r, 'open_vote', { closesAt: addCalendarDays(this.today, 2) });
    return (await this.get(person, r.id))!;
  }
  async request(
    person: Actor,
    unitId: string,
    labor: Actor,
    basis = 'member_death',
    capacity = 'designated_successor',
    title = 'Invented succession request',
  ) {
    const r = await this.create(person, 'succession', title, {
      unitId,
      transferBasis: basis,
      capacity,
      chain: 'Invented death, designation and chain; not real probate proof.',
    });
    const evidenceId = await this.attach(person, r);
    await this.command(person, r, 'submit', { attested: true, rightsAcknowledged: true });
    await this.command(labor, r, 'begin_review');
    return {
      record: (await this.get(person, r.id))!,
      input: {
        undivided: true,
        deathEstablished: true,
        identityEstablished: true,
        chainEstablished: true,
        probateConsistent: true,
        competingRightsResolved: true,
        legalBasis: 'Invented uniform bylaw, probate chain, notice and review basis',
        reasons: findings,
        evidenceIds: [evidenceId],
      },
    };
  }
}
