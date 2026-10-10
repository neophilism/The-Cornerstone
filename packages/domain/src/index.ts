import type { CaseRecord, Kind, Role } from '@cornerstone/contracts';
export { workflows, workflow, parseFields, validateAction, workflowGroups } from './workflows.js';

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 422,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
export function requireCondition(value: unknown, code: string, message: string): asserts value {
  if (!value) throw new DomainError(code, message);
}
export function majorityOfAll(yes: number, units: number): boolean {
  requireCondition(
    Number.isSafeInteger(yes) &&
      Number.isSafeInteger(units) &&
      units > 0 &&
      yes >= 0 &&
      yes <= units,
    'INVALID_VOTE_COUNT',
    'Vote counts must match the frozen founding roll.',
  );
  return yes * 2 > units;
}
export function principalLivelihood(
  earnedIncomeShare: number | null,
  hours: number | null,
): boolean {
  if (earnedIncomeShare !== null)
    requireCondition(
      Number.isFinite(earnedIncomeShare) && earnedIncomeShare >= 0 && earnedIncomeShare <= 1,
      'INVALID_BASELINE',
      'Income share must be between zero and one.',
    );
  if (hours !== null)
    requireCondition(
      Number.isFinite(hours) && hours >= 0,
      'INVALID_BASELINE',
      'Hours cannot be negative.',
    );
  return (
    (earnedIncomeShare !== null && earnedIncomeShare > 0.5) || (hours !== null && hours >= 1000)
  );
}
export function validateFoundingRoll(input: {
  units: { claimId: string; personId: string }[];
  pending: number;
  closed: boolean;
  largerApproval?: { yes: number; laborFindings: boolean };
}) {
  const n = input.units.length;
  requireCondition(n >= 2, 'ASSOCIATION_TOO_SMALL', 'At least two founding units are required.');
  requireCondition(
    new Set(input.units.map((u) => u.claimId)).size === n,
    'DUPLICATE_CLAIM',
    'A claim may appear once on a founding roll.',
  );
  requireCondition(
    new Set(input.units.map((u) => u.personId)).size === n,
    'DUPLICATE_VOTE',
    'One person has one founding vote within an association.',
  );
  requireCondition(
    input.pending === 0,
    'PENDING_ELIGIBILITY',
    'Resolve timely pending claims before closing the roll.',
  );
  if (n > 2500)
    requireCondition(
      input.largerApproval &&
        majorityOfAll(input.largerApproval.yes, n) &&
        input.largerApproval.laborFindings,
      'LARGER_ASSOCIATION_FINDINGS',
      'A larger association requires all-unit majority approval and Labor findings.',
    );
  requireCondition(input.closed, 'ROLL_NOT_CLOSED', 'Close the founding roll before ranking.');
}
export function validateCapitalRights(rights: {
  investorVotes: boolean;
  boardSeat: boolean;
  governanceVeto: boolean;
  unitPledge: boolean;
  compactForeclosure: boolean;
}) {
  requireCondition(
    !Object.values(rights).some(Boolean),
    'WORKER_CONTROL',
    'Outside capital cannot acquire votes, board seats, governance vetoes, founding units, or the compact right.',
  );
}
export function successorUnit(
  existing: { unitId: string; successorId: string | null },
  successorId: string,
  approved: boolean,
) {
  requireCondition(
    approved && successorId.length > 0,
    'SUCCESSION_PROOF',
    'A verified single-successor finding is required.',
  );
  return { unitId: existing.unitId, successorId }; // Preserve the unit; never mint another.
}
export type Field = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'number' | 'boolean' | 'money' | 'select' | 'json';
  required: boolean;
  help?: string;
  options?: string[];
};
export type ActionDefinition = {
  key: string;
  label: string;
  from: string[];
  to: string;
  roles: Role[];
  authority: string | null;
  fields: Field[];
  help: string;
};
export type WorkflowDefinition = {
  kind: Kind;
  label: string;
  description: string;
  initial: string;
  createRoles: Role[];
  createFields: Field[];
  actions: ActionDefinition[];
  official: boolean;
};
export function assertTransition(record: CaseRecord, action: Pick<ActionDefinition, 'from'>) {
  requireCondition(
    action.from.includes(record.state),
    'INVALID_TRANSITION',
    `This action is unavailable while the record is ${record.state}.`,
  );
}
export function addCalendarDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  requireCondition(
    !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === date && Number.isInteger(days),
    'INVALID_DATE',
    'A valid legal date and day count are required.',
  );
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function anniversary(date: string, years: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  const y = d.getUTCFullYear() + years;
  requireCondition(
    !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === date && Number.isInteger(years),
    'INVALID_DATE',
    'A valid calendar date and whole year count are required.',
  );
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last))).toISOString().slice(0, 10);
}
export function renewal(input: {
  effectiveDate: string;
  today: string;
  renewalCount: number;
  controlContinues: boolean;
  uncuredViolationEstablished: boolean;
  stayed: boolean;
}) {
  const initialEnd = anniversary(input.effectiveDate, 30),
    finalEnd = anniversary(input.effectiveDate, 40);
  if (input.today < initialEnd) return { state: 'initial', end: initialEnd };
  if (input.today >= finalEnd) return { state: 'expired', end: finalEnd };
  requireCondition(
    input.renewalCount <= 1,
    'EXCESS_RENEWAL',
    'Only one ten-year renewal is available.',
  );
  if ((!input.controlContinues || input.uncuredViolationEstablished) && !input.stayed)
    return { state: 'nonrenewal_review', end: initialEnd };
  return { state: 'renewed', end: finalEnd }; // A missed agency review does not prevent renewal.
}
