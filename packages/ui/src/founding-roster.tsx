'use client';
import { useRef, useState } from 'react';
import type { CaseRecord } from '@cornerstone/contracts';
import { parseFoundingRoster } from '@cornerstone/domain';
type Unit = { claimId: string; personId: string };
export function FoundingRoster({
  prefix,
  value,
  records,
}: {
  prefix: string;
  value: unknown;
  records: CaseRecord[];
}) {
  const [rows, setRows] = useState<Unit[]>(
    Array.isArray(value) && value.length ? (value as Unit[]) : [{ claimId: '', personId: '' }],
  );
  const [imported, setImported] = useState<Unit[] | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [page, setPage] = useState(0);
  const importGeneration = useRef(0);
  const eligible = records.filter((r) => r.kind === 'claim' && r.state === 'eligible');
  const offset = Math.min(page * 20, Math.floor((rows.length - 1) / 20) * 20);
  function change(index: number, patch: Partial<Unit>) {
    setRows((old) => old.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  return (
    <fieldset className="structured-field founding-roster">
      <legend>Proposed founding roster</legend>
      <p className="hint">
        List one eligible claim and its actual holder per proposed founder. Saving a roster does not
        grant a unit or accept anyone's membership. Each person must later consent for themselves.
      </p>
      <input type="hidden" name="units" value={JSON.stringify(rows)} />
      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <details className="roster-import">
        <summary>Import an existing roster</summary>
        <p className="hint">
          Use an invented CSV file with two columns: claimId,personId. IDs must be valid record
          references. The file is read in this browser; the proposed roster is saved only when you
          save the draft.
        </p>
        <label htmlFor={`${prefix}-roster-file`}>Synthetic roster CSV</label>
        <input
          id={`${prefix}-roster-file`}
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={async (e) => {
            const generation = ++importGeneration.current;
            const file = e.target.files?.[0];
            setError('');
            setImported(null);
            setMessage('');
            if (!file) return;
            try {
              if (file.size > 1000000)
                throw Error('This file exceeds the one-megabyte draft input limit.');
              const parsed = parseFoundingRoster(
                new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()),
              );
              if (generation === importGeneration.current) setImported(parsed);
            } catch (error) {
              if (generation === importGeneration.current)
                setError(error instanceof Error ? error.message : 'The roster could not be read.');
            }
          }}
        />
        {imported && (
          <div className="info-card">
            <p>
              {imported.length.toLocaleString()} unique proposed founders ready to inspect.
              Eligibility and ownership have not been verified.
            </p>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => {
                setRows(imported);
                setPage(0);
                setImported(null);
                setMessage('Imported roster is in the form. Review it before saving.');
              }}
            >
              Use imported roster
            </button>
          </div>
        )}
      </details>
      <p className="hint">
        {rows.length.toLocaleString()} proposed {rows.length === 1 ? 'founder' : 'founders'} ·
        Showing {offset + 1}–{Math.min(offset + 20, rows.length)}.{' '}
        {rows.length > 2500
          ? 'This scale requires separate approval by a majority of all founders and Labor findings.'
          : 'The ordinary maximum is 2,500.'}
      </p>
      {rows.slice(offset, offset + 20).map((row, i) => {
        const index = offset + i;
        return (
          <div className="roster-entry" key={index}>
            <h3>Proposed founder {index + 1}</h3>
            {eligible.length > 0 && (
              <div className="field">
                <label htmlFor={`${prefix}-claim-choice-${index}`}>
                  Choose an accessible eligible claim {index + 1}
                </label>
                <select
                  id={`${prefix}-claim-choice-${index}`}
                  value={eligible.some((r) => r.id === row.claimId) ? row.claimId : ''}
                  onChange={(e) => {
                    const claim = eligible.find((r) => r.id === e.target.value);
                    if (claim) change(index, { claimId: claim.id, personId: claim.ownerId });
                  }}
                >
                  <option value="">Choose by name, or enter supplied references below</option>
                  {eligible.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} · {r.id.slice(-6)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="structured-row">
              <div className="field">
                <label htmlFor={`${prefix}-claim-${index}`}>Eligible claim ID {index + 1}</label>
                <input
                  id={`${prefix}-claim-${index}`}
                  value={row.claimId}
                  onChange={(e) => change(index, { claimId: e.target.value.trim() })}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor={`${prefix}-person-${index}`}>Person ID {index + 1}</label>
                <input
                  id={`${prefix}-person-${index}`}
                  value={row.personId}
                  onChange={(e) => change(index, { personId: e.target.value.trim() })}
                  required
                />
              </div>
              <button
                type="button"
                className="quiet-button"
                aria-label={`Remove proposed founder ${index + 1}`}
                disabled={rows.length === 1}
                onClick={() => setRows((old) => old.filter((_, n) => n !== index))}
              >
                Remove
              </button>
            </div>
          </div>
        );
      })}
      <div className="record-actions">
        <button
          type="button"
          className="button button-secondary"
          onClick={() => {
            setPage(Math.floor(rows.length / 20));
            setRows((old) => [...old, { claimId: '', personId: '' }]);
          }}
        >
          Add proposed founder
        </button>
        {rows.length > 20 && (
          <>
            <button
              type="button"
              className="quiet-button"
              disabled={offset === 0}
              onClick={() => setPage(offset / 20 - 1)}
            >
              Previous 20 founders
            </button>
            <button
              type="button"
              className="quiet-button"
              disabled={offset + 20 >= rows.length}
              onClick={() => setPage(offset / 20 + 1)}
            >
              Next 20 founders
            </button>
          </>
        )}
      </div>
    </fieldset>
  );
}
