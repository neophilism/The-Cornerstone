import { readFileSync } from 'node:fs';
export function splitSql(source) {
  const parts = [];
  let start = 0,
    quote = null,
    dollar = null,
    line = false,
    block = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i],
      n = source[i + 1];
    if (line) {
      if (c === '\n') line = false;
      continue;
    }
    if (block) {
      if (c === '*' && n === '/') {
        block = false;
        i++;
      }
      continue;
    }
    if (dollar) {
      if (source.slice(i, i + dollar.length) === dollar) {
        i += dollar.length - 1;
        dollar = null;
      }
      continue;
    }
    if (quote) {
      if (c === quote) {
        if (n === quote) i++;
        else quote = null;
      }
      continue;
    }
    if (c === '-' && n === '-') {
      line = true;
      i++;
      continue;
    }
    if (c === '/' && n === '*') {
      block = true;
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      continue;
    }
    if (c === '$') {
      const m = source.slice(i).match(/^\$[a-zA-Z_0-9]*\$/);
      if (m) {
        dollar = m[0];
        i += dollar.length - 1;
        continue;
      }
    }
    if (c === ';') {
      const p = source.slice(start, i + 1).trim();
      if (p) parts.push(p);
      start = i + 1;
    }
  }
  const tail = source.slice(start).trim();
  if (tail) parts.push(tail);
  if (quote || dollar || block) throw Error('Unterminated SQL');
  return parts;
}
if (process.argv[2]) console.log(JSON.stringify(splitSql(readFileSync(process.argv[2], 'utf8'))));
