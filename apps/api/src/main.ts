import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { FinanceError } from '@cornerstone/finance';
import helmet from 'helmet';
import { parseCookie, stringifySetCookie } from 'cookie';
import * as oidc from 'openid-client';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import {
  ActorSchema,
  ModeSchema,
  RealmSchema,
  MarkActivityReadSchema,
  WorkspaceSessionSchema,
  RevokeSessionSchema,
  IdSchema,
} from '@cornerstone/contracts';
import { DomainError, workflows } from '@cornerstone/domain';
import {
  readKey,
  digest,
  sessionToken,
  safeOrigin,
  equalSecret,
  localAuthAllowed,
  encrypt,
  decrypt,
  type Envelope,
} from '@cornerstone/security';
import { Store, PersistenceError, verifySchema } from '@cornerstone/store';
import { ProgramService } from './service.js';
import { DraftAccessService } from './access.js';
import { EvidenceService } from './evidence.js';
import { MembershipService } from './membership.js';
import { RecordReader } from './records.js';

class ApplicationModule {}
Module({})(ApplicationModule);
const env = process.env,
  mode = ModeSchema.parse(env['CORNERSTONE_MODE'] || 'proposal'),
  realm = RealmSchema.parse(env['DATA_REALM'] || 'proposal');
const production = env['NODE_ENV'] === 'production';
const internal = env['INTERNAL_API_KEY'];
if (production && (!internal || internal.length < 32))
  throw Error('A unique internal API credential is required in production.');
if (
  production &&
  (mode !== 'proposal' ||
    realm !== 'proposal' ||
    env['SENSITIVE_INTAKE_ENABLED'] === 'true' ||
    env['LOCAL_AUTH_ENABLED'] === 'true')
)
  throw Error('Protected production activation is unavailable in this release.');
let store: Store | null = null,
  service: ProgramService | null = null;
if (env['DATABASE_URL']) {
  store = new Store(
    env['DATABASE_URL'],
    readKey(env['FIELD_ENCRYPTION_KEY'], 'FIELD_ENCRYPTION_KEY'),
  );
  await store.verifyRole();
  await verifySchema(store.pool);
  service = new ProgramService(store, mode, realm);
}
const app = await NestFactory.create<NestExpressApplication>(ApplicationModule, {
  logger: ['warn', 'error'],
  bodyParser: true,
});
app.useBodyParser('json', { limit: '2mb' });
app.enableShutdownHooks();
app.use(
  helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  }),
);
const http = app.getHttpAdapter().getInstance();
const origins = [
  env['PORTAL_ORIGIN'] || 'http://localhost:3001',
  env['STAFF_ORIGIN'] || 'http://localhost:3002',
];
const counts = new Map<string, { count: number; until: number }>();
http.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Request-ID', randomUUID());
  if (req.path === '/healthz') return next();
  if (
    production &&
    (!internal || !equalSecret((req.headers['x-internal-key'] as string) || '', internal))
  )
    return res
      .status(403)
      .json({ code: 'INTERNAL_ONLY', message: 'Use an approved website service.' });
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    !origins.some((o) => safeOrigin(req.headers.origin, o))
  )
    return res
      .status(403)
      .json({ code: 'ORIGIN_REQUIRED', message: 'Submit from the approved website origin.' });
  const now = Date.now();
  const consume = (key: string, limit: number) => {
    let count = counts.get(key);
    if (!count || count.until < now) {
      if (counts.size >= 10000) for (const [k, v] of counts) if (v.until < now) counts.delete(k);
      if (!count && counts.size >= 10000) return false;
      count = { count: 0, until: now + 60000 };
      counts.set(key, count);
    }
    return ++count.count <= limit;
  };
  const ip = req.ip || 'unknown';
  const token = parseCookie(req.headers.cookie || '')[
    production ? '__Host-cornerstone-session' : 'cornerstone-session'
  ];
  // The BFF shares an address. Bound total traffic and each opaque session separately;
  // an invented token never bypasses the address ceiling or normal authentication.
  if (
    !consume(`address:${ip}`, 600) ||
    !consume(token ? `session:${digest(token)}` : `anonymous:${ip}`, 120)
  ) {
    res.setHeader('Retry-After', '60');
    return res
      .status(429)
      .json({ code: 'RATE_LIMIT', message: 'Too many requests. Wait a minute and retry.' });
  }
  next();
});
const cookieName = production ? '__Host-cornerstone-session' : 'cornerstone-session',
  csrfName = production ? '__Host-cornerstone-csrf' : 'cornerstone-csrf';
const cookies = (req: Request) => parseCookie(req.headers.cookie || '');
const setCookie = (res: Response, name: string, value: string, maxAge = 28800) =>
  res.append(
    'Set-Cookie',
    stringifySetCookie({
      name,
      value,
      path: '/',
      httpOnly: name !== csrfName,
      secure: production,
      sameSite: 'lax',
      maxAge,
    }),
  );
function requireStore() {
  if (!store)
    throw new DomainError(
      'SERVICE_UNAVAILABLE',
      'Private development persistence is not configured.',
      503,
    );
  return store;
}
async function actor(req: Request, mutating = false) {
  const db = requireStore(),
    token = cookies(req)[cookieName];
  if (!token) throw new DomainError('SIGN_IN_REQUIRED', 'Sign in to your workspace.', 401);
  const result = await db.pool.query('SELECT * FROM auth_lookup($1)', [digest(token)]);
  const row = result.rows[0];
  if (!row) throw new DomainError('SESSION_EXPIRED', 'Your session expired. Sign in again.', 401);
  if (mutating && !equalSecret(digest(String(req.headers['x-csrf-token'] || '')), row.csrf_hash))
    throw new DomainError('CSRF_REQUIRED', 'Reload the page before submitting.', 403);
  return ActorSchema.parse(row.actor);
}
function route(
  method: 'get' | 'post',
  path: string,
  fn: (req: Request, res: Response) => Promise<unknown> | unknown,
) {
  http[method](path, async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (e) {
      const known =
        e instanceof DomainError || e instanceof PersistenceError || e instanceof FinanceError;
      const z = e instanceof Error && e.name === 'ZodError';
      const status =
        e instanceof DomainError || e instanceof PersistenceError
          ? e.status
          : e instanceof FinanceError || z
            ? 422
            : 500;
      res.status(status).json({
        code: known ? e.code : z ? 'INVALID_INPUT' : 'REQUEST_FAILED',
        message: known
          ? e.message
          : z
            ? 'Check the required fields and their formats.'
            : 'The request could not be completed. No successful receipt was issued.',
        requestId: res.getHeader('X-Request-ID'),
      });
    }
  });
}
route('get', '/healthz', (_, res) =>
  res.json({ status: 'ok', mode, realm, protectedIntake: false }),
);
route('get', '/status', (req, res) =>
  res.json({
    mode,
    realm,
    protectedIntake: false,
    localAuth: localAuthAllowed(env, req.headers.host || ''),
  }),
);
route('get', '/me', async (req, res) => {
  const a = await actor(req);
  res.json({
    actor: a,
    csrf: cookies(req)[csrfName] || '',
    mode,
    local: localAuthAllowed(env, req.headers.host || ''),
  });
});
route('get', '/workflows', async (req, res) => {
  const a = await actor(req);
  res.json({ workflows: workflows.filter((w) => w.createRoles.some((r) => a.roles.includes(r))) });
});
route('get', '/auth/sessions', async (req, res) => {
  await actor(req);
  const rows = await requireStore().pool.query('SELECT * FROM auth_sessions($1)', [
    digest(cookies(req)[cookieName]),
  ]);
  res.json({
    sessions: rows.rows.map((s) =>
      WorkspaceSessionSchema.parse({
        id: s.id,
        authenticatedAt: s.authenticated_at.toISOString(),
        expiresAt: s.expires_at.toISOString(),
        current: s.current_session,
      }),
    ),
  });
});
route('post', '/auth/sessions/revoke', async (req, res) => {
  await actor(req, true);
  const input = RevokeSessionSchema.parse(req.body);
  const token = digest(cookies(req)[cookieName]);
  const current = await requireStore().pool.query(
    'SELECT id FROM auth_sessions($1) WHERE current_session',
    [token],
  );
  const result = await requireStore().pool.query('SELECT auth_revoke_session($1,$2) revoked', [
    token,
    input.id,
  ]);
  if (current.rows[0]?.id === input.id) {
    setCookie(res, cookieName, '', 0);
    setCookie(res, csrfName, '', 0);
  }
  res.json({ revoked: result.rows[0]?.revoked === true });
});
route('post', '/auth/sessions/revoke-others', async (req, res) => {
  await actor(req, true);
  if (Object.keys(req.body ?? {}).length)
    throw new DomainError('INVALID_INPUT', 'No fields are accepted for this action.');
  const result = await requireStore().pool.query('SELECT auth_revoke_others($1) revoked', [
    digest(cookies(req)[cookieName]),
  ]);
  res.json({ revoked: result.rows[0]?.revoked ?? 0 });
});
route('get', '/records', async (req, res) => {
  res.json(await new RecordReader(requireStore()).read(await actor(req), req.query));
});
const accessService = () => new DraftAccessService(requireStore(), mode, realm);
route('get', '/access', async (req, res) => {
  const a = await actor(req);
  res.json({ grants: await accessService().list(a, IdSchema.parse(req.query['recordId'])) });
});
route('post', '/access/grant', async (req, res) =>
  res.json(await accessService().grant(await actor(req, true), req.body)),
);
route('post', '/access/revoke', async (req, res) =>
  res.json(await accessService().revoke(await actor(req, true), req.body)),
);
const evidenceService = () =>
  new EvidenceService(requireStore(), mode, realm, env['EVIDENCE_STORAGE_PROVIDER'] || 'disabled');
route('get', '/evidence', async (req, res) =>
  res.json(await evidenceService().list(await actor(req), IdSchema.parse(req.query['recordId']))),
);
route('post', '/evidence/upload', async (req, res) =>
  res.json(await evidenceService().upload(await actor(req, true), req.body)),
);
route('post', '/evidence/validate', async (req, res) =>
  res.json(await evidenceService().validate(await actor(req, true), req.body)),
);
route('get', '/evidence/download', async (req, res) => {
  const result = await evidenceService().download(
    await actor(req),
    IdSchema.parse(req.query['id']),
  );
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="' + result.filename + '"');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(result.bytes);
});
const membershipService = () => new MembershipService(requireStore(), mode, realm);
route('get', '/memberships', async (req, res) =>
  res.json(await membershipService().list(await actor(req))),
);
route('get', '/memberships/roll', async (req, res) =>
  res.json(
    await membershipService().rollView(await actor(req), IdSchema.parse(req.query['recordId'])),
  ),
);
route('post', '/memberships/respond', async (req, res) =>
  res.json(await membershipService().respond(await actor(req, true), req.body)),
);
route('get', '/governance', async (req, res) =>
  res.json(
    await membershipService().ballotView(await actor(req), IdSchema.parse(req.query['recordId'])),
  ),
);
route('get', '/notifications', async (req, res) =>
  res.json(await requireStore().notificationPage(await actor(req), req.query)),
);
route('post', '/notifications/read', async (req, res) => {
  const a = await actor(req, true);
  if (mode !== 'simulation' || realm !== 'simulation')
    throw new DomainError(
      'INTAKE_DISABLED',
      'Activity updates are limited to synthetic development.',
      503,
    );
  const input = MarkActivityReadSchema.parse(req.body);
  res.json(await requireStore().markActivityRead(a, input.ids));
});
route('post', '/records', async (req, res) => {
  const a = await actor(req, true);
  if (!service)
    throw new DomainError(
      'SERVICE_UNAVAILABLE',
      'Private development persistence is not configured.',
      503,
    );
  res.status(201).json(await service.create(a, req.body));
});
route('post', '/commands', async (req, res) => {
  const a = await actor(req, true);
  if (!service)
    throw new DomainError(
      'SERVICE_UNAVAILABLE',
      'Private development persistence is not configured.',
      503,
    );
  res.json(await service.command(a, req.body));
});
route('post', '/auth/logout', async (req, res) => {
  await actor(req, true);
  await requireStore().pool.query('SELECT auth_logout($1)', [digest(cookies(req)[cookieName])]);
  setCookie(res, cookieName, '', 0);
  setCookie(res, csrfName, '', 0);
  res.json({ signedOut: true });
});
const personas = [
  'participant',
  'member',
  'successor',
  'labor',
  'commerce',
  'state',
  'supervisor',
  'fiscal',
  'adjudicator',
  'support',
];
async function establish(req: Request, res: Response, id: string) {
  const token = sessionToken(),
    csrf = sessionToken();
  await requireStore().pool.query('SELECT auth_session($1,$2,$3)', [
    id,
    digest(token),
    digest(csrf),
  ]);
  setCookie(res, cookieName, token);
  setCookie(res, csrfName, csrf);
}
route('post', '/auth/local', async (req, res) => {
  if (!localAuthAllowed(env, req.headers.host || ''))
    throw new DomainError('LOCAL_AUTH_DISABLED', 'Local persona access is disabled.', 403);
  const persona = req.body?.persona;
  if (typeof persona !== 'string' || !personas.includes(persona))
    throw new DomainError('INVALID_PERSONA', 'Choose an explicitly seeded synthetic persona.');
  const result = await requireStore().pool.query('SELECT simulation_persona($1)', [persona]);
  const id = result.rows[0]?.simulation_persona;
  if (!id)
    throw new DomainError('PERSONA_NOT_SEEDED', 'Run the explicit synthetic seed first.', 503);
  await establish(req, res, id);
  res.json({ signedIn: true, realm: 'simulation' });
});
let configuration: Promise<oidc.Configuration> | null = null;
function oidcConfig() {
  if (!env['OIDC_ISSUER'] || !env['OIDC_CLIENT_ID'] || !env['OIDC_REDIRECT_URI'])
    throw new DomainError(
      'IDENTITY_NOT_CONFIGURED',
      'An approved identity provider is not configured.',
      503,
    );
  if (!env['OIDC_ISSUER'].startsWith('https://'))
    throw new DomainError('IDENTITY_TRANSPORT', 'Identity discovery requires HTTPS.', 503);
  return (configuration ??= oidc.discovery(
    new URL(env['OIDC_ISSUER']),
    env['OIDC_CLIENT_ID'],
    env['OIDC_CLIENT_SECRET'] || undefined,
  ));
}
route('get', '/auth/start', async (req, res) => {
  if (production)
    throw new DomainError(
      'PROGRAM_ACTIVATION_NOT_AUTHORIZED',
      'Protected identity is unavailable until lawful program activation and verified identity/recovery controls; external security auditing is not a prerequisite.',
      503,
    );
  const config = await oidcConfig(),
    verifier = oidc.randomPKCECodeVerifier(),
    state = oidc.randomState(),
    nonce = oidc.randomNonce();
  const key = readKey(env['SESSION_KEY'], 'SESSION_KEY');
  const flow = encrypt(
    { verifier, state, nonce, at: Date.now() },
    key,
    'session-v1',
    'cornerstone:oidc-flow',
  );
  setCookie(
    res,
    'cornerstone-oidc-flow',
    Buffer.from(JSON.stringify(flow)).toString('base64url'),
    600,
  );
  res.redirect(
    oidc.buildAuthorizationUrl(config, {
      redirect_uri: env['OIDC_REDIRECT_URI']!,
      scope: 'openid',
      response_type: 'code',
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    }).href,
  );
});
route('get', '/auth/callback', async (req, res) => {
  if (production)
    throw new DomainError(
      'PROGRAM_ACTIVATION_NOT_AUTHORIZED',
      'Protected identity remains inactive until lawful activation and verified identity/recovery controls; an independent human audit is not required.',
      503,
    );
  const encoded = cookies(req)['cornerstone-oidc-flow'];
  if (!encoded) throw new DomainError('AUTH_FLOW_EXPIRED', 'Start sign-in again.', 401);
  setCookie(res, 'cornerstone-oidc-flow', '', 0);
  const flow = decrypt<{ verifier: string; state: string; nonce: string; at: number }>(
    JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Envelope,
    readKey(env['SESSION_KEY'], 'SESSION_KEY'),
    'cornerstone:oidc-flow',
  );
  if (Date.now() - flow.at > 600000)
    throw new DomainError('AUTH_FLOW_EXPIRED', 'Start sign-in again.', 401);
  const callback = new URL(env['OIDC_REDIRECT_URI']!);
  callback.search = req.originalUrl.includes('?')
    ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
    : '';
  const tokens = await oidc.authorizationCodeGrant(await oidcConfig(), callback, {
    pkceCodeVerifier: flow.verifier,
    expectedState: flow.state,
    expectedNonce: flow.nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims?.sub)
    throw new DomainError('INVALID_IDENTITY', 'A validated identity subject is required.', 401);
  const result = await requireStore().pool.query('SELECT auth_bind($1,$2,$3)', [
    realm,
    env['OIDC_ISSUER'],
    claims.sub,
  ]);
  await establish(req, res, result.rows[0].auth_bind);
  res.redirect('/');
});
http.use((_req: Request, res: Response) =>
  res.status(404).json({ code: 'NOT_FOUND', message: 'Endpoint not found.' }),
);
await app.listen(
  Number(env['PORT'] || env['API_PORT'] || 4010),
  production ? '0.0.0.0' : '127.0.0.1',
);
const shutdown = async () => {
  await store?.close();
  await app.close();
};
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
