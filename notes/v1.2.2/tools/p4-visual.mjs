// Stop-4 (P5 function-group tab, P6 other three tabs, P7 wrap-up) layout and content measurements of the real app at 1280x720 ONLY.
// SYNTHETIC inputs only: the hand-written peak tables below (the shape of tests/fixtures/v121/S1.json; not a real compound). No benchmark folder, no real spectrum.
// Usage: node notes/v1.2.2/tools/p4-visual.mjs [baseUrl] [outDir]   (production: PORT=3011 NODE_ENV=production node dist/server.mjs)
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const base = args[0] ?? 'http://127.0.0.1:3011';
const out = path.resolve(args[1] ?? path.join(here, '..', 'p4-screenshots'));
fs.mkdirSync(out, {recursive: true});

const IR_PEAKS = [[3350, 75, 60], [3030, 20, 12], [2965, 30, 14], [1612, 40, 10], [1510, 80, 10], [1440, 35, 10], [1235, 70, 12], [1175, 55, 10], [830, 72, 10], [560, 40, 14]];
// a dense absorbance curve (sum of Gaussians at the peak positions): the curve itself gives no peak marks, the script marks them by hand below
const IR = ['wavenumber,Absorbance', ...Array.from({length: 1801}, (_, i) => 4000 - 2 * i).map(x => `${x},${(IR_PEAKS.reduce((a, [c, hgt, wd]) => a + (hgt / 100) * Math.exp(-0.5 * ((x - c) / wd) ** 2), 0)).toFixed(4)}`)].join(String.fromCharCode(10));
const H1 = 'ppm,intensity,integration,multiplicity,J\n7.08,90,4,d,8.6\n6.73,90,4,d,8.6\n4.75,40,2,br s,\n1.62,100,6,s,';
const FORMULA = 'C15H16O2';
const TABS = [['fg', '圖譜官能基'], ['pred', '預測結構'], ['formula', '分子式與搜尋'], ['input', '輸入與校正'], ['diag', '診斷']];
const TEMPLATES = {
  'candidate-method': /候選分子圖選出區間／環境知識/g,
  'single-peak': /目前僅依賴單一模態之孤立峰支持/g,
  'shared-observation': /共享觀測／競爭解釋|共享同一個觀測/g,
};
const results = [];
const note = (name, value, ok) => { results.push({name, value, ok: ok === undefined ? null : ok}); console.log(`${ok === undefined ? '  ' : ok ? 'OK ' : 'BAD'} ${name}: ${typeof value === 'string' ? value : JSON.stringify(value)}`); };

const browser = await chromium.launch({channel: process.env.E2E_BROWSER_CHANNEL || 'chrome', ignoreDefaultArgs: ['--hide-scrollbars']});
const [w, h] = [1280, 720];
const ctx = await browser.newContext({viewport: {width: w, height: h}, permissions: ['clipboard-read', 'clipboard-write']});
const page = await ctx.newPage();
const errors = [], consoleErrors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
const shot = name => page.screenshot({path: path.join(out, `${name}-${w}x${h}.png`)});

await page.goto(base);
await page.getByRole('group', {name: '光譜檔案'}).waitFor();
const files = page.locator('input[type=file]');
await files.nth(1).setInputFiles({name: 'synthetic-1h.csv', mimeType: 'text/csv', buffer: Buffer.from(H1)});
await files.nth(0).setInputFiles({name: 'synthetic-ir.csv', mimeType: 'text/csv', buffer: Buffer.from(IR)});
await page.waitForTimeout(300);
// the IR table is a curve: mark the peaks by hand (position, intensity) like a user would on page 1
const form = page.locator('form').filter({has: page.getByRole('button', {name: '新增標記', exact: true})});
for (const [pos, inten] of IR_PEAKS) {
  await form.locator('input[type=number]').nth(0).fill(String(pos));
  await form.locator('input[type=number]').nth(1).fill(String(inten));
  await form.getByRole('button', {name: '新增標記', exact: true}).click();
}
await page.waitForTimeout(300);
await page.getByRole('button', {name: /^第 3 頁.*化學判讀/}).click();
await page.getByLabel('分子式（選填）', {exact: true}).fill(FORMULA);
await page.getByRole('button', {name: '開始分析', exact: true}).click();
await page.getByTestId('analysis-control').and(page.locator('[data-result-current=true]')).waitFor({timeout: 180000});

async function measureTab(id, name) {
  await page.getByTestId(`result-tab-${id}`).click();
  await page.waitForTimeout(250);
  await page.evaluate(() => { document.querySelector('main').scrollTop = 0; });
  const L = s => `[${name}] ${s}`;
  const m = await page.evaluate(tabId => {
    const main = document.querySelector('main');
    const isScroller = e => { const o = getComputedStyle(e).overflowY; return o === 'auto' || o === 'scroll'; };
    const outside = [...document.querySelectorAll('body *')].filter(e => !main.contains(e) && !e.closest('[role=dialog],dialog') && isScroller(e)).map(e => e.tagName + '.' + String(e.className).slice(0, 40));
    const inside = [...main.querySelectorAll('*')].filter(e => isScroller(e) && e.getClientRects().length > 0 && e.scrollHeight > e.clientHeight + 1).map(e => e.tagName + '.' + String(e.className).slice(0, 40));
    const panel = document.querySelector(`[data-testid=result-panel-${tabId}]`);
    const text = panel.innerText;
    const effectiveOpen = [...panel.querySelectorAll('details[open]')].filter(d => !d.parentElement.closest('details:not([open])'));
    return {
      scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, docH: document.documentElement.scrollHeight, innerH: window.innerHeight,
      mainScrollbar: main.offsetWidth - main.clientWidth, outside, inside,
      decimals: (text.match(/\d+\.\d{3,}/g) ?? []).slice(0, 6), confidence: /可信度\s*\d+%/.test(text), hidden: panel.hidden,
      openDetailsAll: panel.querySelectorAll('details[open]').length, openDetailsEffective: effectiveOpen.length, openTestIds: effectiveOpen.map(d => d.dataset.testid ?? d.querySelector('summary')?.textContent?.slice(0, 20)),
      templates: Object.fromEntries(Object.entries({
        'candidate-method': '候選分子圖選出區間／環境知識', 'single-peak': '目前僅依賴單一模態之孤立峰支持', 'shared-observation': '共享觀測／競爭解釋|共享同一個觀測',
      }).map(([k, v]) => [k, (text.match(new RegExp(v, 'g')) ?? []).length])),
      textLength: text.length,
    };
  }, id);
  note(L('no horizontal scroll'), `${m.scrollW} <= ${m.innerW}`, m.scrollW <= m.innerW);
  note(L('document does not scroll by itself'), `${m.docH} vs ${m.innerH}`, m.docH <= m.innerH);
  note(L('<main> scrollbar width >= 12'), m.mainScrollbar, m.mainScrollbar >= 12);
  note(L('vertical scrollers outside <main>'), m.outside, m.outside.length === 0);
  note(L('vertical scrollers inside <main>'), m.inside, m.inside.length === 0);
  note(L('visible text with 3+ decimals (A8)'), m.decimals, m.decimals.length === 0);
  note(L('no 可信度 NN%'), m.confidence, m.confidence === false);
  for (const [k, n] of Object.entries(m.templates)) note(L(`template sentence "${k}" count <= 1`), n, n <= 1);
  note(L('details[open] (all / effective)'), {all: m.openDetailsAll, effective: m.openDetailsEffective, ids: m.openTestIds});
  await shot(`tab-${id}`);
  return m;
}

const per = {};
for (const [id, name] of TABS) per[id] = await measureTab(id, name);
note('fg + pred: no details[open] (effective)', [per.fg.openDetailsEffective, per.pred.openDetailsEffective], per.fg.openDetailsEffective === 0 && per.pred.openDetailsEffective === 0);
note('formula tab: composition panel closed (effective open = 0)', per.formula.openDetailsEffective, per.formula.openDetailsEffective === 0);
note('input tab: peak tables closed (effective open = 0)', per.input.openDetailsEffective, per.input.openDetailsEffective === 0);

// ---- fg tab content
await page.getByTestId('result-tab-fg').click();
const fg = await page.evaluate(() => {
  const zone = document.querySelector('[data-testid=result-fixed-zone]').getBoundingClientRect();
  const first = document.querySelector('[data-testid=fg-group]').getBoundingClientRect();
  const shown = document.querySelectorAll('[data-testid=fg-group-list] > [data-testid=fg-group]').length;
  const hiddenEl = document.querySelector('[data-testid=fg-hidden-groups]');
  const hiddenN = hiddenEl ? hiddenEl.querySelectorAll('[data-testid=fg-group]').length : 0;
  return {zoneBottom: Math.round(zone.bottom), firstTop: Math.round(first.top), firstBottom: Math.round(first.bottom), innerH: window.innerHeight, shown, hiddenN, notice: hiddenEl?.querySelector('summary')?.textContent ?? null,
    firstRow: document.querySelector('[data-testid=fg-group] summary').innerText, openedAfterHiddenOpen: null};
});
note('A16: first function-group row visible without scrolling (1280x720)', fg, fg.firstTop >= fg.zoneBottom && fg.firstBottom <= fg.innerH);
note('fg tab: shown groups + hidden groups', {shown: fg.shown, hidden: fg.hiddenN, total: fg.shown + fg.hiddenN});
await page.getByTestId('fg-hidden-groups').locator('summary').first().click();
await page.getByTestId('fg-group').first().locator('summary').click();
await page.waitForTimeout(150);
await shot('tab-fg-expanded');
const afterOpen = await page.evaluate(() => ({visibleHidden: [...document.querySelectorAll('[data-testid=fg-hidden-groups] [data-testid=fg-group]')].filter(e => e.getBoundingClientRect().height > 0).length}));
note('hidden groups are all visible after opening the notice', afterOpen, afterOpen.visibleHidden === fg.hiddenN);
await page.getByTestId('fg-hidden-groups').locator('summary').first().click();
await page.getByTestId('fg-group').first().locator('summary').click();

// ---- keyboard: left/right on the tab list
await page.getByTestId('result-tab-fg').focus();
await page.keyboard.press('ArrowRight');
const k1 = await page.getByTestId('result-tab-pred').getAttribute('aria-selected');
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
const k2 = await page.getByTestId('result-tab-input').getAttribute('aria-selected');
await page.keyboard.press('ArrowLeft');
const k3 = await page.getByTestId('result-tab-formula').getAttribute('aria-selected');
const focused = await page.evaluate(() => document.activeElement?.id);
note('keyboard: → → → ← switches tabs and moves focus', {k1, k2, k3, focused}, k1 === 'true' && k2 === 'true' && k3 === 'true' && focused === 'result-tab-formula');
const roles = await page.evaluate(() => ({tablist: document.querySelectorAll('[role=tablist]').length, tabs: document.querySelectorAll('[role=tab]').length, panels: document.querySelectorAll('[role=tabpanel]').length, selected: document.querySelectorAll('[role=tab][aria-selected=true]').length}));
note('a11y: tablist 1, tab 5, tabpanel 5, selected 1', roles, roles.tablist === 1 && roles.tabs === 5 && roles.panels === 5 && roles.selected === 1);

// ---- formula tab: row cap
await page.getByTestId('result-tab-formula').click();
await page.getByTestId('composition-panel-summary').click();
const rows = await page.evaluate(() => ({rows: document.querySelectorAll('[data-testid=composition-hypotheses] tbody tr').length, button: document.querySelector('[data-testid=composition-rows-toggle]')?.textContent ?? null}));
note('formula tab: table rows shown and the 展開全部 button', rows);
await shot('tab-formula-open');
await page.getByTestId('composition-panel-summary').click();

// ---- diag tab: copy summary and full formula table
await page.getByTestId('result-tab-diag').click();
await page.getByRole('button', {name: '複製診斷摘要'}).click();
await page.waitForTimeout(200);
const clip = await page.evaluate(() => navigator.clipboard.readText());
const titles = ['資料檢查', '¹H 峰表與程式的讀法', 'IR 帶與校正方式', '分子式表', '搜尋計畫摘要', '前幾名候選', '各規則擋掉的結構數'];
note('diag: 複製診斷摘要 → clipboard has the 7 sections, <= 120 lines', {lines: clip.split('\n').length - 1, sections: titles.filter(t => clip.includes('■ ' + t)).length}, titles.every(t => clip.includes('■ ' + t)) && clip.split('\n').length - 1 <= 120);
note('diag: summary names the nitrogen and oxygen sources', {n: /氮證據來源/.test(clip), o: /氧下限來源/.test(clip)}, /氮證據來源/.test(clip) && /氧下限來源/.test(clip));
await page.getByRole('button', {name: '複製完整分子式表'}).click();
await page.waitForTimeout(200);
const table = await page.evaluate(() => navigator.clipboard.readText());
note('diag: 複製完整分子式表 → one line per hypothesis', {lines: table.split('\n').length - 1, hasState: /已搜尋/.test(table) && /未搜尋/.test(table)}, /已搜尋/.test(table));
await shot('tab-diag-after-copy');

// ---- rules over the whole page
const r = await page.evaluate(() => {
  const counts = {};
  for (const e of document.querySelectorAll('[data-testid]')) counts[e.dataset.testid] = (counts[e.dataset.testid] ?? 0) + 1;
  const allowed = ['observation-row', 'ir-relative-intensity', 'composition-badge', 'composition-inventory-preview', 'molecular-depiction', 'candidate-reasoning', 'candidate-source', 'candidate-v12-assembly', 'conclusion-card', 'compact-candidate', 'candidate-evidence', 'candidate-evidence-summary', 'candidate-evidence-table', 'fg-group'];
  const dupes = Object.entries(counts).filter(([k, v]) => v > 1 && !allowed.includes(k)).map(([k, v]) => `${k}x${v}`);
  const names = [...document.querySelectorAll('button,a')].map(e => (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim()).filter(t => /^第 [123] 頁/.test(t));
  const statuses = [...document.querySelectorAll('[role=status]')].map(e => e.textContent.trim().slice(0, 30));
  return {dupes, stepNames: names, statuses};
});
note('data-testid unique (except per-row / per-candidate markers)', r.dupes, r.dupes.length === 0);
note('A13: buttons/links named 第 1/2/3 頁 are exactly the 3 step buttons', r.stepNames, r.stepNames.length === 3);
note('exactly one role=status', r.statuses, r.statuses.length === 1);

// ---- print
await page.emulateMedia({media: 'print'});
for (const [id, name] of TABS) {
  if (!['fg', 'pred', 'diag'].includes(id)) continue;
  await page.evaluate(i => document.querySelector(`[data-testid=result-tab-${i}]`).click(), id);
  await page.waitForTimeout(250);
  const p = await page.evaluate(() => { const m = document.querySelector('main'); return {mainOverflowY: getComputedStyle(m).overflowY, mainClientH: m.clientHeight, mainScrollH: m.scrollHeight}; });
  note(`print, tab ${name}: <main> does not clip`, p, p.mainOverflowY === 'visible' && Math.abs(p.mainClientH - p.mainScrollH) <= 1);
  await page.screenshot({path: path.join(out, `print-${id}-${w}x${h}.png`), fullPage: true});
  fs.writeFileSync(path.join(out, `print-${id}.pdf`), await page.pdf({format: 'A4', printBackground: true}));
}
await page.emulateMedia({media: 'screen'});
note('no page errors / console errors', {pageErrors: errors, consoleErrors}, errors.length === 0 && consoleErrors.length === 0);
await ctx.close();
await browser.close();
fs.writeFileSync(path.join(out, 'measurements.json'), JSON.stringify(results, null, 1));
const bad = results.filter(x => x.ok === false);
console.log(`\n${results.length} notes, ${bad.length} BAD`);
if (bad.length) { for (const b of bad) console.log('BAD', b.name, JSON.stringify(b.value)); process.exitCode = 1; }
