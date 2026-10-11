'use client';
import { useState } from 'react';

type Values = Record<string, any>;
type EntryField = {
  key: string;
  label: string;
  type?: 'money' | 'date' | 'number' | 'boolean';
  options?: string[];
};
function Input({
  field,
  prefix,
  value,
  change,
}: {
  field: EntryField;
  prefix: string;
  value: unknown;
  change: (value: unknown) => void;
}) {
  const id = `${prefix}-${field.key}`;
  if (field.type === 'boolean')
    return (
      <div className="check-field">
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(e) => change(e.target.checked)}
        />
        <label htmlFor={id}>{field.label}</label>
      </div>
    );
  return (
    <div className="field">
      <label htmlFor={id}>
        {field.label}
        {field.type === 'money' ? ' (USD)' : ''}
      </label>
      {field.options ? (
        <select
          id={id}
          required
          value={String(value ?? '')}
          onChange={(e) => change(e.target.value)}
        >
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          required
          type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
          min={field.type === 'number' ? 1 : undefined}
          max={field.type === 'number' ? 9999 : undefined}
          step={field.type === 'number' ? 1 : undefined}
          inputMode={field.type === 'money' ? 'decimal' : undefined}
          pattern={field.type === 'money' ? '(0|[1-9][0-9]*)(\\.[0-9]{2})?' : undefined}
          value={String(value ?? '')}
          onChange={(e) =>
            change(
              field.type === 'number' && e.target.value ? Number(e.target.value) : e.target.value,
            )
          }
        />
      )}
    </div>
  );
}
export function FinancialTermsEditor({ prefix, value }: { prefix: string; value: unknown }) {
  const previous = (value && typeof value === 'object' ? value : {}) as Values;
  const [version, setVersion] = useState(String(previous['version'] ?? ''));
  const [rateActId, setRateActId] = useState(String(previous['rateActId'] ?? ''));
  const [numerator, setNumerator] = useState(String(previous['rate']?.numerator ?? ''));
  const [denominator, setDenominator] = useState(String(previous['rate']?.denominator ?? ''));
  const terms = {
    version,
    rateActId,
    rate: { numerator, denominator },
    workingCapitalMonths: 6,
    ordinaryHorizonMonths: 36,
    growthLimit: { numerator: '1', denominator: '2' },
  };
  return (
    <fieldset className="structured-field financial-terms">
      <legend>Published financial terms</legend>
      <p className="hint">
        Use the prospective Rate Act and common method published before associations rank this
        offer. No default state percentage is supplied. Officials cannot bargain for a different
        percentage after matching.
      </p>
      <input type="hidden" name="financialTerms" value={JSON.stringify(terms)} />
      <input type="hidden" name="financialVersion" value={version} />
      <input type="hidden" name="rateAct" value={rateActId} />
      <Input
        prefix={prefix + '-terms'}
        field={{ key: 'rateAct', label: 'Prospective flat-rate act' }}
        value={rateActId}
        change={(v) => setRateActId(String(v))}
      />
      <Input
        prefix={prefix + '-terms'}
        field={{ key: 'version', label: 'Common calculation and baseline version' }}
        value={version}
        change={(v) => setVersion(String(v))}
      />
      <div className="finance-grid">
        <div className="field">
          <label htmlFor={prefix + '-state-numerator'}>Published rate numerator</label>
          <input
            id={prefix + '-state-numerator'}
            required
            inputMode="numeric"
            pattern="[1-9][0-9]*"
            value={numerator}
            onChange={(e) => setNumerator(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={prefix + '-state-denominator'}>Published rate denominator</label>
          <input
            id={prefix + '-state-denominator'}
            required
            inputMode="numeric"
            pattern="[1-9][0-9]*"
            value={denominator}
            onChange={(e) => setDenominator(e.target.value)}
          />
        </div>
      </div>
      <p className="hint">
        Enter the exact enacted fraction. These fields do not enact or approve a rate.
      </p>
      <details>
        <summary>Protected baseline in the proposed state act</summary>
        <ul>
          <li>
            Working capital: at most six months of ordinary operating costs, further limited by the
            cash-cycle shortfall.
          </li>
          <li>
            Ordinary reserves and projects: 36 months; a legally required longer liability reserve
            needs separate proof.
          </li>
          <li>
            Other productive investment: at most one half of the balance after earlier protections.
          </li>
        </ul>
        <p className="hint">
          These are draft implementation choices, not the state's surplus-share percentage. The flat
          share conveys no equity or management power.
        </p>
      </details>
    </fieldset>
  );
}
const receipts: EntryField[] = [
  { key: 'grossReceipts', label: 'Gross cash receipts', type: 'money' },
  { key: 'financingProceeds', label: 'Financing included in gross receipts', type: 'money' },
  { key: 'refunds', label: 'Refunds included in gross receipts', type: 'money' },
  { key: 'collectedTaxes', label: 'Government taxes included in gross receipts', type: 'money' },
  {
    key: 'recoveriesAndReleasedAllowances',
    label: 'Recoveries and released allowances',
    type: 'money',
  },
  { key: 'ordinaryAnnualOperatingCosts', label: 'Ordinary annual operating costs', type: 'money' },
  { key: 'cashCycleShortfall', label: 'Forecast operating cash-cycle shortfall', type: 'money' },
];
const costs: EntryField[] = [
  { key: 'id', label: 'Ledger entry reference' },
  { key: 'sourceId', label: 'Underlying source reference' },
  {
    key: 'kind',
    label: 'Cost category',
    options: [
      'operating',
      'wages',
      'tax',
      'interest',
      'fund',
      'debt_principal',
      'distribution',
      'depreciation',
      'amortization',
      'state_share',
    ],
  },
  { key: 'paid', label: 'Cash paid', type: 'money' },
  { key: 'reserved', label: 'Irrevocably reserved Fund payment', type: 'money' },
  { key: 'eligibleAmount', label: 'Supported eligible amount', type: 'money' },
  { key: 'fundFinanced', label: 'The outlay was financed by the Founding Fund', type: 'boolean' },
  {
    key: 'previouslyDeducted',
    label: 'Already recognized in an expense, loss, debt or allowance',
    type: 'boolean',
  },
  { key: 'required', label: 'This payment is required or scheduled', type: 'boolean' },
  { key: 'armLength', label: 'Independently supportable arm’s-length amount', type: 'boolean' },
  {
    key: 'irrevocablyReserved',
    label: 'Required Fund cash is irrevocably reserved for payment',
    type: 'boolean',
  },
];
const losses: EntryField[] = [
  { key: 'id', label: 'Loss ledger reference' },
  { key: 'year', label: 'Loss year', type: 'number' },
  { key: 'enterpriseId', label: 'Association reference for this loss' },
  { key: 'original', label: 'Original operating loss', type: 'money' },
  { key: 'remaining', label: 'Unrecovered loss', type: 'money' },
];
const allowances: EntryField[] = [
  { key: 'id', label: 'Allowance ledger reference' },
  { key: 'sourceId', label: 'Underlying source reference' },
  {
    key: 'kind',
    label: 'Allowance category',
    options: ['working_capital', 'liability_reserve', 'required_capital', 'productive_investment'],
  },
  { key: 'addition', label: 'Actual addition to restricted cash', type: 'money' },
  { key: 'target', label: 'Documented target', type: 'money' },
  { key: 'existingDedicated', label: 'Funds already dedicated to this purpose', type: 'money' },
  {
    key: 'insuranceGrantsOtherFinance',
    label: 'Insurance, grants or other financing available',
    type: 'money',
  },
  { key: 'deadline', label: 'Current use deadline', type: 'date' },
  { key: 'originalDeadline', label: 'Original use deadline', type: 'date' },
  { key: 'documented', label: 'The target and purpose are documented', type: 'boolean' },
  { key: 'verified', label: 'The need is independently verified', type: 'boolean' },
  {
    key: 'restricted',
    label: 'Cash is separately tracked and restricted to this use',
    type: 'boolean',
  },
  {
    key: 'legallyRequiredLonger',
    label: 'Law requires a longer liability-reserve period',
    type: 'boolean',
  },
  {
    key: 'legalRequiredAmount',
    label: 'Amount required for the longer legal period',
    type: 'money',
  },
];
function blank(fields: EntryField[]) {
  return Object.fromEntries(
    fields.map((f) => [
      f.key,
      f.options?.[0] ?? (f.type === 'boolean' ? false : f.type === 'money' ? '0.00' : ''),
    ]),
  );
}
function Entries({
  name,
  description,
  fields,
  rows,
  prefix,
  change,
}: {
  name: string;
  description: string;
  fields: EntryField[];
  rows: Values[];
  prefix: string;
  change: (rows: Values[]) => void;
}) {
  return (
    <section className="finance-entries">
      <h3>{name}</h3>
      <p className="hint">{description}</p>
      {!rows.length && <p className="hint">No entries added.</p>}
      {rows.map((row, i) => (
        <details className="finance-entry" key={i} open>
          <summary>
            {name} · entry {i + 1}
          </summary>
          <div className="finance-entry-fields">
            {fields.map((field) => (
              <Input
                key={field.key}
                prefix={`${prefix}-${i}`}
                field={field}
                value={row[field.key] ?? (field.type === 'money' ? '0.00' : '')}
                change={(v) => change(rows.map((r, j) => (j === i ? { ...r, [field.key]: v } : r)))}
              />
            ))}
            <button
              type="button"
              className="quiet-button"
              onClick={() => change(rows.filter((_, j) => j !== i))}
            >
              Remove {name.toLowerCase()} entry {i + 1}
            </button>
          </div>
        </details>
      ))}
      <button
        type="button"
        className="button button-secondary"
        onClick={() => change([...rows, blank(fields)])}
      >
        Add {name.toLowerCase()} entry
      </button>
    </section>
  );
}
export function ScheduleEditor({ prefix, value }: { prefix: string; value: unknown }) {
  const [data, setData] = useState<Values>(() => ({
    yearEnd: '',
    ...Object.fromEntries(receipts.map((f) => [f.key, '0.00'])),
    costs: [],
    losses: [],
    allowances: [],
    priorDeductionSourceIds: [],
    ...(value && typeof value === 'object' ? value : {}),
  }));
  const [previousSources, setPreviousSources] = useState<string>(
    (data['priorDeductionSourceIds'] as string[]).join('\n'),
  );
  const update = (key: string, v: unknown) => setData((current) => ({ ...current, [key]: v }));
  return (
    <fieldset className="structured-field financial-schedule">
      <legend>Annual cash-method schedule</legend>
      <input
        type="hidden"
        name="schedule"
        value={JSON.stringify({
          ...data,
          priorDeductionSourceIds: previousSources
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        })}
      />
      <p className="hint">
        Reconcile these amounts to the enterprise's accounts and source ledger. Enter dollars and
        cents as exact decimal amounts. The linked compact supplies the association and published
        method; the fiscal year comes from the field above. Neither this form nor a correction can
        set a private rate.
      </p>
      <Input
        prefix={prefix + '-schedule'}
        field={{ key: 'yearEnd', label: 'Fiscal year-end date', type: 'date' }}
        value={data['yearEnd']}
        change={(v) => update('yearEnd', v)}
      />
      <h3>Receipts and operating needs</h3>
      <div className="finance-grid">
        {receipts.map((field) => (
          <Input
            key={field.key}
            field={field}
            prefix={prefix + '-schedule'}
            value={data[field.key]}
            change={(v) => update(field.key, v)}
          />
        ))}
      </div>
      <Entries
        name="Costs"
        description="Each underlying cost is recognized only once. Distributions, depreciation, amortization and the state share are excluded. Fund-financed outlays are recognized through required Fund remittances."
        fields={costs}
        rows={data['costs']}
        prefix={prefix + '-cost'}
        change={(v) => update('costs', v)}
      />
      <Entries
        name="Prior losses"
        description="Use unrecovered operating losses of this same enterprise, with their original years and balances. Optional allowances do not create operating losses."
        fields={losses}
        rows={data['losses']}
        prefix={prefix + '-loss'}
        change={(v) => update('losses', v)}
      />
      <Entries
        name="Protected allowances"
        description="Document an actual addition to separately tracked restricted cash, net of other available funding. A renamed project cannot extend its original deadline. Unsupported allowances block calculation."
        fields={allowances}
        rows={data['allowances']}
        prefix={prefix + '-allowance'}
        change={(v) => update('allowances', v)}
      />
      <div className="field">
        <label htmlFor={prefix + '-previous-sources'}>
          Previously deducted source references (optional)
        </label>
        <textarea
          id={prefix + '-previous-sources'}
          rows={3}
          value={previousSources}
          onChange={(e) => setPreviousSources(e.target.value)}
        />
        <span className="hint">
          One ledger source reference per line. An earlier deduction cannot be claimed again.
        </span>
      </div>
      <p className="hint">
        No positive shareable surplus means no state payment. The continuing state share is separate
        from the capped Founding Fund obligation.
      </p>
    </fieldset>
  );
}
export function CalculationSummary({ value }: { value: unknown }) {
  if (!value || typeof value !== 'object' || !('shareableSurplus' in value)) return null;
  const data = value as Values;
  const rows = [
    ['receipts', 'Net receipts'],
    ['operatingCosts', 'Recognized operating costs'],
    ['operatingBalance', 'Operating balance'],
    ['lossesUsed', 'Prior losses used'],
    ['fundProtected', 'Required Fund payments protected'],
    ['debtProtected', 'Eligible debt principal protected'],
    ['shareableSurplus', 'Positive shareable surplus'],
    ['statePayment', 'State land-account share'],
  ];
  return (
    <section className="calculation-summary">
      <h2>Published-method calculation</h2>
      <p className="hint">Simulation calculation only. This is not a settled payment.</p>
      <dl className="record-data">
        {rows.map(([key, label]) => (
          <div key={key} style={{ display: 'contents' }}>
            <dt>{label} (USD)</dt>
            <dd>{String(data[key!])}</dd>
          </div>
        ))}
      </dl>
      <p className="hint">
        Method: {data['termsVersion']} · Rate Act: {data['rateActId']}
      </p>
      {data['allowances']?.length > 0 && (
        <>
          <h3>Allowed restricted cash</h3>
          <ul>
            {data['allowances'].map((a: Values) => (
              <li key={a['id']}>
                {a['id']}: {a['allowed']} USD · due {a['deadline']}
              </li>
            ))}
          </ul>
        </>
      )}
      {data['excluded']?.length > 0 && (
        <>
          <h3>Excluded entries</h3>
          <ul>
            {data['excluded'].map((e: Values) => (
              <li key={e['id']}>
                {e['id']}: {e['reason']}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
