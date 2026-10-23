import {describe,expect,it} from 'vitest';
import {WorkbenchOrchestrator} from '../src/engines/workbenchOrchestrator';
import {SpectrumParser} from '../src/engines/spectrumParser';
import {pixelFromPhysical} from '../src/engines/scientificEngines/axisCalibration';
import {AXIS_CALIBRATION_CONFIG as CFG} from '../src/engines/scientificEngines/axisCalibrationConfig';
import {buildCalibrationCheck,threePointFailureMessage,olsLine} from '../src/engines/scientificEngines/axisCalibrationPanel';
import {BANDS,refPoint,syntheticSegmentedIRImage} from './irAxisFixture';
import type {ExperimentalSpectrumData} from '../src/types/spectrum';

// v1.1.7-hotfix.2 UI-phase engineering checks. Synthetic image and axis only (tests/irAxisFixture.ts).
const pt=(cm:number)=>{const r=refPoint(cm);return {pixelX:r.pixelX,pixelY:0,realX:r.physicalX,realY:0};};
const two=(s:ExperimentalSpectrumData,a=3000,b=500)=>WorkbenchOrchestrator.applyTwoPointCalibration(s,{pointA:pt(a),pointB:pt(b)});
const three=(s:ExperimentalSpectrumData)=>WorkbenchOrchestrator.applyThreePointCalibration(s,{pointA:pt(3000),pointB:pt(500),pointC:pt(1500)});
const pw=(s:ExperimentalSpectrumData)=>WorkbenchOrchestrator.applyPiecewiseCalibration(s,{points:[pt(3000),pt(1500),pt(500)].map(p=>({pixelX:p.pixelX,realX:p.realX})),presetId:'IR_SCALE_BREAK_2000'});
/** Every mark must equal a fresh conversion of its ORIGINAL pixel position with the calibration that was just applied. */
const expectFromPixels=(s:ExperimentalSpectrumData,original:ExperimentalSpectrumData)=>{
 const c=s.imageCalibration!;
 expect(s.peaks.map(p=>p.id).sort()).toEqual(original.peaks.map(p=>p.id).sort());
 for(const p of s.peaks){const o=original.peaks.find(q=>q.id===p.id)!;expect(p.pixelX).toBe(o.pixelX);expect(p.x).toBeCloseTo(SpectrumParser.pixelToPhysicalX(o.pixelX!,c),6);}
};

describe('re-applying calibrations always restarts from the original pixel positions',()=>{
 it('2-point → piecewise → 2-point: each result is correct and nothing accumulates',()=>{
  const original=syntheticSegmentedIRImage();
  const first=two(original);
  expect(first.calibrationFailed).toBeFalsy();expectFromPixels(first,original);
  const second=pw(first);
  expect(second.calibrationFailed).toBe(false);expectFromPixels(second,original);
  expect(second.imageCalibration?.calibrationMode).toBe('PIECEWISE');
  const third=two(second);
  expect(third.calibrationFailed).toBeFalsy();expectFromPixels(third,original);
  expect(third.imageCalibration?.piecewiseKnots).toBeUndefined();   // the straight line replaced the knots completely
  expect(third.peaks.map(p=>p.x)).toEqual(first.peaks.map(p=>p.x)); // identical to the first 2-point result, bit for bit
  expect(third.peaks.map(p=>p.pixelX)).toEqual(original.peaks.map(p=>p.pixelX));
 });
 it('a rejected 3-point attempt in between does not corrupt the next calibration',()=>{
  const original=syntheticSegmentedIRImage();
  const failed=three(original);
  expect(failed.calibrationFailed).toBe(true);
  const again=pw(failed);
  expect(again.calibrationFailed).toBe(false);expectFromPixels(again,original);
  const reference=pw(original);
  expect(again.peaks.map(p=>p.x)).toEqual(reference.peaks.map(p=>p.x));
 });
});

describe('3-point failure is reported from the actual result',()=>{
 it('the user-like segmented points are rejected and the message carries the reason and figures',()=>{
  const failed=three(syntheticSegmentedIRImage());
  expect(failed.calibrationFailed).toBe(true);
  const msg=threePointFailureMessage(failed,2500);
  expect(msg.startsWith(CFG.ui.threePointFailedPrefix)).toBe(true);
  expect(msg).toContain('POOR');expect(msg).toMatch(/R² = 0\.\d{4}/);expect(msg).toMatch(/標準化 RMSE = 0\.\d{3}/);
  expect(msg).toContain(CFG.ui.threePointFailedNoApplyText);expect(msg).not.toContain('成功');
 });
 it('an engine error without fit figures still produces a clear message',()=>{
  const msg=threePointFailureMessage({digitizationErrorMessage:'三點校正失敗：兩個校正點的像素位置相同。'},2500);
  expect(msg).toContain('兩個校正點的像素位置相同');expect(msg).not.toMatch(/R² =/);
 });
});

describe('calibration point check (input / converted / difference)',()=>{
 const P=(label:string,cm:number)=>({label,pixelX:refPoint(cm).pixelX,physicalX:cm});
 it('piecewise: every point reproduces itself and nothing is flagged',()=>{
  const c=buildCalibrationCheck('PIECEWISE',[P('A',3000),P('B',1500),P('C',500)],'IR_SCALE_BREAK_2000');
  expect(c.error).toBeNull();expect(c.rows).toHaveLength(3);
  for(const r of c.rows){expect(Math.abs(r.diff)).toBeLessThanOrEqual(c.tolerance);expect(r.flagged).toBe(false);}
 });
 it('3-point on the segmented axis: residuals are flagged red and the non-linearity warning appears',()=>{
  const c=buildCalibrationCheck('THREE_POINT',[P('A',3000),P('B',500),P('C',1500)]);
  expect(c.rows.some(r=>r.flagged)).toBe(true);expect(c.warning).toBe(CFG.linearityWarningText);
 });
 it('3-point on a truly linear axis: no flag, no warning',()=>{
  const lin=(l:string,px:number)=>({label:l,pixelX:px,physicalX:4000-px*3});
  const c=buildCalibrationCheck('THREE_POINT',[lin('A',100),lin('B',500),lin('C',900)]);
  expect(c.rows.every(r=>!r.flagged)).toBe(true);expect(c.warning).toBeNull();
 });
 it('2-point: the line passes through both points (no flag, and no warning — it cannot be judged)',()=>{
  const c=buildCalibrationCheck('TWO_POINT',[P('A',3000),P('B',500)]);
  expect(c.rows.map(r=>Math.abs(r.diff)<1e-9)).toEqual([true,true]);expect(c.warning).toBeNull();
 });
 it('piecewise input errors surface as an error, not as rows',()=>{
  const c=buildCalibrationCheck('PIECEWISE',[P('A',3000),{label:'B',pixelX:refPoint(3000).pixelX,physicalX:500}]);
  expect(c.error).toContain('重複或過近');expect(c.rows).toEqual([]);
 });
 it('the OLS helper matches the 3-point engine on the same points',()=>{
  const failed=three(syntheticSegmentedIRImage());const fit=olsLine([3000,500,1500].map(cm=>({pixelX:refPoint(cm).pixelX,physicalX:cm})))!;
  expect(fit.slope).toBeCloseTo(failed.imageCalibration!.slope!,6);expect(fit.intercept).toBeCloseTo(failed.imageCalibration!.intercept!,4);
 });
});

describe('editing an observed position back-converts to pixels (PeakObservationTable)',()=>{
 it('piecewise knots invert to the original pixel; straight-line calibrations keep the old slope formula',()=>{
  const original=syntheticSegmentedIRImage(),cal=pw(original).imageCalibration!;
  for(const [cm] of BANDS){const px=refPoint(cm).pixelX;expect(Math.abs(pixelFromPhysical(cal.piecewiseKnots!,SpectrumParser.pixelToPhysicalX(px,cal))-px)).toBeLessThan(0.1);}
  const lin=two(original).imageCalibration!;
  for(const v of [3100,2000,700]){
   const old=(v-(lin.intercept??lin.xAxisStart-lin.plotLeftPx*lin.slope!))/(lin.slope??(lin.xAxisEnd-lin.xAxisStart)/(lin.plotRightPx-lin.plotLeftPx));
   expect(Math.abs(SpectrumParser.physicalToPixelX(v,lin)-old)).toBeLessThanOrEqual(0.05);
  }
 });
});
