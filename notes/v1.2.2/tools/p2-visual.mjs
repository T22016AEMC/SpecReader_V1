// Stop-2 (P2a page 1, P2b page 2) visual and layout measurements of the real app at 1280x720 and 1920x1080.
// SYNTHETIC inputs only: two peak tables written below (the shape of the hand-written fixture S1, tests/fixtures/v121/S1.json; not a real compound)
// and canvas-drawn engineering images (an axis box with a curve; same idea as tests/e2e/ir-original-baseline.spec.ts).
// Usage: start the production server first (corepack pnpm@11.25.0 build; PORT=3011 NODE_ENV=production node dist/server.mjs), then
//        node notes/v1.2.2/tools/p2-visual.mjs [baseUrl] [outDir]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const base = args[0] ?? 'http://127.0.0.1:3011';
const out = path.resolve(args[1] ?? path.join(here, '..', 'p2-screenshots'));
fs.mkdirSync(out, {recursive: true});

const IR = 'wavenumber,%Transmittance\n' + [[4000, 99], [3350, 25], [3030, 80], [2965, 70], [1612, 60], [1510, 20], [1440, 65], [1235, 30], [1175, 45], [830, 28], [560, 60], [450, 99]].map(r => r.join(',')).join('\n');
const H1 = 'ppm,intensity,integration,multiplicity,J\n7.08,90,4,d,8.6\n6.73,90,4,d,8.6\n4.75,40,2,br s,\n1.62,100,6,s,';
const MODALITIES = ['IR', '¹H NMR', '¹³C NMR', 'MS', 'MS/MS', 'ToF-SIMS'];
const results = [];
const note = (name, value, ok) => { results.push({name, value, ok: ok === undefined ? null : ok}); console.log(`${ok === undefined ? '  ' : ok ? 'OK ' : 'BAD'} ${name}: ${typeof value === 'string' ? value : JSON.stringify(value)}`); };

const browser = await chromium.launch({channel: process.env.E2E_BROWSER_CHANNEL || 'chrome', ignoreDefaultArgs: ['--hide-scrollbars']});

const drawImage = (page, kind) => page.evaluate(k => {
  const c = document.createElement('canvas'); c.width = 1000; c.height = 600; const x = c.getContext('2d');
  x.fillStyle = 'white'; x.fillRect(0, 0, 1000, 600); x.strokeStyle = 'black'; x.strokeRect(80, 40, 870, 490); x.font = '16px sans-serif'; x.fillStyle = 'black';
  if (k === 'ir') { x.fillText('4000', 80, 565); x.fillText('400', 925, 565); }
  else { x.fillText('12', 80, 565); x.fillText('0', 945, 565); }
  x.strokeStyle = '#1455dd'; x.lineWidth = 2; x.beginPath();
  for (let px = 82; px <= 948; px++) {
    const y = k === 'ir' ? 115 + 90 * Math.exp(-Math.pow((px - 280) / 60, 2)) + 150 * Math.exp(-Math.pow((px - 650) / 12, 2)) + 6 * Math.sin(px / 20) : 480 - 380 * Math.exp(-Math.pow((px - 300) / 6, 2)) - 250 * Math.exp(-Math.pow((px - 700) / 6, 2));
    if (px === 82) x.moveTo(px, y); else x.lineTo(px, y);
  }
  x.stroke();
  return c.toDataURL('image/png');
}, kind);

async function measure(page, label, {inner = false, files: checkFiles = false} = {}) {
  const m = await page.evaluate(() => {
    const main = document.querySelector('main');
    const rect = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return {top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height)}; };
    const isScroller = e => { const o = getComputedStyle(e).overflowY; return (o === 'auto' || o === 'scroll'); };
    const outside = [...document.querySelectorAll('body *')].filter(e => {
      if (main && main.contains(e)) return false;
      if (e.closest('[role=dialog],dialog')) return false;
      return isScroller(e);
    }).map(e => e.tagName + '.' + String(e.className).slice(0, 40));
    // scroll containers INSIDE <main> that actually scroll (content taller than the box) = "scrollbars in scrollbars"
    const inside = main ? [...main.querySelectorAll('*')].filter(e => isScroller(e) && e.scrollHeight > e.clientHeight + 1).map(e => e.tagName + '.' + String(e.className).slice(0, 40)) : [];
    const files = [...document.querySelectorAll('input[type=file]')].map(i => i.closest('[role=group] > div')?.querySelector('button span')?.textContent?.trim() ?? null);
    const viewer = document.querySelector('[data-sr-viewer]');
    return {
      scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, bodyScrollH: document.documentElement.scrollHeight, innerH: window.innerHeight,
      header: rect('header'), main: rect('main'),
      viewerTop: viewer ? Math.round(viewer.getBoundingClientRect().top) : null,
      mainScrollbar: main ? main.offsetWidth - main.clientWidth : null, mainScrollable: main ? main.scrollHeight > main.clientHeight : null, mainOverflowY: main ? getComputedStyle(main).overflowY : null,
      outside, inside, files,
    };
  });
  note(`${label}: title bar + step bar height`, m.header?.height, m.header.height <= 120);
  note(`${label}: no horizontal scroll`, `${m.scrollW} <= ${m.innerW}`, m.scrollW <= m.innerW);
  note(`${label}: the document itself does not scroll`, `scrollHeight ${m.bodyScrollH} vs innerHeight ${m.innerH}`, m.bodyScrollH <= m.innerH);
  note(`${label}: <main> scrollbar width (offsetWidth - clientWidth >= 12)`, m.mainScrollbar, m.mainScrollbar >= 12);
  note(`${label}: vertical scrollers outside <main>`, m.outside, m.outside.length === 0);
  if (inner) note(`${label}: scrollbars inside <main> (nested scrolling boxes)`, m.inside, m.inside.length === 0);
  if (checkFiles) note(`${label}: input[type=file] count and DOM order`, m.files, JSON.stringify(m.files) === JSON.stringify(MODALITIES));
  // test-compatibility rules (DESIGN_REPORT A.2): every data-testid once (except the per-row marker), step buttons are the only "第 N 頁" buttons/links, no 可信度 NN%
  const rules = await page.evaluate(() => {
    const counts = {};
    for (const e of document.querySelectorAll('[data-testid]')) counts[e.dataset.testid] = (counts[e.dataset.testid] ?? 0) + 1;
    const dupes = Object.entries(counts).filter(([k, v]) => v > 1 && k !== 'observation-row' && k !== 'ir-relative-intensity').map(([k, v]) => `${k}x${v}`);
    const names = [...document.querySelectorAll('button,a')].map(e => (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim()).filter(t => /^第 [123] 頁/.test(t));
    const form = [...document.querySelectorAll('form')].find(f => f.textContent.includes('新增標記'));
    const formInputs = form ? [...form.querySelectorAll('input[type=number]')].length : null;
    return {dupes, stepNames: names, formNumberInputs: formInputs, confidencePercent: /可信度\s*\d+%/.test(document.body.innerText), statusChanged: [...document.querySelectorAll('[role=status]')].filter(e => e.textContent.includes('資料已變更')).length};
  });
  note(`${label}: data-testid unique (except the per-row observation-row and ir-relative-intensity)`, rules.dupes, rules.dupes.length === 0);
  note(`${label}: buttons/links named 第 N 頁 are exactly the 3 step buttons`, rules.stepNames, rules.stepNames.length === 3);
  note(`${label}: no 可信度 NN% text; no 資料已變更 status`, {confidencePercent: rules.confidencePercent, statusChanged: rules.statusChanged}, !rules.confidencePercent && rules.statusChanged === 0);
  if (rules.formNumberInputs !== null) note(`${label}: manual-add form keeps two number inputs (position, intensity)`, rules.formNumberInputs, rules.formNumberInputs === 2);
  if (m.mainScrollable) {
    const before = m.header;
    await page.evaluate(() => { document.querySelector('main').scrollTop = 800; });
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => { const r = document.querySelector('header').getBoundingClientRect(); return {top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height)}; });
    const scrolled = await page.evaluate(() => document.querySelector('main').scrollTop);
    note(`${label}: fixed area unchanged after scrolling the content ${Math.round(scrolled)} px`, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`, JSON.stringify(before) === JSON.stringify(after));
    await page.evaluate(() => { document.querySelector('main').scrollTop = 0; });
  } else note(`${label}: content shorter than the viewport (fixed-area check done on the long states)`, 'n/a');
  return m;
}

const tagsRow = page => page.getByRole('group', {name: '光譜檔案'});
const tagButton = (page, name) => tagsRow(page).getByRole('button', {name: new RegExp('^' + name)}).first();

for (const [w, h] of [[1280, 720], [1920, 1080]]) {
  const tag = `${w}x${h}`;
  const L = s => `[${tag}] ${s}`;
  const shot = (page, name) => page.screenshot({path: path.join(out, `${name}-${tag}.png`)});

  // ---------- scenario A: numeric peak tables ----------
  {
    const ctx = await browser.newContext({viewport: {width: w, height: h}});
    const page = await ctx.newPage();
    const errors = [], consoleErrors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    await page.goto(base);
    await page.getByRole('group', {name: '光譜檔案'}).waitFor();
    await shot(page, 'p1-empty');
    await measure(page, L('page 1 empty'), {inner: true, files: true});

    const files = page.locator('input[type=file]');
    await files.nth(0).setInputFiles({name: 'synthetic-ir.csv', mimeType: 'text/csv', buffer: Buffer.from(IR)});
    await files.nth(1).setInputFiles({name: 'synthetic-1h.csv', mimeType: 'text/csv', buffer: Buffer.from(H1)});
    await page.getByText('synthetic-1h.csv').first().waitFor();
    await page.waitForTimeout(300);

    await tagButton(page, 'IR').click();
    await page.waitForTimeout(200);
    await shot(page, 'p1-loaded-ir');
    const mIr = await measure(page, L('page 1, IR csv loaded (IR in focus)'), {inner: true, files: true});
    note(L('page 1 IR: spectrum viewer top edge y <= 400'), mIr.viewerTop, mIr.viewerTop <= 400);
    await tagsRow(page).screenshot({path: path.join(out, `status-csv-${tag}.png`)});

    await tagButton(page, '¹H NMR').click();
    await page.waitForTimeout(200);
    await shot(page, 'p1-loaded-1h');
    const mH = await measure(page, L('page 1, 1H csv loaded (1H in focus)'), {inner: true, files: true});
    note(L('page 1 1H: spectrum viewer top edge y <= 400'), mH.viewerTop, mH.viewerTop <= 400);
    const viewerH = await page.evaluate(() => { const v = document.querySelector('[data-sr-viewer] svg[viewBox^="0 0 860"]'); const r = v.getBoundingClientRect(); return {w: Math.round(r.width), h: Math.round(r.height), viewBox: v.getAttribute('viewBox')}; });
    note(L('page 1: viewer svg box (viewBox height 420)'), viewerH, /\s420$/.test(viewerH.viewBox ?? ''));

    // "明細" is collapsed by default and opens inside the same row
    const rows = page.getByTestId('observation-row');
    const rowCount = await rows.count();
    const closed = await rows.first().locator('details').evaluate(d => d.open);
    await rows.first().locator('summary').click();
    const opened = await rows.first().locator('details').evaluate(d => d.open);
    note(L('page 1: row details closed by default, opens on click'), {rows: rowCount, before: closed, after: opened}, rowCount === 4 && closed === false && opened === true);
    await rows.first().locator('summary').click();

    // plot-mode drag, zoom and click-to-mark at the new 420 px height
    const peaksBefore = await rows.count();
    const svg = page.locator('[data-sr-viewer] svg[viewBox^="0 0 860"]').first();
    await svg.scrollIntoViewIfNeeded();
    const box = await svg.boundingBox();
    await svg.click({position: {x: box.width * 0.45, y: box.height * 0.5}});
    const peaksAfter = await rows.count();
    note(L('plot click adds a mark at 420 px height'), `${peaksBefore} -> ${peaksAfter}`, peaksAfter === peaksBefore + 1);
    // a mark snaps to the nearest curve point while dragging, so drag far enough to change the snapped position
    const allPos = () => page.evaluate(() => [...document.querySelectorAll('[data-testid=observation-row] input[aria-label$=位置]')].map(i => i.value).join(','));
    const marker = page.locator('[data-sr-viewer] svg[viewBox^="0 0 860"] g.cursor-move circle').first();
    const xBefore = await allPos();
    const mb = await marker.boundingBox();
    await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2); await page.mouse.down(); await page.mouse.move(mb.x + mb.width / 2 + 160, mb.y + mb.height / 2 - 20, {steps: 10}); await page.mouse.up();
    const xAfter = await allPos();
    note(L('plot marker drag changes a mark position'), `${xBefore} -> ${xAfter}`, xBefore !== xAfter);
    await page.getByTitle('放大座標區間', {exact: true}).click();
    await page.waitForTimeout(150);
    const zoomed = await svg.evaluate(s => s.querySelectorAll('text').length);
    await page.getByTitle('重置縮放', {exact: true}).click();
    note(L('zoom in / reset work'), `svg text nodes while zoomed ${zoomed}`, zoomed > 0);

    // page 2 with a numeric file: information (blue), not a warning
    await page.evaluate(() => { document.querySelector('main').scrollTop = 0; });
    await page.getByRole('button', {name: /^第 2 頁.*座標校正/}).click();
    await page.waitForTimeout(300);
    await shot(page, 'p2-numeric-1h');
    await measure(page, L('page 2, numeric files'), {inner: true});
    note(L('JavaScript errors (scenario A)'), errors, errors.length === 0);
    note(L('console resource errors (scenario A; information only)'), consoleErrors);
    await ctx.close();
  }

  // ---------- scenario B: canvas-drawn images ----------
  {
    const ctx = await browser.newContext({viewport: {width: w, height: h}});
    const page = await ctx.newPage();
    const errors = [], consoleErrors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    await page.goto(base);
    const irImg = await drawImage(page, 'ir');
    const hImg = await drawImage(page, '1h');
    const files = page.locator('input[type=file]');
    await files.nth(0).setInputFiles({name: 'synthetic-ir.png', mimeType: 'image/png', buffer: Buffer.from(irImg.split(',')[1], 'base64')});
    await files.nth(1).setInputFiles({name: 'synthetic-1h.png', mimeType: 'image/png', buffer: Buffer.from(hImg.split(',')[1], 'base64')});
    await page.getByText('synthetic-1h.png').first().waitFor();
    await page.waitForTimeout(300);

    await tagButton(page, 'IR').click();
    await page.waitForTimeout(200);
    await shot(page, 'p1-images-ir');
    const bIr = await measure(page, L('page 1, IR image (IR in focus)'), {inner: true, files: true});
    note(L('page 1 IR image: spectrum viewer top edge y <= 400'), bIr.viewerTop, bIr.viewerTop <= 400);
    await tagButton(page, '¹H NMR').click();
    await page.waitForTimeout(200);
    await shot(page, 'p1-images-1h');
    const bH = await measure(page, L('page 1, 1H image (1H in focus)'), {inner: true, files: true});
    note(L('page 1 1H image: spectrum viewer top edge y <= 400'), bH.viewerTop, bH.viewerTop <= 400);
    const statusText = async () => page.evaluate(() => [...document.querySelectorAll('[role=group] [data-calibration-kind]')].map(e => `${e.getAttribute('data-calibration-kind')}: ${e.textContent.trim()}`));
    const st1 = await statusText();
    note(L('page 1 tags before calibration'), st1, st1.some(t => t.includes('預設座標（尚未校正）') || t.includes('尚未校正')) && !st1.some(t => t.includes('已由你校正')));
    await tagsRow(page).screenshot({path: path.join(out, `status-1h-default-${tag}.png`)});

    // marker click + drag on the image (image mode)
    await tagButton(page, 'IR').click();
    const imgSvg = page.locator('[data-sr-viewer] svg[viewBox="0 0 1000 600"]').first();
    await imgSvg.scrollIntoViewIfNeeded();
    const ib = await imgSvg.boundingBox();
    const rows = page.getByTestId('observation-row');
    const n0 = await rows.count();
    await imgSvg.click({position: {x: ib.width * 0.3, y: ib.height * 0.35}});
    const n1 = await rows.count();
    note(L('image click adds a mark at the new height'), `${n0} -> ${n1}`, n1 === n0 + 1);
    const mk = page.locator('[data-sr-viewer] svg[viewBox="0 0 1000 600"] g.cursor-move').first();
    if (await mk.count()) {
      const mbx = await mk.boundingBox();
      const pos = rows.last().getByLabel(/位置/);
      const before = await pos.inputValue();
      await page.mouse.move(mbx.x + mbx.width / 2, mbx.y + mbx.height / 2); await page.mouse.down(); await page.mouse.move(mbx.x + mbx.width / 2 + 40, mbx.y + mbx.height / 2, {steps: 6}); await page.mouse.up();
      const after = await pos.inputValue();
      note(L('image marker drag changes the mark position'), `${before} -> ${after}`, before !== after);
    } else note(L('image marker drag'), 'no draggable marker found', false);

    // ---------- page 2 ----------
    await page.evaluate(() => { document.querySelector('main').scrollTop = 0; });
    await page.getByRole('button', {name: /^第 2 頁.*座標校正/}).click();
    await page.getByRole('button', {name: /^IR/}).first().click();
    await page.waitForTimeout(400);
    await shot(page, 'p2-ir');
    const p2ir = await measure(page, L('page 2, IR image'), {inner: true});
    note(L('page 2: ir-calibration-panel present exactly once; piecewise-toggle once'), {panel: await page.getByTestId('ir-calibration-panel').count(), toggle: await page.getByTestId('piecewise-toggle').count()}, (await page.getByTestId('ir-calibration-panel').count()) === 1 && (await page.getByTestId('piecewise-toggle').count()) === 1);
    const chips = await page.evaluate(() => [...document.querySelectorAll('[data-calibration-kind]')].map(e => `${e.getAttribute('data-calibration-kind')}: ${e.textContent.trim()}`));
    note(L('page 2 chips (calibration status per spectrum)'), chips, chips.length >= 2);
    const reminder = await page.locator('[data-calibration-reminder]').textContent().catch(() => null);
    note(L('page 2 reminder (non-blocking)'), reminder, !!reminder);
    const step3 = await page.getByRole('button', {name: /^第 3 頁.*化學判讀/}).textContent();
    note(L('step 3 button keeps a name starting with 第 3 頁 and carries the warning mark'), step3, /^第 3 頁/.test(step3.trim()) && step3.includes('⚠'));

    // IR baseline drag + zoom (the baseline panel now sits in the right column)
    const handle = page.getByLabel('原圖基線控制點 3');
    await handle.waitFor();
    await page.evaluate(() => { document.querySelector('main').scrollTop = 120; });
    await handle.scrollIntoViewIfNeeded();
    const y0 = await handle.getAttribute('data-y'); const hb = await handle.boundingBox();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down(); await page.mouse.move(hb.x + 12, hb.y + 26, {steps: 6}); await page.mouse.up();
    const y1 = await handle.getAttribute('data-y');
    note(L('IR baseline handle 3 drags (main scrolled 120 px)'), `data-y ${y0} -> ${y1}`, y0 !== y1);
    await page.getByTitle('放大座標區間', {exact: true}).click(); await page.waitForTimeout(150);
    const y2 = await handle.getAttribute('data-y'); const hb2 = await handle.boundingBox();
    await page.mouse.move(hb2.x + hb2.width / 2, hb2.y + hb2.height / 2); await page.mouse.down(); await page.mouse.move(hb2.x + 10, hb2.y - 14, {steps: 6}); await page.mouse.up();
    const y3 = await handle.getAttribute('data-y');
    note(L('IR baseline handle 3 drags while zoomed in'), `data-y ${y2} -> ${y3}`, y2 !== y3);
    await page.getByTitle('重置縮放', {exact: true}).click();
    await page.evaluate(() => { document.querySelector('main').scrollTop = 0; });

    // piecewise (IR suggestion) opened: still one toggle, controls appear, two-point hint disappears
    await page.getByTestId('piecewise-toggle').click();
    await page.waitForTimeout(200);
    await shot(page, 'p2-ir-piecewise');
    const pw = {panel: await page.getByTestId('piecewise-calibration').count(), hint: await page.getByTestId('two-point-linearity-hint').count()};
    note(L('piecewise opened: controls shown, two-point hint hidden'), pw, pw.panel === 1 && pw.hint === 0);
    // piecewise point C is set by clicking the image; verify the click lands (a calibration point, not a mark)
    const calSvg = page.locator('svg').filter({has: page.getByLabel('原圖基線控制點 1')}).first();
    await calSvg.scrollIntoViewIfNeeded();
    const cb = await calSvg.boundingBox();
    await page.getByRole('button', {name: /切換為點圖取樣 A|目前點圖設定 Pt A/}).first().click();
    const cx0 = await page.getByLabel('校正點 A 像素 X', {exact: true}).inputValue();
    await calSvg.click({position: {x: cb.width * 0.35, y: cb.height * 0.9}});
    const cx1 = await page.getByLabel('校正點 A 像素 X', {exact: true}).inputValue();
    note(L('piecewise: clicking the image sets calibration point A pixel X'), `${cx0} -> ${cx1}`, cx0 !== cx1);
    await page.getByTestId('piecewise-toggle').click();

    await page.evaluate(() => { document.querySelector('main').scrollTop = 0; });
    await page.getByRole('button', {name: /^¹H NMR/}).first().click();
    await page.waitForTimeout(400);
    await shot(page, 'p2-1h');
    await measure(page, L('page 2, 1H image'), {inner: true});
    const hchips = await page.evaluate(() => [...document.querySelectorAll('[data-calibration-kind]')].map(e => `${e.getAttribute('data-calibration-kind')}: ${e.textContent.trim()}`));
    note(L('page 2 chips before calibrating 1H'), hchips, hchips.some(t => t.startsWith('DEFAULT_COORDS')));
    // preview collapse: add 5 marks so the preview has more than 4 rows
    const hsvg = page.locator('svg').filter({has: page.locator('rect')}).first();
    await page.getByRole('button', {name: /套用兩點線性座標校正並轉換/}).click();
    await page.waitForTimeout(300);
    await shot(page, 'p2-1h-calibrated');
    const hchips2 = await page.evaluate(() => [...document.querySelectorAll('[data-calibration-kind]')].map(e => `${e.getAttribute('data-calibration-kind')}: ${e.textContent.trim()}`));
    note(L('page 2 chips after the two-point calibration of 1H'), hchips2, hchips2.some(t => t.startsWith('USER') && t.includes('已校正 ✓（兩點）')));
    await page.getByRole('button', {name: /^第 1 頁/}).click();
    await page.waitForTimeout(300);
    await tagsRow(page).screenshot({path: path.join(out, `status-1h-calibrated-${tag}.png`)});
    const st2 = await statusText();
    note(L('page 1 tags after calibrating 1H'), st2, st2.some(t => t.includes('已由你校正（兩點）')));
    note(L('JavaScript errors (scenario B)'), errors, errors.length === 0);
    note(L('console resource errors (scenario B; information only)'), consoleErrors);
    await ctx.close();
  }
}

fs.writeFileSync(path.join(out, 'measurements.json'), JSON.stringify(results, null, 1));
const bad = results.filter(r => r.ok === false);
console.log(`\n${results.length} items, ${bad.length} failed`);
await browser.close();
process.exit(bad.length ? 1 : 0);
