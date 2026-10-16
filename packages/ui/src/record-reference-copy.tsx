'use client';
import { useEffect, useRef, useState } from 'react';
import type { CaseRecord } from '@cornerstone/contracts';
import { currentRecordReference } from './record-reference.js';
export function RecordReferenceCopy({
  record,
  api,
  disabled,
}: {
  record: CaseRecord;
  api: (path: string) => Promise<unknown>;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [reference, setReference] = useState('');
  const generation = useRef(0),
    active = useRef(false),
    blocked = useRef(disabled);
  blocked.current = disabled;
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    if (disabled) {
      generation.current++;
      active.current = false;
      setBusy(false);
      setMessage('');
      setReference('');
    }
  }, [disabled]);
  async function copy() {
    if (active.current || blocked.current) return;
    const current = ++generation.current;
    active.current = true;
    setBusy(true);
    setMessage('');
    setReference('');
    try {
      const raw = await api('records?recordId=' + encodeURIComponent(record.id));
      if (current !== generation.current || blocked.current) return;
      const id = currentRecordReference(raw, record);
      setReference(id);
      try {
        await navigator.clipboard.writeText(id);
        if (current === generation.current)
          setMessage('Record ID copied. It does not grant access to the record.');
      } catch {
        if (current === generation.current)
          setMessage(
            'Clipboard access is unavailable. Select and copy the verified record ID below.',
          );
      }
    } catch {
      if (current === generation.current) {
        setReference('');
        setMessage('Current record access could not be verified. Nothing was copied.');
      }
    } finally {
      if (current === generation.current) {
        active.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <div className="record-reference-copy">
      <p className="hint">
        Copying places this private record identifier on your clipboard. Clipboard history, syncing
        and other apps may retain it. This app cannot recall a copied reference; it grants no record
        access.
      </p>
      <button className="quiet-button" disabled={disabled || busy} onClick={() => void copy()}>
        {busy ? 'Checking record access...' : 'Copy record ID'}
      </button>
      {message && (
        <p className="hint" role="status">
          {message}
        </p>
      )}
      {reference && <p className="workspace-id">{reference}</p>}
    </div>
  );
}
