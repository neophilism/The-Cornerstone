import 'reflect-metadata';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ActivityWorker } from './activity.js';
import { verifySchema } from '@cornerstone/store';
import { bindStopSignals, runWorkerLoop } from './runner.js';
class WorkerModule {}
Module({})(WorkerModule);
async function main() {
  const stop = new AbortController();
  const unbind = bindStopSignals(process, stop);
  let app: INestApplicationContext | undefined;
  let worker: ActivityWorker | undefined;
  try {
    await runWorkerLoop(
      {
        async initialize() {
          const env = process.env;
          const provider = env['NOTIFICATION_PROVIDER'] || 'disabled';
          if (!['disabled', 'in-app'].includes(provider))
            throw Error('External notice providers are not configured.');
          if (
            provider === 'in-app' &&
            (env['NODE_ENV'] === 'production' ||
              env['CORNERSTONE_MODE'] !== 'simulation' ||
              env['DATA_REALM'] !== 'simulation')
          )
            throw Error('Activity delivery is limited to synthetic development.');
          if (provider === 'in-app' && !env['WORKER_DATABASE_URL'])
            throw Error('Separate restricted worker credentials required.');
          app = await NestFactory.createApplicationContext(WorkerModule, {
            logger: ['warn', 'error'],
            abortOnError: false,
          });
          // Do not install Nest's independent process-exit handler. This lifecycle owns draining.
          if (stop.signal.aborted) return;
          if (provider === 'in-app') {
            worker = new ActivityWorker(env['WORKER_DATABASE_URL']!);
            await worker.verifyRole();
            await verifySchema(worker.pool);
          }
          if (!stop.signal.aborted) console.log(`Activity worker ready: ${provider}.`);
        },
        async dispatch(signal) {
          if (worker) await worker.once(25, signal);
        },
        dispatchFailed() {
          console.error('Activity dispatch paused; pending events retain their recovery leases.');
        },
        async close() {
          try {
            await worker?.close();
          } finally {
            await app?.close();
          }
        },
      },
      stop.signal,
    );
  } finally {
    unbind();
  }
}
main().catch(() => {
  // Startup and teardown exceptions can contain credentials or provider details.
  console.error(
    'Activity worker stopped before readiness or during cleanup. Review its approved configuration and database readiness.',
  );
  process.exitCode = 1;
});
