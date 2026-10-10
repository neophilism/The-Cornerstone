// Read-only Git transport support; includes only the current, committed code tree.
import { execFileSync } from 'node:child_process';
const paths = execFileSync('git', ['ls-tree', '-rz', '--name-only', 'HEAD'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const groups = [];
let group = [],
  size = 0;
for (const path of paths) {
  const content = execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' });
  if (size + Buffer.byteLength(content) > 45000 && group.length) {
    groups.push(group);
    group = [];
    size = 0;
  }
  group.push({ path, content });
  size += Buffer.byteLength(content);
}
if (group.length) groups.push(group);
console.log(
  JSON.stringify(
    process.argv[2] === undefined
      ? { groups: groups.length, files: paths.length }
      : groups[Number(process.argv[2])],
  ),
);
