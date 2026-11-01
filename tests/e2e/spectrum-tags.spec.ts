import {test,expect,type Page} from '@playwright/test';
// v1.2.2 P2a. The six spectrum tags of page 1 replace the six cards: the file inputs must keep their number, their order and exist at load time
// (other specs address them as nth(0..5)); the calibration wording must never call the program's default frame "calibrated".
// Synthetic engineering fixtures only (a canvas-drawn axis box with a curve; tiny CSV tables), not experimental spectra.
const modalities=['IR','¹H NMR','¹³C NMR','MS','MS/MS','ToF-SIMS'];
const drawImage=(page:Page)=>page.evaluate(()=>{const c=document.createElement('canvas');c.width=1000;c.height=600;const x=c.getContext('2d')!;x.fillStyle='white';x.fillRect(0,0,1000,600);x.strokeStyle='black';x.strokeRect(80,40,870,490);x.strokeStyle='#1455dd';x.lineWidth=2;x.beginPath();for(let px=82;px<=948;px++){const y=115+90*Math.exp(-Math.pow((px-280)/60,2))+150*Math.exp(-Math.pow((px-650)/12,2));if(px===82)x.moveTo(px,y);else x.lineTo(px,y);}x.stroke();return c.toDataURL('image/png');});
const tag=(page:Page,label:string)=>page.getByRole('group',{name:'光譜檔案'}).locator('> div').filter({has:page.getByRole('button',{name:new RegExp('^'+label.replace(/[/¹³]/g,m=>m==='/'?'\/':m))})});

test('6 個檔案輸入，順序固定且載入時就存在',async({page})=>{
 await page.goto('/');
 const inputs=page.locator('input[type=file]');
 await expect(inputs).toHaveCount(6);                                   // no waiting for an upload: present at load
 const owners=await inputs.evaluateAll(list=>list.map(i=>i.closest('[role=group] > div')?.querySelector('button span')?.textContent?.trim()));
 expect(owners).toEqual(modalities);                                     // IR, ¹H, ¹³C, MS, MS/MS, ToF-SIMS in DOM order
 // the order is also what an upload does: file 1 lands on the ¹H tag, and nothing else changes
 await inputs.nth(1).setInputFiles({name:'order-check-1h.csv',mimeType:'text/csv',buffer:Buffer.from('ppm,intensity\n1.2,100')});
 await expect(tag(page,'¹H NMR')).toContainText('order-check-1h.csv');
 await expect(tag(page,'IR')).not.toContainText('.csv');
 await expect(inputs).toHaveCount(6);
 // unloaded tags offer only 「＋加入」
 await expect(tag(page,'¹³C NMR')).toContainText('＋加入');
});

test('校正狀態文字：CSV 是座標來自檔案；¹H 圖片預設座標不寫「已校正」；兩點校正後才寫已由你校正',async({page})=>{
 test.setTimeout(90000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await page.locator('input[type=file]').nth(0).setInputFiles({name:'status-ir.csv',mimeType:'text/csv',buffer:Buffer.from('wavenumber,relative intensity\n3350,70\n1050,100')});
 const csv=tag(page,'IR');
 await expect(csv).toContainText('座標來自檔案');await expect(csv).not.toContainText('已校正');await expect(csv).not.toContainText('已具備物理座標');
 await expect(csv.locator('[data-calibration-kind]')).toHaveAttribute('data-calibration-kind','NUMERIC');

 const image=await drawImage(page);
 await page.locator('input[type=file]').nth(1).setInputFiles({name:'status-1h.png',mimeType:'image/png',buffer:Buffer.from(image.split(',')[1],'base64')});
 const h=tag(page,'¹H NMR');
 await expect(h).toContainText('預設座標（尚未校正）');await expect(h).not.toContainText('已校正');await expect(h).not.toContainText('已由你校正');
 await expect(h).toContainText('⚠');
 // page 2: a warning chip for ¹H, an information chip for the CSV, and a non-blocking reminder (the step to page 3 stays clickable)
 await page.getByRole('button',{name:/^第 2 頁.*座標校正/}).click();
 await page.getByRole('button',{name:/^¹H NMR/}).click();
 await expect(page.locator('[data-calibration-kind=DEFAULT_COORDS]')).toContainText('預設座標（未校正）');
 await expect(page.locator('[data-calibration-kind=NUMERIC]')).toContainText('座標來自數值檔');
 await expect(page.locator('[data-calibration-reminder]')).toContainText('尚未校正：¹H NMR');
 await expect(page.getByRole('button',{name:/^第 3 頁.*化學判讀/})).toBeEnabled();
 // two-point calibration with the proposed frame
 await page.getByRole('button',{name:/套用兩點線性座標校正並轉換/}).click();
 await expect(page.getByText(/兩點線性座標校正成功/)).toBeVisible();
 await expect(page.locator('[data-calibration-kind=USER]')).toContainText('已校正 ✓（兩點）');
 await expect(page.locator('[data-calibration-reminder]')).toHaveCount(0);
 await page.getByRole('button',{name:/^第 1 頁/}).click();
 await expect(tag(page,'¹H NMR')).toContainText('已由你校正（兩點）');
 expect(errors).toEqual([]);
});
