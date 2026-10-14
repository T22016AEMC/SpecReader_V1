import {test,expect} from '@playwright/test';
test('IR 五點控制、拖曳、校正預覽與重新分析',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 const rows=Array.from({length:81},(_,i)=>`${400+i*45},${100-Math.max(0,30-Math.abs(i-30)*4)}`);
 await page.locator('input[type=file]').first().setInputFiles({name:'engineering-curve.csv',mimeType:'text/csv',buffer:Buffer.from('wavenumber,%Transmittance\n'+rows.join('\n'))});
 await page.getByRole('button',{name:'重設五點基線',exact:true}).click();
 const point=page.getByLabel('基線控制點 3');await expect(point).toBeVisible();
 await point.scrollIntoViewIfNeeded();
 const before=await point.getAttribute('cy'),box=await point.boundingBox();
 if(!box)throw new Error('Missing baseline control');
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+20,box.y+20,{steps:4});await page.mouse.up();
 expect(await point.getAttribute('cy')).not.toBe(before);
 await page.getByRole('button',{name:'套用基線並供重新分析',exact:true}).click();
 await expect(page.getByLabel('IR 分析視圖')).toHaveValue('CORRECTED');
 await page.getByRole('button',{name:/^第 3 頁.*化學判讀/}).click();
 await expect(page.getByText('De novo 搜尋狀態與界限',{exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});
