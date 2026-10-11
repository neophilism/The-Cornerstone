// One ephemeral synthetic key across the database job; never uses a provider secret.
import { randomBytes } from 'node:crypto';
import { appendFileSync } from 'node:fs';
if (
  process.env.DATA_REALM !== 'simulation' ||
  process.env.CORNERSTONE_MODE !== 'simulation' ||
  process.env.GITHUB_ACTIONS !== 'true' ||
  !process.env.GITHUB_ENV
)
  throw Error('Isolated synthetic Actions job required.');
const key = randomBytes(32).toString('base64');
process.stdout.write(`::add-mask::${key}\n`);
appendFileSync(process.env.GITHUB_ENV, `FIELD_ENCRYPTION_KEY=${key}\n`);
