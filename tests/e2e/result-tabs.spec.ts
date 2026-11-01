import {test, expect, type Page} from '@playwright/test';
import {openTab} from './helpers/ui';
// v1.2.2 P3. The result page (page 3): five tabs that are all rendered and only hidden, the fixed one-line data check, and which tab opens when.
// Synthetic engineering fixtures only (hand-written peak tables, a canvas-drawn axis box with a curve); no experimental spectrum, no benchmark data.
const drawImage = (page: Page) => page.evaluate(() => { const c = document.createElement('canvas'); c.width = 1000; c.height = 600; const x = c.getContext('2d')!; x.fillStyle = 'white'; x.fillRect(0, 0, 1000, 600); x.strokeStyle = 'black'; x.strokeRect(80, 40, 870, 490); x.strokeStyle = '#1455dd'; x.lineWidth = 2; x.beginPath(); for (let px = 82; px <= 948; px++) { const y = 115 + 90 * Math.exp(-Math.pow((px - 280) / 60, 2)) + 150 * Math.exp(-Math.pow((px - 650) / 12, 2)); if (px === 82) x.moveTo(px, y); else x.lineTo(px, y); } x.stroke(); return c.toDataURL('image/png'); });
const ir = 'wavenumber,relative intensity\n3350,70\n2920,30\n1715,80\n1050,100';
// the shape of the hand-written fixture S1 (a phenol-like pattern, no carbonyl band), %Transmittance
const irPhenol = 'wavenumber,%Transmittance\n' + [[4000, 99], [3350, 25], [3030, 80], [2965, 70], [1612, 60], [1510, 20], [1440, 65], [1235, 30], [1175, 45], [830, 28], [560, 60], [450, 99]].map(r => r.join(',')).join('\n');

async function analyseEthanolLike(page: Page) {
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles({name: 'tabs-ir.csv', mimeType: 'text/csv', buffer: Buffer.from(ir)});
  await page.getByRole('button', {name: /^第 3 頁.*化學判讀/}).click();
  await page.getByLabel('分子式（選填）', {exact: true}).fill('C2H6O');
  await page.getByRole('button', {name: '開始分析', exact: true}).click();
  await expect(page.getByTestId('analysis-control')).toHaveAttribute('data-result-current', 'true', {timeout: 90000});
}

test('分頁切換與隱藏渲染：五個分頁都在 DOM、測試用標記各一個、展開狀態不因切換而丟失、步驟列以外沒有「第 N 頁」開頭的按鈕', async ({page}) => {
  test.setTimeout(150000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await analyseEthanolLike(page);
  // default tab after an analysis finished: 圖譜官能基
  await expect(page.getByRole('tab', {name: /圖譜官能基/})).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab')).toHaveCount(5);
  // every panel is rendered; only the open one is visible
  for (const id of ['fg', 'pred', 'formula', 'input', 'diag']) await expect(page.getByTestId(`result-panel-${id}`)).toHaveCount(1);
  await expect(page.getByTestId('result-panel-fg')).toBeVisible();
  for (const id of ['pred', 'formula', 'input', 'diag']) await expect(page.getByTestId(`result-panel-${id}`)).toBeHidden();
  // hidden panels keep their test markers in the DOM
  await expect(page.getByTestId('composition-panel')).toHaveCount(1);
  await expect(page.getByTestId('composition-panel')).toBeHidden();
  expect(await page.getByTestId('candidate-reasoning').count()).toBeGreaterThan(0);
  // one analysis bar, one status line with this wording, one data check, one analysis-process card
  await expect(page.getByTestId('analysis-control')).toHaveCount(1);
  await expect(page.getByTestId('data-check')).toHaveCount(1);
  await expect(page.getByTestId('six-step-reasoning')).toHaveCount(1);
  await expect(page.getByTestId('generation-status')).toHaveCount(1);
  await expect(page.getByRole('status')).toHaveCount(1);
  // an opened <details> keeps its state while another tab is shown
  await openTab(page, '分子式與搜尋');
  await expect(page.getByTestId('composition-panel')).toBeVisible();
  await page.getByTestId('composition-panel-summary').click();
  await expect(page.getByTestId('composition-hypotheses')).toBeVisible();
  await openTab(page, '預測結構');
  await expect(page.getByTestId('composition-panel')).toBeHidden();
  await openTab(page, '分子式與搜尋');
  await expect(page.getByTestId('composition-hypotheses')).toBeVisible();
  // the buttons between the first two tabs
  await openTab(page, '預測結構');
  await page.getByRole('button', {name: /回圖譜官能基/}).click();
  await expect(page.getByRole('tab', {name: /圖譜官能基/})).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', {name: /看預測結構/}).click();
  await expect(page.getByRole('tab', {name: /預測結構/})).toHaveAttribute('aria-selected', 'true');
  // the analysis process card is only in the diagnosis tab once the analysis has finished
  await expect(page.getByTestId('result-panel-diag').getByTestId('six-step-reasoning')).toHaveCount(1);
  // A13: only the three step buttons start with 「第 N 頁」
  const names = await page.locator('button, a').evaluateAll(list => list.map(el => (el.getAttribute('aria-label') || el.textContent || '').trim()));
  expect(names.filter(n => /^第 [123] 頁/.test(n))).toHaveLength(3);
  expect(errors).toEqual([]);
});

test('資料檢查固定行：¹H 圖片未校正→琥珀＋⚠（步驟列也有 ⚠）；兩點校正後→綠', async ({page}) => {
  test.setTimeout(90000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  // no spectrum: no data-check line
  await page.getByRole('button', {name: /^第 3 頁.*化學判讀/}).click();
  await expect(page.getByTestId('data-check')).toHaveCount(0);
  await page.getByRole('button', {name: /^第 1 頁/}).click();
  const image = await drawImage(page);
  await page.locator('input[type=file]').nth(1).setInputFiles({name: 'check-1h.png', mimeType: 'image/png', buffer: Buffer.from(image.split(',')[1], 'base64')});
  // declare the solvent and the frequency so that the calibration is the only open question
  await page.getByLabel('氘代溶劑').selectOption('CDCl3');
  await page.locator('select').filter({has: page.locator('option', {hasText: '500 MHz'})}).selectOption('500');
  await page.getByRole('button', {name: /^第 3 頁.*化學判讀/}).click();
  const bar = page.getByTestId('data-check');
  await expect(bar).toBeVisible();
  await expect(bar).toHaveAttribute('data-level', 'warn');
  await expect(bar).toContainText('¹H ⚠');
  await expect(bar).toContainText('有 ⚠ 項目');
  await expect(page.getByRole('button', {name: /^第 3 頁.*化學判讀.*⚠/})).toHaveCount(1);
  // the input tab carries the ⚠ count as well
  await expect(page.getByRole('tab', {name: /輸入與校正/})).toContainText('⚠ 1');
  // detail list floats over the content
  await page.getByRole('button', {name: '展開資料檢查明細'}).click();
  await expect(page.getByTestId('data-check-detail')).toContainText('預設座標');
  await page.getByRole('button', {name: '收合資料檢查明細'}).click();
  await expect(page.getByTestId('data-check-detail')).toHaveCount(0);
  // two-point calibration on page 2 turns the line green
  await page.getByRole('button', {name: /^第 2 頁.*座標校正/}).click();
  await page.getByRole('button', {name: /^¹H NMR/}).click();
  await page.getByRole('button', {name: /套用兩點線性座標校正並轉換/}).click();
  await expect(page.getByText(/兩點線性座標校正成功/)).toBeVisible();
  await page.getByRole('button', {name: /^第 3 頁.*化學判讀/}).click();
  await expect(bar).toHaveAttribute('data-level', 'ok');
  await expect(bar).toContainText('¹H ✓');
  await expect(bar).not.toContainText('有 ⚠ 項目');
  await expect(page.getByRole('button', {name: /^第 3 頁.*化學判讀.*⚠/})).toHaveCount(0);
  await expect(page.getByRole('tab', {name: /輸入與校正/})).not.toContainText('⚠');
  expect(errors).toEqual([]);
});

test('預設分頁：分析中與取消後停在「預測結構」並看到分析過程；重新分析完成後回到「圖譜官能基」，分析過程移到「診斷」', async ({page}) => {
  test.setTimeout(150000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').nth(1).setInputFiles({name: 'tabs-observations.csv', mimeType: 'text/csv', buffer: Buffer.from('ppm,intensity,integration,multiplicity,J\n6.9,80,2,d,8\n7.3,90,2,d,8')});
  await page.getByRole('button', {name: /^第 3 頁.*化學判讀/}).click();
  const formula = page.getByLabel('分子式（選填）', {exact: true});
  await formula.fill('C50H50O4');
  // before any analysis the first tab is open
  await expect(page.getByRole('tab', {name: /圖譜官能基/})).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', {name: '開始分析', exact: true}).click();
  await expect(page.getByRole('tab', {name: /預測結構/})).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('result-panel-pred').getByTestId('local-structure-plan')).toBeVisible({timeout: 30000});
  await expect(page.getByTestId('analysis-progress')).toContainText(/步驟[34]\/6/);
  await expect(page.getByTestId('analysis-progress')).toHaveCount(1);
  await page.getByTestId('analysis-cancel').click();
  await expect(page.getByTestId('generation-status')).toHaveAttribute('data-code', 'CANCELLED', {timeout: 30000});
  // after a cancel the process card stays on the prediction tab (one copy only)
  await expect(page.getByRole('tab', {name: /預測結構/})).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('six-step-reasoning')).toHaveCount(1);
  await expect(page.getByTestId('result-panel-pred').getByTestId('six-step-reasoning')).toBeVisible();
  for (let i = 1; i <= 6; i++) await expect(page.getByTestId(`reasoning-step-${i}`)).toBeVisible();
  // a finished re-analysis goes back to the first tab; the process card moves to the diagnosis tab
  await formula.fill('C2H6O');
  await page.getByRole('button', {name: '開始分析', exact: true}).click();
  await expect(page.getByTestId('analysis-control')).toHaveAttribute('data-result-current', 'true', {timeout: 60000});
  await expect(page.getByRole('tab', {name: /圖譜官能基/})).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('six-step-reasoning')).toHaveCount(1);
  await expect(page.getByTestId('result-panel-diag').getByTestId('six-step-reasoning')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('預測結構：前 3 名結論卡、其餘精簡列、最重要的一則警告、原地展開支持與矛盾、沒有 3 位以上小數', async ({page}) => {
  test.setTimeout(150000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').nth(0).setInputFiles({name: 'conclusion-ir.csv', mimeType: 'text/csv', buffer: Buffer.from(irPhenol)});
  const image = await drawImage(page);
  await page.locator('input[type=file]').nth(1).setInputFiles({name: 'conclusion-1h.png', mimeType: 'image/png', buffer: Buffer.from(image.split(',')[1], 'base64')});
  await page.getByLabel('氘代溶劑').selectOption('CDCl3');
  await page.locator('select').filter({has: page.locator('option', {hasText: '500 MHz'})}).selectOption('500');
  await page.getByRole('button', {name: /^第 3 頁.*化學判讀/}).click();
  await page.getByLabel('分子式（選填）', {exact: true}).fill('C15H16O2');
  await page.getByRole('button', {name: '開始分析', exact: true}).click();
  await expect(page.getByTestId('analysis-control')).toHaveAttribute('data-result-current', 'true', {timeout: 120000});
  await openTab(page, '預測結構');
  const panel = page.getByTestId('result-panel-pred');
  // the tab badge carries the candidate count and a ⚠ while a warning is open
  const total = Number((await page.getByRole('tab', {name: /預測結構/}).innerText()).match(/\d+/)![0]);
  expect(total).toBeGreaterThan(3);
  await expect(page.getByRole('tab', {name: /預測結構/})).toContainText('⚠');
  // exactly three conclusion cards, the rest are compact rows
  await expect(panel.getByTestId('conclusion-card')).toHaveCount(3);
  await expect(panel.getByTestId('compact-candidate')).toHaveCount(total - 3);
  // the top warning is the calibration one (an uncalibrated ¹H image outranks the other warnings) and links back to page 2
  await expect(panel.getByTestId('top-warning')).toHaveAttribute('data-kind', 'calibration');
  await expect(panel.getByTestId('top-warning')).toContainText('¹H 未經校正——排名可能不可靠');
  await expect(panel.getByTestId('top-warning').getByRole('button', {name: '回第 2 頁校正'})).toBeVisible();
  // each card: whole-number compatibility, a structure drawing, 1-3 reason lines, the source line, the collapsed reasoning
  for (const card of await panel.getByTestId('conclusion-card').all()) {
    await expect(card).toContainText(/模型相容度：\d+\/100/);
    await expect(card.getByTestId('molecular-depiction')).toBeVisible();
    const lines = await card.locator('ul > li').count();
    expect(lines).toBeGreaterThanOrEqual(1); expect(lines).toBeLessThanOrEqual(3);
    await expect(card.getByTestId('candidate-source')).toContainText('候選來源：');
    await expect(card.getByTestId('candidate-source')).not.toContainText('有界搜尋／未校準相容度');
    await expect(card.getByTestId('candidate-reasoning')).not.toHaveAttribute('open', '');
  }
  // the sentence about the bounded search is said once, in the block heading
  await expect(panel.getByTestId('conclusion-block').locator('h2 + p')).toContainText('有界搜尋');
  // nothing is open by default; the one-sentence search status keeps its data-code; the full text and the constraint summary are collapsed
  await expect(panel.locator('details[open]')).toHaveCount(0);
  await expect(panel.getByTestId('generation-status')).toHaveAttribute('data-code', /.+/);
  await expect(panel.getByTestId('conclusion-card').first().getByTestId('candidate-evidence')).toHaveCount(0);
  // 展開支持與矛盾 opens in place (no tab switch) and toggles
  await panel.getByRole('button', {name: '展開支持與矛盾'}).first().click();
  await expect(panel.getByTestId('conclusion-card').first().getByTestId('candidate-evidence')).toBeVisible();
  await expect(page.getByRole('tab', {name: /預測結構/})).toHaveAttribute('aria-selected', 'true');
  await panel.getByRole('button', {name: '收合支持與矛盾'}).first().click();
  await expect(panel.getByTestId('candidate-evidence')).toHaveCount(0);
  // a compact row opens to the full evidence, with its own drawing
  await panel.getByTestId('compact-candidate').first().getByRole('button', {name: '展開支持與矛盾'}).click();
  await expect(panel.getByTestId('compact-candidate').first().getByTestId('molecular-depiction')).toBeVisible();
  await expect(panel.getByTestId('compact-candidate').first().getByTestId('candidate-evidence')).toBeVisible();
  // number format and wording of the whole tab
  const text = await panel.innerText();
  expect(text.match(/\d+\.\d{3,}/g)).toBeNull();
  expect(text).not.toMatch(/可信度\s*\d+%/);
  expect(errors).toEqual([]);
});
