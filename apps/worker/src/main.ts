import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { setTimeout } from 'node:timers/promises';
import { ActivityWorker } from './activity.js';
import { verifySchema } from '@cornerstone/store';
class WorkerModule {}
Module({})(WorkerModule);
const app = await NestFactory.createApplicationContext(WorkerModule, { logger: ['warn', 'error'] });
app.enableShutdownHooks();
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
const worker = provider === 'in-app' ? new ActivityWorker(env['WORKER_DATABASE_URL']!) : null;
if (worker) {
  await worker.verifyRole();
  await verifySchema(worker.pool);
}
const stop = new AbortController();
process.once('SIGTERM', () => stop.abort());
process.once('SIGINT', () => stop.abort());
try {
  while (!stop.signal.aborted) {
    if (worker) {
      try {
        await worker.once();
      } catch {
        console.error('Activity dispatch paused; pending events retain their recovery leases.');
      }
    }
    try {
      await setTimeout(2000, undefined, { signal: stop.signal });
    } catch {
      break;
    }
  }
} finally {
  if (worker) await worker.close();
  await app.close();
}
