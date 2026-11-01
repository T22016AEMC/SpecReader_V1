// Stop-3 (P3 result-page skeleton, P4 prediction tab) visual and layout measurements of the real app at 1280x720 and 1920x1080.
// SYNTHETIC inputs only: two peak tables written below (the shape of the hand-written fixture S1, tests/fixtures/v121/S1.json; not a real compound)
// and a canvas-drawn engineering image (an axis box with a curve). No benchmark folder, no real spectrum, no screenshots of real data.
// Usage: start the production server first (corepack pnpm@11.25.0 build; PORT=3011 NODE_ENV=production node dist/server.mjs), then
//        node notes/v1.2.2/tools/p3-visual.mjs [baseUrl] [outDir]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const base = args[0] ?? 'http://127.0.0.1:3011';
const out = path.resolve(args[1] ?? path.join(here, '..', 'p3-screenshots'));
fs.mkdirSync(out, {recursive: true});

const IR = 'wavenumber,%Transmittance\n' + [[4000, 99], [3350, 25], [3030, 80], [2965, 70], [1612, 60], [1510, 20], [1440, 65], [1235, 30], [1175, 45], [830, 28], [560, 60], [450, 99]].map(r => r.join(',')).join('\n');
const H1 = 'ppm,intensity,integration,multiplicity,J\n7.08,90,4,d,8.6\n6.73,90,4,d,8.6\n4.75,40,2,br s,\n1.62,100,6,s,';
const FORMULA = 'C15H16O2';
const TABS = [['fg', '圖譜官能基'], ['pred', '預測結構'], ['formula', '分子式與搜尋'], ['input', '輸入與校正'], ['diag', '診斷']];
const results = [];
const note = (name, value, ok) => { results.push({name, value, ok: ok === undefined ? null : ok}); console.log(`${ok === undefined ? '  ' : ok ? 'OK ' : 'BAD'} ${name}: ${typeof value === 'string' ? value : JSON.stringify(value)}`); };

const browser = await chromium.launch({channel: process.env.E2E_BROWSER_CHANNEL || 'chrome', ignoreDefaultArgs: ['--hide-scrollbars']});

const drawImage = page => page.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 1000; c.height = 600; const x = c.getContext('2d');
  x.fillStyle = 'white'; x.fillRect(0, 0, 1000, 600); x.strokeStyle = 'black'; x.strokeRect(80, 40, 870, 490); x.font = '16px sans-serif'; x.fillStyle = 'black';
  x.fillText('12', 80, 565); x.fillText('0', 945, 565);
  x.strokeStyle = '#1455dd'; x.lineWidth = 2; x.beginPath();
  for (let px = 82; px <= 948; px++) { const y = 480 - 380 * Math.exp(-Math.pow((px - 300) / 6, 2)) - 250 * Math.exp(-Math.pow((px - 700) / 6, 2)); if (px === 82) x.moveTo(px, y); else x.lineTo(px, y); }
  x.stroke();
  return c.toDataURL('image/png');
});

/** Everything that has a fixed position in the result page: header, data check, analysis bar, tab bar. */
const fixedRects = page => page.evaluate(() => {
  const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom), Math.round(b.left), Math.round(b.right)].join(','); };
  return {header: r('header'), zone: r('[data-testid=result-fixed-zone]'), dataCheck: r('[data-testid=data-check]'), analysis: r('[data-testid=analysis-control]'), tabs: r('[role=tablist]'), main: r('main')};
});

async function measure(page, label, {tab}) {
  const m = await page.evaluate(() => {
    const main = document.querySelector('main');
    const isScroller = e => { const o = getComputedStyle(e).overflowY; return (o === 'auto' || o === 'scroll'); };
    const outside = [...document.querySelectorAll('body *')].filter(e => {
      if (main && main.contains(e)) return false;
      if (e.closest('[role=dialog],dialog')) return false;
      return isScroller(e);
    }).map(e => e.tagName + '.' + String(e.className).slice(0, 40));
    const inside = main ? [...main.querySelectorAll('*')].filter(e => isScroller(e) && e.scrollHeight > e.clientHeight + 1).map(e => e.tagName + '.' + String(e.className).slice(0, 40)) : [];
    return {
      scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, bodyScrollH: document.documentElement.scrollHeight, innerH: window.innerHeight,
      mainScrollbar: main.offsetWidth - main.clientWidth, mainScrollable: main.scrollHeight > main.clientHeight, outside, inside,
    };
  });
  note(`${label}: no horizontal scroll`, `${m.scrollW} <= ${m.innerW}`, m.scrollW <= m.innerW);
  note(`${label}: the document itself does not scroll`, `scrollHeight ${m.bodyScrollH} vs innerHeight ${m.innerH}`, m.bodyScrollH <= m.innerH);
  note(`${label}: <main> scrollbar width (offsetWidth - clientWidth >= 12)`, m.mainScrollbar, m.mainScrollbar >= 12);
  note(`${label}: vertical scrollers outside <main>`, m.outside, m.outside.length === 0);
  // the four environment cards of the 圖譜官能基 tab keep their old max-h-44 inner scrollbars until P5 (moved unchanged in P3): informational there
  note(`${label}: scroll containers inside <main> that actually scroll (nested scrollbars)${tab === 'fg' ? ' [P5 carry-over, informational]' : ''}`, m.inside, tab === 'fg' ? undefined : m.inside.length === 0);
  const before = await fixedRects(page);
  await page.evaluate(() => { document.querySelector('main').scrollTop = 800; });
  await page.waitForTimeout(100);
  const scrolled = await page.evaluate(() => document.querySelector('main').scrollTop);
  const after = await fixedRects(page);
  const same = ['header', 'zone', 'dataCheck', 'analysis', 'tabs', 'main'].every(k => before[k] === after[k]);
  if (m.mainScrollable) note(`${label}: fixed area (header, data check, analysis bar, tab bar) unchanged after scrolling the content ${Math.round(scrolled)} px`, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`, same);
  else note(`${label}: content shorter than the viewport, scroll check not applicable (fixed rects)`, before);
  await page.evaluate(() => { document.querySelector('main').scrollTop = 0; });
  // inside the open panel only
  const panel = await page.evaluate(id => {
    const el = document.querySelector(`[data-testid=result-panel-${id}]`);
    const text = el.innerText;
    return {openDetails: el.querySelectorAll('details[open]').length, decimals: (text.match(/\d+\.\d{3,}/g) ?? []).slice(0, 5), confidence: /可信度\s*\d+%/.test(text), hidden: el.hidden};
  }, tab);
  note(`${label}: panel is the visible one`, panel.hidden, panel.hidden === false);
  note(`${label}: no 可信度 NN% text`, panel.confidence, panel.confidence === false);
  return panel;
}

async function rules(page, label) {
  const r = await page.evaluate(() => {
    const counts = {};
    for (const e of document.querySelectorAll('[data-testid]')) counts[e.dataset.testid] = (counts[e.dataset.testid] ?? 0) + 1;
    const dupes = Object.entries(counts).filter(([k, v]) => v > 1 && !['observation-row', 'ir-relative-intensity', 'composition-badge', 'composition-inventory-preview', 'molecular-depiction', 'candidate-reasoning', 'candidate-source', 'candidate-v12-assembly', 'conclusion-card', 'compact-candidate', 'candidate-evidence'].includes(k)).map(([k, v]) => `${k}x${v}`);
    const names = [...document.querySelectorAll('button,a')].map(e => (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim()).filter(t => /^第 [123] 頁/.test(t));
    const statuses = [...document.querySelectorAll('[role=status]')].map(e => e.textContent.trim().slice(0, 30));
    return {dupes, stepNames: names, statuses};
  });
  note(`${label}: data-testid unique (except the per-candidate markers and per-row markers)`, r.dupes, r.dupes.length === 0);
  note(`${label}: buttons/links named 第 N 頁 are exactly the 3 step buttons (A13)`, r.stepNames, r.stepNames.length === 3);
  note(`${label}: exactly one role=status`, r.statuses, r.statuses.length === 1);
}

async function runScenario(browser, w, h, kind) {
  const tag = `${w}x${h}`;
  const L = s => `[${tag} ${kind}] ${s}`;
  const shot = (page, name) => page.screenshot({path: path.join(out, `${name}-${tag}.png`)});
  const ctx = await browser.newContext({viewport: {width: w, height: h}});
  const page = await ctx.newPage();
  const errors = [], consoleErrors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) consoleErrors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`); });
  await page.goto(base);
  await page.getByRole('group', {name: '光譜檔案'}).waitFor();
  const files = page.locator('input[type=file]');
  await files.nth(0).setInputFiles({name: 'synthetic-ir.csv', mimeType: 'text/csv', buffer: Buffer.from(IR)});
  if (kind === 'image-h1') {
    const image = await drawImage(page);
    await files.nth(1).setInputFiles({name: 'synthetic-1h.png', mimeType: 'image/png', buffer: Buffer.from(image.split(',')[1], 'base64')});
    await page.getByLabel('氘代溶劑').selectOption('CDCl3');
    await page.locator('select').filter({has: page.locator('option', {hasText: '500 MHz'})}).selectOption('500');
  } else {
    await files.nth(1).setInputFiles({name: 'synthetic-1h.csv', mimeType: 'text/csv', buffer: Buffer.from(H1)});
  }
  await page.waitForTimeout(300);
  await page.getByRole('button', {name: /^第 3 頁.*化學判讀/}).click();
  await page.getByLabel('分子式（選填）', {exact: true}).fill(FORMULA);
  await shot(page, `${kind}-before-analysis`);
  await page.getByRole('button', {name: '開始分析', exact: true}).click();
  await page.getByTestId('result-tab-pred').waitFor();
  await page.waitForTimeout(400);
  note(L('while running: the prediction tab is open'), await page.getByTestId('result-tab-pred').getAttribute('aria-selected'), (await page.getByTestId('result-tab-pred').getAttribute('aria-selected')) === 'true');
  await shot(page, `${kind}-running`);
  await page.getByTestId('analysis-control').and(page.locator('[data-result-current=true]')).waitFor({timeout: 150000});
  note(L('after completion: the first tab is open'), await page.getByTestId('result-tab-fg').getAttribute('aria-selected'), (await page.getByTestId('result-tab-fg').getAttribute('aria-selected')) === 'true');

  for (const [id, name] of TABS) {
    await page.getByTestId(`result-tab-${id}`).click();
    await page.waitForTimeout(250);
    await shot(page, `${kind}-tab-${id}`);
    const panel = await measure(page, L(`tab ${name}`), {tab: id});
    if (id === 'pred') {
      note(L('prediction tab: details[open] = 0'), panel.openDetails, panel.openDetails === 0);
      note(L('prediction tab: no number with three or more decimals (A8)'), panel.decimals, panel.decimals.length === 0);
      const geo = await page.evaluate(() => {
        const card = document.querySelector('[data-testid=conclusion-card][data-rank="1"]');
        if (!card) return null;
        const zone = document.querySelector('[data-testid=result-fixed-zone]').getBoundingClientRect();
        const score = [...card.querySelectorAll('span')].find(s => s.textContent.startsWith('模型相容度：')).getBoundingClientRect();
        const depiction = card.querySelector('[data-testid=molecular-depiction]');
        const svg = depiction.querySelector('svg')?.getBoundingClientRect();
        const dep = depiction.getBoundingClientRect();
        return {zoneBottom: Math.round(zone.bottom), scoreTop: Math.round(score.top), scoreBottom: Math.round(score.bottom), depTop: Math.round(dep.top), depBottom: Math.round(dep.bottom), svgBottom: svg ? Math.round(svg.bottom) : null, innerH: window.innerHeight,
          cards: document.querySelectorAll('[data-testid=conclusion-card]').length, warning: document.querySelector('[data-testid=top-warning]')?.textContent ?? null, score: score && card ? [...card.querySelectorAll('span')].find(s => s.textContent.startsWith('模型相容度：')).textContent : null};
      });
      note(L('A16: rank 1 score and structure drawing visible without scrolling'), geo, !!geo && geo.scoreTop >= geo.zoneBottom && geo.depBottom <= geo.innerH);
      const expanded = await page.evaluate(() => ({details: document.querySelectorAll('[data-testid=result-panel-pred] details[open]').length, evidenceOpen: document.querySelectorAll('[data-testid=candidate-evidence]').length}));
      note(L('prediction tab: expanded blocks (details open / evidence areas open)'), expanded, expanded.details === 0 && expanded.evidenceOpen === 0);
      // opening the evidence area of card 1 works in place (no tab switch)
      await page.getByRole('button', {name: '展開支持與矛盾'}).first().click();
      await page.waitForTimeout(150);
      note(L('opening 支持與矛盾 keeps the prediction tab'), await page.getByTestId('result-tab-pred').getAttribute('aria-selected'), (await page.getByTestId('result-tab-pred').getAttribute('aria-selected')) === 'true');
      await shot(page, `${kind}-tab-pred-evidence-open`);
      await page.getByRole('button', {name: '收合支持與矛盾'}).first().click();
    }
    if (id === 'fg' && kind === 'csv') {
      const g = await page.evaluate(() => { const zone = document.querySelector('[data-testid=result-fixed-zone]').getBoundingClientRect(); return {zoneBottom: Math.round(zone.bottom), cards: document.querySelectorAll('[data-testid=result-panel-fg] .rounded-xl').length}; });
      note(L('fg tab: fixed zone height (px)'), g.zoneBottom);
    }
  }
  await rules(page, L('whole page'));

  // print: every tab prints unclipped
  await page.emulateMedia({media: 'print'});
  for (const [id, name] of TABS) {
    if (!['fg', 'pred', 'diag'].includes(id)) continue;
    await page.evaluate(i => document.querySelector(`[data-testid=result-tab-${i}]`).click(), id);
    await page.waitForTimeout(250);
    const p = await page.evaluate(() => { const m = document.querySelector('main'); return {mainOverflowY: getComputedStyle(m).overflowY, mainClientH: m.clientHeight, mainScrollH: m.scrollHeight, docScrollH: document.documentElement.scrollHeight, innerH: window.innerHeight}; });
    note(L(`print, tab ${name}: <main> does not clip`), p, p.mainOverflowY === 'visible' && Math.abs(p.mainClientH - p.mainScrollH) <= 1);
    if (w === 1280) {
      await page.screenshot({path: path.join(out, `${kind}-print-${id}-${tag}.png`), fullPage: true});
      const pdf = await page.pdf({format: 'A4', printBackground: true});
      fs.writeFileSync(path.join(out, `${kind}-print-${id}.pdf`), pdf);
    }
  }
  await page.emulateMedia({media: 'screen'});
  // uploading an IMAGE runs the optional AI auto-detect on page 1 (checkbox default on); the server answers 503 when no Gemini key is configured (v1.2.1 behaviour, unrelated to the result page)
  const known = consoleErrors.filter(e => /digitize-spectrum|status of 503/.test(e));
  const unexpected = consoleErrors.filter(e => !known.includes(e));
  note(L('no page errors / unexpected console errors'), {pageErrors: errors, unexpected, knownAutoDetect503: known.length}, errors.length === 0 && unexpected.length === 0);
  await ctx.close();
}

for (const [w, h] of [[1280, 720], [1920, 1080]]) {
  await runScenario(browser, w, h, 'csv');
  await runScenario(browser, w, h, 'image-h1');
}
await browser.close();
fs.writeFileSync(path.join(out, 'measurements.json'), JSON.stringify(results, null, 1));
const bad = results.filter(r => r.ok === false);
console.log(`\n${results.length} notes, ${bad.length} BAD`);
if (bad.length) { for (const b of bad) console.log('BAD', b.name, JSON.stringify(b.value)); process.exitCode = 1; }
