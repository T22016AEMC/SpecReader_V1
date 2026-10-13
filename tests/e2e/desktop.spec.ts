import {test,expect} from '@playwright/test';
test('正式桌面首頁、雙模式、API 與本地 WASM 資源',async({page,request})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const health=await request.get('/api/health');expect(health.status()).toBe(200);
  expect((await health.json()).localScientificEngines).toBe(true);
  const wasm=await request.get('/rdkit/RDKit_minimal.wasm');expect(wasm.status()).toBe(200);
  expect(wasm.headers()['content-type']).toContain('application/wasm');
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Mode A：實驗證據 → 官能基判讀 → 候選結構推論'})).toBeVisible();
  await page.getByRole('button',{name:'Mode B：輸入結構 → 預測光譜'}).click();
  await expect(page.getByText('Mode B',{exact:false}).first()).toBeVisible();
  await page.getByRole('button',{name:'Mode A：實驗證據 → 官能基判讀 → 候選結構推論'}).click();
  await expect(page.getByText('Mode A 輸入證據中心',{exact:false})).toBeVisible();
  await page.reload();await expect(page.getByText('Mode A 輸入證據中心',{exact:false})).toBeVisible();
  await page.screenshot({path:'validation/desktop-home.png'});
  expect(errors).toEqual([]);
});
