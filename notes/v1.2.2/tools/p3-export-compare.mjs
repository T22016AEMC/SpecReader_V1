// Stop-3 acceptance 9: the 「下載完整 JSON 證據包」 export of the same SYNTHETIC input is the same in v1.2.1 and in this branch.
// Both builds run the same hand-written inputs through the real UI (Worker analysis, then 匯出報告 → 下載完整 JSON 證據包).
// The only differences allowed are the wall-clock fields (elapsed time etc., which also differ between two runs of the SAME build; that baseline is measured too).
// Usage: node notes/v1.2.2/tools/p3-export-compare.mjs <v1.2.1 base url> <branch base url> [outDir]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const [oldBase, newBase, outArg] = process.argv.slice(2);
const out = path.resolve(outArg ?? path.join(here, '..', 'p3-export-compare'));
fs.mkdirSync(out, {recursive: true});

// two small inputs whose search finishes by itself (user formula; the grammar is exhausted), so the step counts do not depend on the wall clock
const CASES = {
  ethanol: {ir: 'wavenumber,relative intensity\n3350,70\n2920,30\n1050,100', h1: null, formula: 'C2H6O'},
  propanone: {ir: 'wavenumber,relative intensity\n1715,100\n2970,40\n1360,35', h1: 'ppm,intensity,integration,multiplicity\n2.14,100,6,s', formula: 'C3H6O'},
};
const TIME_KEY = /capturedAt|elapsed|durationMs|timestamp|generatedAt|startedAt|finishedAt|^ms$|Ms$/i;

const browser = await chromium.launch({channel: process.env.E2E_BROWSER_CHANNEL || 'chrome'});
async function exportJson(base, name) {
  const c = CASES[name];
  const ctx = await browser.newContext({viewport: {width: 1440, height: 1000}, acceptDownloads: true});
  const page = await ctx.newPage();
  await page.goto(base);
  await page.locator('input[type=file]').nth(0).setInputFiles({name: 'export-compare-ir.csv', mimeType: 'text/csv', buffer: Buffer.from(c.ir)});
  if (c.h1) await page.locator('input[type=file]').nth(1).setInputFiles({name: 'export-compare-1h.csv', mimeType: 'text/csv', buffer: Buffer.from(c.h1)});
  await page.getByRole('button', {name: /^第 3 頁.*化學判讀/}).click();
  await page.getByLabel('分子式（選填）', {exact: true}).fill(c.formula);
  await page.getByRole('button', {name: '開始分析', exact: true}).click();
  await page.getByTestId('analysis-control').and(page.locator('[data-result-current=true]')).waitFor({timeout: 150000});
  await page.getByRole('button', {name: '匯出報告', exact: true}).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', {name: /下載完整 JSON 證據包/}).click()]);
  const file = await download.path();
  const text = fs.readFileSync(file, 'utf8');
  await ctx.close();
  return text;
}
const strip = v => {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !TIME_KEY.test(k)).map(([k, x]) => [k, strip(x)]));
  return v;
};
const diffPaths = (a, b, at = '$', acc = []) => {
  if (acc.length > 30) return acc;
  if (Array.isArray(a) && Array.isArray(b)) { if (a.length !== b.length) acc.push(`${at}: length ${a.length} vs ${b.length}`); for (let i = 0; i < Math.min(a.length, b.length); i++) diffPaths(a[i], b[i], `${at}[${i}]`, acc); }
  else if (a && b && typeof a === 'object' && typeof b === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diffPaths(a[k], b[k], `${at}.${k}`, acc); }
  else if (a !== b) acc.push(`${at}: ${JSON.stringify(a)?.slice(0, 60)} vs ${JSON.stringify(b)?.slice(0, 60)}`);
  return acc;
};
const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

const report = [];
for (const name of Object.keys(CASES)) {
  const oldA = await exportJson(oldBase, name), oldB = await exportJson(oldBase, name), neu = await exportJson(newBase, name);
  fs.writeFileSync(path.join(out, `${name}-v121.json`), oldA); fs.writeFileSync(path.join(out, `${name}-branch.json`), neu);
  const a = strip(JSON.parse(oldA)), b = strip(JSON.parse(oldB)), n = strip(JSON.parse(neu));
  const rawKeysDiffer = (x, y) => JSON.stringify(x) !== JSON.stringify(y);
  const base = diffPaths(a, b), cross = diffPaths(a, n);
  const line = {
    case: name, bytes: {v121: oldA.length, branch: neu.length},
    rawIdentical: oldA === neu, rawIdenticalTwoV121Runs: oldA === oldB,
    afterDroppingTimingKeys: {v121_vs_branch_identical: !rawKeysDiffer(a, n), v121_vs_v121_identical: !rawKeysDiffer(a, b), hash: {v121: sha(JSON.stringify(a)), v121_second_run: sha(JSON.stringify(b)), branch: sha(JSON.stringify(n))}},
    differencesV121vsV121: base.slice(0, 10), differencesV121vsBranch: cross.slice(0, 10),
  };
  report.push(line); console.log(JSON.stringify(line, null, 1));
}
await browser.close();
fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(report, null, 1));
process.exitCode = report.every(r => r.afterDroppingTimingKeys.v121_vs_branch_identical) ? 0 : 1;
