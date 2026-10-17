'use client';
import { useEffect, useRef, useState } from 'react';
import type { CaseRecord, Receipt } from '@cornerstone/contracts';
import { actionFailure } from './action-recovery.js';
import {
  prepareMembershipAction,
  membershipRequest,
  membershipResult,
  type MembershipAttempt,
} from './membership-recovery.js';

export function useMemberAction({
  record,
  path,
  api,
  disabled,
  onBusyChange,
  onChanged,
}: {
  record: CaseRecord;
  path: MembershipAttempt['path'];
  api: (path: string, body?: unknown) => Promise<unknown>;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onChanged: (result: { record: CaseRecord; receipt: Receipt }) => Promise<void>;
}) {
  const [attempt, setAttempt] = useState<MembershipAttempt | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const frozen = useRef<MembershipAttempt | null>(null),
    active = useRef(false),
    generation = useRef(0),
    notify = useRef(onBusyChange);
  notify.current = onBusyChange;
  useEffect(() => {
    generation.current++;
    return () => {
      generation.current++;
      frozen.current = null;
      notify.current(false);
    };
  }, []);
  useEffect(() => {
    if (!attempt) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [attempt]);
  async function send(intent: MembershipAttempt, retry: boolean) {
    if (active.current) return;
    active.current = true;
    const current = generation.current;
    frozen.current = intent;
    setAttempt(intent);
    setBusy(true);
    setError('');
    notify.current(true);
    let result: ReturnType<typeof membershipResult> | null = null;
    try {
      result = membershipResult(await api(intent.path, membershipRequest(intent)), intent);
    } catch (failure) {
      if (current !== generation.current) return;
      if (actionFailure(failure, retry) === 'rejected') {
        frozen.current = null;
        setAttempt(null);
        notify.current(false);
        setError(
          failure instanceof Error ? failure.message : 'The membership action was rejected.',
        );
      } else
        setError(
          'The membership outcome is unknown. It may already be saved. Retry the exact original request to recover its receipt before changing consent or casting another ballot.',
        );
    } finally {
      if (current === generation.current) {
        active.current = false;
        setBusy(false);
      }
    }
    if (!result || current !== generation.current) return;
    frozen.current = null;
    setAttempt(null);
    notify.current(false);
    // Confirmation and current-state refresh are separate from write recovery.
    await onChanged(result);
  }
  return {
    busy,
    locked: !!attempt,
    error,
    submit(raw: unknown) {
      if (disabled || active.current || frozen.current) return;
      try {
        void send(prepareMembershipAction(path, raw, record), false);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'Check the membership action.');
      }
    },
    recovery:
      attempt && !busy ? (
        <div className="membership-recovery">
          <p>
            Recovery is held in this tab only. Closing it loses the retry request, not a saved
            response or ballot. The original version is {attempt.version}.
          </p>
          <button
            type="button"
            className="button"
            onClick={() => {
              if (frozen.current) void send(frozen.current, true);
            }}
          >
            Retry exact membership action
          </button>
        </div>
      ) : null,
  };
}
