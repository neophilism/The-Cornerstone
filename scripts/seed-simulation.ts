import pg from 'pg';
import { randomUUID } from 'node:crypto';
if (
  process.env['CORNERSTONE_MODE'] !== 'simulation' ||
  process.env['DATA_REALM'] !== 'simulation' ||
  process.env['NODE_ENV'] === 'production'
)
  throw Error('Explicit synthetic development environment required.');
const url = process.env['MIGRATION_DATABASE_URL'];
if (!url) throw Error('Separate migration credentials required.');
const client = new pg.Client({ connectionString: url });
await client.connect();
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
const institutions = Object.fromEntries(
  ['labor', 'commerce', 'state', 'supervisor', 'fiscal', 'adjudicator', 'support'].map((r) => [
    r,
    randomUUID(),
  ]),
);
try {
  await client.query('BEGIN');
  for (const persona of personas) {
    const roles =
      persona === 'member'
        ? ['participant', 'member']
        : ['participant', 'successor'].includes(persona)
          ? ['participant']
          : [persona];
    await client.query(
      "INSERT INTO actors(id,realm,issuer,subject,roles,institution_id,jurisdiction,assurance) VALUES($1,'simulation','cornerstone:synthetic-development',$2,$3,$4,'EX', $5) ON CONFLICT(realm,issuer,subject) DO NOTHING",
      [
        randomUUID(),
        persona,
        roles,
        institutions[persona] || null,
        persona === 'member'
          ? 'verified'
          : ['participant', 'successor'].includes(persona)
            ? 'draft'
            : 'privileged',
      ],
    );
  }
  const rows = await client.query(
    "SELECT subject,institution_id FROM actors WHERE realm='simulation' AND issuer='cornerstone:synthetic-development'",
  );
  const actual = Object.fromEntries(rows.rows.map((r) => [r.subject, r.institution_id]));
  const routes: Record<string, string[]> = {
    labor: ['event_petition', 'claim', 'succession', 'association', 'launch', 'resolution'],
    commerce: ['round', 'match'],
    state: ['objection', 'permit'],
    supervisor: ['state_authority', 'offer', 'compact', 'supervision', 'enforcement', 'renewal'],
    adjudicator: ['hearing'],
    fiscal: ['fund_commitment', 'fund_payment', 'financial_schedule', 'land_acquisition'],
    support: ['support_request', 'privacy_request', 'handoff'],
  };
  for (const [role, kinds] of Object.entries(routes))
    for (const kind of kinds)
      await client.query(
        'INSERT INTO simulation_routing(kind,institution_id,roles) VALUES($1,$2,$3) ON CONFLICT(kind) DO UPDATE SET institution_id=EXCLUDED.institution_id,roles=EXCLUDED.roles',
        [kind, actual[role], [role]],
      );
  await client.query('COMMIT');
  console.log(
    'Seeded synthetic personas and routing; no real event, claimant or authority created.',
  );
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  await client.end();
}
