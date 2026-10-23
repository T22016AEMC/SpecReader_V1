import {test,expect,type Page} from '@playwright/test';
// v1.1.7-hotfix.2 UI checks. The uploaded image is a plain engineering fixture (axis box + one curve), not a spectrum;
// these tests only exercise the calibration panel (messages, hints, preview table), never chemical accuracy.
async function openCalibrationPage(page:Page) {
 await page.goto('/');
 const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1000;c.height=600;const x=c.getContext('2d')!;x.fillStyle='white';x.fillRect(0,0,1000,600);x.strokeStyle='black';x.strokeRect(80,40,870,490);x.strokeStyle='#1455dd';x.lineWidth=2;x.beginPath();for(let px=82;px<=948;px++){const y=115+90*Math.exp(-Math.pow((px-280)/60,2))+150*Math.exp(-Math.pow((px-650)/12,2));if(px===82)x.moveTo(px,y);else x.lineTo(px,y);}x.stroke();return c.toDataURL('image/png');});
 await page.locator('input[type=file]').first().setInputFiles({name:'engineering-fixture-ir.png',mimeType:'image/png',buffer:Buffer.from(image.split(',')[1],'base64')});
 await page.getByRole('button',{name:/^第 2 頁.*座標校正/}).click();
 await expect(page.getByLabel('校正點 A 像素 X',{exact:true})).toBeVisible();
}
const fill=async(page:Page,label:string,v:string)=>page.getByLabel(label,{exact:true}).fill(v);

test('2 點模式顯示線性度提示，仍可套用',async({page})=>{
 await openCalibrationPage(page);
 const hint=page.getByTestId('two-point-linearity-hint');
 await expect(hint).toHaveText('只用兩點無法檢查座標軸是否線性；若圖的座標軸在中途換比例，請展開進階選項加入第三點。');
 await fill(page,'校正點 A 物理波數','3000');await fill(page,'校正點 B 物理波數','500');
 await page.getByRole('button',{name:/套用兩點線性座標校正並轉換/}).click();
 await expect(page.getByText(/兩點線性座標校正成功/)).toBeVisible();
 await expect(page.getByTestId('calibration-check')).toContainText('換算依據：2 點直線');
});

test('3 點校正失敗時顯示錯誤，不顯示成功',async({page})=>{
 await openCalibrationPage(page);
 await page.getByRole('button',{name:/進階選項：三點最小平方法校正/}).click();
 await expect(page.getByTestId('two-point-linearity-hint')).toHaveCount(0);
 await fill(page,'校正點 A 物理波數','3000');await fill(page,'校正點 B 物理波數','500');
 await fill(page,'校正點 C 像素 X','450');await fill(page,'校正點 C 物理波數','1500');
 await expect(page.getByTestId('linearity-warning')).toContainText('座標軸可能非線性，建議使用分段線性模式');
 await expect(page.getByTestId('calibration-check').locator('[data-flagged="true"]').first()).toBeVisible();
 await page.getByRole('button',{name:/套用三點最小平方法校正並轉換/}).click();
 await expect(page.getByText(/三點最小平方法校正失敗，未套用/)).toBeVisible();
 await expect(page.getByText(/三點最小平方法校正成功/)).toHaveCount(0);
});

test('分段線性：預設說明文字、推定轉折點、預覽檢查表與套用',async({page})=>{
 await openCalibrationPage(page);
 await page.getByTestId('piecewise-toggle').click();
 const panel=page.getByTestId('piecewise-calibration');
 await expect(panel).toContainText('適用於座標軸在 2000 cm⁻¹ 處改變比例的圖（2000 以上與以下的刻度間距不同）。勾選前請確認你的圖確實如此。也可以直接點 2000 的刻度當作校正點 D，不使用預設。');
 const preset=page.getByLabel('IR 座標軸在 2000 cm⁻¹ 處換比例（2:1）',{exact:true});
 await expect(preset).not.toBeChecked();
 // 3000 → px 120, 1500 → px 440, 500 → px 780 on this fixture's own numbers
 await fill(page,'校正點 A 像素 X','120');await fill(page,'校正點 A 物理波數','3000');
 await page.getByLabel('使用校正點 C',{exact:true}).check();
 await fill(page,'校正點 C 像素 X','440');await fill(page,'校正點 C 物理波數','1500');
 await fill(page,'校正點 B 像素 X','780');await fill(page,'校正點 B 物理波數','500');
 await preset.check();
 await expect(page.getByTestId('piecewise-inferred-knots')).toContainText('→ 2000');
 const check=page.getByTestId('calibration-check');
 await expect(check).toContainText('換算依據：分段線性');
 await expect(check.locator('[data-flagged="true"]')).toHaveCount(0);
 await page.getByRole('button',{name:/套用分段線性校正並轉換/}).click();
 await expect(page.getByText(/分段線性校正成功/)).toBeVisible();
 await expect(page.getByText(/分段線性 已校正/).first()).toBeVisible();
});

test('分段線性：校正點有誤時顯示原因並停用套用',async({page})=>{
 await openCalibrationPage(page);
 await page.getByTestId('piecewise-toggle').click();
 await fill(page,'校正點 A 像素 X','300');await fill(page,'校正點 B 像素 X','300');
 await expect(page.getByTestId('piecewise-error')).toContainText('重複或過近');
 await expect(page.getByRole('button',{name:/套用分段線性校正並轉換/})).toBeDisabled();
});
