import { setTimeout as pause } from 'node:timers/promises';

type SignalTarget = {
  on(event: string, listener: () => void): unknown;
  off(event: string, listener: () => void): unknown;
};
/** Keep both handlers installed throughout draining, including repeated signals. */
export function bindStopSignals(target: SignalTarget, stop: AbortController): () => void {
  const requestStop = () => stop.abort();
  target.on('SIGTERM', requestStop);
  target.on('SIGINT', requestStop);
  return () => {
    target.off('SIGTERM', requestStop);
    target.off('SIGINT', requestStop);
  };
}
export type WorkerRuntime = {
  initialize(): Promise<void>;
  dispatch(signal: AbortSignal): Promise<unknown>;
  close(): Promise<void>;
  dispatchFailed(): void;
};
/** One owner of startup, polling and teardown; never close a pool under an in-flight dispatch. */
export async function runWorkerLoop(
  runtime: WorkerRuntime,
  signal: AbortSignal,
  pollMs = 2000,
): Promise<void> {
  try {
    if (signal.aborted) return;
    await runtime.initialize();
    while (!signal.aborted) {
      try {
        await runtime.dispatch(signal);
      } catch {
        runtime.dispatchFailed();
      }
      if (signal.aborted) break;
      try {
        await pause(pollMs, undefined, { signal });
      } catch (error) {
        if (!signal.aborted) throw error;
      }
    }
  } finally {
    await runtime.close();
  }
}
