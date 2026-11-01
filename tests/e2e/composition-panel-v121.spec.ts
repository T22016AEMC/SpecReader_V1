import {test, expect, type Page} from '@playwright/test';
// v1.2.1 A class in the composition panel: the search plan block (O floor, S decision, rounds, "未搜尋" reasons), the round badges and the fixed limitation.
// SYNTHETIC peak tables only (a single-ring + alkyl shape written for this test); the tests check wording and behaviour, never chemical accuracy.
// The panel is data driven: with the planning flag off (tests/v12/v121FlagGolden.test.ts) or with a user formula there is no plan, and none of these blocks exists.
async function analyse(page: Page, formula: string) {
  await page.goto('/');
  const ir = 'wavenumber,relative intensity\n3030,15\n2960,30\n1612,45\n1512,85\n1245,80\n1178,60\n1038,65\n830,75';
  const h1 = 'ppm,intensity,integration,multiplicity,J\n7.10,90,2,d,8.6\n6.82,90,2,d,8.6\n3.78,100,3,s,\n2.58,60,2,q,7.6\n1.21,70,3,t,7.6';
  await page.locator('input[type=file]').first().setInputFiles({name: 'observed-ir.csv', mimeType: 'text/csv', buffer: Buffer.from(ir)});
  await page.locator('input[type=file]').nth(1).setInputFiles({name: 'observed-1h.csv', mimeType: 'text/csv', buffer: Buffer.from(h1)});
  await page.getByRole('button', {name: /^第 3 頁.*化學判讀/}).click();
  if (formula) await page.getByLabel('分子式（選填）', {exact: true}).fill(formula);
  await page.getByRole('button', {name: '開始分析', exact: true}).click();
  await expect(page.getByTestId('analysis-control')).toHaveAttribute('data-result-current', 'true', {timeout: 90000});
  await page.getByTestId('composition-panel-summary').click();
}

test('沒填分子式：搜尋計畫區塊（O 下限來源、S 說明、輪次、未搜尋原因）、輪次徽章與兩輪限制句', async ({page}) => {
  test.setTimeout(150000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await analyse(page, '');
  const plan = page.getByTestId('composition-planning');
  await expect(plan).toBeVisible();
  await expect(plan).toContainText('搜尋計畫');
  await expect(page.getByTestId('composition-oxygen')).toContainText('O 下限');
  await expect(page.getByTestId('composition-oxygen')).toContainText('IR');
  await expect(page.getByTestId('composition-sulfur')).toHaveText('未考慮 S（沒有 S 專屬證據；組成層白名單不含 S）');
  await expect(page.getByTestId('composition-planning-summary')).toContainText('個分子式被搜尋');
  const reasons = page.getByTestId('composition-not-searched');
  await expect(reasons).toBeVisible();
  await expect(reasons).toContainText('未搜尋（');
  // round badges on the rows: every searched formula says its round, every other row says "未搜尋"
  const rounds = page.getByTestId('composition-round');
  expect(await rounds.count()).toBeGreaterThan(5);
  await expect(page.locator('[data-testid=composition-round][data-round=ROUND_1], [data-testid=composition-round][data-round=ROUND_2]').first()).toContainText('輪');
  await expect(page.locator('[data-testid=composition-round][data-round=NOT_SEARCHED]').first()).toHaveText('未搜尋');
  await expect(page.getByTestId('composition-search-cell').filter({hasText: '未搜尋（'}).first()).toBeVisible();
  await expect(page.getByTestId('composition-limitations')).toContainText('兩輪搜尋下，烯基讀法只給各 k 第一輪最高分者');
  // wording, no internal codes
  const text = await page.getByTestId('composition-panel').innerText();
  expect(text).not.toMatch(/ROUND1_STEP_CAP|VINYL_READINGS_NOT_RUN|ROUND1_NO_TEMPLATE_READING|OXYGEN_VARIANT_LIMIT|K_ROUND_ROBIN_FULL|H1_INFEASIBLE/);
  expect(errors).toEqual([]);
});

test('使用者填分子式（沒有搜尋計畫）：看不到搜尋計畫區塊、輪次徽章與兩輪限制句', async ({page}) => {
  test.setTimeout(150000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await analyse(page, 'C9H12O');
  await expect(page.getByTestId('composition-hypotheses')).toContainText('C9H12O');
  await expect(page.getByTestId('composition-planning')).toHaveCount(0);
  await expect(page.getByTestId('composition-round')).toHaveCount(0);
  await expect(page.getByTestId('composition-not-searched')).toHaveCount(0);
  await expect(page.getByTestId('composition-limitations')).not.toContainText('兩輪搜尋下');
  expect(errors).toEqual([]);
});
