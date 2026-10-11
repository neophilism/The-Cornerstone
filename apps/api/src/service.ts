import { randomUUID } from 'node:crypto';
import type { Actor, CaseRecord, Command, Mode, Realm } from '@cornerstone/contracts';
import {
  CreateRecordSchema,
  CommandSchema,
  IdSchema,
  SurplusScheduleSchema,
} from '@cornerstone/contracts';
import {
  workflow,
  parseFields,
  validateAction,
  assertTransition,
  validateFoundingRoll,
  majorityOfAll,
  renewal,
  requireCondition,
  DomainError,
} from '@cornerstone/domain';
import { assertAuthority, draftPolicy } from '@cornerstone/policy';
import { canAct, digest } from '@cornerstone/security';
import { Store, type Transaction } from '@cornerstone/store';
import {
  cents,
  money,
  rate,
  fundRemittance,
  stateSurplus,
  type SurplusInput,
  type FundAccount,
} from '@cornerstone/finance';

export class ProgramService {
  constructor(
    readonly store: Store,
    readonly mode: Mode,
    readonly realm: Realm,
  ) {}
  private writable(actor: Actor) {
    requireCondition(
      actor.realm === this.realm,
      'REALM_MISMATCH',
      'Your session belongs to a different environment.',
    );
    requireCondition(
      this.mode === 'simulation' && this.realm === 'simulation',
      'PROTECTED_INTAKE_DISABLED',
      'Protected production intake requires independently reviewed recipient security and approved authority; this release is synthetic-only.',
    );
  }
  async create(actor: Actor, raw: unknown) {
    this.writable(actor);
    const input = CreateRecordSchema.parse(raw);
    const wf = workflow(input.kind);
    requireCondition(
      wf.createRoles.some((r) => actor.roles.includes(r)),
      'ROLE_REQUIRED',
      'Your role cannot create this record.',
    );
    const data = parseFields(wf.createFields, input.input);
    const now = new Date().toISOString();
    const requestDigest = digest(input);
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
      const record: CaseRecord = {
        id: randomUUID(),
        realm: actor.realm,
        kind: input.kind,
        state: wf.initial,
        version: 1,
        ownerId: actor.id,
        institutionId: actor.institutionId,
        jurisdiction: actor.jurisdiction,
        policyVersion: draftPolicy.version,
        title: input.title,
        data,
        createdAt: now,
        updatedAt: now,
      };
      const receipt = await this.store.save(
        tx,
        actor,
        record,
        'create',
        input.idempotencyKey,
        requestDigest,
        true,
      );
      return { record, receipt };
    });
  }
  async command(actor: Actor, raw: unknown) {
    this.writable(actor);
    const command = CommandSchema.parse(raw);
    const requestDigest = digest(command);
    return this.store.transaction(actor, async (tx) => {
      const previous = await this.store.existingReceipt(
        tx,
        actor,
        command.idempotencyKey,
        requestDigest,
      );
      if (previous)
        return {
          receipt: previous,
          record: await this.store.getVersion(tx, previous.recordId, previous.version),
        };
      const record = await this.store.get(tx, command.recordId, true);
      if (!record) throw new DomainError('NOT_FOUND', 'Record not found.', 404);
      if (record.version !== command.expectedVersion)
        throw new DomainError(
          'STALE_VERSION',
          'This record changed. Reload before submitting.',
          409,
        );
      const wf = workflow(record.kind),
        a =
          command.action === 'save_draft'
            ? {
                key: 'save_draft',
                from: ['draft'],
                to: 'draft',
                roles: wf.createRoles,
                authority: null,
                fields: wf.createFields,
              }
            : wf.actions.find((a) => a.key === command.action);
      requireCondition(a, 'UNKNOWN_ACTION', 'Unknown action.');
      assertTransition(record, a);
      const grants = await this.store.grants(tx, record.id),
        now = new Date().toISOString();
      requireCondition(
        canAct(actor, record, a.roles, grants, a.key, now),
        'RECORD_PERMISSION',
        'An assigned, unconflicted reviewer or scoped member is required.',
      );
      if (a.authority)
        assertAuthority({
          mode: this.mode,
          realm: this.realm,
          actor,
          function: a.authority,
          now,
          authorities: [],
          jurisdiction: record.jurisdiction,
          policyVersion: record.policyVersion,
        });
      const input = parseFields(a.fields, command.input);
      let data = validateAction(record, a.key, input, now.slice(0, 10));
      data = await this.linkedRules(tx, actor, record, command, data, now);
      const history = Array.isArray(record.data['history']) ? record.data['history'] : [];
      data['history'] = [
        ...history,
        { version: record.version + 1, action: a.key, at: now, actorId: actor.id },
      ];
      let institution = record.institutionId;
      if (a.key === 'submit') {
        const routed = await tx.query('SELECT simulation_assign($1,$2)', [record.id, record.kind]);
        institution = routed.rows[0]?.simulation_assign || institution;
      }
      const next = {
        ...record,
        data,
        state: a.to,
        version: record.version + 1,
        updatedAt: now,
        institutionId: institution,
      };
      const receipt = await this.store.save(
        tx,
        actor,
        next,
        a.key,
        command.idempotencyKey,
        requestDigest,
      );
      return { record: next, receipt };
    });
  }
  private async linked(
    tx: Transaction,
    id: unknown,
    kind: CaseRecord['kind'],
    states: string[],
    lock = false,
  ) {
    IdSchema.parse(id);
    const r = await this.store.get(tx, String(id), lock);
    requireCondition(
      r && r.kind === kind && states.includes(r.state),
      'RELATED_RECORD',
      'A valid accessible related record with the required finding is needed.',
    );
    return r;
  }
  private async linkedRules(
    tx: Transaction,
    actor: Actor,
    r: CaseRecord,
    c: Command,
    d: Record<string, unknown>,
    now: string,
  ) {
    const k = c.action,
      today = now.slice(0, 10);
    if (r.kind === 'claim' && k === 'find_eligible')
      await this.linked(tx, d['eventId'], 'event_petition', ['certified']);
    if (r.kind === 'association' && k === 'close_roll') {
      await this.linked(tx, d['eventId'], 'event_petition', ['certified']);
      const units = d['units'] as { claimId: string; personId: string }[];
      requireCondition(Array.isArray(units), 'INVALID_ROLL', 'Provide the founding roll.');
      validateFoundingRoll({
        units,
        pending: Number(d['pendingClaims']),
        closed: true,
        ...(units.length > 2500
          ? {
              largerApproval: {
                yes: Number(d['largerYes']),
                laborFindings: d['largerFindings'] === true,
              },
            }
          : {}),
      });
      for (const u of units) {
        IdSchema.parse(u.personId);
        const claim = await this.linked(tx, u.claimId, 'claim', ['eligible'], true);
        requireCondition(
          claim.data['eventId'] === d['eventId'],
          'EVENT_MISMATCH',
          'Every founding claim must belong to the association’s certified event.',
        );
        const person = await tx.query('SELECT simulation_actor_exists($1,$2) AS valid', [
          u.personId,
          actor.realm,
        ]);
        requireCondition(
          person.rows[0]?.valid,
          'INVALID_UNIT',
          'The founding person must exist in this realm.',
        );
        await tx.query('SELECT register_founding_unit($1,$2,$3,$4,$5)', [
          randomUUID(),
          actor.realm,
          r.id,
          u.claimId,
          u.personId,
        ]);
      }
      d['unitCount'] = units.length;
      d['rollClosedAt'] = today;
    }
    if (r.kind === 'resolution' && k === 'open_vote') {
      const a = await this.linked(tx, d['associationId'], 'association', [
        'ready',
        'provisional',
        'operating',
      ]);
      const count = await tx.query(
        'SELECT count(*)::int AS n FROM founding_units WHERE association_id=$1 AND active',
        [a.id],
      );
      requireCondition(
        Number(d['unitCount']) === count.rows[0]?.n,
        'ROLL_VERSION',
        'Use the actual frozen active founding roll.',
      );
      d['ballots'] = [];
    }
    if (r.kind === 'resolution' && k === 'record_vote') {
      requireCondition(
        today <= String(d['closesAt']),
        'VOTE_CLOSED',
        'The voting period has ended.',
      );
      IdSchema.parse(d['unitId']);
      const unit = await tx.query(
        'SELECT * FROM founding_units WHERE id=$1 AND association_id=$2 AND active',
        [d['unitId'], d['associationId']],
      );
      requireCondition(
        unit.rows[0] && (unit.rows[0].successor_id || unit.rows[0].person_id) === actor.id,
        'UNIT_AUTHORITY',
        'You must hold the active founding unit.',
      );
      const ballots = Array.isArray(d['ballots'])
        ? (d['ballots'] as { unitId: string; choice: string }[])
        : [];
      requireCondition(
        !ballots.some((b) => b.unitId === d['unitId']),
        'DUPLICATE_BALLOT',
        'That founding unit has already voted.',
      );
      d['ballots'] = [...ballots, { unitId: d['unitId'], choice: d['choice'] }];
    }
    if (r.kind === 'resolution' && k === 'tally') {
      requireCondition(
        today > String(d['closesAt']),
        'VOTE_OPEN',
        'Wait until the published voting period closes.',
      );
      const ballots = d['ballots'] as { unitId: string; choice: string }[];
      const yes = ballots.filter((b) => b.choice === 'yes').length;
      d['yes'] = yes;
      d['approved'] = majorityOfAll(yes, Number(d['unitCount']));
    }
    if (r.kind === 'offer' && k === 'publish') {
      await this.linked(tx, d['authorityId'], 'state_authority', ['verified']);
      const terms = d['financialTerms'] as { version: string; rateActId: string };
      requireCondition(
        terms.version === d['financialVersion'] && terms.rateActId === d['rateAct'],
        'PUBLISHED_FINANCIAL_METHOD',
        'The published rate act and method version must match the financial terms.',
      );
    }
    if (r.kind === 'compact' && k === 'publish') {
      const offer = await this.linked(tx, d['offerId'], 'offer', ['published']);
      await this.linked(tx, d['associationId'], 'association', ['ready', 'provisional']);
      const match = await this.linked(tx, d['matchId'], 'match', ['accepted']);
      requireCondition(
        match.data['offerId'] === offer.id && match.data['associationId'] === d['associationId'],
        'MATCH_MISMATCH',
        'The compact must use the accepted offer and association.',
      );
      const resolution = await this.linked(tx, d['memberResolutionId'], 'resolution', ['tallied']);
      requireCondition(
        resolution.data['approved'] === true &&
          resolution.data['decision'] === 'compact' &&
          resolution.data['associationId'] === d['associationId'],
        'MEMBER_APPROVAL',
        'A valid all-unit-majority compact resolution is required.',
      );
      const menu = offer.data['commercialMenu'];
      requireCondition(
        menu && typeof menu === 'object' && d['terms'] && typeof d['terms'] === 'object',
        'PUBLISHED_MENU',
        'Use published terms.',
      );
      for (const [key, value] of Object.entries(d['terms'] as object)) {
        const choices = (menu as Record<string, unknown>)[key];
        requireCondition(
          Array.isArray(choices) && choices.some((v) => digest(v) === digest(value)),
          'OUTSIDE_MENU',
          'A selected term is outside the immutable published menu.',
        );
      }
      d['initialYears'] = 30;
      d['renewalYears'] = 10;
      d['renewalCount'] = 0;
    }
    if (r.kind === 'permit' && k === 'verify')
      await this.linked(tx, d['compactId'], 'compact', ['effective']);
    if (r.kind === 'launch' && ['approve', 'operate'].includes(k)) {
      await this.linked(tx, d['compactId'], 'compact', ['effective']);
      requireCondition(
        Array.isArray(d['permitIds']) && d['permitIds'].length > 0,
        'PERMITS_REQUIRED',
        'Required ordinary permits must be verified.',
      );
      for (const id of d['permitIds'] as unknown[]) {
        const permit = await this.linked(tx, id, 'permit', ['verified']);
        requireCondition(
          permit.data['compactId'] === d['compactId'] &&
            String(permit.data['validThrough']) >= today,
          'PERMIT_EXPIRED',
          'A valid permit for this compact is required.',
        );
      }
    }
    if (r.kind === 'renewal' && k === 'review') {
      const compact = await this.linked(tx, d['compactId'], 'compact', ['effective']);
      d['result'] = renewal({
        effectiveDate: String(compact.data['effectiveDate']),
        today,
        renewalCount: Number(compact.data['renewalCount'] || 0),
        controlContinues: d['controlContinues'] === true,
        uncuredViolationEstablished: d['uncuredViolationEstablished'] === true,
        stayed: d['stayed'] === true,
      });
    }
    if (r.kind === 'fund_commitment' && k === 'approve') {
      const budget = d['budget'];
      requireCondition(
        Array.isArray(budget) && budget.length > 0,
        'FUND_BUDGET',
        'Itemize eligible costs.',
      );
      let total = 0n;
      for (const item of budget as { kind: string; amount: string }[]) {
        requireCondition(
          ['formation', 'feasibility', 'licensing', 'training'].includes(item.kind),
          'INELIGIBLE_FUND_COST',
          'Only formation, feasibility, licensing and training costs are eligible.',
        );
        const amount = cents(item.amount);
        requireCondition(amount >= 0n, 'NEGATIVE_COST', 'Costs cannot be negative.');
        total += amount;
      }
      requireCondition(
        cents(String(d['principal'])) <= total,
        'FUND_LIMIT',
        'The advance cannot exceed the documented eligible budget.',
      );
      const fraction = d['receiptRate'] as { numerator: string; denominator: string };
      rate(BigInt(fraction.numerator), BigInt(fraction.denominator));
      d['collected'] = '0.00';
      d['released'] = false;
    }
    if (r.kind === 'fund_payment' && k === 'calculate') {
      const fund = await this.linked(tx, d['fundId'], 'fund_commitment', ['disbursed']);
      const fraction = fund.data['receiptRate'] as { numerator: string; denominator: string };
      const account: FundAccount = {
        terms: {
          principal: cents(String(fund.data['principal'])),
          fixedReturn: cents(String(fund.data['fixedReturn'])),
          receiptRate: rate(BigInt(fraction.numerator), BigInt(fraction.denominator)),
          version: fund.policyVersion,
        },
        collected: cents(String(fund.data['collected'])),
        released: fund.data['released'] === true,
      };
      const calculated = fundRemittance(account, {
        operating: cents(String(d['grossReceipts'])),
        financing: cents(String(d['financing'])),
        refunds: cents(String(d['refunds'])),
        collectedTaxes: cents(String(d['taxes'])),
      });
      d['calculation'] = JSON.parse(
        JSON.stringify(calculated, (_, v) => (typeof v === 'bigint' ? money(v) : v)),
      );
    }
    if (r.kind === 'financial_schedule' && ['calculate', 'correct'].includes(k)) {
      const compact = await this.linked(tx, d['compactId'], 'compact', ['effective']);
      const offer = await this.linked(tx, compact.data['offerId'], 'offer', ['published']);
      requireCondition(
        d['schedule'] && typeof d['schedule'] === 'object' && offer.data['financialTerms'],
        'INVALID_SCHEDULE',
        'A verified schedule and published financial terms are required.',
      );
      const wire = {
        ...(d['schedule'] as object),
        terms: offer.data['financialTerms'],
        enterpriseId: compact.data['associationId'],
        year: d['fiscalYear'],
      };
      d['calculation'] = calculateWireSchedule(wire);
    }
    // Protected adapters are intentionally unavailable. Never convert a request into a fake external receipt.
    if (
      ['sealed_ranking', 'draw', 'round'].includes(r.kind) &&
      ['seal', 'replace', 'publish', 'open', 'close', 'compute'].includes(k)
    )
      throw new DomainError(
        'CUSTODY_REVIEW_REQUIRED',
        'Independently reviewed ranking custody and witnessed draw providers are not installed.',
        503,
      );
    if (r.kind === 'match' && k === 'accept')
      throw new DomainError(
        'EXCHANGE_RESULT_REQUIRED',
        'A verified exchange result and unique active-match transaction are required.',
        503,
      );
    if (k === 'confirm_transfer' || (r.kind === 'land_acquisition' && k === 'settle'))
      throw new DomainError(
        'TREASURY_ADAPTER_REQUIRED',
        'An independently confirmed Treasury or settlement integration is not installed. No payment receipt has been issued.',
        503,
      );
    if (r.kind === 'succession' && k === 'approve')
      throw new DomainError(
        'SUCCESSION_REVIEW_REQUIRED',
        'The single-successor identity, grant and immutable unit transfer must be independently reviewed before activation.',
        503,
      );
    return d;
  }
}
const amountKeys = new Set([
  'grossReceipts',
  'financingProceeds',
  'refunds',
  'collectedTaxes',
  'recoveriesAndReleasedAllowances',
  'ordinaryAnnualOperatingCosts',
  'cashCycleShortfall',
  'paid',
  'reserved',
  'eligibleAmount',
  'original',
  'remaining',
  'addition',
  'target',
  'existingDedicated',
  'insuranceGrantsOtherFinance',
  'legalRequiredAmount',
]);
export function calculateWireSchedule(raw: unknown) {
  const convert = (v: unknown, key = ''): unknown => {
    if (amountKeys.has(key)) {
      requireCondition(
        typeof v === 'string',
        'INVALID_MONEY',
        'Money must use decimal strings, never floating point.',
      );
      return cents(v);
    }
    if (key === 'numerator' || key === 'denominator') {
      requireCondition(
        typeof v === 'string' && /^\d+$/.test(v),
        'INVALID_RATE',
        'Rate fractions must use whole-number strings.',
      );
      return BigInt(v);
    }
    if (Array.isArray(v)) return v.map((x) => convert(x));
    if (v && typeof v === 'object')
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, convert(x, k)]));
    return v;
  };
  const input = convert(SurplusScheduleSchema.parse(raw)) as SurplusInput;
  requireCondition(
    input &&
      input.terms &&
      Array.isArray(input.costs) &&
      Array.isArray(input.losses) &&
      Array.isArray(input.allowances) &&
      Array.isArray(input.priorDeductionSourceIds),
    'INVALID_SCHEDULE',
    'The complete published-method schedule is required.',
  );
  const result = stateSurplus(input);
  return JSON.parse(JSON.stringify(result, (_, v) => (typeof v === 'bigint' ? money(v) : v)));
}
