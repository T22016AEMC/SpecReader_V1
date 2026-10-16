import {test,expect} from '@playwright/test';
test('六步驟 Worker 顯示實際階段、可取消並保留局部資訊；重新分析繪製完整圖',async({page})=>{
 test.setTimeout(90000);let workers=0;const errors:string[]=[],externalCalls:string[]=[];
 page.on('worker',()=>workers++);page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(/generativelanguage|api\.openai|anthropic|\/api\/ai-reasoning/.test(r.url()))externalCalls.push(r.url());});
 await page.goto('/');
 await page.locator('input[type=file]').nth(1).setInputFiles({name:'observations.csv',mimeType:'text/csv',buffer:Buffer.from('ppm,intensity,integration,multiplicity,J\n6.9,80,2,d,8\n7.3,90,2,d,8')});
 await page.getByRole('button',{name:/^第 3 頁.*化學判讀/}).click();
 const formula=page.getByLabel('分子式（選填）',{exact:true});await formula.fill('C50H50O4');expect(workers).toBe(0);
 await page.getByRole('button',{name:'開始分析',exact:true}).click();
 await expect(page.getByTestId('local-structure-plan')).toBeVisible({timeout:30000});
 await expect(page.getByTestId('analysis-progress')).toContainText(/步驟[34]\/6/);
 // DOM interaction while the Worker is active proves the main thread can respond.
 await page.getByTestId('analysis-cancel').click();
 await expect(page.getByTestId('generation-status')).toHaveAttribute('data-code','CANCELLED',{timeout:30000});
 await expect(page.getByTestId('local-structure-plan')).toBeVisible();
 for(let i=1;i<=6;i++)await expect(page.getByTestId(`reasoning-step-${i}`)).toBeVisible();
 expect(workers).toBe(1);await formula.fill('C2H6O');
 await expect(page.getByTestId('analysis-control')).toHaveAttribute('data-result-current','false');expect(workers).toBe(1);
 await page.getByRole('button',{name:'開始分析',exact:true}).click();
 await expect(page.getByTestId('analysis-control')).toHaveAttribute('data-result-current','true',{timeout:45000});
 const graph=page.getByTestId('molecular-depiction').first();await expect(graph).toHaveAttribute('data-formula','C2H6O',{timeout:15000});
 await expect(graph).toHaveAttribute('data-atom-count','3');await expect(graph.locator('svg')).toBeVisible();
 expect(Number(await graph.getAttribute('data-bond-count'))).toBe(2);await expect(graph.getByRole('alert')).toHaveCount(0);
 await expect(page.getByTestId('candidate-reasoning').first()).toBeVisible();
 expect(workers).toBe(2);expect(errors).toEqual([]);expect(externalCalls).toEqual([]);
});
