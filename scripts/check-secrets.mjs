import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
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
  /postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@(?!localhost[:/])[^\s]+/,
  /(?:ghp|github_pat|sk_live|AKIA)[A-Za-z0-9_]{15,}/,
];
for (const name of names) {
  if (!statSync(name).isFile()) continue;
  if (/^(?:policy|source-originals|private-sources)\/|\.(docx|xlsx|srt|pdf)$/.test(name)) {
    console.error(`Publication-blocked source artifact: ${name}`);
    failed = true;
    continue;
  }
  if (statSync(name).size > 2000000) continue;
  const text = readFileSync(name, 'utf8');
  for (const p of patterns)
    if (p.test(text)) {
      console.error(`Potential secret in ${name}; value omitted.`);
      failed = true;
    }
}
if (failed) process.exitCode = 1;
else
  console.log('No credential patterns or original source artifacts found in the publication set.');
