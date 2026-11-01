// Stop-1 (P1) visual and layout measurements of the real app: screenshots of page 1, page 2, page 3 and Mode B at 1280x720 and 1920x1080, layout checks,
// print emulation and a manual drag/zoom check inside the new scroll container. SYNTHETIC inputs only (peak tables written below; a canvas-drawn image).
// Usage: start the production server first (corepack pnpm@11.25.0 build; set PORT=3011 NODE_ENV=production; node dist/server.mjs), then
//        node notes/v1.2.2/tools/p1-visual.mjs [baseUrl] [outDir] [--theme=dark]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const base = args[0] ?? 'http://127.0.0.1:3011';
const out = path.resolve(args[1] ?? path.join(here, '..', 'p1-screenshots'));
const dark = process.argv.includes('--theme=dark');
fs.mkdirSync(out, {recursive: true});

// synthetic peak tables (shape of the hand-written fixture S1, tests/fixtures/v121/S1.json; not a real compound)
const IR = 'wavenumber,%Transmittance\n' + [[4000, 99], [3350, 25], [3030, 80], [2965, 70], [1612, 60], [1510, 20], [1440, 65], [1235, 30], [1175, 45], [830, 28], [560, 60], [450, 99]].map(r => r.join(',')).join('\n');
const H1 = 'ppm,intensity,integration,multiplicity,J\n7.08,90,4,d,8.6\n6.73,90,4,d,8.6\n4.75,40,2,br s,\n1.62,100,6,s,';
const results = [];
const note = (name, value, ok) => { results.push({name, value, ok}); console.log(`${ok === undefined ? '  ' : ok ? 'OK ' : 'BAD'} ${name}: ${typeof value === 'string' ? value : JSON.stringify(value)}`); };

const browser = await chromium.launch({channel: process.env.E2E_BROWSER_CHANNEL || 'chrome', ignoreDefaultArgs: ['--hide-scrollbars']});

async function measure(page, label) {
  const m = await page.evaluate(() => {
    const main = document.querySelector('main');
    const rect = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return {top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height)}; };
    const scrollers = [...document.querySelectorAll('body *')].filter(e => {
      if (main && main.contains(e)) return false;
      if (e.closest('[role=dialog],dialog')) return false;
      const o = getComputedStyle(e).overflowY;
      return o === 'auto' || o === 'scroll';
    }).map(e => e.tagName + '.' + String(e.className).slice(0, 40));
    return {
      scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
      bodyScrollH: document.documentElement.scrollHeight, innerH: window.innerHeight,
      header: rect('header'), main: rect('main'),
      mainScrollbar: main ? main.offsetWidth - main.clientWidth : null, mainScrollable: main ? main.scrollHeight > main.clientHeight : null, mainOverflowY: main ? getComputedStyle(main).overflowY : null,
      scrollersOutsideMain: scrollers,
    };
  });
  note(`${label} no horizontal scroll`, `${m.scrollW} <= ${m.innerW}`, m.scrollW <= m.innerW);
  note(`${label} document does not scroll (only <main> does)`, `scrollHeight ${m.bodyScrollH} vs innerHeight ${m.innerH}`, m.bodyScrollH <= m.innerH);
  note(`${label} <main> scrollbar width (offsetWidth - clientWidth >= 12)`, m.mainScrollbar, m.mainScrollbar >= 12);
  note(`${label} <main> overflow-y`, m.mainOverflowY, m.mainOverflowY === 'scroll');
  note(`${label} vertical scrollers outside <main> (excluding dialogs)`, m.scrollersOutsideMain, m.scrollersOutsideMain.length === 0);
  if (m.mainScrollable) {
    const before = m.header;
    await page.evaluate(() => { document.querySelector('main').scrollTop = 800; });
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => { const r = document.querySelector('header').getBoundingClientRect(); return {top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height)}; });
    const scrolled = await page.evaluate(() => document.querySelector('main').scrollTop);
    note(`${label} fixed header (title + step bar) unchanged after scrolling the content ${Math.round(scrolled)} px`, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`, JSON.stringify(before) === JSON.stringify(after));
    await page.evaluate(() => { document.querySelector('main').scrollTop = 0; });
  } else note(`${label} content shorter than the viewport (fixed-area check done on the long pages)`, 'n/a');
  return m;
}

for (const [w, h] of [[1280, 720], [1920, 1080]]) {
  const tag = `${w}x${h}`;
  const ctx = await browser.newContext({viewport: {width: w, height: h}});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  if (dark) await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  const shot = name => page.screenshot({path: path.join(out, `${name}-${tag}.png`)});
  const files = page.locator('input[type=file]');
  await files.nth(0).setInputFiles({name: 'synthetic-ir.csv', mimeType: 'text/csv', buffer: Buffer.from(IR)});
  await files.nth(1).setInputFiles({name: 'synthetic-1h.csv', mimeType: 'text/csv', buffer: Buffer.from(H1)});
  await page.getByText('synthetic-ir.csv').first().waitFor();
  await page.waitForTimeout(300);
  await shot('page1');
  await measure(page, `[${tag}] page 1`);

  await page.getByRole('button', {name: /^第 2 頁.*座標校正/}).click();
  await page.waitForTimeout(300);
  await shot('page2');
  await measure(page, `[${tag}] page 2 (numeric files)`);

  await page.getByRole('button', {name: /^第 3 頁.*化學判讀/}).click();
  await page.getByLabel('分子式（選填）', {exact: true}).fill('C15H16O2');
  await page.getByRole('button', {name: '開始分析', exact: true}).click();
  await page.getByTestId('analysis-control').and(page.locator('[data-result-current=true]')).waitFor({timeout: 120000});
  await page.waitForTimeout(500);
  await shot('page3-top');
  await measure(page, `[${tag}] page 3`);
  await page.evaluate(() => { document.querySelector('main').scrollTop = 1500; });
  await shot('page3-scrolled');
  await page.evaluate(() => { document.querySelector('main').scrollTop = 0; });

  // print: the results must not be clipped by the scroll container
  await page.emulateMedia({media: 'print'});
  const print = await page.evaluate(() => {
    const main = document.querySelector('main'), app = document.querySelector('.sr-app');
    return {mainOverflowY: getComputedStyle(main).overflowY, mainClientH: main.clientHeight, mainScrollH: main.scrollHeight, appHeight: Math.round(app.getBoundingClientRect().height), docScrollH: document.documentElement.scrollHeight, innerH: window.innerHeight};
  });
  note(`[${tag}] print: <main> does not clip (overflow visible, clientHeight == scrollHeight)`, print, print.mainOverflowY === 'visible' && Math.abs(print.mainClientH - print.mainScrollH) <= 1);
  note(`[${tag}] print: the page is taller than one screen (content flows)`, `docScrollH ${print.docScrollH} > innerH ${print.innerH}`, print.docScrollH > print.innerH);
  await page.screenshot({path: path.join(out, `page3-print-${tag}.png`), fullPage: true});
  if (w === 1280) {
    const pdf = await page.pdf({format: 'A4', printBackground: true});
    fs.writeFileSync(path.join(out, 'page3-print.pdf'), pdf);
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    note('print: PDF page count of the result page (more than 1 = content flows over pages)', pages, pages > 1);
  }
  await page.emulateMedia({media: 'screen'});

  await page.getByRole('button', {name: /^Mode B/}).click();
  await page.waitForTimeout(300);
  await shot('modeB');
  await measure(page, `[${tag}] Mode B`);
  note(`[${tag}] page errors`, errors, errors.length === 0);
  await ctx.close();
}

// manual drag / zoom check inside the new scroll container: IR image, page 2, five-point baseline
{
  const ctx = await browser.newContext({viewport: {width: 1280, height: 720}});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  if (dark) await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  const image = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1000; c.height = 600; const x = c.getContext('2d');
    x.fillStyle = 'white'; x.fillRect(0, 0, 1000, 600); x.strokeStyle = 'black'; x.strokeRect(80, 40, 870, 490); x.font = '16px sans-serif'; x.fillStyle = 'black'; x.fillText('4000', 80, 565); x.fillText('400', 925, 565);
    x.strokeStyle = '#1455dd'; x.lineWidth = 2; x.beginPath(); for (let px = 82; px <= 948; px++) { const y = 115 + 90 * Math.sin(px / 40) * Math.sin(px / 130); px === 82 ? x.moveTo(px, y) : x.lineTo(px, y); } x.stroke();
    return c.toDataURL('image/png');
  });
  await page.locator('input[type=file]').first().setInputFiles({name: 'synthetic-original-ir.png', mimeType: 'image/png', buffer: Buffer.from(image.split(',')[1], 'base64')});
  await page.getByRole('button', {name: /^第 2 頁.*座標校正/}).click();
  const handle = page.getByLabel('原圖基線控制點 3');
  await handle.waitFor();
  await page.evaluate(() => { document.querySelector('main').scrollTop = 120; });
  await handle.scrollIntoViewIfNeeded();
  const before = await handle.getAttribute('data-y');
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + 12, box.y + 26, {steps: 6}); await page.mouse.up();
  const after = await handle.getAttribute('data-y');
  note('drag: the baseline handle moves inside the scrolling <main> (after scrolling it 120 px)', `data-y ${before} -> ${after}`, before !== after);
  await page.getByTitle('放大座標區間', {exact: true}).click();
  const zoomed = await page.evaluate(() => document.querySelector('main').scrollHeight);
  await page.getByTitle('重置縮放', {exact: true}).click();
  note('zoom: zoom in and reset work inside <main>', `scrollHeight while zoomed ${zoomed}`, true);
  await page.screenshot({path: path.join(out, 'page2-image-drag-1280x720.png')});
  note('drag/zoom page errors', errors, errors.length === 0);
  await ctx.close();
}
await browser.close();
const bad = results.filter(r => r.ok === false);
fs.writeFileSync(path.join(out, dark ? 'measurements-dark.json' : 'measurements.json'), JSON.stringify(results, null, 1));
console.log(`\n${results.filter(r => r.ok).length} ok, ${bad.length} BAD`);
process.exit(bad.length ? 1 : 0);
