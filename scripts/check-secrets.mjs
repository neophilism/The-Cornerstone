import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {allowedDisposableCiDatabase} from './allowed-ci-db.mjs';
const manifest = JSON.parse(readFileSync('policy/SOURCE_MANIFEST.json', 'utf8'));
const allowedPaths = new Set([
  'policy/Speech.srt',
  'policy/Policy_Paper.docx',
  'policy/Design_Commentary.docx',
  'policy/Displacement_Event_Census.docx',
  'policy/Event_Evidence.xlsx',
  'policy/Federal_Cornerstone_Bill.docx',
  'policy/Model_State_Cornerstone_Enabling_Act.docx',
]);
if (
  manifest.publication?.approved !== '2026-10-11' ||
  manifest.sources.length !== allowedPaths.size ||
  new Set(manifest.sources.map((s) => s.path)).size !== allowedPaths.size
)
  throw new Error('Approved source inventory is invalid');
for (const source of manifest.sources) {
  if (!allowedPaths.has(source.path)) throw new Error('Unapproved source path');
  const bytes = readFileSync(source.path);
  if (
    bytes.length !== source.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== source.sha256
  )
    throw new Error(`Source hash mismatch: ${source.path}`);
}
const names = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
let failed = false;
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:ghp|github_pat|sk_live|AKIA)[A-Za-z0-9_]{15,}/,
];
// Database passwords even on loopback are sensitive, except three exact
// documented synthetic CircleCI fixture URLs.
// Require a user:password@host shape; host-only URLs in negative tests are
// not credentials. This still catches passwords even on localhost.
const databaseUris = /postgres(?:ql)?:\/\/[a-zA-Z0-9_.-]+:[^\s:@/"'<>]+@[^\s"'<>]+/g;
for (const name of names) {
  if (!statSync(name).isFile()) continue;
  if (allowedPaths.has(name)) continue;
  if (/^(?:source-originals|private-sources)\/|\.(docx|xlsx|srt|pdf)$/.test(name)) {
    console.error(`Publication-blocked source artifact: ${name}`);
    failed = true;
    continue;
  }
  if (statSync(name).size > 2000000) continue;
  const text = readFileSync(name, 'utf8');
  const matchedPattern = patterns.some(p => p.test(text));
  const matchedDatabase = [...text.matchAll(databaseUris)].some(m => !allowedDisposableCiDatabase(name, m[0]));
  if (matchedPattern || matchedDatabase) {
    console.error('Potential secret in ' + name + '; value omitted.');
    failed = true;
  }
}
if (failed) process.exitCode = 1;
else console.log('No credential patterns found; 7 explicitly approved source originals verified.');
