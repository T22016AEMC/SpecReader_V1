import {test, expect, type Page} from '@playwright/test';
import {openTab} from './helpers/ui';
// v1.2.2 P5/P6/P7. The 圖譜官能基 tab (merged rows, hidden "IR 證據不足" notice), the 診斷 tab (two copy buttons), the 輸入與校正 tab and the keyboard use of the tab bar.
// Synthetic engineering fixtures only: a hand-written ¹H peak table and a computed absorbance curve (sum of Gaussians) marked by hand; the shape of the fixture S1 (a phenol-like pattern). No experimental spectrum, no benchmark data.
const IR_PEAKS = [[3350, 75, 60], [3030, 20, 12], [2965, 30, 14], [1612, 40, 10], [1510, 80, 10], [1440, 35, 10], [1235, 70, 12], [1175, 55, 10], [830, 72, 10], [560, 40, 14]];
const irCurve = ['wavenumber,Absorbance', ...Array.from({length: 1801}, (_, i) => 4000 - 2 * i).map(x => `${x},${IR_PEAKS.reduce((a, [c, h, w]) => a + (h / 100) * Math.exp(-0.5 * ((x - c) / w) ** 2), 0).toFixed(4)}`)].join('\n');
const h1 = 'ppm,intensity,integration,multiplicity,J\n7.08,90,4,d,8.6\n6.73,90,4,d,8.6\n4.75,40,2,br s,\n1.62,100,6,s,';

async function analyse(page: Page, formula?: string) {
  await page.goto('/');
  const files = page.locator('input[type=file]');
  await files.nth(1).setInputFiles({name: 'detail-1h.csv', mimeType: 'text/csv', buffer: Buffer.from(h1)});
  await files.nth(0).setInputFiles({name: 'detail-ir.csv', mimeType: 'text/csv', buffer: Buffer.from(irCurve)});
  const form = page.locator('form').filter({has: page.getByRole('button', {name: '新增標記', exact: true})});
  for (const [pos, inten] of IR_PEAKS) {
    await form.locator('input[type=number]').nth(0).fill(String(pos));
    await form.locator('input[type=number]').nth(1).fill(String(inten));
    await form.getByRole('button', {name: '新增標記', exact: true}).click();
  }
  await page.getByRole('button', {name: /^第 3 頁.*化學判讀/}).click();
  if (formula) await page.getByLabel('分子式（選填）', {exact: true}).fill(formula);
  await page.getByRole('button', {name: '開始分析', exact: true}).click();
  await expect(page.getByTestId('analysis-control')).toHaveAttribute('data-result-current', 'true', {timeout: 90000});
}

test('圖譜官能基：同名合併成一行、IR 證據不足的官能基預設隱藏並可點開、預設沒有展開的區塊', async ({page}) => {
  test.setTimeout(150000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await analyse(page, 'C15H16O2');
  const panel = page.getByTestId('result-panel-fg');
  await expect(panel).toBeVisible();
  await expect(panel.locator('details[open]')).toHaveCount(0);
  // same-name groups are one row with their peaks listed
  const aromatic = panel.locator('[data-testid=fg-group-list] [data-testid=fg-group][data-group="芳環骨架 C=C"]');
  await expect(aromatic).toHaveCount(1);
  await expect(aromatic).toContainText('3 個 IR 峰：1612、1510、1440 cm⁻¹');
  // the hidden notice: its number, the rows inside it, and the badge numbers agree
  const notice = panel.getByTestId('fg-hidden-groups');
  await expect(notice).toBeVisible();
  const noticeText = (await notice.locator('summary').first().textContent()) ?? '';
  const hiddenCount = Number(noticeText.match(/另有 (\d+) 項 IR 證據不足的官能基，已隱藏（點開查看）/)?.[1]);
  expect(hiddenCount).toBeGreaterThan(0);
  const shownCount = await panel.locator('[data-testid=fg-group-list] [data-testid=fg-group]').count();
  await expect(panel.getByText(`${shownCount + hiddenCount} 種官能基（顯示 ${shownCount}、隱藏 ${hiddenCount}）`)).toBeVisible();
  const hiddenRows = notice.locator('[data-testid=fg-group]');
  await expect(hiddenRows).toHaveCount(hiddenCount);
  await expect(hiddenRows.first()).toBeHidden();
  await notice.locator('summary').first().click();
  for (let i = 0; i < hiddenCount; i++) await expect(hiddenRows.nth(i)).toBeVisible();
  // a row opens in place and shows the companion bands and the full id in small text
  await hiddenRows.first().locator('summary').click();
  await expect(hiddenRows.first()).toContainText('伴隨帶已觀測');
  // the template sentence about single peaks is said once on the tab
  const text = await panel.innerText();
  expect(text.match(/目前僅依賴單一模態之孤立峰支持/g) ?? []).toHaveLength(1);
  expect(text).not.toMatch(/\d+\.\d{3,}/);
  expect(errors).toEqual([]);
});

test('診斷：複製診斷摘要（7 個小節、≤120 行、預覽相同）與複製完整分子式表（每個假設一行）', async ({page, context}) => {
  test.setTimeout(150000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await analyse(page);
  await openTab(page, '診斷');
  const preview = page.getByTestId('diagnostic-preview');
  await expect(preview).toBeVisible();
  await page.getByRole('button', {name: '複製診斷摘要'}).click();
  await expect(page.getByTestId('diagnostic-copy-feedback')).toHaveText('已複製診斷摘要');
  const normalise = (t: string) => t.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10)); // Windows clipboards turn LF into CRLF
  const summary = normalise(await page.evaluate(() => navigator.clipboard.readText()));
  const titles = ['資料檢查', '¹H 峰表與程式的讀法', 'IR 帶與校正方式', '分子式表', '搜尋計畫摘要', '前幾名候選', '各規則擋掉的結構數'];
  expect(summary.split('\n').filter(l => l.startsWith('■ ')).map(l => l.slice(2))).toEqual(titles);
  expect(summary.split('\n').length - 1).toBeLessThanOrEqual(120);
  expect(summary).toMatch(/氧下限來源：/);
  expect(summary).toMatch(/氮證據來源：/);
  expect(summary).not.toContain('detail-ir.csv');
  expect((await preview.textContent())?.trim()).toBe(summary.trim());
  // the full formula table: one line per hypothesis, all of them (not only the first ones the tab lists)
  await page.getByRole('button', {name: '複製完整分子式表'}).click();
  await expect(page.getByTestId('diagnostic-copy-feedback')).toHaveText('已複製完整分子式表');
  const table = normalise(await page.evaluate(() => navigator.clipboard.readText()));
  const hypothesisLines = table.split('\n').filter(l => /^#\d+｜/.test(l));
  expect(hypothesisLines.length).toBeGreaterThan(0);
  for (const l of hypothesisLines) expect(l).toMatch(/已搜尋|未搜尋/);
  // the 分子式與搜尋 tab lists the searched rows + the first 4 others and offers all of them
  await openTab(page, '分子式與搜尋');
  await page.getByTestId('composition-panel-summary').click();
  const rows = page.locator('[data-testid=composition-hypotheses] tbody tr');
  const shown = await rows.count();
  if (hypothesisLines.length > shown) {
    await page.getByTestId('composition-rows-toggle').click();
    await expect(rows).toHaveCount(hypothesisLines.length);
  } else await expect(page.getByTestId('composition-rows-toggle')).toHaveCount(0);
  // the export buttons of the tab
  await openTab(page, '診斷');
  for (const name of ['開啟匯出視窗', '複製 Markdown 報告', '下載完整 JSON 證據包', '列印報告']) await expect(page.getByRole('button', {name, exact: true})).toBeVisible();
  expect(errors).toEqual([]);
});

test('輸入與校正：峰表收合、每張光譜有校正狀態與「到第 2 頁調整」；未提供的光譜併成一行', async ({page}) => {
  test.setTimeout(150000);
  await analyse(page, 'C15H16O2');
  await openTab(page, '輸入與校正');
  const ir = page.getByTestId('input-summary-IR');
  await expect(ir).toBeVisible();
  await expect(ir.getByTestId('input-peaks-IR')).not.toHaveAttribute('open', '');
  await ir.getByTestId('input-peaks-IR').locator('summary').click();
  expect(await ir.locator('tbody tr').count()).toBeGreaterThanOrEqual(10); // the curve's own peaks plus the ten marks; at most the first 20 rows are listed
  await expect(page.getByTestId('input-summary-1H_NMR')).toContainText('溶劑：未宣告');
  await expect(page.getByTestId('input-summary')).toContainText('未提供：¹³C、MS、MS/MS、ToF-SIMS（不當成反證）');
  await ir.getByRole('button', {name: '到第 2 頁調整'}).click();
  await expect(page.getByRole('button', {name: /^第 2 頁.*座標校正/})).toBeVisible();
  await expect(page.getByTestId('ir-calibration-panel')).toBeVisible();
});

test('分頁列鍵盤：← → Home End 切換分頁並移動焦點，只有目前分頁在 Tab 順序內；role 結構正確', async ({page}) => {
  test.setTimeout(150000);
  await analyse(page, 'C15H16O2');
  await expect(page.getByRole('tablist')).toHaveCount(1);
  await expect(page.getByRole('tabpanel', {includeHidden: true})).toHaveCount(5);
  const tab = (name: RegExp) => page.getByRole('tab', {name});
  await expect(tab(/圖譜官能基/)).toHaveAttribute('tabindex', '0');
  await expect(tab(/預測結構/)).toHaveAttribute('tabindex', '-1');
  await tab(/圖譜官能基/).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab(/預測結構/)).toHaveAttribute('aria-selected', 'true');
  await expect(tab(/預測結構/)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(tab(/輸入與校正/)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(tab(/分子式與搜尋/)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(tab(/診斷/)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight'); // wraps to the first tab
  await expect(tab(/圖譜官能基/)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft'); // and back to the last
  await expect(tab(/診斷/)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tab(/圖譜官能基/)).toHaveAttribute('aria-selected', 'true');
  // the tab focused by the keyboard (Home) draws a focus ring
  await expect(tab(/圖譜官能基/)).toBeFocused();
  const outline = await tab(/圖譜官能基/).evaluate(el => { const c = getComputedStyle(el); return {style: c.outlineStyle, width: c.outlineWidth, focusVisible: el.matches(':focus-visible')}; });
  expect(outline).toMatchObject({focusVisible: true});
  expect(outline.style).not.toBe('none');
  expect(parseFloat(outline.width)).toBeGreaterThan(0);
  // each panel is labelled by its tab
  await expect(page.getByTestId('result-panel-diag')).toHaveAttribute('aria-labelledby', 'result-tab-diag');
});
