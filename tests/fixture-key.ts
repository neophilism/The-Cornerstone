import { randomBytes } from 'node:crypto';
import { readKey } from '@cornerstone/security';
export function fixtureKey() {
  if (
    process.env['CORNERSTONE_MODE'] !== 'simulation' ||
    process.env['DATA_REALM'] !== 'simulation'
  )
    throw Error('Synthetic fixture key only.');
  return process.env['FIELD_ENCRYPTION_KEY']
    ? readKey(process.env['FIELD_ENCRYPTION_KEY'], 'FIELD_ENCRYPTION_KEY')
    : randomBytes(32);
}
