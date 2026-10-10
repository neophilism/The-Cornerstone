import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  timingSafeEqual,
} from 'node:crypto';
import type { Actor, CaseRecord } from '@cornerstone/contracts';

export function canRead(
  actor: Actor,
  record: CaseRecord,
  grants: {
    subjectId: string;
    recordId: string;
    expiresAt: string;
    revoked: boolean;
    permissions: string[];
  }[],
  now: string,
): boolean {
  if (actor.realm !== record.realm || actor.conflicts.includes(record.id)) return false;
  if (actor.id === record.ownerId) return true;
  if (
    grants.some(
      (g) =>
        g.subjectId === actor.id &&
        g.recordId === record.id &&
        !g.revoked &&
        g.expiresAt > now &&
        g.permissions.includes('read'),
    )
  )
    return true;
  return (
    actor.assurance === 'privileged' &&
    actor.institutionId !== null &&
    actor.institutionId === record.institutionId &&
    actor.assignments.includes(record.id) &&
    !actor.roles.every((r) => ['technical_admin', 'investor', 'provider'].includes(r))
  );
}
export function canAct(
  actor: Actor,
  record: CaseRecord,
  roles: string[],
  grants: {
    subjectId: string;
    recordId: string;
    expiresAt: string;
    revoked: boolean;
    permissions: string[];
  }[],
  action: string,
  now: string,
) {
  if (!canRead(actor, record, grants, now) || !actor.roles.some((r) => roles.includes(r)))
    return false;
  if (actor.id === record.ownerId || actor.assignments.includes(record.id)) return true;
  return grants.some(
    (g) =>
      g.subjectId === actor.id &&
      g.recordId === record.id &&
      !g.revoked &&
      g.expiresAt > now &&
      g.permissions.includes(action),
  );
}
export type Envelope = {
  version: 1;
  keyId: string;
  nonce: string;
  ciphertext: string;
  tag: string;
};
export function readKey(value: string | undefined, name: string): Buffer {
  if (!value) throw new Error(`${name} is required; no fallback key is permitted.`);
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error(`${name} must be a 32-byte base64 key.`);
  return key;
}
export function encrypt(value: unknown, key: Buffer, keyId: string, binding: string): Envelope {
  const nonce = randomBytes(12),
    c = createCipheriv('aes-256-gcm', key, nonce);
  c.setAAD(Buffer.from(binding));
  const ciphertext = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
  return {
    version: 1,
    keyId,
    nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: c.getAuthTag().toString('base64'),
  };
}
export function decrypt<T>(e: Envelope, key: Buffer, binding: string): T {
  if (e.version !== 1) throw new Error('Unsupported envelope version.');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(e.nonce, 'base64'));
  d.setAAD(Buffer.from(binding));
  d.setAuthTag(Buffer.from(e.tag, 'base64'));
  return JSON.parse(
    Buffer.concat([d.update(Buffer.from(e.ciphertext, 'base64')), d.final()]).toString('utf8'),
  ) as T;
}
export function digest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b, 'en'))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function equalSecret(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function sessionToken() {
  return randomBytes(32).toString('base64url');
}
export function safeOrigin(origin: string | undefined, expected: string) {
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(expected).origin;
  } catch {
    return false;
  }
}
export function localAuthAllowed(env: Record<string, string | undefined>, host: string) {
  const hostname = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
  return (
    env['NODE_ENV'] !== 'production' &&
    env['CORNERSTONE_MODE'] === 'simulation' &&
    env['DATA_REALM'] === 'simulation' &&
    env['LOCAL_AUTH_ENABLED'] === 'true' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(hostname ?? '') &&
    env['LOCAL_AUTH_HOST'] === 'localhost'
  );
}
