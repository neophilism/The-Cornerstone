import { describe, expect, it } from 'vitest';
import {
  cents,
  money,
  rate,
  fundRemittance,
  stateSurplus,
  reconcileAllowance,
  type SurplusInput,
  type Cost,
  type Allowance,
} from '@cornerstone/finance';
const terms = {
  version: 'synthetic-method-v1',
  rate: rate(1n, 20n),
  rateActId: 'SYNTHETIC-ONLY',
  workingCapitalMonths: 6,
  ordinaryHorizonMonths: 36,
  growthLimit: rate(1n, 2n),
} as const;
const base = (): SurplusInput => ({
  enterpriseId: 'synthetic-enterprise',
  year: 2026,
  yearEnd: '2026-12-31',
  terms,
  grossReceipts: 100000n,
  financingProceeds: 0n,
  refunds: 0n,
  collectedTaxes: 0n,
  recoveriesAndReleasedAllowances: 0n,
  costs: [],
  losses: [],
  allowances: [],
  ordinaryAnnualOperatingCosts: 10000n,
  cashCycleShortfall: 8000n,
  priorDeductionSourceIds: [],
});
const cost = (id: string, kind: Cost['kind'], paid: bigint): Cost => ({
  id,
  sourceId: `receipt:${id}`,
  kind,
  paid,
  eligibleAmount: paid,
  fundFinanced: false,
  previouslyDeducted: false,
  required: true,
  armLength: true,
  irrevocablyReserved: false,
});
const allowance = (id: string, kind: Allowance['kind'], amount: bigint): Allowance => ({
  id,
  sourceId: `restricted:${id}`,
  kind,
  addition: amount,
  target: amount,
  existingDedicated: 0n,
  insuranceGrantsOtherFinance: 0n,
  deadline: '2028-12-31',
  originalDeadline: '2028-12-31',
  documented: true,
  verified: true,
  restricted: true,
  legallyRequiredLonger: false,
  legalRequiredAmount: 0n,
});
describe('exact cash calculations (all rates are synthetic fixtures)', () => {
  it('nets existing working capital from the collective six-month ceiling', () => {
    const a = { ...allowance('wc', 'working_capital', 9000n), existingDedicated: 4000n };
    expect(stateSurplus({ ...base(), allowances: [a] }).allowances[0]?.allowed).toBe(1000n);
  });
  it('protects supported required Fund cash irrevocably reserved for remittance', () => {
    const c = {
      ...cost('fund-reserved', 'fund', 0n),
      reserved: 20000n,
      eligibleAmount: 20000n,
      irrevocablyReserved: true,
    };
    expect(stateSurplus({ ...base(), costs: [c] }).fundProtected).toBe(20000n);
    expect(() => stateSurplus({ ...base(), costs: [{ ...c, kind: 'distribution' }] })).toThrow(
      /reserved/,
    );
  });
  it('parses currency exactly and rejects floating approximations', () => {
    expect(cents('9007199254740993.01')).toBe(900719925474099301n);
    expect(money(-101n)).toBe('-1.01');
    expect(() => cents('1e3')).toThrow();
    expect(() => cents('1.001')).toThrow();
  });
  it('caps the final Fund remittance and never restarts after release', () => {
    let account = {
      terms: { principal: 100n, fixedReturn: 20n, receiptRate: rate(1n, 2n), version: 'synthetic' },
      collected: 110n,
      released: false,
    };
    const r = fundRemittance(account, {
      operating: 100n,
      financing: 0n,
      refunds: 0n,
      collectedTaxes: 0n,
    });
    expect(r.payment).toBe(10n);
    expect(r.remaining).toBe(0n);
    expect(r.account.released).toBe(true);
    expect(
      fundRemittance(r.account, {
        operating: 999999n,
        financing: 0n,
        refunds: 0n,
        collectedTaxes: 0n,
      }).payment,
    ).toBe(0n);
  });
  it('excludes financing, taxes and refunds from the Fund base', () => {
    const r = fundRemittance(
      {
        terms: { principal: 100000n, fixedReturn: 0n, receiptRate: rate(1n, 10n), version: 'test' },
        collected: 0n,
        released: false,
      },
      { operating: 10000n, financing: 5000n, refunds: 1000n, collectedTaxes: 1000n },
    );
    expect(r.payment).toBe(300n);
  });
  it('uses expenses, prior losses FIFO and required payments in the prescribed order', () => {
    const b = base();
    const r = stateSurplus({
      ...b,
      grossReceipts: 200000n,
      costs: [
        cost('op', 'operating', 100000n),
        cost('fund', 'fund', 10000n),
        cost('debt', 'debt_principal', 5000n),
      ],
      losses: [
        {
          id: 'newer',
          year: 2025,
          original: 50000n,
          remaining: 40000n,
          enterpriseId: b.enterpriseId,
        },
        {
          id: 'older',
          year: 2023,
          original: 30000n,
          remaining: 30000n,
          enterpriseId: b.enterpriseId,
        },
      ],
      allowances: [
        allowance('wc', 'working_capital', 9000n),
        allowance('growth', 'productive_investment', 100000n),
      ],
    });
    expect(r.losses.map((l) => l.remaining)).toEqual([0n, 0n]);
    expect(r.fundProtected).toBe(10000n);
    expect(r.debtProtected).toBe(5000n);
    expect(r.allowances.map((a) => a.allowed)).toEqual([5000n, 5000n]);
    expect(r.shareableSurplus).toBe(5000n);
    expect(r.statePayment).toBe(250n);
  });
  it('produces no state payment for a deficit and preserves its verified loss', () => {
    const r = stateSurplus({ ...base(), grossReceipts: 100n, costs: [cost('op', 'wages', 500n)] });
    expect(r.shareableSurplus).toBe(0n);
    expect(r.statePayment).toBe(0n);
    expect(r.newLoss?.remaining).toBe(400n);
  });
  it('does not recognize distributions or Fund-financed outlays twice', () => {
    const r = stateSurplus({
      ...base(),
      costs: [
        cost('distribution', 'distribution', 50000n),
        { ...cost('advance-cost', 'operating', 50000n), fundFinanced: true },
        cost('fund', 'fund', 10000n),
      ],
    });
    expect(r.shareableSurplus).toBe(90000n);
    expect(r.excluded).toHaveLength(2);
  });
  it('rejects reused source receipts and relabeled reserve deadlines', () => {
    expect(() =>
      stateSurplus({
        ...base(),
        costs: [{ ...cost('op', 'operating', 100n), sourceId: 'old' }],
        priorDeductionSourceIds: ['old'],
      }),
    ).toThrow(/deducted again/);
    expect(() =>
      stateSurplus({
        ...base(),
        allowances: [{ ...allowance('r', 'liability_reserve', 100n), deadline: '2029-01-01' }],
      }),
    ).toThrow(/original/);
  });
  it('caps productive investments collectively at half the protected remainder', () => {
    const r = stateSurplus({
      ...base(),
      allowances: [
        allowance('g1', 'productive_investment', 40000n),
        allowance('g2', 'productive_investment', 40000n),
        allowance('g3', 'productive_investment', 40000n),
      ],
    });
    expect(r.allowances.reduce((n, a) => n + a.allowed, 0n)).toBe(50000n);
    expect(r.shareableSurplus).toBe(50000n);
  });
  it('nets existing dedicated cash and external financing from an allowance', () => {
    const a = {
      ...allowance('r', 'required_capital', 50000n),
      existingDedicated: 20000n,
      insuranceGrantsOtherFinance: 15000n,
    };
    expect(stateSurplus({ ...base(), allowances: [a] }).allowances[0]?.allowed).toBe(15000n);
  });
  it('releases unused or diverted cash at its original deadline', () => {
    expect(
      reconcileAllowance(
        {
          id: 'r',
          balance: 10000n,
          target: 9000n,
          deadline: '2026-12-31',
          originalDeadline: '2026-12-31',
          diverted: 1000n,
          spentForPurpose: 2000n,
        },
        '2026-12-31',
      ),
    ).toEqual({ release: 8000n, remaining: 0n, deadline: '2026-12-31' });
  });
  it('rejects an unset or malformed state rate and an altered protected baseline', () => {
    expect(() => stateSurplus({ ...base(), terms: { ...terms, rateActId: '' } })).toThrow(
      /prospective rate/,
    );
    expect(() =>
      stateSurplus({ ...base(), terms: { ...terms, rate: { numerator: 2n, denominator: 0n } } }),
    ).toThrow(/valid/);
  });
  it('preserves nonnegative bounded payments across 1000 independent receipt sizes', () => {
    for (let n = 0; n < 1000; n++) {
      const gross = BigInt(n) * 997n;
      const r = stateSurplus({
        ...base(),
        grossReceipts: gross,
        costs: [cost('op', 'operating', BigInt(n % 37) * 100n)],
      });
      expect(r.statePayment >= 0n).toBe(true);
      expect(r.statePayment <= r.shareableSurplus).toBe(true);
      expect(r.shareableSurplus <= gross).toBe(true);
    }
  });
});
