import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
class WorkerModule {}
Module({})(WorkerModule);
const app = await NestFactory.createApplicationContext(WorkerModule, { logger: ['warn', 'error'] });
app.enableShutdownHooks();
// No external notice, journal, or payment provider is installed. Pending outbox events remain pending.
// A provider must supply idempotent acceptance, delivery state, retry/dead-letter rules, and independent receipts.
if (process.env['NOTIFICATION_PROVIDER'] && process.env['NOTIFICATION_PROVIDER'] !== 'disabled')
  throw Error('The configured notification provider is not implemented or reviewed.');
const heartbeat = setInterval(() => {}, 30000);
process.once('SIGTERM', () => {
  clearInterval(heartbeat);
  void app.close();
});
process.once('SIGINT', () => {
  clearInterval(heartbeat);
  void app.close();
});
