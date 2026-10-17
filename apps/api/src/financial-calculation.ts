import { SurplusScheduleSchema } from '@cornerstone/contracts';
import { requireCondition } from '@cornerstone/domain';
import { cents, money, stateSurplus, type SurplusInput } from '@cornerstone/finance';

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
