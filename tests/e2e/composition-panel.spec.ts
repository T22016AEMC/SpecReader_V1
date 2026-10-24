import {test,expect,type Page} from '@playwright/test';
// P1b composition panel. Synthetic input only (a two-row IR table and a user formula); the tests check the panel's behaviour and
// wording, never chemical accuracy. IR 1715 gives a carbonyl reading that cannot hold C2H6O, so the run is relaxed to formula-only.
async function analyse(page:Page,formulaText='C2H6O'){
 await page.goto('/');
 await page.locator('input[type=file]').first().setInputFiles({name:'observed.csv',mimeType:'text/csv',buffer:Buffer.from('wavenumber,relative intensity\n1715,80\n2920,30')});
 await page.getByRole('button',{name:/^第 3 頁.*化學判讀/}).click();
 await page.getByLabel('分子式（選填）',{exact:true}).fill(formulaText);
 await page.getByRole('button',{name:'開始分析',exact:true}).click();
 await expect(page.getByTestId('analysis-control')).toHaveAttribute('data-result-current','true',{timeout:60000});
}
test('組成推斷面板：預設收合；展開後有未校準、完整與約束說明；資料變更後標示舊結果',async({page})=>{
 test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await analyse(page);
 const panel=page.getByTestId('composition-panel');
 await expect(panel).toBeVisible();
 await expect(panel).not.toHaveAttribute('open','');
 await expect(page.getByTestId('composition-panel-summary')).toContainText('組成推斷（分子式假設）｜使用者分子式（硬限制）｜1 個分子式假設｜窮舉：完整（COMPLETE）');
 await page.getByTestId('composition-panel-summary').click();
 await expect(panel).toHaveAttribute('open','');
 const table=page.getByTestId('composition-hypotheses');
 await expect(table).toContainText('相對信心（未校準）');
 await expect(table).toContainText('C2H6O');
 await expect(table.getByTestId('composition-search-cell')).toContainText('完整（COMPLETE）');
 await expect(table.getByTestId('composition-search-cell')).toContainText('只相對於目前分子式與片段約束');
 const confidence=table.getByTestId('composition-confidence').first();
 expect(await confidence.innerText()).not.toContain('%');
 expect(await confidence.getAttribute('title')).toMatch(/^各假設間的相對比較，不是機率，也沒有以實測準確度校準：\d/);
 await expect(page.getByTestId('composition-limitations')).toContainText('相對信心沒有校準');
 await expect(page.getByTestId('composition-overview')).toContainText('未評分的候選沒有被排除，只是沒有進入完整評分。');
 await page.getByLabel('分子式（選填）',{exact:true}).fill('C15H16O2');
 await expect(page.getByTestId('composition-panel-summary')).toContainText('資料已變更，以下為舊結果');
 expect(errors).toEqual([]);
});
test('約束被放寬時，收合狀態下摘要列可見琥珀色徽章；候選卡片標示來源',async({page})=>{
 test.setTimeout(120000);
 await analyse(page);
 const panel=page.getByTestId('composition-panel');
 await expect(panel).not.toHaveAttribute('open','');
 const badge=page.getByTestId('composition-panel-summary').getByTestId('composition-badge');
 await expect(badge).toHaveCount(1);
 await expect(badge).toBeVisible();
 await expect(badge).toHaveText('約束已放寬（只依分子式）');
 await expect(badge).toHaveAttribute('data-badge','RELAXED');
 await expect(badge).toHaveClass(/amber/);
 const src=page.getByTestId('candidate-source').first();
 await expect(src).toContainText('候選來源：窮舉器｜約束已放寬');
});
