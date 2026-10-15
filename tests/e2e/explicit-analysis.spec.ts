import {test,expect} from '@playwright/test';
test('只有開始分析建立 Worker；編輯與跨頁不推論，C15 組成正確回報搜尋界限',async({page})=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));let workers=0;page.on('worker',()=>workers++);
 await page.goto('/');await page.locator('input[type=file]').first().setInputFiles({name:'observed.csv',mimeType:'text/csv',buffer:Buffer.from('wavenumber,relative intensity\n1715,80\n2920,30')});
 await page.getByRole('button',{name:/^第 3 頁.*化學判讀/}).click();await expect(page.getByTestId('analysis-control')).toHaveAttribute('data-analysis-runs','0');expect(workers).toBe(0);
 const formula=page.getByLabel('分子式（選填）',{exact:true});await formula.fill('C2H6O');expect(workers).toBe(0);
 await page.getByRole('button',{name:'開始分析',exact:true}).click();await expect(page.getByTestId('analysis-control')).toHaveAttribute('data-result-current','true',{timeout:45000});expect(workers).toBe(1);await expect(page.getByTestId('analysis-control')).toHaveAttribute('data-worker-rdkit','true');await expect(page.getByTestId('generation-status')).toHaveAttribute('data-code','CANDIDATES_FOUND');
 await formula.fill('C15H16O2');await expect(page.getByRole('status').filter({hasText:'資料已變更'})).toBeVisible();expect(workers).toBe(1);await expect(page.getByTestId('analysis-control')).toHaveAttribute('data-analysis-runs','1');
 await page.getByRole('button',{name:'開始分析',exact:true}).click();await expect(page.getByTestId('analysis-control')).toHaveAttribute('data-result-current','true',{timeout:45000});expect(workers).toBe(2);await expect(page.getByTestId('generation-status')).not.toHaveAttribute('data-code','CHEMICALLY_INVALID_FORMULA');await expect(page.getByTestId('generation-status')).toContainText('C15H16O2');expect(errors).toEqual([]);
});
