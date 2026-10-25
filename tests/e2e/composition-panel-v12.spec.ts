import {test,expect,type Page} from '@playwright/test';
// v1.2.0 1H-constraint sections of the composition panel (docs/P1C_PANEL_DESIGN.md), the candidate-card provenance and the no-candidate explanation.
// useV12Constraints is true by default in 1.2.0, so these run the real flow. SYNTHETIC peak tables only; the tests check wording and behaviour, never chemical accuracy.
async function analyse(page:Page,h1:string,formula:string,ir?:string){
 await page.goto('/');
 if(ir)await page.locator('input[type=file]').first().setInputFiles({name:'observed-ir.csv',mimeType:'text/csv',buffer:Buffer.from(ir)});
 await page.locator('input[type=file]').nth(1).setInputFiles({name:'observed-1h.csv',mimeType:'text/csv',buffer:Buffer.from(h1)});
 await page.getByRole('button',{name:/^第 3 頁.*化學判讀/}).click();
 await page.getByLabel('分子式（選填）',{exact:true}).fill(formula);
 await page.getByRole('button',{name:'開始分析',exact:true}).click();
 await expect(page.getByTestId('analysis-control')).toHaveAttribute('data-result-current','true',{timeout:90000});
}
const ETHER_FREE_CSV='ppm,intensity,integration,multiplicity,J\n6.84,90,4,s,\n3.77,100,6,s,';

test('1H 原子清單區段預設展開、約束區段預設收合；訊號表、必含子結構與固定評分句；候選卡片顯示組裝來歷',async({page})=>{
 test.setTimeout(150000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await analyse(page,ETHER_FREE_CSV,'C8H10O2');
 const panel=page.getByTestId('composition-panel');
 await expect(panel).not.toHaveAttribute('open','');
 await page.getByTestId('composition-panel-summary').click();
 await expect(panel).toHaveAttribute('open','');
 const inv=page.getByTestId('composition-inventory');
 await expect(inv).toBeVisible();await expect(inv).toHaveAttribute('open','');
 await expect(inv).toContainText('由 1H 推得的原子清單');
 await expect(page.getByTestId('composition-inventory-status').first()).toContainText('1H 原子清單：');
 const rows=page.getByTestId('composition-inventory-signals').first().locator('tbody tr');
 await expect(rows).toHaveCount(2);
 await expect(page.getByTestId('composition-inventory-signals').first()).toContainText('位移類別');
 await expect(page.getByTestId('composition-inventory-signals').first()).toContainText('芳香 CH');
 await expect(page.getByTestId('composition-inventory-combinations').first()).toContainText('k=2，額外可交換 H=0');
 await expect(inv).toContainText('位移類別的數值是工程預設，未校準');
 const cons=page.getByTestId('composition-constraints');
 await expect(cons).toBeVisible();await expect(cons).not.toHaveAttribute('open','');
 await cons.locator('summary').first().click();
 await expect(cons).toHaveAttribute('open','');
 await expect(page.getByTestId('composition-scoring')).toHaveText('評分（雙向）：雙向評分見各候選的證據清單');
 await expect(page.getByTestId('composition-exclusions')).toBeVisible();
 // the panel does not show internal codes
 const text=await panel.innerText();
 expect(text).not.toMatch(/ARO_CH|ALKYL_CH|VINYL_READINGS_BUDGET|V12_CONSTRAINTS_FALLBACK|INVENTORY_ALTERNATIVES_TRUNCATED/);
 // candidate card: provenance in readable Chinese
 const reasoning=page.getByTestId('candidate-reasoning').first();
 await reasoning.locator('summary').click();
 const assembly=reasoning.getByTestId('candidate-v12-assembly');
 await expect(assembly).toContainText('1H 原子清單讀法：k=2');
 await expect(assembly).toContainText('δ 6.84 ppm（4H）');
 await expect(assembly).toContainText('葉端檢查：');
 expect(await assembly.innerText()).not.toMatch(/ARO_CH|STRONG_CARBONYL|AROMATIC|inv-k/);
 // the new objection / support lines on the card are readable
 const card=page.getByTestId('candidate-source').first();
 await expect(card).toContainText('候選來源：窮舉器');
 expect(errors).toEqual([]);
});

test('1H 約束退回：摘要列出現琥珀色徽章、原因文字；候選來源標示「1H 約束未套用」；結果不標完整',async({page})=>{
 test.setTimeout(150000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // H = 12 cannot be explained by the integrals 3:2:2 (S = 7, k ≤ 3, up to 2 unobserved OH): the inventory is unusable
 await analyse(page,'ppm,intensity,integration,multiplicity,J\n2.3,100,3,s,\n7.1,90,2,d,2\n7.0,90,2,d,2','C7H12');
 const summary=page.getByTestId('composition-panel-summary');
 const badge=summary.getByTestId('composition-badge').filter({hasText:'1H 約束未能套用（已退回）'});
 await expect(badge).toHaveCount(1);await expect(badge).toHaveAttribute('data-badge','V12_FALLBACK');await expect(badge).toHaveClass(/amber/);
 await summary.click();
 await expect(page.getByTestId('composition-inventory-reason').first()).toContainText('原因：');
 await expect(page.getByTestId('composition-inventory-reason').first()).toContainText('不相容');
 await expect(page.getByTestId('composition-search-cell').first()).toContainText('未完整');
 const src=page.getByTestId('candidate-source').first();
 await expect(src).toContainText('1H 約束未套用');
 expect(errors).toEqual([]);
});

test('沒有任何候選時，候選區域顯示中文說明：主句、被擋掉的結構、沒跑完的部分、建議，且不顯示內部代碼',async({page})=>{
 test.setTimeout(170000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // a strong C≡N band (the nitrile is then a required substructure on every path) in a formula without N: nothing can satisfy it
 await analyse(page,'ppm,intensity,integration,multiplicity,J\n2.3,100,3,s,\n7.1,90,2,d,2\n7.0,90,2,d,2','C14H24O2','wavenumber,relative intensity\n2230,100\n2950,40');
 const z=page.getByTestId('zero-candidate-explanation');
 await expect(z).toBeVisible();
 await expect(page.getByTestId('zero-candidate-headline')).toHaveText('在預算內找不到符合 1H 約束與強證據的結構');
 await expect(z).toContainText('被擋掉的結構');
 await expect(z.getByTestId('zero-candidate-blocked').or(z.getByTestId('zero-candidate-blocked-empty'))).toBeVisible();
 const text=await z.innerText();
 expect(text).not.toMatch(/STATE_BUDGET|TIME_BUDGET|VINYL_READINGS_BUDGET|NITRILE|FALLBACK|PLAUSIBILITY/);
 expect(errors).toEqual([]);
});
