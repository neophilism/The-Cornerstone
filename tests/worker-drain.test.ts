import { describe, expect, it, vi } from 'vitest';
import { EventEmitter, once } from 'node:events';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import { ActivityWorker } from '../apps/worker/src/activity.js';
import { bindStopSignals, runWorkerLoop, type WorkerRuntime } from '../apps/worker/src/runner.js';
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function runtime(stop: AbortController): WorkerRuntime {
  return {
    initialize: vi.fn(async () => {}),
    dispatch: vi.fn(async () => {
      stop.abort();
    }),
    close: vi.fn(async () => {}),
    dispatchFailed: vi.fn(),
  };
}
describe('single-owner worker lifecycle', () => {
  it('initializes, finishes dispatch, then closes once', async () => {
    const stop = new AbortController();
    const order: string[] = [];
    const service = runtime(stop);
    service.initialize = async () => {
      order.push('initialize');
    };
    service.dispatch = async () => {
      order.push('dispatch');
      stop.abort();
    };
    service.close = async () => {
      order.push('close');
    };
    await runWorkerLoop(service, stop.signal);
    expect(order).toEqual(['initialize', 'dispatch', 'close']);
  });
  it('does no startup or dispatch when already stopped', async () => {
    const stop = new AbortController();
    stop.abort();
    const service = runtime(stop);
    await runWorkerLoop(service, stop.signal);
    expect(service.initialize).not.toHaveBeenCalled();
    expect(service.dispatch).not.toHaveBeenCalled();
    expect(service.close).toHaveBeenCalledTimes(1);
  });
  it('drains interrupted startup before closing without polling', async () => {
    const stop = new AbortController();
    const service = runtime(stop);
    const held = deferred();
    const entered = deferred();
    service.initialize = vi.fn(async () => {
      entered.resolve();
      await held.promise;
    });
    const done = runWorkerLoop(service, stop.signal);
    await entered.promise;
    stop.abort();
    expect(service.close).not.toHaveBeenCalled();
    held.resolve();
    await done;
    expect(service.dispatch).not.toHaveBeenCalled();
    expect(service.close).toHaveBeenCalledTimes(1);
  });
  it('does not close while an active dispatch is unsettled', async () => {
    const stop = new AbortController();
    const service = runtime(stop);
    const held = deferred();
    const entered = deferred();
    service.dispatch = vi.fn(async () => {
      entered.resolve();
      await held.promise;
    });
    const done = runWorkerLoop(service, stop.signal);
    await entered.promise;
    stop.abort();
    expect(service.close).not.toHaveBeenCalled();
    held.resolve();
    await done;
    expect(service.dispatch).toHaveBeenCalledTimes(1);
    expect(service.close).toHaveBeenCalledTimes(1);
  });
  it('cleans up partially initialized services after failure', async () => {
    const stop = new AbortController();
    const service = runtime(stop);
    service.initialize = vi.fn(async () => {
      throw Error('synthetic-startup-failure');
    });
    await expect(runWorkerLoop(service, stop.signal)).rejects.toThrow('synthetic-startup-failure');
    expect(service.dispatch).not.toHaveBeenCalled();
    expect(service.close).toHaveBeenCalledTimes(1);
  });
  it('reports a dispatch failure without passing exception contents and can retry later', async () => {
    const stop = new AbortController();
    const service = runtime(stop);
    let count = 0;
    service.dispatch = vi.fn(async () => {
      if (count++ === 0) throw Error('private error details');
      stop.abort();
    });
    await runWorkerLoop(service, stop.signal, 1);
    expect(service.dispatchFailed).toHaveBeenCalledExactlyOnceWith();
    expect(service.dispatch).toHaveBeenCalledTimes(2);
    expect(service.close).toHaveBeenCalledTimes(1);
  });
  it('shutdown interrupts the polling pause instead of waiting for the interval', async () => {
    const stop = new AbortController();
    const service = runtime(stop);
    const entered = deferred();
    service.dispatch = vi.fn(async () => {
      entered.resolve();
    });
    const done = runWorkerLoop(service, stop.signal, 60000);
    await entered.promise;
    await pause(1);
    stop.abort();
    await done;
    expect(service.dispatch).toHaveBeenCalledTimes(1);
    expect(service.close).toHaveBeenCalledTimes(1);
  });
  it('propagates cleanup failure instead of claiming a clean stop', async () => {
    const stop = new AbortController();
    const service = runtime(stop);
    service.close = vi.fn(async () => {
      throw Error('cleanup');
    });
    await expect(runWorkerLoop(service, stop.signal)).rejects.toThrow('cleanup');
  });
  it('handles both repeated signals until explicitly detached', () => {
    const target = new EventEmitter();
    const stop = new AbortController();
    const unbind = bindStopSignals(target, stop);
    const listener = vi.fn();
    stop.signal.addEventListener('abort', listener);
    target.emit('SIGTERM');
    target.emit('SIGINT');
    target.emit('SIGTERM');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(target.listenerCount('SIGTERM')).toBe(1);
    expect(target.listenerCount('SIGINT')).toBe(1);
    unbind();
    unbind();
    expect(target.listenerCount('SIGTERM')).toBe(0);
    expect(target.listenerCount('SIGINT')).toBe(0);
  });
  it('a real process receiving repeated signals stays alive until its active job settles', async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'tests/fixtures/worker-drain.ts'], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    const messages: unknown[] = [];
    const processing = deferred();
    const stopping = deferred();
    child.on('message', (message) => {
      messages.push(message);
      if (message === 'processing') processing.resolve();
      if (message === 'stopping') stopping.resolve();
    });
    const exit = once(child, 'exit');
    const timer = setTimeout(() => child.kill('SIGKILL'), 4000);
    try {
      await processing.promise;
      child.kill('SIGTERM');
      await stopping.promise;
      child.kill('SIGINT');
      await pause(30);
      expect(child.exitCode).toBeNull();
      expect(child.signalCode).toBeNull();
      expect(messages).not.toContain('closed');
      child.send('finish');
      expect(await exit).toEqual([0, null]);
      expect(messages).toEqual(['ready', 'processing', 'stopping', 'settled', 'closed']);
    } finally {
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await exit;
      }
    }
  });
});
describe('stop-aware activity batches', () => {
  const fixture = () => new ActivityWorker('postgresql://localhost/unused_synthetic_fixture');
  it('does not lease after a stop was requested', async () => {
    const worker = fixture();
    const stop = new AbortController();
    stop.abort();
    const query = vi.spyOn(worker.pool, 'query');
    try {
      expect(await worker.once(25, stop.signal)).toEqual({ leased: 0, delivered: 0 });
      expect(query).not.toHaveBeenCalled();
    } finally {
      await worker.close();
    }
  });
  it('does not deliver jobs if stop arrives during lease acquisition', async () => {
    const worker = fixture();
    const stop = new AbortController();
    const query = vi.spyOn(worker.pool, 'query').mockImplementation(async () => {
      stop.abort();
      return {
        rows: [
          { event_id: 'one', token: 'one' },
          { event_id: 'two', token: 'two' },
        ],
      };
    });
    try {
      expect(await worker.once(25, stop.signal)).toEqual({ leased: 2, delivered: 0 });
      expect(query).toHaveBeenCalledTimes(1);
    } finally {
      await worker.close();
    }
  });
  it('settles the active delivery but never starts the next one after stop', async () => {
    const worker = fixture();
    const stop = new AbortController();
    const held = deferred();
    const entered = deferred();
    let calls = 0;
    const query = vi.spyOn(worker.pool, 'query').mockImplementation(async () => {
      if (calls++ === 0)
        return {
          rows: [
            { event_id: 'one', token: 'one' },
            { event_id: 'two', token: 'two' },
          ],
        };
      entered.resolve();
      await held.promise;
      return { rows: [] };
    });
    try {
      const done = worker.once(25, stop.signal);
      await entered.promise;
      stop.abort();
      held.resolve();
      expect(await done).toEqual({ leased: 2, delivered: 1 });
      expect(query).toHaveBeenCalledTimes(2);
    } finally {
      await worker.close();
    }
  });
  it('does no failure-write SQL after an active delivery fails during drain', async () => {
    const worker = fixture();
    const stop = new AbortController();
    let calls = 0;
    const query = vi.spyOn(worker.pool, 'query').mockImplementation(async () => {
      if (calls++ === 0)
        return {
          rows: [
            { event_id: 'one', token: 'one' },
            { event_id: 'two', token: 'two' },
          ],
        };
      stop.abort();
      throw Error('private SQL');
    });
    try {
      expect(await worker.once(25, stop.signal)).toEqual({ leased: 2, delivered: 0 });
      expect(query).toHaveBeenCalledTimes(2);
    } finally {
      await worker.close();
    }
  });
  it('retains ordinary failed-delivery bookkeeping when not stopping', async () => {
    const worker = fixture();
    let calls = 0;
    const query = vi.spyOn(worker.pool, 'query').mockImplementation(async () => {
      if (calls++ === 0)
        return {
          rows: [
            { event_id: 'one', token: 'one' },
            { event_id: 'two', token: 'two' },
          ],
        };
      if (calls === 2) throw Error('private SQL');
      return { rows: [] };
    });
    try {
      expect(await worker.once()).toEqual({ leased: 2, delivered: 1 });
      expect(query).toHaveBeenNthCalledWith(3, 'SELECT fail_activity_event($1,$2,$3)', [
        'one',
        'one',
        'DELIVERY_ERROR',
      ]);
      expect(query).toHaveBeenCalledTimes(4);
    } finally {
      await worker.close();
    }
  });
});
