export const syntheticTerms = {
  version: 'synthetic-financial-review-v1',
  rateActId: 'SYNTHETIC-NOT-AN-ENACTED-RATE',
  rate: { numerator: '1', denominator: '20' },
  workingCapitalMonths: 6,
  ordinaryHorizonMonths: 36,
  growthLimit: { numerator: '1', denominator: '2' },
};

export function financialSchedule(operatingCost = '100.00') {
  return {
    yearEnd: '2026-12-31',
    grossReceipts: '1000.00',
    financingProceeds: '0.00',
    refunds: '0.00',
    collectedTaxes: '0.00',
    recoveriesAndReleasedAllowances: '0.00',
    ordinaryAnnualOperatingCosts: '0.00',
    cashCycleShortfall: '0.00',
    priorDeductionSourceIds: [],
    costs: [
      {
        id: 'invented-operating-entry',
        sourceId: 'invented-operating-source',
        kind: 'operating',
        paid: operatingCost,
        reserved: '0.00',
        eligibleAmount: operatingCost,
        fundFinanced: false,
        previouslyDeducted: false,
        required: true,
        armLength: true,
        irrevocablyReserved: false,
      },
    ],
    losses: [],
    allowances: [],
  };
}
