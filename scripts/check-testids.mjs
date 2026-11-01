// Compares the data-testid values found in src/**/*.tsx with notes/v1.2.2/testids.baseline.json (taken from origin/main = v1.2.1).
// Usage:  node scripts/check-testids.mjs            -> exit 1 if any baseline id has disappeared
//         node scripts/check-testids.mjs --write    -> (re)write the baseline from the current src (only on the v1.2.1 commit)
// Dynamic ids written as template literals are stored with their static prefix and a `*`, e.g. reasoning-step-*.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const baselineFile = path.join(root, 'notes', 'v1.2.2', 'testids.baseline.json');
const posix = p => p.split(path.sep).join('/');
const walk = d => fs.readdirSync(d, {withFileTypes: true}).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx$/.test(e.name) ? [path.join(d, e.name)] : []);

const found = new Map();
for (const f of walk(path.join(root, 'src'))) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/data-testid=(?:"([^"]+)"|\{`([^`]+)`\})/g)) {
      const id = m[1] ?? m[2].replace(/\$\{[^}]*\}.*$/, '*');
      const at = `${posix(path.relative(root, f))}:${i + 1}`;
      found.set(id, [...(found.get(id) ?? []), at]);
    }
  });
}

if (process.argv.includes('--write')) {
  const ids = Object.fromEntries([...found.entries()].sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(baselineFile, JSON.stringify({source: 'origin/main 4d55117 (v1.2.1)', count: found.size, ids}, null, 1) + '\n');
  console.log(`baseline written: ${found.size} ids`);
} else {
  const base = JSON.parse(fs.readFileSync(baselineFile, 'utf8')).ids;
  const missing = Object.keys(base).filter(id => !found.has(id));
  const added = [...found.keys()].filter(id => !(id in base));
  console.log(`baseline ${Object.keys(base).length} ids, now ${found.size}; missing ${missing.length}; new ${added.length}`);
  if (added.length) console.log('new:', added.join(', '));
  if (missing.length) { console.log('MISSING:', missing.join(', ')); process.exit(1); }
}
