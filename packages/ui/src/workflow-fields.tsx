'use client';
import { useState } from 'react';
import type { CaseRecord } from '@cornerstone/contracts';
import type { Field } from '@cornerstone/domain';
import { StructuredField, listFields } from './structured-field.js';
import { EvidenceChoice, RecordChoice, IncomeShare, isRecordReference } from './record-fields.js';
import { CommercialTermsEditor } from './compacts.js';
export function WorkflowFields({
  fields,
  prefix,
  values = {},
  records = [],
  record,
  api,
}: {
  fields: Field[];
  prefix: string;
  values?: Record<string, unknown>;
  records?: CaseRecord[];
  record?: CaseRecord;
  api?: (path: string, body?: unknown) => Promise<any>;
}) {
  const [offerId, setOfferId] = useState(String(values['offerId'] ?? ''));
  return (
    <>
      {fields
        .filter(
          (f) =>
            !fields.some((other) => other.key === 'financialTerms') ||
            !['rateAct', 'financialVersion'].includes(f.key),
        )
        .filter(
          (f) =>
            ![
              'accessibleMeetings',
              'accessibleVoting',
              'accessibleRecords',
              'practicalDeliberation',
            ].includes(f.key) ||
            (Array.isArray(record?.data['units']) && record.data['units'].length > 2500),
        )
        .map((f) =>
          f.key === 'evidenceIds' ? (
            <EvidenceChoice
              key={`${prefix}:${record?.id}:${record?.version}:${f.key}`}
              field={f}
              prefix={prefix}
              record={record}
              value={values[f.key]}
              api={api}
            />
          ) : isRecordReference(f.key) ? (
            <RecordChoice
              key={f.key}
              field={f}
              prefix={prefix}
              value={values[f.key]}
              records={records}
              onChange={f.key === 'offerId' ? setOfferId : undefined}
            />
          ) : f.key === 'terms' ? (
            <CommercialTermsEditor
              key={f.key}
              field={f}
              prefix={prefix}
              value={values[f.key]}
              records={records}
              offerId={offerId}
              api={api}
            />
          ) : f.key === 'earnedIncomeShare' ? (
            <IncomeShare key={f.key} prefix={prefix} value={values[f.key]} />
          ) : f.type === 'json' ? (
            <StructuredField
              key={f.key}
              field={f}
              prefix={prefix}
              value={values[f.key]}
              records={records}
            />
          ) : f.type === 'boolean' ? (
            <div className="check-field" key={f.key}>
              <input
                type="checkbox"
                name={f.key}
                id={`${prefix}-${f.key}`}
                defaultChecked={values[f.key] === true}
              />
              <label htmlFor={`${prefix}-${f.key}`}>
                {f.label}
                {f.required ? ' (required finding)' : ''}
              </label>
            </div>
          ) : (
            <div className="field" key={f.key}>
              <label htmlFor={`${prefix}-${f.key}`}>
                {f.label}
                {!f.required ? ' (optional)' : ''}
              </label>
              {f.type === 'select' ? (
                <select
                  id={`${prefix}-${f.key}`}
                  name={f.key}
                  required={f.required}
                  defaultValue={String(values[f.key] ?? '')}
                >
                  <option value="">Choose an option</option>
                  {f.options?.map((o) => (
                    <option value={o} key={o}>
                      {o.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              ) : f.type === 'textarea' ? (
                <textarea
                  id={`${prefix}-${f.key}`}
                  name={f.key}
                  required={f.required}
                  rows={3}
                  defaultValue={String(values[f.key] ?? '')}
                />
              ) : (
                <input
                  id={`${prefix}-${f.key}`}
                  name={f.key}
                  type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                  required={f.required}
                  min={f.type === 'number' ? 0 : undefined}
                  step={f.type === 'number' ? 'any' : undefined}
                  inputMode={f.type === 'money' ? 'decimal' : undefined}
                  pattern={f.type === 'money' ? '(0|[1-9][0-9]*)(\\.[0-9]{2})?' : undefined}
                  defaultValue={String(values[f.key] ?? '')}
                />
              )}
              <span className="hint">
                {f.help ||
                  (f.type === 'money' ? 'Use USD, with two digits for cents when included.' : '')}
              </span>
            </div>
          ),
        )}
    </>
  );
}
export function formInput(form: HTMLFormElement, fields: Field[]) {
  const data = new FormData(form);
  const input: Record<string, unknown> = {};
  for (const f of fields) {
    const v = data.get(f.key);
    if (f.key === 'evidenceIds') {
      if (v !== null)
        input[f.key] = String(v)
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
      continue;
    }
    if (f.type === 'boolean') {
      input[f.key] = v === 'on';
      continue;
    }
    if (typeof v !== 'string' || !v.trim()) continue;
    input[f.key] =
      f.type === 'number'
        ? Number(v)
        : f.type === 'json'
          ? listFields.has(f.key)
            ? v
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter(Boolean)
            : JSON.parse(v)
          : v;
  }
  return input;
}
