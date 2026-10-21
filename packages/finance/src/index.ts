export type Money = bigint;
export type Rate = Readonly<{ numerator: bigint; denominator: bigint }>;
export class FinanceError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
function check(v: unknown, code: string, message: string): asserts v {
  if (!v) throw new FinanceError(code, message);
}
export function cents(value: string): Money {
  check(
    /^-?(0|[1-9]\d{0,17})(\.\d{1,2})?$/.test(value),
    'INVALID_MONEY',
    'Use decimal currency with at most two places.',
  );
  const negative = value.startsWith('-'),
    [whole, fraction = ''] = value.replace('-', '').split('.');
  return (BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'))) * (negative ? -1n : 1n);
}
export function money(value: Money): string {
  const abs = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}
export function rate(numerator: bigint, denominator: bigint): Rate {
  check(
    numerator >= 0n && denominator > 0n && numerator <= denominator,
    'INVALID_RATE',
    'A rate must be a valid nonnegative fraction no greater than one.',
  );
  return Object.freeze({ numerator, denominator });
}
export function multiply(value: Money, r: Rate): Money {
  check(value >= 0n, 'NEGATIVE_RATE_BASE', 'A payment base cannot be negative.');
  rate(r.numerator, r.denominator);
  const scaled = value * r.numerator;
  return (scaled + r.denominator / 2n) / r.denominator;
}
const min = (...values: bigint[]) => values.reduce((a, b) => (a < b ? a : b));
const positive = (v: bigint) => (v > 0n ? v : 0n);

export type FundTerms = Readonly<{
  principal: Money;
  fixedReturn: Money;
  receiptRate: Rate;
  version: string;
}>;
export type FundAccount = Readonly<{ terms: FundTerms; collected: Money; released: boolean }>;
export function fundRemittance(
  account: FundAccount,
  receipts: { operating: Money; financing: Money; refunds: Money; collectedTaxes: Money },
) {
  // Capture each declared receipt field once, before calculating or releasing an obligation.
  // Accessor-backed and missing fields cannot supply a stable exact-cent financial basis.
  const captured = {} as typeof receipts;
  for (const field of ['operating', 'financing', 'refunds', 'collectedTaxes'] as const) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(receipts, field);
    } catch {
      throw new FinanceError('INVALID_RECEIPTS', 'Receipt fields must be plain exact-cent data.');
    }
    check(
      descriptor && Object.hasOwn(descriptor, 'value') && typeof descriptor.value === 'bigint',
      'INVALID_RECEIPTS',
      'Receipt fields must be plain exact-cent data.',
    );
    captured[field] = descriptor.value;
    check(captured[field] >= 0n, 'NEGATIVE_RECEIPTS', 'Receipt components cannot be negative.');
  }
  check(
    captured.financing + captured.refunds + captured.collectedTaxes <= captured.operating,
    'RECEIPT_COMPONENTS',
    'Excluded Fund receipt components cannot exceed gross operating receipts.',
  );
  const total = account.terms.principal + account.terms.fixedReturn;
  check(
    account.terms.principal >= 0n &&
      account.terms.fixedReturn >= 0n &&
      account.collected >= 0n &&
      account.collected <= total,
    'FUND_LEDGER',
    'Fund totals are inconsistent.',
  );
  if (account.released) {
    check(
      account.collected === total,
      'INVALID_RELEASE',
      'Release requires payment of the fixed obligation.',
    );
    return { payment: 0n, remaining: 0n, account };
  }
  // Operating is gross actual receipts; the excluded components are included in that gross.
  const base = positive(
    captured.operating - captured.financing - captured.refunds - captured.collectedTaxes,
  );
  const payment = min(multiply(base, account.terms.receiptRate), total - account.collected);
  const collected = account.collected + payment;
  return {
    payment,
    remaining: total - collected,
    account: { ...account, collected, released: collected === total },
  };
}
export type LossLot = Readonly<{
  id: string;
  year: number;
  original: Money;
  remaining: Money;
  enterpriseId: string;
}>;
export type Cost = Readonly<{
  id: string;
  sourceId: string;
  kind:
    | 'operating'
    | 'wages'
    | 'tax'
    | 'interest'
    | 'fund'
    | 'debt_principal'
    | 'distribution'
    | 'depreciation'
    | 'amortization'
    | 'state_share';
  paid: Money;
  reserved?: Money;
  eligibleAmount: Money;
  fundFinanced: boolean;
  previouslyDeducted: boolean;
  required: boolean;
  armLength: boolean;
  irrevocablyReserved: boolean;
}>;
export type Allowance = Readonly<{
  id: string;
  sourceId: string;
  kind: 'working_capital' | 'liability_reserve' | 'required_capital' | 'productive_investment';
  addition: Money;
  target: Money;
  existingDedicated: Money;
  insuranceGrantsOtherFinance: Money;
  deadline: string;
  originalDeadline: string;
  documented: boolean;
  verified: boolean;
  restricted: boolean;
  legallyRequiredLonger: boolean;
  legalRequiredAmount: Money;
}>;
export type StateTerms = Readonly<{
  version: string;
  rate: Rate;
  rateActId: string;
  workingCapitalMonths: 6;
  ordinaryHorizonMonths: 36;
  growthLimit: Rate;
}>;
export type SurplusInput = Readonly<{
  enterpriseId: string;
  year: number;
  yearEnd: string;
  terms: StateTerms;
  grossReceipts: Money;
  financingProceeds: Money;
  refunds: Money;
  collectedTaxes: Money;
  recoveriesAndReleasedAllowances: Money;
  costs: readonly Cost[];
  losses: readonly LossLot[];
  allowances: readonly Allowance[];
  ordinaryAnnualOperatingCosts: Money;
  cashCycleShortfall: Money;
  priorDeductionSourceIds: readonly string[];
}>;
function monthCeiling(date: string, months: number) {
  const d = new Date(`${date}T00:00:00Z`);
  check(
    !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === date,
    'INVALID_DATE',
    'Use a valid fiscal date.',
  );
  const targetMonth = d.getUTCMonth() + months;
  const last = new Date(Date.UTC(d.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(d.getUTCFullYear(), targetMonth, Math.min(d.getUTCDate(), last)))
    .toISOString()
    .slice(0, 10);
}
export function stateSurplus(input: SurplusInput) {
  check(
    input.terms.rateActId && input.terms.version && input.terms.rate.numerator > 0n,
    'UNSET_STATE_RATE',
    'A published prospective rate and calculation version are required.',
  );
  rate(input.terms.rate.numerator, input.terms.rate.denominator);
  monthCeiling(input.yearEnd, 0);
  check(
    input.terms.workingCapitalMonths === 6 &&
      input.terms.ordinaryHorizonMonths === 36 &&
      input.terms.growthLimit.numerator === 1n &&
      input.terms.growthLimit.denominator === 2n,
    'ALTERED_BASELINE',
    'The protected draft baseline cannot be privately negotiated.',
  );
  const allAmounts = [
    input.grossReceipts,
    input.financingProceeds,
    input.refunds,
    input.collectedTaxes,
    input.recoveriesAndReleasedAllowances,
    input.ordinaryAnnualOperatingCosts,
    input.cashCycleShortfall,
  ];
  check(
    allAmounts.every((v) => v >= 0n),
    'NEGATIVE_INPUT',
    'Receipt and target components cannot be negative.',
  );
  check(
    input.financingProceeds + input.refunds + input.collectedTaxes <= input.grossReceipts,
    'RECEIPT_COMPONENTS',
    'Excluded receipts exceed gross receipts.',
  );
  const sourceIds = new Set(input.priorDeductionSourceIds),
    ids = new Set<string>();
  const claim = (id: string, sourceId: string) => {
    check(!ids.has(id), 'DUPLICATE_ENTRY', 'A ledger entry cannot be counted twice.');
    ids.add(id);
    check(
      !sourceIds.has(sourceId),
      'DOUBLE_DEDUCTION',
      'A previously deducted outlay cannot be deducted again.',
    );
    sourceIds.add(sourceId);
  };
  let operatingCosts = 0n,
    fund = 0n,
    debt = 0n;
  const excluded: { id: string; reason: string }[] = [];
  for (const c of input.costs) {
    const reserved = c.reserved ?? 0n;
    check(
      reserved >= 0n &&
        (reserved === 0n || (c.kind === 'fund' && c.required && c.irrevocablyReserved)),
      'UNSUPPORTED_RESERVATION',
      'Only documented irrevocably reserved required Fund payments qualify as reserved costs.',
    );
    check(
      c.paid >= 0n && c.eligibleAmount >= 0n && c.eligibleAmount <= c.paid + reserved,
      'COST_AMOUNT',
      'An eligible paid amount must be supported by the documented payment.',
    );
    if (['distribution', 'depreciation', 'amortization', 'state_share'].includes(c.kind)) {
      excluded.push({ id: c.id, reason: 'Not deductible under the published cash method' });
      continue;
    }
    if (c.fundFinanced && c.kind !== 'fund') {
      excluded.push({
        id: c.id,
        reason: 'Fund-financed outlays are recognized only through required Fund remittances',
      });
      continue;
    }
    if (c.previouslyDeducted) {
      excluded.push({
        id: c.id,
        reason: 'Already recognized in an expense, loss, debt or allowance',
      });
      continue;
    }
    if (!c.armLength) {
      excluded.push({
        id: c.id,
        reason: 'An independently supportable arm’s-length amount is required',
      });
      continue;
    }
    if (c.kind === 'fund' || c.kind === 'debt_principal') {
      if (!c.required) {
        excluded.push({
          id: c.id,
          reason: 'Only required Fund payments and scheduled debt principal qualify',
        });
        continue;
      }
      claim(c.id, c.sourceId);
      if (c.kind === 'fund') fund += c.eligibleAmount;
      else debt += c.eligibleAmount;
    } else {
      claim(c.id, c.sourceId);
      operatingCosts += c.eligibleAmount;
    }
  }
  const receipts =
    input.grossReceipts -
    input.financingProceeds -
    input.refunds -
    input.collectedTaxes +
    input.recoveriesAndReleasedAllowances;
  const operatingBalance = receipts - operatingCosts;
  const lossIds = new Set<string>();
  let remaining = positive(operatingBalance),
    lossesUsed = 0n;
  const losses = [...input.losses]
    .sort((a, b) => a.year - b.year || a.id.localeCompare(b.id))
    .map((l) => {
      check(
        !lossIds.has(l.id) &&
          l.enterpriseId === input.enterpriseId &&
          l.year < input.year &&
          l.original >= l.remaining &&
          l.remaining >= 0n,
        'INVALID_LOSS_LOT',
        'Use each verified prior enterprise loss once.',
      );
      lossIds.add(l.id);
      const used = min(remaining, l.remaining);
      remaining -= used;
      lossesUsed += used;
      return { ...l, remaining: l.remaining - used };
    });
  const newLoss =
    operatingBalance < 0n
      ? {
          id: `${input.enterpriseId}:${input.year}`,
          year: input.year,
          original: -operatingBalance,
          remaining: -operatingBalance,
          enterpriseId: input.enterpriseId,
        }
      : null;
  const fundProtected = min(remaining, fund);
  remaining -= fundProtected;
  const debtProtected = min(remaining, debt);
  remaining -= debtProtected;
  const allowances: { id: string; allowed: Money; deadline: string; kind: Allowance['kind'] }[] =
    [];
  let workingUsed = 0n;
  const workingExisting = input.allowances
    .filter((a) => a.kind === 'working_capital')
    .reduce((n, a) => n + a.existingDedicated + a.insuranceGrantsOtherFinance, 0n);
  const workingBudget = positive(
    min(input.cashCycleShortfall, input.ordinaryAnnualOperatingCosts / 2n) - workingExisting,
  );
  let growthBudget: bigint | null = null;
  let growthUsed = 0n;
  const ordered = [...input.allowances].sort(
    (a, b) =>
      ['working_capital', 'liability_reserve', 'required_capital', 'productive_investment'].indexOf(
        a.kind,
      ) -
        [
          'working_capital',
          'liability_reserve',
          'required_capital',
          'productive_investment',
        ].indexOf(b.kind) || a.id.localeCompare(b.id),
  );
  for (const a of ordered) {
    check(
      [
        a.addition,
        a.target,
        a.existingDedicated,
        a.insuranceGrantsOtherFinance,
        a.legalRequiredAmount,
      ].every((v) => v >= 0n),
      'ALLOWANCE_AMOUNT',
      'Allowance components cannot be negative.',
    );
    check(
      a.documented && a.verified && a.restricted,
      'UNSUPPORTED_ALLOWANCE',
      'A documented, verified, actual addition to restricted cash is required.',
    );
    check(
      a.deadline === a.originalDeadline && a.deadline > input.yearEnd,
      'ROLLED_ALLOWANCE',
      'Use the original unexpired deadline; relabeling cannot extend it.',
    );
    const beyond = a.deadline > monthCeiling(input.yearEnd, 36);
    check(
      !beyond || (a.kind === 'liability_reserve' && a.legallyRequiredLonger),
      'ALLOWANCE_HORIZON',
      'Ordinary reserves and projects must be due within 36 months.',
    );
    claim(a.id, a.sourceId);
    let target = positive(a.target - a.existingDedicated - a.insuranceGrantsOtherFinance);
    if (a.kind === 'working_capital') {
      target = min(target, positive(workingBudget - workingUsed));
    }
    if (beyond) target = min(target, a.legalRequiredAmount);
    if (a.kind === 'productive_investment') {
      growthBudget ??= remaining / 2n;
      target = min(target, positive(growthBudget - growthUsed));
    }
    const allowed = min(remaining, a.addition, target);
    remaining -= allowed;
    if (a.kind === 'working_capital') workingUsed += allowed;
    if (a.kind === 'productive_investment') growthUsed += allowed;
    allowances.push({ id: a.id, allowed, deadline: a.originalDeadline, kind: a.kind });
  }
  return {
    receipts,
    operatingCosts,
    operatingBalance,
    lossesUsed,
    losses,
    newLoss,
    fundProtected,
    debtProtected,
    allowances,
    excluded,
    shareableSurplus: remaining,
    statePayment: multiply(remaining, input.terms.rate),
    termsVersion: input.terms.version,
    rateActId: input.terms.rateActId,
  };
}
export type AllowanceLot = Readonly<{
  id: string;
  balance: Money;
  target: Money;
  deadline: string;
  originalDeadline: string;
  diverted: Money;
  spentForPurpose: Money;
}>;
export function reconcileAllowance(lot: AllowanceLot, today: string) {
  check(
    lot.deadline === lot.originalDeadline,
    'ROLLED_ALLOWANCE',
    'The original deduction deadline is immutable.',
  );
  check(
    [lot.balance, lot.target, lot.diverted, lot.spentForPurpose].every((v) => v >= 0n) &&
      lot.diverted + lot.spentForPurpose <= lot.balance,
    'ALLOWANCE_LEDGER',
    'Allowance movements exceed their balance.',
  );
  const unspent = lot.balance - lot.spentForPurpose - lot.diverted;
  const release =
    lot.diverted + (today >= lot.originalDeadline ? unspent : positive(unspent - lot.target));
  return {
    release,
    remaining: lot.balance - lot.spentForPurpose - release,
    deadline: lot.originalDeadline,
  };
}
