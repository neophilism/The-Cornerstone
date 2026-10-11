import { expect, it } from 'vitest';
import { calculateWireSchedule } from '../apps/api/src/service.js';
const fixture = () => ({
  enterpriseId: 'synthetic-enterprise',
  year: 2026,
  yearEnd: '2026-12-31',
  terms: {
    version: 'synthetic-method',
    rateActId: 'SYNTHETIC-ONLY',
    rate: { numerator: '1', denominator: '20' },
    workingCapitalMonths: 6,
    ordinaryHorizonMonths: 36,
    growthLimit: { numerator: '1', denominator: '2' },
  },
  grossReceipts: '1000.00',
  financingProceeds: '0.00',
  refunds: '0.00',
  collectedTaxes: '0.00',
  recoveriesAndReleasedAllowances: '0.00',
  costs: [],
  losses: [],
  allowances: [],
  ordinaryAnnualOperatingCosts: '0.00',
  cashCycleShortfall: '0.00',
  priorDeductionSourceIds: [],
});
it('validates the complete financial wire format before exact-cents calculation (synthetic rate)', () => {
  expect(calculateWireSchedule(fixture()).statePayment).toBe('50.00');
  expect(() => calculateWireSchedule({ ...fixture(), grossReceipts: 1000 })).toThrow();
  expect(() =>
    calculateWireSchedule({ ...fixture(), allowances: [{ addition: '10.00' }] }),
  ).toThrow();
  expect(() =>
    calculateWireSchedule({
      ...fixture(),
      terms: { ...fixture().terms, workingCapitalMonths: 600 },
    }),
  ).toThrow();
  expect(() => calculateWireSchedule({ ...fixture(), favoredRate: '0.01' })).toThrow();
});
