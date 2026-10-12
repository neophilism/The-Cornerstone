import { bindStopSignals, runWorkerLoop } from '../../apps/worker/src/runner.js';
const stop = new AbortController();
const unbind = bindStopSignals(process, stop);
let finish!: () => void;
const held = new Promise<void>((resolve) => {
  finish = resolve;
});
process.on('message', (message) => {
  if (message === 'finish') finish();
});
stop.signal.addEventListener('abort', () => process.send?.('stopping'), { once: true });
try {
  await runWorkerLoop(
    {
      async initialize() {
        process.send?.('ready');
      },
      async dispatch() {
        process.send?.('processing');
        await held;
        process.send?.('settled');
      },
      async close() {
        process.send?.('closed');
      },
      dispatchFailed() {
        process.send?.('unexpected-dispatch-failure');
      },
    },
    stop.signal,
  );
} finally {
  unbind();
  process.disconnect();
}
