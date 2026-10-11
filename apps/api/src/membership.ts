import { randomUUID, randomBytes } from 'node:crypto';
import {
  FoundingInvitationViewSchema,
  MembershipSnapshotSchema,
  FoundingRollViewSchema,
  MemberBallotViewSchema,
  RespondFoundingInvitationSchema,
  IdSchema,
  type Actor,
  type CaseRecord,
  type Mode,
  type Realm,
} from '@cornerstone/contracts';
import { DomainError, requireCondition, addCalendarDays, majorityOfAll } from '@cornerstone/domain';
import { Store, type Transaction } from '@cornerstone/store';
import { digest, type Envelope } from '@cornerstone/security';
import { draftPolicy } from '@cornerstone/policy';

type BallotRow = {
  id: string;
  unit_id: string;
  resolution_id: string;
  choice_cipher: Envelope;
  choice_commitment: string;
  receipt_id: string;
};
export function foundingTerms(record: CaseRecord) {
  return digest({
    associationId: record.id,
    eventId: record.data['eventId'],
    units: record.data['units'],
    rollOpened: record.data['rollOpened'],
    constitution: record.data['constitution'],
  });
}
export class MembershipService {
  constructor(
    readonly store: Store,
    readonly mode: Mode,
    readonly realm: Realm,
  ) {}
  private simulation(actor: Actor) {
    requireCondition(
      this.mode === 'simulation' && this.realm === 'simulation' && actor.realm === 'simulation',
      'MEMBERSHIP_DISABLED',
      'Membership development uses invented simulation records only.',
    );
  }
  async list(actor: Actor) {
    this.simulation(actor);
    return this.store.transaction(actor, async (tx) => {
      const invitations = await tx.query(
        'SELECT i.*,i.closes_on::text AS closes_text,v.choice_cipher,v.commitment FROM founding_invitations i LEFT JOIN founding_scale_votes v ON v.invitation_id=i.id WHERE i.person_id=$1 ORDER BY i.created_at DESC LIMIT 200',
        [actor.id],
      );
      const units = await tx.query(
        'SELECT * FROM founding_units WHERE active AND readable_record(association_id) AND COALESCE(successor_id,person_id)=$1 ORDER BY created_at DESC LIMIT 200',
        [actor.id],
      );
      return MembershipSnapshotSchema.parse({
        invitations: invitations.rows.map((i) => this.invitation(i, actor.id)),
        units: units.rows.map((u) => ({
          unitId: u.id,
          associationId: u.association_id,
          claimId: u.claim_id,
          successor: !!u.successor_id,
        })),
        realm: 'simulation',
        officialMembership: false,
      });
    });
  }
  private scaleChoice(i: Record<string, any>): 'yes' | 'no' | 'abstain' | null {
    if (!i.choice_cipher) return null;
    const body = this.store.open<{ choice: 'yes' | 'no' | 'abstain'; nonce: string }>(
      i.choice_cipher,
      `cornerstone:scale:${i.association_id}:${i.id}:${i.terms_digest}`,
    );
    requireCondition(
      ['yes', 'no', 'abstain'].includes(body.choice) &&
        /^[a-f0-9]{64}$/.test(body.nonce) &&
        digest({ invitationId: i.id, termsDigest: i.terms_digest, ...body }) === i.commitment,
      'SCALE_VOTE_INTEGRITY',
      'A larger-association choice could not be verified.',
    );
    return body.choice;
  }
  private invitation(i: Record<string, any>, actorId: string) {
    return FoundingInvitationViewSchema.parse({
      id: i.id,
      associationId: i.association_id,
      claimId: i.claim_id,
      personId: i.person_id,
      termsDigest: i.terms_digest,
      closesOn: String(i.closes_text),
      response: i.response,
      respondedAt: i.responded_at?.toISOString() ?? null,
      ownScaleChoice: i.person_id === actorId ? this.scaleChoice(i) : null,
    });
  }
  async rollView(actor: Actor, id: string) {
    this.simulation(actor);
    return this.store.transaction(actor, async (tx) => {
      const record = await this.store.get(tx, id);
      if (!record || record.kind !== 'association')
        throw new DomainError('NOT_FOUND', 'Association not found.', 404);
      const fullRoll =
        record.ownerId === actor.id ||
        (actor.assurance === 'privileged' &&
          actor.roles.includes('labor') &&
          actor.institutionId === record.institutionId &&
          actor.assignments.includes(id));
      const rows = (
        await tx.query(
          'SELECT i.*,i.closes_on::text AS closes_text,v.choice_cipher,v.commitment FROM founding_invitations i LEFT JOIN founding_scale_votes v ON v.invitation_id=i.id WHERE i.association_id=$1 ORDER BY i.created_at,i.id',
          [id],
        )
      ).rows;
      return FoundingRollViewSchema.parse({
        invitations: rows.map((i) => this.invitation(i, actor.id)),
        fullRoll,
        realm: 'simulation',
      });
    });
  }
  async respond(actor: Actor, raw: unknown) {
    this.simulation(actor);
    const input = RespondFoundingInvitationSchema.parse(raw),
      requestDigest = digest(input);
    return this.store.transaction(actor, async (tx) => {
      const previous = await this.store.existingReceipt(
        tx,
        actor,
        input.idempotencyKey,
        requestDigest,
      );
      if (previous)
        return {
          receipt: previous,
          record: await this.store.getVersion(tx, previous.recordId, previous.version),
        };
      const record = await this.store.get(tx, input.recordId, true);
      if (!record || record.kind !== 'association')
        throw new DomainError('NOT_FOUND', 'Association not found.', 404);
      if (record.version !== input.expectedVersion)
        throw new DomainError(
          'STALE_VERSION',
          'The association changed. Reload before responding.',
          409,
        );
      requireCondition(
        ['submitted', 'review'].includes(record.state),
        'ROLL_CLOSED',
        'The founding roll is no longer open for personal consent.',
      );
      const invitation = (
        await tx.query(
          'SELECT *,closes_on::text AS closes_text FROM founding_invitations WHERE id=$1 AND association_id=$2 AND person_id=$3',
          [input.invitationId, record.id, actor.id],
        )
      ).rows[0];
      requireCondition(
        invitation && invitation.terms_digest === foundingTerms(record),
        'INVITATION_REQUIRED',
        'Your own invitation with unchanged founding terms is required.',
      );
      requireCondition(
        invitation.closes_text >= new Date().toISOString().slice(0, 10),
        'FOUNDING_PERIOD_CLOSED',
        'The published founding period has closed.',
      );
      await tx.query('SELECT simulation_respond_invitation($1,$2,$3)', [
        invitation.id,
        input.response,
        invitation.terms_digest,
      ]);
      const larger =
        Array.isArray(record.data['units']) &&
        record.data['units'].length > draftPolicy.ordinaryUnitLimit;
      const scale = larger
        ? {
            choice: input.response === 'accepted' ? (input.scaleChoice ?? 'abstain') : 'abstain',
            nonce: randomBytes(32).toString('hex'),
          }
        : null;
      const commitment = scale
        ? digest({ invitationId: invitation.id, termsDigest: invitation.terms_digest, ...scale })
        : null;
      const now = new Date().toISOString();
      const next = {
        ...record,
        version: record.version + 1,
        updatedAt: now,
        data: {
          ...record.data,
          ...(commitment ? { lastScaleCommitment: commitment } : {}),
          history: [
            ...(Array.isArray(record.data['history']) ? record.data['history'] : []),
            {
              version: record.version + 1,
              action: 'founding_response',
              at: now,
              actorId: actor.id,
            },
          ],
        },
      };
      const receipt = await this.store.save(
        tx,
        actor,
        next,
        'founding_response',
        input.idempotencyKey,
        requestDigest,
      );
      if (scale && commitment)
        await tx.query('SELECT simulation_record_scale_vote($1,$2::jsonb,$3,$4)', [
          invitation.id,
          JSON.stringify(
            this.store.seal(
              scale,
              `cornerstone:scale:${record.id}:${invitation.id}:${invitation.terms_digest}`,
            ),
          ),
          commitment,
          receipt.id,
        ]);
      return { record: next, receipt };
    });
  }
  async invite(tx: Transaction, record: CaseRecord) {
    requireCondition(
      record.data['rollOpened'] === record.updatedAt.slice(0, 10),
      'FOUNDING_OPENING_DATE',
      'In simulation, use the submission date for the founding opening date so every invitation receives the full period.',
    );
    const units = record.data['units'] as { claimId: string; personId: string }[];
    requireCondition(
      units.length >= 2,
      'ASSOCIATION_TOO_SMALL',
      'At least two founding units are required.',
    );
    requireCondition(
      new Set(units.map((u) => u.claimId)).size === units.length &&
        new Set(units.map((u) => u.personId)).size === units.length,
      'DUPLICATE_FOUNDER',
      'One proposed person and claim may appear once on this roll.',
    );
    try {
      await tx.query('SELECT simulation_invite_founders($1,$2::jsonb,$3,$4::date)', [
        record.id,
        JSON.stringify(units),
        foundingTerms(record),
        addCalendarDays(String(record.data['rollOpened']), draftPolicy.foundingDays),
      ]);
    } catch (error) {
      if ((error as { code?: string }).code === 'P0001')
        throw new DomainError(
          'FOUNDING_ROLL_INVALID',
          'Every proposed founder must own an eligible claim without an existing active founding unit. Review the roll before submitting.',
          422,
        );
      throw error;
    }
  }
  async assertConsented(tx: Transaction, record: CaseRecord, today: string) {
    requireCondition(
      today > addCalendarDays(String(record.data['rollOpened']), draftPolicy.foundingDays),
      'FOUNDING_PERIOD_OPEN',
      'The published 180-day founding period is still open.',
    );
    const units = record.data['units'] as { claimId: string; personId: string }[];
    const rows = (
      await tx.query(
        'SELECT i.*,v.choice_cipher,v.commitment FROM founding_invitations i LEFT JOIN founding_scale_votes v ON v.invitation_id=i.id WHERE i.association_id=$1',
        [record.id],
      )
    ).rows;
    const byClaim = new Map(rows.map((i) => [i.claim_id, i]));
    const terms = foundingTerms(record);
    requireCondition(
      rows.length === units.length &&
        units.every((u) => {
          const i = byClaim.get(u.claimId);
          return (
            i && i.person_id === u.personId && i.response === 'accepted' && i.terms_digest === terms
          );
        }),
      'PERSONAL_FOUNDING_CONSENT',
      'Every proposed founding person must personally accept these unchanged terms. A declined or unanswered invitation cannot create a unit.',
    );
    return rows.filter((i) => this.scaleChoice(i) === 'yes').length;
  }
  async resolutionDraft(
    tx: Transaction,
    actor: Actor,
    data: Record<string, unknown>,
    recordId?: string,
  ) {
    const associationId = IdSchema.parse(data['associationId']),
      association = await this.store.get(tx, associationId);
    requireCondition(
      association?.kind === 'association' &&
        ['ready', 'provisional', 'operating'].includes(association.state),
      'MEMBER_ASSOCIATION',
      'An accessible closed founding association is required.',
    );
    const own = (
      await tx.query(
        'SELECT id FROM founding_units WHERE association_id=$1 AND active AND COALESCE(successor_id,person_id)=$2',
        [associationId, actor.id],
      )
    ).rows;
    requireCondition(
      own.length === 1,
      'ACTIVE_FOUNDING_UNIT',
      'Only an active founding-unit holder may prepare a member resolution.',
    );
    if (recordId) {
      const link = (
        await tx.query('SELECT association_id FROM resolution_links WHERE resolution_id=$1', [
          recordId,
        ])
      ).rows[0];
      requireCondition(
        link?.association_id === associationId,
        'RESOLUTION_ASSOCIATION_FIXED',
        'A draft resolution cannot move to a different association.',
      );
    }
    const count = (
      await tx.query(
        'SELECT count(*)::int AS n FROM founding_units WHERE association_id=$1 AND active',
        [associationId],
      )
    ).rows[0]?.n;
    requireCondition(
      typeof count === 'number' && count >= 2,
      'INVALID_ROLL',
      'At least two active founding units are required.',
    );
    data['unitCount'] = count;
  }
  async freeze(tx: Transaction, record: CaseRecord, data: Record<string, unknown>, today: string) {
    requireCondition(
      String(data['closesAt']) >= today,
      'VOTE_CLOSING_DATE',
      'A vote cannot open with a closing date in the past.',
    );
    const link = (
      await tx.query('SELECT association_id FROM resolution_links WHERE resolution_id=$1', [
        record.id,
      ])
    ).rows[0];
    requireCondition(
      link?.association_id === data['associationId'],
      'RESOLUTION_ASSOCIATION_FIXED',
      'The resolution must retain its original association.',
    );
    await tx.query('SELECT simulation_freeze_resolution($1,$2::date)', [
      record.id,
      data['closesAt'],
    ]);
    const frozen = (
      await tx.query('SELECT unit_count,roll_digest FROM resolution_links WHERE resolution_id=$1', [
        record.id,
      ])
    ).rows[0];
    data['unitCount'] = frozen?.unit_count;
    data['rollDigest'] = frozen?.roll_digest;
    data['votesCast'] = 0;
    delete data['ballots'];
  }
  async prepareBallot(
    tx: Transaction,
    actor: Actor,
    record: CaseRecord,
    data: Record<string, unknown>,
    today: string,
  ) {
    requireCondition(
      today <= String(data['closesAt']),
      'VOTE_CLOSED',
      'The voting period has ended.',
    );
    const unitId = IdSchema.parse(data['unitId']);
    const own = (
      await tx.query(
        'SELECT u.id FROM founding_units u JOIN resolution_roll f ON f.unit_id=u.id AND f.resolution_id=$1 WHERE u.id=$2 AND u.association_id=$3 AND u.active AND COALESCE(u.successor_id,u.person_id)=$4',
        [record.id, unitId, data['associationId'], actor.id],
      )
    ).rows[0];
    requireCondition(
      own,
      'UNIT_AUTHORITY',
      'You must hold an active unit in this resolution’s frozen roll.',
    );
    try {
      await tx.query('SELECT simulation_lock_voting_unit($1,$2)', [record.id, unitId]);
    } catch (error) {
      if (error instanceof Error && error.message === 'UNIT_AUTHORITY')
        throw new DomainError(
          'UNIT_AUTHORITY',
          'This founding unit is no longer held by you.',
          409,
        );
      throw error;
    }
    const status = (
      await tx.query('SELECT cast_already FROM simulation_ballot_status($1) WHERE unit_id=$2', [
        record.id,
        unitId,
      ])
    ).rows[0];
    requireCondition(status, 'UNIT_AUTHORITY', 'An active frozen founding unit is required.');
    requireCondition(
      !status.cast_already,
      'DUPLICATE_BALLOT',
      'That founding unit has already voted.',
    );
    const id = randomUUID(),
      choice = String(data['choice']),
      nonce = randomBytes(32).toString('base64url'),
      commitment = digest({ resolutionId: record.id, unitId, choice, nonce });
    requireCondition(
      ['yes', 'no', 'abstain'].includes(choice),
      'INVALID_CHOICE',
      'Choose yes, no or abstain.',
    );
    const cipher = this.store.seal(
      { choice, nonce },
      `cornerstone:ballot:${id}:${record.id}:${unitId}`,
    );
    data['lastBallotCommitment'] = commitment;
    data['votesCast'] = Number(data['votesCast'] ?? 0) + 1;
    delete data['unitId'];
    delete data['choice'];
    delete data['ballots'];
    return { id, unitId, cipher, commitment };
  }
  private decodeBallot(row: BallotRow) {
    let body: { choice: string; nonce: string };
    try {
      body = this.store.open(
        row.choice_cipher,
        `cornerstone:ballot:${row.id}:${row.resolution_id}:${row.unit_id}`,
      );
    } catch {
      throw new DomainError('BALLOT_INTEGRITY', 'A stored ballot could not be verified.', 409);
    }
    requireCondition(
      ['yes', 'no', 'abstain'].includes(body.choice) &&
        /^[A-Za-z0-9_-]{43}$/.test(body.nonce) &&
        digest({
          resolutionId: row.resolution_id,
          unitId: row.unit_id,
          choice: body.choice,
          nonce: body.nonce,
        }) === row.choice_commitment,
      'BALLOT_INTEGRITY',
      'A stored ballot could not be verified.',
    );
    return body.choice;
  }
  async tally(tx: Transaction, record: CaseRecord, data: Record<string, unknown>, today: string) {
    requireCondition(
      today > String(data['closesAt']),
      'VOTE_OPEN',
      'Wait until the published voting period closes.',
    );
    const link = (
      await tx.query('SELECT unit_count FROM resolution_links WHERE resolution_id=$1', [record.id])
    ).rows[0];
    requireCondition(
      link?.unit_count === data['unitCount'],
      'ROLL_VERSION',
      'Tally must use the frozen total of founding units.',
    );
    const rows = (
      await tx.query<BallotRow>('SELECT * FROM ballots WHERE resolution_id=$1', [record.id])
    ).rows;
    const choices = rows.map((row) => this.decodeBallot(row)),
      yes = choices.filter((c) => c === 'yes').length;
    requireCondition(
      rows.length <= Number(data['unitCount']),
      'INVALID_VOTE_COUNT',
      'Ballots cannot exceed the frozen founding roll.',
    );
    data['yes'] = yes;
    data['no'] = choices.filter((c) => c === 'no').length;
    data['abstain'] = choices.filter((c) => c === 'abstain').length;
    data['notCast'] = Number(data['unitCount']) - rows.length;
    data['votesCast'] = rows.length;
    data['approved'] = majorityOfAll(yes, Number(data['unitCount']));
    delete data['ballots'];
    delete data['unitId'];
    delete data['choice'];
  }
  async ballotView(actor: Actor, id: string) {
    this.simulation(actor);
    return this.store.transaction(actor, async (tx) => {
      const record = await this.store.get(tx, id);
      if (!record || record.kind !== 'resolution')
        throw new DomainError('NOT_FOUND', 'Member resolution not found.', 404);
      const link = (
        await tx.query(
          'SELECT *,closes_on::text AS closes_text FROM resolution_links WHERE resolution_id=$1',
          [id],
        )
      ).rows[0];
      requireCondition(
        link,
        'RESOLUTION_ASSOCIATION_FIXED',
        'The resolution has no verified association link.',
      );
      const units = (
        await tx.query(
          'SELECT id FROM founding_units WHERE association_id=$1 AND active AND COALESCE(successor_id,person_id)=$2',
          [link.association_id, actor.id],
        )
      ).rows.map((u) => u.id);
      const rows = (
        await tx.query<BallotRow>(
          'SELECT b.* FROM ballots b JOIN receipts r ON r.id=b.receipt_id WHERE b.resolution_id=$1 AND b.unit_id=ANY($2::uuid[]) AND r.actor_id=$3',
          [id, units, actor.id],
        )
      ).rows;
      return MemberBallotViewSchema.parse({
        resolutionId: id,
        associationId: link.association_id,
        unitCount: link.unit_count,
        rollDigest: link.roll_digest,
        closesOn: link.closes_text,
        ownUnits: units,
        castUnits: (
          await tx.query('SELECT unit_id FROM simulation_ballot_status($1) WHERE cast_already', [
            id,
          ])
        ).rows.map((row) => row.unit_id),
        ownBallots: rows.map((row) => ({
          unitId: row.unit_id,
          choice: this.decodeBallot(row),
          receiptId: row.receipt_id,
          commitment: row.choice_commitment,
        })),
        realm: 'simulation',
        cryptographicallySealed: false,
      });
    });
  }
}
