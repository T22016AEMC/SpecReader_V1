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
  await page.getByPlaceholder('輸入有效 SMILES（例如 CC(=O)Oc1ccccc1C(=O)O）或化合物名稱...').fill('CCO');
  await page.getByRole('button',{name:'MS/MS 可能碎片'}).click();
  await page.getByRole('button',{name:'ToF-SIMS 表面離子假設'}).click();
  await page.getByRole('button',{name:'執行反向光譜預測',exact:true}).click();
  await expect(page.getByText('C2H6O',{exact:false}).first()).toBeVisible();
  await expect(page.locator('svg').first()).toBeVisible();
  await page.getByRole('button',{name:'Mode A：實驗證據 → 官能基判讀 → 候選結構推論'}).click();
  await expect(page.getByText('Mode A 輸入證據中心',{exact:false})).toBeVisible();
  await page.reload();await expect(page.getByText('Mode A 輸入證據中心',{exact:false})).toBeVisible();
  await page.screenshot({path:'validation/desktop-home.png'});
  expect(errors).toEqual([]);
});
test('Mode A CSV、人工標峰、校正頁與候選排名',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles({name:'synthetic-ir.csv',mimeType:'text/csv',buffer:Buffer.from('wavenumber,relative intensity\n3350,70\n1050,100\n2920,40')});
  await expect(page.getByText('synthetic-ir.csv',{exact:false}).first()).toBeVisible();
  const form=page.locator('form').filter({has:page.getByRole('button',{name:'新增標記',exact:true})});
  await form.locator('input[type=number]').nth(0).fill('1715');
  await form.locator('input[type=number]').nth(1).fill('85');
  await form.getByRole('button',{name:'新增標記',exact:true}).click();
  await page.getByRole('button',{name:/^第 2 頁.*座標校正/}).click();
  await page.getByRole('button',{name:/^第 3 頁.*化學判讀/}).click();await page.getByLabel('分子式（選填）',{exact:true}).fill('C3H6O');await page.getByRole('button',{name:'開始分析',exact:true}).click();await expect(page.getByTestId('analysis-control')).toHaveAttribute('data-result-current','true',{timeout:45000});
  await expect(page.getByText('化學判讀與結構推論（Interpretation）',{exact:false}).first()).toBeVisible();
  await expect(page.getByText('模型相容度：',{exact:false}).first()).toBeVisible({timeout:30000});
  expect(errors).toEqual([]);
});
const independentInputs=[
  ['IR','wavenumber,relative intensity\n1715,100\n2920,40'],
  ['H1','ppm,intensity,integration,multiplicity\n1.2,100,3,t\n3.6,70,2,q'],
  ['C13','ppm,intensity\n18,100\n58,80'],
  ['MS','m/z,intensity\n46,100\n31,80'],
  ['MSMS','m/z,intensity\n47,80\n29,100'],
  ['TOF','m/z,intensity\n31,100\n43,70'],
];
for(const [index,[name,data]] of independentInputs.entries())test(`桌面單獨 ${name} 上傳及判讀，不要求分子式`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('input[type=file]').nth(index)).toBeAttached();
  await page.locator('input[type=file]').nth(index).setInputFiles({name:`synthetic-${name}.csv`,mimeType:'text/csv',buffer:Buffer.from(data)});
  await expect(page.getByText(`synthetic-${name}.csv`,{exact:false}).first()).toBeVisible();
  await page.getByRole('button',{name:/^第 3 頁.*化學判讀/}).click();await page.getByRole('button',{name:'開始分析',exact:true}).click();await expect(page.getByTestId('analysis-control')).toHaveAttribute('data-result-current','true',{timeout:45000});
  await expect(page.getByText('化學判讀與結構推論（Interpretation）',{exact:false}).first()).toBeVisible();
  expect(errors).toEqual([]);
});

