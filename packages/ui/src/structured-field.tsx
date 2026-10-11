'use client';
import { useState } from 'react';
import type { Field } from '@cornerstone/domain';
import type { CaseRecord } from '@cornerstone/contracts';
import { FoundingRoster } from './founding-roster.js';
import { FinancialTermsEditor, ScheduleEditor } from './financial-fields.js';

export const listFields = new Set([
  'evidenceIds',
  'offerIds',
  'associationIds',
  'witnesses',
  'tieOrder',
  'permitIds',
]);
const costs = ['formation', 'feasibility', 'licensing', 'training'];
const outsideRights = [
  ['investorVotes', 'Outside investor votes'],
  ['boardSeat', 'Outside investor board seat'],
  ['governanceVeto', 'Outside investor management veto'],
  ['unitPledge', 'Founding units pledged as collateral'],
  ['compactForeclosure', 'Foreclosure on the compact right'],
] as const;
type BudgetRow = { kind: string; amount: string };
function BudgetEditor({ field, prefix, value }: { field: Field; prefix: string; value: unknown }) {
  const [rows, setRows] = useState<BudgetRow[]>(
    Array.isArray(value) && value.length
      ? (value as BudgetRow[])
      : [{ kind: 'formation', amount: '' }],
  );
  const change = (index: number, patch: Partial<BudgetRow>) =>
    setRows((old) => old.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <fieldset className="structured-field">
      <legend>{field.label}</legend>
      <p className="hint">
        Itemize the limited costs the enterprise requests. These are synthetic amounts, not an
        appropriation or payment.
      </p>
      <input type="hidden" name={field.key} value={JSON.stringify(rows)} />
      {rows.map((row, i) => (
        <div className="structured-row" key={i}>
          <div className="field">
            <label htmlFor={`${prefix}-cost-${i}`}>Cost category {i + 1}</label>
            <select
              id={`${prefix}-cost-${i}`}
              value={row.kind}
              onChange={(e) => change(i, { kind: e.target.value })}
            >
              {costs.map((cost) => (
                <option key={cost} value={cost}>
                  {cost}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${prefix}-amount-${i}`}>Amount {i + 1} (USD)</label>
            <input
              id={`${prefix}-amount-${i}`}
              inputMode="decimal"
              value={row.amount}
              onChange={(e) => change(i, { amount: e.target.value })}
              required={field.required}
            />
          </div>
          <button
            type="button"
            className="quiet-button"
            aria-label={`Remove cost ${i + 1}`}
            disabled={rows.length === 1}
            onClick={() => setRows((old) => old.filter((_, index) => index !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button button-secondary"
        onClick={() => setRows((old) => [...old, { kind: 'formation', amount: '' }])}
      >
        Add cost
      </button>
    </fieldset>
  );
}
function RightsEditor({ field, prefix, value }: { field: Field; prefix: string; value: unknown }) {
  const [rights, setRights] = useState<Record<string, boolean>>(
    Object.fromEntries(
      outsideRights.map(([k]) => [
        k,
        typeof value === 'object' &&
          value !== null &&
          (value as Record<string, unknown>)[k] === true,
      ]),
    ),
  );
  return (
    <fieldset className="structured-field">
      <legend>{field.label}</legend>
      <p className="hint">
        Record any proposed outside capital rights. Each right listed below is prohibited by the
        worker-control rule; selecting one blocks approval.
      </p>
      <input type="hidden" name={field.key} value={JSON.stringify(rights)} />
      {outsideRights.map(([k, label]) => (
        <div className="check-field" key={k}>
          <input
            id={`${prefix}-${k}`}
            type="checkbox"
            checked={rights[k] || false}
            onChange={(e) => setRights((r) => ({ ...r, [k]: e.target.checked }))}
          />
          <label htmlFor={`${prefix}-${k}`}>{label}</label>
        </div>
      ))}
    </fieldset>
  );
}
function FractionEditor({
  field,
  prefix,
  value,
}: {
  field: Field;
  prefix: string;
  value: unknown;
}) {
  const current =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const [numerator, setNumerator] = useState(String(current['numerator'] ?? ''));
  const [denominator, setDenominator] = useState(String(current['denominator'] ?? ''));
  return (
    <fieldset className="structured-field">
      <legend>{field.label}</legend>
      <p className="hint">
        Enter the predetermined published fraction. No default policy percentage is supplied.
      </p>
      <input type="hidden" name={field.key} value={JSON.stringify({ numerator, denominator })} />
      <div className="structured-row">
        <div className="field">
          <label htmlFor={`${prefix}-${field.key}-numerator`}>Numerator</label>
          <input
            id={`${prefix}-${field.key}-numerator`}
            inputMode="numeric"
            pattern="[0-9]+"
            value={numerator}
            onChange={(e) => setNumerator(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-${field.key}-denominator`}>Denominator</label>
          <input
            id={`${prefix}-${field.key}-denominator`}
            inputMode="numeric"
            pattern="[1-9][0-9]*"
            value={denominator}
            onChange={(e) => setDenominator(e.target.value)}
            required
          />
        </div>
      </div>
    </fieldset>
  );
}
export function StructuredField({
  field,
  prefix,
  value,
  records = [],
}: {
  field: Field;
  prefix: string;
  value: unknown;
  records?: CaseRecord[];
}) {
  if (field.key === 'units')
    return <FoundingRoster prefix={prefix} value={value} records={records} />;
  if (field.key === 'budget') return <BudgetEditor field={field} prefix={prefix} value={value} />;
  if (field.key === 'investorRights')
    return <RightsEditor field={field} prefix={prefix} value={value} />;
  if (field.key === 'receiptRate')
    return <FractionEditor field={field} prefix={prefix} value={value} />;
  if (field.key === 'financialTerms') return <FinancialTermsEditor prefix={prefix} value={value} />;
  if (field.key === 'schedule') return <ScheduleEditor prefix={prefix} value={value} />;
  const list = listFields.has(field.key);
  return (
    <div className="field">
      <label htmlFor={`${prefix}-${field.key}`}>
        {field.label}
        {field.required ? '' : ' (optional)'}
      </label>
      <textarea
        id={`${prefix}-${field.key}`}
        name={field.key}
        required={field.required}
        rows={4}
        spellCheck={false}
        defaultValue={
          list
            ? Array.isArray(value)
              ? value.join('\n')
              : ''
            : value === undefined
              ? ''
              : JSON.stringify(value, null, 2)
        }
      />
      <span className="hint">
        {list
          ? 'Enter one synthetic record ID per line. References do not upload evidence or certify a finding.'
          : 'Development structured input (JSON). This expert interface is restricted to synthetic testing; protected intake requires a reviewed guided interface.'}
      </span>
    </div>
  );
}
