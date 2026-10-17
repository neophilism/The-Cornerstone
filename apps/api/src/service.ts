import { randomUUID } from 'node:crypto';
import type { Actor, CaseRecord, Command, Mode, Realm, Receipt } from '@cornerstone/contracts';
import {
  CreateRecordSchema,
  CommandSchema,
  IdSchema,
  SurplusScheduleSchema,
} from '@cornerstone/contracts';
import {
  workflow,
  actionUnavailable,
  parseFields,
  validateAction,
  assertTransition,
  validateFoundingRoll,
  renewal,
  requireCondition,
  DomainError,
} from '@cornerstone/domain';
import { assertAuthority, draftPolicy } from '@cornerstone/policy';
import { canAct, canRead, digest } from '@cornerstone/security';
import { EvidenceService } from './evidence.js';
import { MembershipService } from './membership.js';
import { SuccessionService } from './succession.js';
import { ClaimSurvivalService } from './claim-survival.js';
import { GovernanceService } from './governance.js';
import { CompactService } from './compacts.js';
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
    private readonly clock: () => Date = () => new Date(),
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
      'Protected production intake requires verified recipient security, identity/recovery controls and approved authority; this release is synthetic-only.',
    );
  }
  private async replay(tx: Transaction, actor: Actor, receipt: Receipt) {
    // An actor may retain an old receipt while no longer having case access.
    // Do not label an inaccessible historical record as a successful recovery.
    const current = await this.store.get(tx, receipt.recordId);
    if (
      !current ||
      !canRead(actor, current, await this.store.grants(tx, current.id), this.clock().toISOString())
    )
      throw new DomainError('NOT_FOUND', 'Record not found or no longer accessible.', 404);
    const record = await this.store.getVersion(tx, receipt.recordId, receipt.version);
    if (!record)
      throw new DomainError('NOT_FOUND', 'Record not found or no longer accessible.', 404);
    return { receipt, record };
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
    const now = this.clock().toISOString();
    const requestDigest = digest(input);
    return this.store.transaction(actor, async (tx) => {
      const previous = await this.store.existingReceipt(
        tx,
        actor,
        input.idempotencyKey,
        requestDigest,
      );
      if (previous) return this.replay(tx, actor, previous);
      const members = new MembershipService(this.store, this.mode, this.realm);
      if (input.kind === 'resolution') {
        await members.resolutionDraft(tx, actor, data);
        await new GovernanceService(this.store).bindResolution(tx, actor, data);
        await new CompactService(this.store).bindResolution(tx, actor, data);
      }
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
      if (record.kind === 'resolution')
        await tx.query('SELECT simulation_link_resolution($1,$2)', [
          record.id,
          data['associationId'],
        ]);
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
      if (previous) return this.replay(tx, actor, previous);
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
        now = this.clock().toISOString();
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
      const unavailable = actionUnavailable(record.kind, a.key);
      // A known, pre-mutation prerequisite rejection is not an uncertain server failure.
      if (unavailable) throw new DomainError(unavailable.code, unavailable.message, 409);
      const input = parseFields(a.fields, command.input);
      const retained = { ...record.data };
      if (a.key === 'save_draft') for (const field of wf.createFields) delete retained[field.key];
      let data = validateAction({ ...record, data: retained }, a.key, input, now.slice(0, 10));
      const members = new MembershipService(this.store, this.mode, this.realm);
      if (record.kind === 'resolution' && a.key === 'save_draft') {
        await members.resolutionDraft(tx, actor, data, record.id);
        await new GovernanceService(this.store).bindResolution(tx, actor, data);
        await new CompactService(this.store).bindResolution(tx, actor, data);
      }
      if (record.kind === 'opportunity')
        await new GovernanceService(this.store).prepareOpportunity(tx, actor, record, a.key, data);
      if (record.kind === 'compact')
        await new CompactService(this.store).requireApproval(tx, actor, record, a.key, data);
      data = await this.linkedRules(tx, actor, record, command, data, now);
      if (record.kind === 'succession')
        data = await new SuccessionService().prepare(tx, actor, record, a.key, data);
      if (record.kind === 'claim_survival')
        data = await new ClaimSurvivalService(this.store).prepare(tx, actor, record, a.key, data);
      const ballot =
        record.kind === 'resolution' && a.key === 'record_vote'
          ? await members.prepareBallot(tx, actor, record, data, now.slice(0, 10))
          : undefined;
      const history = Array.isArray(record.data['history']) ? record.data['history'] : [];
      data['history'] = [
        ...history,
        { version: record.version + 1, action: a.key, at: now, actorId: actor.id },
      ];
      let institution = record.institutionId;
      if (
        a.key === 'submit' ||
        (record.kind === 'resolution' && a.key === 'open_vote') ||
        (record.kind === 'opportunity' && a.key === 'propose')
      ) {
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
      if (record.kind === 'association' && a.key === 'submit') await members.invite(tx, next);
      if (record.kind === 'opportunity' && a.key === 'propose')
        await new GovernanceService(this.store).share(tx, next, receipt);
      if (record.kind === 'succession' && a.key === 'approve')
        await new SuccessionService().finish(tx, next, receipt);
      if (record.kind === 'claim_survival' && a.key === 'approve')
        await new ClaimSurvivalService(this.store).finish(tx, actor, next, receipt);
      if (ballot)
        await tx.query('SELECT simulation_cast_ballot($1,$2,$3,$4::jsonb,$5,$6)', [
          ballot.id,
          record.id,
          ballot.unitId,
          JSON.stringify(ballot.cipher),
          ballot.commitment,
          receipt.id,
        ]);
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
    const definition = workflow(r.kind),
      action = definition.actions.find((a) => a.key === k);
    const needsEvidence =
      (k === 'submit' && definition.createFields.some((f) => f.key === 'evidenceIds')) ||
      action?.fields.some((f) => f.key === 'evidenceIds' && f.required);
    if (needsEvidence)
      requireCondition(
        Array.isArray(d['evidenceIds']) && d['evidenceIds'].length > 0,
        'EVIDENCE_REQUIRED',
        'Attach and validate evidence before submission or written findings.',
      );
    if (Array.isArray(d['evidenceIds']) && (needsEvidence || action?.authority)) {
      const ids = d['evidenceIds'].map((id) => IdSchema.parse(id));
      await new EvidenceService(
        this.store,
        this.mode,
        this.realm,
        'synthetic-postgres',
      ).assertAvailable(tx, r.id, ids);
    }
    if (r.kind === 'claim' && k === 'find_eligible')
      await this.linked(tx, d['eventId'], 'event_petition', ['certified']);
    if (r.kind === 'association' && k === 'withdraw_proposal') {
      requireCondition(
        actor.id === r.ownerId,
        'ASSOCIATION_OWNER_REQUIRED',
        'Only the proposal owner may withdraw an unclosed proposal.',
      );
      requireCondition(
        !(await tx.query('SELECT id FROM founding_units WHERE association_id=$1', [r.id])).rowCount,
        'ROLL_ALREADY_CLOSED',
        'A closed founding unit requires the applicable member-governance process.',
      );
    }
    if (r.kind === 'association' && k === 'close_roll') {
      await this.linked(tx, d['eventId'], 'event_petition', ['certified']);
      const largerYes = await new MembershipService(
        this.store,
        this.mode,
        this.realm,
      ).assertConsented(tx, r, today);
      const units = d['units'] as { claimId: string; personId: string }[];
      requireCondition(Array.isArray(units), 'INVALID_ROLL', 'Provide the founding roll.');
      const largerFindings = [
        'accessibleMeetings',
        'accessibleVoting',
        'accessibleRecords',
        'practicalDeliberation',
      ].every((key) => d[key] === true);
      validateFoundingRoll({
        units,
        pending: Number(d['pendingClaims']),
        closed: true,
        ...(units.length > 2500
          ? {
              largerApproval: {
                yes: largerYes,
                laborFindings: largerFindings,
              },
            }
          : {}),
      });
      const represented = new Map<
        string,
        { eventId: string; firstLossDate: string; claimIds: string[] }
      >();
      const claims = new Map(
        (
          await this.store.getMany(
            tx,
            units.map((u) => u.claimId),
            true,
          )
        ).map((claim) => [claim.id, claim]),
      );
      for (const u of units) {
        IdSchema.parse(u.personId);
        const claim = claims.get(u.claimId);
        requireCondition(
          claim?.kind === 'claim' && claim.state === 'eligible' && claim.ownerId === u.personId,
          'FOUNDING_CLAIM_REQUIRED',
          'Every founder requires an accessible eligible claim in their own name.',
        );
        const eventId = IdSchema.parse(claim.data['eventId']);
        if (!represented.has(eventId)) {
          const event = await this.linked(tx, eventId, 'event_petition', ['certified']);
          represented.set(eventId, {
            eventId,
            firstLossDate: String(event.data['firstLossDate']),
            claimIds: [],
          });
        }
        represented.get(eventId)!.claimIds.push(claim.id);
      }
      requireCondition(
        represented.has(String(d['eventId'])),
        'EVENT_NOT_REPRESENTED',
        'The organizing event must be represented by an actual eligible founding claim.',
      );
      await tx.query('SELECT simulation_close_founding_units($1)', [r.id]);
      d['representedEvents'] = [...represented.values()].sort((a, b) =>
        a.eventId.localeCompare(b.eventId),
      );
      if (units.length > 2500) {
        d['largerYes'] = largerYes;
        d['largerFindings'] = largerFindings;
      }
      d['unitCount'] = units.length;
      d['rollClosedAt'] = today;
    }
    if (r.kind === 'resolution' && k === 'open_vote') {
      await new GovernanceService(this.store).assertResolutionBinding(tx, actor, d);
      await new CompactService(this.store).assertResolutionBinding(tx, actor, d);
      await this.linked(tx, d['associationId'], 'association', [
        'ready',
        'provisional',
        'operating',
      ]);
      await new MembershipService(this.store, this.mode, this.realm).freeze(tx, r, d, today);
    }
    if (r.kind === 'resolution' && k === 'tally') {
      await new MembershipService(this.store, this.mode, this.realm).tally(tx, r, d, today);
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
