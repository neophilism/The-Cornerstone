'use client';
import { useEffect, useState } from 'react';
import { EvidenceViewSchema, type CaseRecord, type EvidenceView } from '@cornerstone/contracts';
import type { Field } from '@cornerstone/domain';

type Api = (path: string, body?: unknown) => Promise<any>;
export function EvidenceChoice({
  field,
  prefix,
  record,
  value,
  api,
}: {
  field: Field;
  prefix: string;
  record?: CaseRecord | undefined;
  value: unknown;
  api?: Api | undefined;
}) {
  const [items, setItems] = useState<EvidenceView[]>([]);
  const [selected, setSelected] = useState<string[]>(Array.isArray(value) ? value : []);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let active = true;
    setItems([]);
    setState('loading');
    if (record && api)
      void api('evidence?recordId=' + record.id)
        .then((result) => {
          if (!active) return;
          const evidence = EvidenceViewSchema.array().parse(result.evidence);
          setItems(evidence);
          setSelected((ids) =>
            ids.filter((id) => evidence.some((e) => e.id === id && e.state === 'clean')),
          );
          setState('ready');
        })
        .catch(() => {
          if (active) setState('error');
        });
    return () => {
      active = false;
    };
  }, [record?.id, record?.version]);
  if (!record)
    return (
      <p className="hint">
        Save your draft first. Then attach supporting material in Evidence & sources.
      </p>
    );
  const clean = items.filter((e) => e.state === 'clean');
  return (
    <fieldset className="structured-field evidence-choice" aria-busy={state === 'loading'}>
      <legend>Choose supporting evidence</legend>
      <input type="hidden" name={field.key} value={state === 'ready' ? selected.join('\n') : ''} />
      <p className="hint">
        Choose checked attachments from this record. A format check does not establish that the
        account is true.
      </p>
      {state === 'loading' ? (
        <p role="status">Loading attachments…</p>
      ) : state === 'error' ? (
        <p role="alert">Attachments could not be loaded. Reopen this record to try again.</p>
      ) : clean.length ? (
        clean.map((item) => (
          <div className="check-field" key={item.id}>
            <input
              id={`${prefix}-evidence-${item.id}`}
              type="checkbox"
              checked={selected.includes(item.id)}
              onChange={(e) =>
                setSelected((ids) =>
                  e.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id),
                )
              }
            />
            <label htmlFor={`${prefix}-evidence-${item.id}`}>
              {item.filename}
              <span className="hint evidence-description">{item.description}</span>
            </label>
          </div>
        ))
      ) : (
        <p>
          No checked attachments yet. Add a text file and validate it in Evidence & sources below.
        </p>
      )}
      {items.some((item) => item.state !== 'clean') && (
        <p className="hint">Quarantined and rejected files cannot be selected.</p>
      )}
      <p className="hint">
        {selected.length} selected{field.required ? ' · At least one is required.' : '.'}
      </p>
    </fieldset>
  );
}

const referenceKinds: Record<string, string[]> = {
  eventId: ['event_petition'],
  associationId: ['association'],
  opportunityId: ['opportunity'],
  offerId: ['offer'],
  compactId: ['compact'],
  resolutionId: ['resolution'],
  roundId: ['round'],
  matchId: ['match'],
  fundId: ['fund_commitment'],
  authorityId: ['state_authority'],
  memberResolutionId: ['resolution'],
};
export function isRecordReference(key: string) {
  return key in referenceKinds || key === 'referenceId';
}
export function RecordChoice({
  field,
  prefix,
  value,
  records,
  onChange,
}: {
  field: Field;
  prefix: string;
  value: unknown;
  records: CaseRecord[];
  onChange?: ((id: string) => void) | undefined;
}) {
  const options = records.filter(
    (r) =>
      (field.key === 'referenceId' || referenceKinds[field.key]?.includes(r.kind)) &&
      (field.key !== 'eventId' || r.state === 'certified'),
  );
  const [id, setId] = useState(String(value ?? ''));
  const [manual, setManual] = useState(!!id && !options.some((r) => r.id === id));
  const label = field.label.replace(/ record ID$| ID$/, '');
  return (
    <div className="field">
      <label htmlFor={`${prefix}-${field.key}`}>
        {label}
        {field.required ? '' : ' (optional)'}
      </label>
      {manual ? (
        <input
          id={`${prefix}-${field.key}`}
          name={field.key}
          required={field.required}
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            onChange?.(e.target.value);
          }}
        />
      ) : (
        <select
          id={`${prefix}-${field.key}`}
          name={field.key}
          required={field.required}
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            onChange?.(e.target.value);
          }}
        >
          <option value="">Choose an accessible record</option>
          {options.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title} · {r.state.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      )}
      <span className="hint">
        {field.key === 'eventId'
          ? 'Only accessible certified simulation events appear here. Research census entries are not certifications.'
          : 'Choose a record you can already access. The server checks its status and your authority when you act.'}
      </span>
      {!options.length && !manual && (
        <span className="hint">
          No matching record is accessible yet. Save or review the prerequisite record first, or use
          a supplied reference.
        </span>
      )}
      <button
        className="quiet-button reference-toggle"
        type="button"
        onClick={() => {
          setManual(!manual);
          setId('');
        }}
      >
        {manual ? 'Choose by name' : 'Use a supplied record ID'}
      </button>
    </div>
  );
}

export function IncomeShare({
  prefix,
  value,
  originalWorker = false,
}: {
  prefix: string;
  value: unknown;
  originalWorker?: boolean;
}) {
  const [percent, setPercent] = useState(
    typeof value === 'number' ? String(Math.round(value * 10000) / 100) : '',
  );
  return (
    <div className="field">
      <label htmlFor={`${prefix}-income-percent`}>
        Share of {originalWorker ? 'the worker’s' : 'your'} earned income (%) (optional)
      </label>
      <input
        type="hidden"
        name="earnedIncomeShare"
        value={percent === '' ? '' : String(Number(percent) / 100)}
      />
      <input
        id={`${prefix}-income-percent`}
        type="number"
        min="0"
        max="100"
        step="0.01"
        value={percent}
        onChange={(e) => setPercent(e.target.value)}
      />
      <span className="hint">
        Before the government action, how much of {originalWorker ? 'the worker’s' : 'your'} earned
        income came from this livelihood? For example, enter 75 for three quarters. Annual hours
        provide another way to show the established livelihood.
      </span>
    </div>
  );
}
