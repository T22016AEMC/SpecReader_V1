import {test,expect} from '@playwright/test';
test('IR 真實取樣的寬窄自動判斷、人工覆寫及非機率證據顯示',async({page})=>{
 test.setTimeout(90000);let workers=0;page.on('worker',()=>workers++);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 const data='wavenumber,Absorbance\n'+Array.from({length:401},(_,i)=>`${3100+i},${Math.exp(-.5*((3100+i-3300)/12)**2)}`).join('\n');
 await page.locator('input[type=file]').first().setInputFiles({name:'geometry-only.csv',mimeType:'text/csv',buffer:Buffer.from(data)});
 const form=page.locator('form').filter({has:page.getByRole('button',{name:'新增標記',exact:true})});await form.locator('input[type=number]').nth(0).fill('3300');await form.locator('input[type=number]').nth(1).fill('1');await form.getByRole('button',{name:'新增標記',exact:true}).click();
 const row=page.getByTestId('observation-row').filter({has:page.locator('input[value="3300"]')}).first(),shape=row.getByRole('combobox');await expect(shape).toHaveValue('sharp');await expect(shape.locator('option:not([hidden])')).toHaveText(['窄峰（Narrow band）','寬峰（Broad band）']);
 await shape.selectOption('broad');await row.getByLabel(/備註/).fill('人工外觀覆寫');await expect(shape).toHaveValue('broad');await expect(row.getByLabel(/寬峰起點|寬峰終點|峰寬/)).toHaveCount(0);expect(workers).toBe(0);
 await page.getByRole('button',{name:/^第 3 頁.*化學判讀/}).click();expect(workers).toBe(0);await page.getByRole('button',{name:'開始分析',exact:true}).click();await expect(page.getByTestId('analysis-control')).toHaveAttribute('data-result-current','true',{timeout:45000});expect(workers).toBe(1);
 await expect(page.getByText(/可信度\s*\d+%/)).toHaveCount(0);await expect(page.getByText('未提供確認（不等於缺失）',{exact:false}).first()).toBeVisible();
 await page.getByRole('button',{name:/^第 1 頁/}).click();await expect(page.getByTestId('observation-row').filter({has:page.locator('input[value="3300"]')}).first().getByRole('combobox')).toHaveValue('broad');expect(errors).toEqual([]);
});
test('MS、MSMS、ToF 實驗條件在光譜層級保存，峰列只記實測值',async({page})=>{
 test.setTimeout(90000);let workers=0;page.on('worker',()=>workers++);await page.goto('/');
 for(const [index,name] of [[3,'MS'],[4,'MSMS'],[5,'TOF']] as const){
 await page.locator('input[type=file]').nth(index).setInputFiles({name:name+'.csv',mimeType:'text/csv',buffer:Buffer.from('m/z,intensity\n101,100\n83,50')});
 const panel=page.getByTestId('mass-experiment-conditions');await expect(panel).toBeVisible();await page.getByLabel('MS 離子模式',{exact:true}).selectOption('Negative');await page.getByLabel('MS 量測條件備註',{exact:true}).fill('儀器條件記錄 '+name);
 if(index===4){await page.getByLabel('MSMS 前驅離子',{exact:true}).fill('101');await page.getByLabel('MSMS 活化方法',{exact:true}).selectOption('CID');await page.getByLabel('MSMS 碰撞能量',{exact:true}).fill('20');}
 const row=page.getByTestId('observation-row').first();await expect(row.getByRole('combobox')).toHaveCount(0);await row.getByLabel(/相對強度/).fill('75');await row.getByLabel(/備註/).fill('實測峰');await expect(page.getByLabel('MS 離子模式',{exact:true})).toHaveValue('Negative');expect(workers).toBe(0);
 }
});
