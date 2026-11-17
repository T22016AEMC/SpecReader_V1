import {test, expect, type Page} from '@playwright/test';
import {openTab} from './helpers/ui';
// v1.4.1 stop 20 (B): the URL parameter ?exp=h1,ir and the diagnostic-summary line "已啟用實驗功能：…". The line comes from the report of the analysis WORKER (result.runtime.experiments, read from the worker's own
// configuration), so a line that shows up proves that the main thread's switch reached the worker. Synthetic hand-written ¹H table only; no real spectrum.
const h1 = 'ppm,intensity,integration,multiplicity,J\n7.08,90,4,d,8.6\n6.73,90,4,d,8.6\n4.75,40,2,br s,\n1.62,100,6,s,';
const LINE = '已啟用實驗功能：';
// v1.4.2 stop 36 (E): h1, ir and ir2 are on by default since 1.4.2, so the worker reports them on every analysis; ?exp=h1 / ir / ir2 no longer change anything.
// The expected lines below were changed from 'no line' / 'only the named one' to this default line (an E2E test cannot switch the worker configuration back; listed in STOP36_REPORT E).
const DEFAULT_LINE = `${LINE}¹H 新規則／IR 新規則／IR 第二輪（烯烴面外彎曲）`;

async function analyseAt(page: Page, url: string) {
  await page.goto(url);
  await page.locator('input[type=file]').nth(1).setInputFiles({name: 'exp-1h.csv', mimeType: 'text/csv', buffer: Buffer.from(h1)});
  await page.getByRole('button', {name: /^第 3 頁.*化學判讀/}).click();
  await page.getByLabel('分子式（選填）', {exact: true}).fill('C15H16O2');
  await page.getByRole('button', {name: '開始分析', exact: true}).click();
  await expect(page.getByTestId('analysis-control')).toHaveAttribute('data-result-current', 'true', {timeout: 90000});
  await openTab(page, '診斷');
  const preview = page.getByTestId('diagnostic-preview');
  await expect(preview).toBeVisible();
  return (await preview.textContent()) ?? '';
}

test('沒有 exp 參數：診斷摘要的「已啟用實驗功能」一行列出預設開啟的三組（1.4.2 起）', async ({page}) => {
  test.setTimeout(150000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const summary = await analyseAt(page, '/');
  expect(summary).toContain('SpecReader 診斷摘要');
  expect(summary.split('\n').filter(l => l.includes(LINE))).toEqual([DEFAULT_LINE]);
  // unknown values are ignored, not an error, and change nothing either
  const ignored = await analyseAt(page, '/?exp=foo,,bar');
  expect(ignored.split('\n').filter(l => l.includes(LINE))).toEqual([DEFAULT_LINE]);
  expect(errors).toEqual([]);
});

test('?exp=ir：IR 新規則已是預設，診斷摘要與不帶參數相同（由分析 Worker 回報）；重新整理不帶參數也相同', async ({page}) => {
  test.setTimeout(150000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const summary = await analyseAt(page, '/?exp=ir');
  expect(summary.split('\n').filter(l => l.includes(LINE))).toEqual([DEFAULT_LINE]);
  // nothing is stored: the same page without the parameter is the default again
  const again = await analyseAt(page, '/');
  expect(again.split('\n').filter(l => l.includes(LINE))).toEqual([DEFAULT_LINE]);
  expect(errors).toEqual([]);
});

// v1.4.2 stop 25 (3): ?exp=ir2 (IR round 2, alkene out-of-plane bands: useV142IR on, the default-off negative-evidence sub-flag stays off) and the combination with the v1.4.1 names.
test('?exp=ir2：IR 第二輪已是預設，診斷摘要與不帶參數相同、沒有負向證據那一行；與 ir 並用也相同', async ({page}) => {
  test.setTimeout(200000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const summary = await analyseAt(page, '/?exp=ir2');
  expect(summary.split('\n').filter(l => l.includes(LINE))).toEqual([DEFAULT_LINE]);
  expect(summary).not.toContain('負向證據');
  const both = await analyseAt(page, '/?exp=ir,ir2');
  expect(both.split('\n').filter(l => l.includes(LINE))).toEqual([DEFAULT_LINE]);
  const again = await analyseAt(page, '/');
  expect(again.split('\n').filter(l => l.includes(LINE))).toEqual([DEFAULT_LINE]);
  expect(errors).toEqual([]);
});
