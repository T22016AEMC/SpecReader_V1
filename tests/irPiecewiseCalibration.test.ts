import fs from 'node:fs';
import path from 'node:path';
import {beforeAll,describe,expect,it} from 'vitest';
import {initializeRDKit} from '../src/engines/scientificEngines/rdkitAdapter';
import {WorkbenchOrchestrator} from '../src/engines/workbenchOrchestrator';
import {SpectrumParser} from '../src/engines/spectrumParser';
import {createReasoningPlan} from '../src/engines/reasoning/hypothesisGenerator';
import {prepareIR,processIRSeries} from '../src/engines/scientificEngines/irSignalProcessing';
import {pixelIRX} from '../src/engines/scientificEngines/irManualBaseline';
import {buildPiecewiseAxis,physicalFromPixel,pixelFromPhysical} from '../src/engines/scientificEngines/axisCalibration';
import {AXIS_CALIBRATION_CONFIG as CFG} from '../src/engines/scientificEngines/axisCalibrationConfig';
import {BANDS,refPoint,syntheticSegmentedIRImage,pixelOf} from './irAxisFixture';
import type {ExperimentalSpectrumData} from '../src/types/spectrum';
import {IR_PEAK_CONFIG} from '../src/engines/scientificEngines/irPeakConfig';

// v1.1.7-hotfix.2 acceptance A–F. The IR image, its segmented axis and its bands are SYNTHETIC (tests/irAxisFixture.ts).
beforeAll(()=>initializeRDKit());
const TOL=CFG.irCalibratedPositionToleranceCm;
const real=(p:{pixelX:number;physicalX:number})=>({pixelX:p.pixelX,realX:p.physicalX});
const piecewise=(s:ExperimentalSpectrumData,cms:number[],presetId:'IR_SCALE_BREAK_2000'|null='IR_SCALE_BREAK_2000')=>WorkbenchOrchestrator.applyPiecewiseCalibration(s,{points:cms.map(cm=>real(refPoint(cm))),presetId});
const peakNear=(s:ExperimentalSpectrumData,cm:number)=>s.peaks.find(p=>Math.abs(p.x-cm)<=TOL);
const golden=JSON.parse(fs.readFileSync(path.resolve(__dirname,'goldens','irLinearCalibration.hotfix1.json'),'utf8'));
const pick=(s:ExperimentalSpectrumData)=>({calibrationFailed:s.calibrationFailed??false,digitizationErrorMessage:s.digitizationErrorMessage??null,
 calibration:s.imageCalibration?{slope:s.imageCalibration.slope??null,intercept:s.imageCalibration.intercept??null,xAxisStart:s.imageCalibration.xAxisStart,xAxisEnd:s.imageCalibration.xAxisEnd,rSquared:s.imageCalibration.rSquared??null,rmse:s.imageCalibration.rmse??null,residuals:s.imageCalibration.residuals??null,calibrationQuality:s.imageCalibration.calibrationQuality??null,source:s.imageCalibration.source}:null,
 peaks:s.peaks.map(p=>({id:p.id,x:p.x,pixelX:p.pixelX??null,isCalibrated:p.isCalibrated??null})).sort((a,b)=>a.id.localeCompare(b.id)),pointCount:s.points.length});

describe('A. segmented axis, 3000/1500/500 + 2:1 preset',()=>{
 it('every marked band lands within tolerance; ids and pixels are kept',()=>{
  const before=syntheticSegmentedIRImage();
  const s=piecewise(before,[3000,1500,500]);
  expect(s.calibrationFailed).toBe(false);
  expect(s.imageCalibration?.calibrationMode).toBe('PIECEWISE');
  const inferred=s.imageCalibration!.piecewiseKnots!.filter(k=>k.inferred);
  expect(inferred).toHaveLength(1);
  expect(inferred[0].physicalX).toBe(2000);
  expect(Math.abs(inferred[0].pixelX-pixelOf(2000))).toBeLessThan(1.5);   // user-reported ≈ px 576
  for(const [cm] of BANDS)expect(peakNear(s,cm),`band ${cm}`).toBeDefined();
  expect(s.peaks.map(p=>p.id).sort()).toEqual(before.peaks.map(p=>p.id).sort());
  for(const p of s.peaks){const old=before.peaks.find(q=>q.id===p.id)!;expect(p.pixelX).toBe(old.pixelX);}
 });
 it('the traced curve is converted with the same mapping (IR processing peaks also land on the bands)',()=>{
  const s=piecewise(syntheticSegmentedIRImage(),[3000,1500,500]);
  const c=s.imageCalibration!;
  for(const [cm] of BANDS){const px=pixelOf(cm);expect(Math.abs(pixelIRX(px,c)-SpectrumParser.pixelToPhysicalX(px,c))).toBeLessThan(0.01);}
  const auto=prepareIR(s).peaks.map(p=>p.x);
  for(const cm of [3050,2960,1600,1510,1240,830])expect(auto.some(x=>Math.abs(x-cm)<=TOL),`processed ${cm}`).toBe(true);
 });
 it('without the preset the three points interpolate piecewise but the 3000→1500 span stays linear',()=>{
  const s=piecewise(syntheticSegmentedIRImage(),[3000,1500,500],null);
  expect(s.calibrationFailed).toBe(false);
  expect(peakNear(s,1600)).toBeUndefined();          // 1600 sits between 3000 and 1500, where the break is not modelled
  for(const cm of [1385,1240,830])expect(peakNear(s,cm)).toBeDefined();
 });
});

describe('B. existing 2-point and 3-point OLS unchanged, with a non-linearity warning',()=>{
 const A=refPoint(3000),B=refPoint(500),C=refPoint(1500);
 it('2-point output is identical to the pre-change golden and warns with the third point as a check',()=>{
  const two=WorkbenchOrchestrator.applyTwoPointCalibration(syntheticSegmentedIRImage(),{pointA:{...A,pixelY:100,realX:A.physicalX,realY:0},pointB:{...B,pixelY:500,realX:B.physicalX,realY:100}});
  expect(pick(two)).toEqual(golden.twoPoint);
  const check=WorkbenchOrchestrator.checkCalibrationLinearity(two.imageCalibration,[real(A),real(B),real(C)]);
  expect(check.warning).toBe('座標軸可能非線性，建議使用分段線性模式');
  expect(check.flagged.map(f=>f.point.physicalX)).toEqual([1500]);
  // Two points alone cannot reveal curvature: no warning.
  expect(WorkbenchOrchestrator.checkCalibrationLinearity(two.imageCalibration,[real(A),real(B)]).warning).toBeNull();
 });
 it('3-point OLS output is identical to the golden (POOR, not applied) and the residual check warns',()=>{
  const three=WorkbenchOrchestrator.applyThreePointCalibration(syntheticSegmentedIRImage(),{pointA:{pixelX:A.pixelX,realX:3000},pointB:{pixelX:B.pixelX,realX:500},pointC:{pixelX:C.pixelX,realX:1500}});
  expect(pick(three)).toEqual(golden.threePoint);
  const check=WorkbenchOrchestrator.checkCalibrationLinearity(three.imageCalibration,[real(A),real(B),real(C)]);
  expect(check.warning).toBe('座標軸可能非線性，建議使用分段線性模式');
  expect(check.flagged.length).toBe(3);
 });
 it('an accepted 3-point OLS run is identical to its golden too',()=>{
  const ok=WorkbenchOrchestrator.applyThreePointCalibration(syntheticSegmentedIRImage(),{pointA:{pixelX:refPoint(3500).pixelX,realX:3500},pointB:{pixelX:refPoint(2100).pixelX,realX:2100},pointC:{pixelX:refPoint(2600).pixelX,realX:2600}});
  expect(pick(ok)).toEqual(golden.threePointAccepted);
  // Points on one straight part of the axis: no warning.
  expect(WorkbenchOrchestrator.checkCalibrationLinearity(ok.imageCalibration,[{pixelX:refPoint(3500).pixelX,realX:3500},{pixelX:refPoint(2600).pixelX,realX:2600},{pixelX:refPoint(2100).pixelX,realX:2100}]).warning).toBeNull();
 });
});

describe('C. five calibration points',()=>{
 it('each point maps back to its own value; neighbours interpolate linearly; ends extrapolate',()=>{
  const cms=[3600,2800,1800,1200,600];
  const s=piecewise(syntheticSegmentedIRImage(),cms,null);
  expect(s.calibrationFailed).toBe(false);
  for(const cm of cms){const p=refPoint(cm);expect(Math.abs(SpectrumParser.pixelToPhysicalX(p.pixelX,s.imageCalibration!)-cm)).toBeLessThanOrEqual(0.01);}
  for(const r of s.imageCalibration!.calibrationPoints!)expect(Math.abs(r.residual??1)).toBeLessThanOrEqual(0.01);
  const knots=s.imageCalibration!.piecewiseKnots!;
  expect(knots).toHaveLength(5);
  // inverse mapping round-trips
  for(const x of [3900,3000,2000,1000,450])expect(Math.abs(physicalFromPixel(knots,pixelFromPhysical(knots,x))-x)).toBeLessThan(1e-6);
 });
});

describe('D. invalid input is reported, never silently applied',()=>{
 const base=()=>syntheticSegmentedIRImage();
 const run=(points:{pixelX:number;realX:number}[])=>WorkbenchOrchestrator.applyPiecewiseCalibration(base(),{points,presetId:null});
 it('non-monotonic values, duplicate pixels, equal values, wrong count and non-numbers',()=>{
  const cases:[string,{pixelX:number;realX:number}[],RegExp][]=[
   ['swapped values',[{pixelX:331,realX:3000},{pixelX:824,realX:500},{pixelX:1319,realX:1500}],/順序不一致/],
   ['duplicate pixel',[{pixelX:331,realX:3000},{pixelX:332,realX:1500},{pixelX:1319,realX:500}],/像素位置重複/],
   ['same value',[{pixelX:331,realX:1500},{pixelX:824,realX:1500},{pixelX:1319,realX:500}],/數值相同/],
   ['one point',[{pixelX:331,realX:3000}],/2–5 個校正點/],
   ['six points',[100,300,500,700,900,1100].map((px,i)=>({pixelX:px,realX:4000-i*600})),/2–5 個校正點/],
   ['not a number',[{pixelX:331,realX:Number.NaN},{pixelX:824,realX:1500}],/有效數字/],
  ];
  for(const [name,points,message] of cases){
   const before=base();
   const s=run(points);
   expect(s.calibrationFailed,name).toBe(true);
   expect(s.digitizationErrorMessage,name).toMatch(message);
   expect(s.peaks.map(p=>p.x),name).toEqual(before.peaks.map(p=>p.x));   // marks untouched
   expect(s.imageCalibration?.piecewiseKnots,name).toBeUndefined();
  }
 });
 it('points given in any order are sorted by pixel (input order itself is not an error)',()=>{
  const s=WorkbenchOrchestrator.applyPiecewiseCalibration(base(),{points:[real(refPoint(500)),real(refPoint(3000)),real(refPoint(1500))],presetId:'IR_SCALE_BREAK_2000'});
  expect(s.calibrationFailed).toBe(false);
  expect(peakNear(s,1600)).toBeDefined();
 });
 it('numeric spectra are rejected with a clear message',()=>{
  const numeric={...base(),sourceType:'NUMERIC_EXPERIMENTAL' as const,sourceFormat:'CSV' as const,digitizedFromImage:false};
  const s=WorkbenchOrchestrator.applyPiecewiseCalibration(numeric,{points:[real(refPoint(3000)),real(refPoint(500))]});
  expect(s.calibrationFailed).toBe(true);
  expect(s.digitizationErrorMessage).toContain('只適用於圖片光譜');
 });
 it('the preset infers the break from points on one side only (extrapolation across 2000)',()=>{
  const r=buildPiecewiseAxis([refPoint(1500),refPoint(500)],{presetId:'IR_SCALE_BREAK_2000'});
  expect(r.ok).toBe(true);
  if(r.ok){
   expect(r.inferredKnots.map(k=>k.physicalX)).toEqual([2000,4000]);
   expect(Math.abs(physicalFromPixel(r.knots,pixelOf(3050))-3050)).toBeLessThan(TOL);
  }
 });
});

describe('E. real absorption bands survive the hotfix.1 detection thresholds',()=>{
 const series=(bands:[number,number,number][],step=2)=>{const out:{x:number;y:number}[]=[];for(let x=4000;x>=600;x-=step){let y=95;for(const [c,w,h] of bands)y-=h*Math.exp(-.5*((x-c)/w)**2);out.push({x,y});}return out;};
 it('strong neighbouring bands, a close doublet and a band on the flank of a broad band are all kept',()=>{
  // Every band here is a resolvable local minimum of the synthetic curve (1600/1572 and 1385/1365 are doublets, 3050 sits on the flank of 3350).
  const bands:[number,number,number][]=[[3350,160,45],[3050,15,10],[1600,8,55],[1572,7,32],[1510,10,60],[1385,6,18],[1365,6,22],[1240,18,65],[830,12,40]];
  const xs=processIRSeries(series(bands),'PERCENT_TRANSMITTANCE').peaks.map(p=>p.x);
  for(const [c] of bands)expect(xs.some(x=>Math.abs(x-c)<=6),`band ${c}`).toBe(true);
 });
 it('the hotfix.1 thresholds drop no band that detection without them finds',()=>{
  const bands:[number,number,number][]=[[3350,160,45],[3050,15,10],[2960,14,40],[2870,12,28],[1600,8,55],[1572,7,32],[1510,10,60],[1385,6,18],[1365,6,22],[1240,18,65],[830,12,40]];
  const cfg=IR_PEAK_CONFIG as unknown as Record<string,number>,saved={...cfg};
  let before:number[]=[];
  try{cfg.minProminenceNoiseMultiple=0;cfg.minProminenceFractionOfMax=0;cfg.flatRangeNoiseMultiple=0;before=processIRSeries(series(bands),'PERCENT_TRANSMITTANCE').peaks.map(p=>p.x);}
  finally{Object.assign(cfg,saved);}
  const after=processIRSeries(series(bands),'PERCENT_TRANSMITTANCE').peaks.map(p=>p.x);
  const found=bands.filter(([c])=>before.some(x=>Math.abs(x-c)<=6));
  expect(found.length).toBe(bands.length);
  for(const [c] of found)expect(after.some(x=>Math.abs(x-c)<=6),`band ${c} lost by hotfix.1 thresholds`).toBe(true);
 });
 it('after piecewise calibration of the synthetic image, the traced strong bands 1600 and 1510 are kept',()=>{
  const s=piecewise(syntheticSegmentedIRImage([]),[3000,1500,500]);   // no marks: only the traced curve
  const xs=prepareIR(s).peaks.map(p=>p.x);
  for(const cm of [1600,1510,1240,2960])expect(xs.some(x=>Math.abs(x-cm)<=TOL),`traced ${cm}`).toBe(true);
 });
});

describe('F. complete flow: calibration → observations → N evidence',()=>{
 const nitrogenMode=(s:ExperimentalSpectrumData)=>{
  const prepared=WorkbenchOrchestrator.prepareModeAEvidence({IR:s},{});
  const plan=createReasoningPlan(prepared.bundle);
  return {plan,mode:plan.nitrogenEvidence!.mode};
 };
 it('alkyl-aromatic 1510 + 1385 at their correct wavenumbers is not N evidence',()=>{
  const s=piecewise(syntheticSegmentedIRImage(),[3000,1500,500]);
  const {plan,mode}=nitrogenMode(s);
  const ir=plan.observations.filter(o=>o.modality==='IR').map(o=>o.value);
  expect(ir.some(x=>Math.abs(x-1510)<=TOL)&&ir.some(x=>Math.abs(x-1385)<=TOL)).toBe(true);
  expect(mode).toBe('NONE');
 });
 it('a real nitro pair (two strong, similar bands) on the same segmented axis is N evidence',()=>{
  const nitroBands:[number,number,number][]=[[3100,15,10],[1525,12,62],[1345,12,60],[850,12,30]];
  const s=piecewise(syntheticSegmentedIRImage(nitroBands.map(b=>b[0]),nitroBands),[3000,1500,500]);
  const {plan,mode}=nitrogenMode(s);
  const ir=plan.observations.filter(o=>o.modality==='IR').map(o=>o.value);
  expect(ir.some(x=>Math.abs(x-1525)<=TOL)&&ir.some(x=>Math.abs(x-1345)<=TOL)).toBe(true);
  expect(mode).toBe('EVIDENCE');
  expect(plan.nitrogenEvidence!.reasons.some(r=>r.text.includes('硝基'))).toBe(true);
 });
});
