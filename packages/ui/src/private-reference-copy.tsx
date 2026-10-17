'use client';
import { useEffect, useRef, useState } from 'react';
import { disclosePrivateReference, type VerifiedPrivateReference } from './private-reference.js';

/** Disclosure follows a fresh authorized read and the still-current component context. */
export function PrivateReferenceCopy({
  label,
  verify,
  disabled,
  className = 'private-reference-copy',
}: {
  label: 'record' | 'founding unit' | 'evidence';
  verify: () => Promise<VerifiedPrivateReference>;
  disabled: boolean;
  className?: string;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [reference, setReference] = useState('');
  const generation = useRef(0),
    active = useRef(false),
    blocked = useRef(disabled);
  blocked.current = disabled;
  function cancel() {
    generation.current++;
    active.current = false;
    setBusy(false);
    setMessage('');
    setReference('');
  }
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    if (disabled) cancel();
  }, [disabled]);
  async function copy() {
    if (active.current || blocked.current) return;
    const current = ++generation.current;
    active.current = true;
    setBusy(true);
    setMessage('');
    setReference('');
    try {
      const reference = await verify();
      if (current !== generation.current || blocked.current || !reference.isCurrent()) return;
      try {
        await disclosePrivateReference(reference, (id) => {
          setReference(id);
          return navigator.clipboard.writeText(id);
        });
        if (current === generation.current && reference.isCurrent())
          setMessage(
            label === 'record'
              ? 'Record ID copied. It grants no access.'
              : 'Verified ' + label + ' ID copied. It grants no access.',
          );
      } catch {
        if (current === generation.current && reference.isCurrent())
          setMessage('Clipboard access is unavailable. Select and copy the verified ID below.');
      }
      if (!reference.isCurrent() && current === generation.current) setReference('');
    } catch {
      if (current === generation.current) {
        setReference('');
        setMessage('Current ' + label + ' access could not be verified. Nothing was copied.');
      }
    } finally {
      if (current === generation.current) {
        active.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <div className={className}>
      <p className="hint">
        Copying places this private identifier on your clipboard. Clipboard history, syncing and
        other apps may retain it. This app cannot recall it, and it grants no access.
      </p>
      <button className="quiet-button" disabled={disabled || busy} onClick={() => void copy()}>
        {busy ? 'Checking ' + label + ' access...' : 'Copy ' + label + ' ID'}
      </button>
      {busy && (
        <button className="quiet-button" onClick={cancel}>
          Cancel reference copy
        </button>
      )}
      {message && (
        <p className="hint" role="status">
          {message}
        </p>
      )}
      {reference && <p className="workspace-id">{reference}</p>}
    </div>
  );
}
