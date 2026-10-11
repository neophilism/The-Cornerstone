'use client';
import { useState } from 'react';
import type { Field } from '@cornerstone/domain';

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
type Row = Record<string, string>;
function RowEditor({ field, prefix, value }: { field: Field; prefix: string; value: unknown }) {
  const unit = field.key === 'units';
  const empty = () => (unit ? { claimId: '', personId: '' } : { kind: 'formation', amount: '' });
  const [rows, setRows] = useState<Row[]>(
    Array.isArray(value) && value.length ? (value as Row[]) : [empty()],
  );
  const change = (i: number, key: string, next: string) =>
    setRows((r) => r.map((row, index) => (index === i ? { ...row, [key]: next } : row)));
  return (
    <fieldset className="structured-field">
      <legend>{field.label}</legend>
      <p className="hint">
        {unit
          ? 'One eligible claim and one person per founding unit. The server verifies ownership, eligibility and duplicate rights.'
          : 'Itemize the limited costs the enterprise requests. These are synthetic amounts, not an appropriation or payment.'}
      </p>
      <input type="hidden" name={field.key} value={JSON.stringify(rows)} />
      {rows.map((row, i) => (
        <div className="structured-row" key={i}>
          <div className="field">
            <label htmlFor={`${prefix}-${field.key}-${i}-first`}>
              {unit ? `Eligible claim ID ${i + 1}` : `Cost category ${i + 1}`}
            </label>
            {unit ? (
              <input
                id={`${prefix}-${field.key}-${i}-first`}
                value={row['claimId'] || ''}
                onChange={(e) => change(i, 'claimId', e.target.value)}
                required={field.required}
              />
            ) : (
              <select
                id={`${prefix}-${field.key}-${i}-first`}
                value={row['kind'] || 'formation'}
                onChange={(e) => change(i, 'kind', e.target.value)}
              >
                {costs.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="field">
            <label htmlFor={`${prefix}-${field.key}-${i}-second`}>
              {unit ? `Person ID ${i + 1}` : `Amount ${i + 1} (USD)`}
            </label>
            <input
              id={`${prefix}-${field.key}-${i}-second`}
              inputMode={unit ? 'text' : 'decimal'}
              value={row[unit ? 'personId' : 'amount'] || ''}
              onChange={(e) => change(i, unit ? 'personId' : 'amount', e.target.value)}
              required={field.required}
            />
          </div>
          <button
            type="button"
            className="quiet-button"
            aria-label={`Remove ${unit ? 'founding unit' : 'cost'} ${i + 1}`}
            disabled={rows.length === 1}
            onClick={() => setRows((r) => r.filter((_, index) => index !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button button-secondary"
        onClick={() => setRows((r) => [...r, empty()])}
      >
        Add {unit ? 'founding unit' : 'cost'}
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
}: {
  field: Field;
  prefix: string;
  value: unknown;
}) {
  if (field.key === 'units' || field.key === 'budget')
    return <RowEditor field={field} prefix={prefix} value={value} />;
  if (field.key === 'investorRights')
    return <RightsEditor field={field} prefix={prefix} value={value} />;
  if (field.key === 'receiptRate')
    return <FractionEditor field={field} prefix={prefix} value={value} />;
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
