import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const files = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.next', '.git'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (/\.(ts|tsx|js|mjs)$/.test(p)) files.push(p);
  }
}
await walk('apps');
await walk('packages');
const failures = [];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  if (
    (file.startsWith('apps/web/') || file.startsWith('packages/ui/')) &&
    /(?:from\s*['"]|import\(['"])(?:pg|@cornerstone\/(?:store|security)|node:crypto)/.test(text) &&
    !file.endsWith('proxy.ts')
  )
    failures.push(`${file}: private server dependency in public/client boundary`);
  if (/localStorage\.(setItem|getItem)|sessionStorage\.(setItem|getItem)/.test(text))
    failures.push(`${file}: browser persistence is not approved for private records`);
  if (
    file.startsWith('apps/') &&
    file.endsWith('page.tsx') &&
    /DATABASE_URL|FIELD_ENCRYPTION_KEY|INTERNAL_API_KEY/.test(text)
  )
    failures.push(`${file}: private configuration in a UI module`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log(`Boundary checks passed for ${files.length} modules.`);
