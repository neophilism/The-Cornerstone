// Read committed Git objects for the GitHub connector; never reads working secrets.
import { execFileSync } from 'node:child_process';
const git = (...args) => execFileSync('git', args, { maxBuffer: 32 * 1024 * 1024 });
const base = process.argv[2];
if (!base || !/^[a-f0-9]{40}$/.test(base))
  throw new Error('Provide a verified 40-character base commit');
const head = git('rev-parse', 'HEAD').toString().trim();
const tree = git('rev-parse', 'HEAD^{tree}').toString().trim();
const names = git('diff', '--name-only', '-z', base, head).toString().split('\0').filter(Boolean);
const files = names.map((path) => {
  const entry = git('ls-tree', head, '--', path).toString().trim();
  if (!entry) return { path, deleted: true };
  const [, mode, sha] = /^(\d+) blob ([a-f0-9]{40})\t/.exec(entry) ?? [];
  if (!mode || !sha) throw new Error('Unsupported Git tree entry');
  const bytes = Number(git('cat-file', '-s', sha).toString().trim());
  const text = !/\.(docx|xlsx|pdf)$/.test(path) && bytes <= 24576;
  return { path, mode, sha, bytes, text, chunks: Math.ceil(bytes / 24576) };
});
if (process.argv[3] === '--chunk') {
  const path = process.argv[4];
  const index = Number(process.argv[5]);
  const f = files.find((f) => f.path === path && !f.deleted);
  if (!f || !Number.isSafeInteger(index) || index < 0 || index >= f.chunks)
    throw new Error('Invalid committed chunk');
  const buffer = git('cat-file', 'blob', f.sha).subarray(index * 24576, (index + 1) * 24576);
  console.log(
    JSON.stringify({ path, index, bytes: buffer.length, base64: buffer.toString('base64') }),
  );
} else if (process.argv[3] === '--text') {
  const groups = [];
  let group = [],
    size = 0;
  for (const f of files.filter((f) => f.text || f.deleted)) {
    if (size + (f.bytes ?? 0) > 40000 && group.length) {
      groups.push(group);
      group = [];
      size = 0;
    }
    group.push(
      f.deleted
        ? { path: f.path, mode: '100644', type: 'blob', sha: null }
        : {
            path: f.path,
            mode: f.mode,
            type: 'blob',
            content: git('cat-file', 'blob', f.sha).toString(),
          },
    );
    size += f.bytes ?? 0;
  }
  if (group.length) groups.push(group);
  const index = Number(process.argv[4]);
  console.log(
    JSON.stringify(process.argv[4] === undefined ? { groups: groups.length } : groups[index]),
  );
} else console.log(JSON.stringify({ base, head, tree, files }));
