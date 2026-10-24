import {beforeAll,describe,expect,it} from 'vitest';
import {initializeRDKit} from '../src/engines/scientificEngines/rdkitAdapter';
import {WorkbenchOrchestrator} from '../src/engines/workbenchOrchestrator';
import {SpectrumParser} from '../src/engines/spectrumParser';
import {BANDS,refPoint,syntheticSegmentedIRImage,pixelOf} from './irAxisFixture';
import type {ExperimentalSpectrumData} from '../src/types/spectrum';
import {createReasoningPlan} from '../src/engines/reasoning/hypothesisGenerator';

// v1.1.8: peaks re-detected from the traced curve after a calibration must carry the traced curve's own intensity and must not leave
// stale peaks behind when the calibration is changed. SYNTHETIC image and curve only (tests/irAxisFixture.ts).
beforeAll(()=>initializeRDKit());
const pt=(cm:number)=>{const r=refPoint(cm);return {pixelX:r.pixelX,pixelY:0,realX:r.physicalX,realY:0};};
const two=(s:ExperimentalSpectrumData)=>WorkbenchOrchestrator.applyTwoPointCalibration(s,{pointA:pt(3500),pointB:pt(830)});
const piece=(s:ExperimentalSpectrumData)=>WorkbenchOrchestrator.applyPiecewiseCalibration(s,{points:[pt(3000),pt(1500),pt(500)].map(p=>({pixelX:p.pixelX,realX:p.realX})),presetId:'IR_SCALE_BREAK_2000'});
const view=(s:ExperimentalSpectrumData)=>s.peaks.map(p=>({x:p.x,y:p.y,pixelX:p.pixelX??null,id:p.id})).sort((a,b)=>a.x-b.x);
/** Traced curve (same definition as the engine uses for re-detection): x calibrated, y = 100·(bottom−py)/(bottom−top). */
const curve=(s:ExperimentalSpectrumData)=>{const c=s.imageCalibration!;return s.irPixelCurve!.map(p=>({x:SpectrumParser.pixelToPhysicalX(p.x,c),y:100*(c.plotBottomPx-p.y)/(c.plotBottomPx-c.plotTopPx)}));};
const curveAt=(s:ExperimentalSpectrumData,x:number)=>curve(s).reduce((b,q)=>Math.abs(q.x-x)<Math.abs(b.x-x)?q:b).y;

describe('T1 re-detected peaks carry the traced curve intensity',()=>{
 it('every re-detected peak y equals the curve at its x; strongest band lowest, weakest highest',()=>{
  const s=piece(syntheticSegmentedIRImage([]));
  const auto=s.peaks.filter(p=>p.id.startsWith('ir-auto-px'));
  expect(auto.length).toBeGreaterThan(4);
  for(const p of auto)expect(Math.abs(p.y-curveAt(s,p.x)),`peak ${p.x}`).toBeLessThan(0.6);
  expect(auto.every(p=>p.pixelX!==undefined&&p.isCalibrated===true)).toBe(true);
  const depth=(cm:number)=>BANDS.find(b=>b[0]===cm)![2];
  const y=(cm:number)=>auto.find(p=>Math.abs(p.x-cm)<4)!.y;
  expect(y(1240)).toBeLessThan(y(1385));      // depth 60 vs 20
  expect(y(1510)).toBeLessThan(y(2870));      // 50 vs 28
  expect(depth(1240)).toBeGreaterThan(depth(1385));
  const ys=auto.map(p=>p.y);
  expect(auto.find(p=>p.y===Math.min(...ys))!.x).toBeGreaterThan(0);
  // the relative intensity fields derived from y use the same definition (same order as y, reversed for absorption depth is NOT mixed in)
  const ordered=[...auto].sort((a,b)=>a.y-b.y);
  for(let i=1;i<ordered.length;i++)expect((ordered[i].normalizedIntensity??0)).toBeGreaterThanOrEqual((ordered[i-1].normalizedIntensity??0)-1e-9);
 });
});

describe('T2 repeated calibration leaves no stale peaks',()=>{
 it('2-point → piecewise → 2-point equals a fresh calibration each time',()=>{
  const base=syntheticSegmentedIRImage();
  const a=two(base),b=piece(a),c=two(b);
  expect(view(a)).toEqual(view(two(base)));
  expect(view(b)).toEqual(view(piece(base)));
  expect(view(c)).toEqual(view(a));
 });
});

describe('T3 user marks and edited peaks survive repeated calibration',()=>{
 it('manual and modified peaks keep ids and pixels and are converted from the original pixel each time',()=>{
  const base=syntheticSegmentedIRImage([3050,1600,830]);
  const ids=base.peaks.map(p=>p.id).sort();
  let s=base;
  for(const step of [two,piece,two,piece]){
   s=step(s);
   const kept=s.peaks.filter(p=>ids.includes(p.id));
   expect(kept.map(p=>p.id).sort()).toEqual(ids);
   for(const p of kept){const o=base.peaks.find(q=>q.id===p.id)!;expect(p.pixelX).toBe(o.pixelX);expect(p.x).toBeCloseTo(SpectrumParser.pixelToPhysicalX(o.pixelX!,s.imageCalibration!),6);}
  }
 });
});

describe('T3b a user-edited re-detected peak survives and is converted again from its pixel',()=>{
 it('edit flag, text and id are kept; x follows the new calibration; no duplicate appears',()=>{
  const a=two(syntheticSegmentedIRImage([]));
  const autos=a.peaks.filter(p=>p.id.startsWith('ir-auto-px'));
  const target=autos.reduce((b,p)=>p.y<b.y?p:b);   // the strongest re-detected band
  const edited={...a,peaks:a.peaks.map(p=>p.id===target.id?{...p,userModified:true,assignment:'user note'}:p)};
  const b=piece(edited);
  const kept=b.peaks.filter(p=>p.id===target.id);
  expect(kept).toHaveLength(1);
  expect(kept[0].assignment).toBe('user note');
  expect(kept[0].pixelX).toBe(target.pixelX);
  expect(kept[0].x).toBeCloseTo(SpectrumParser.pixelToPhysicalX(target.pixelX!,b.imageCalibration!),2);
  expect(b.peaks.filter(p=>Math.abs(p.x-kept[0].x)<3)).toHaveLength(1);
  const c=two(b);
  expect(c.peaks.filter(p=>p.id===target.id)).toHaveLength(1);
  expect(c.peaks.find(p=>p.id===target.id)!.x).toBeCloseTo(SpectrumParser.pixelToPhysicalX(target.pixelX!,c.imageCalibration!),2);
 });
});

describe('T5 complete flow: calibrated image → IR evidence → N evidence',()=>{
 const nitro:[number,number,number][]=[[3100,15,10],[1525,12,62],[1345,12,60],[850,12,30]];
 const plan=(s:ExperimentalSpectrumData)=>createReasoningPlan(WorkbenchOrchestrator.prepareModeAEvidence({IR:s},{}).bundle);
 it('strong bands stay the strongest observations and a real nitro pair is N evidence; alkyl-aromatic is not (no page-1 marks, only re-detected peaks)',()=>{
  const n=plan(piece(syntheticSegmentedIRImage([],nitro)));
  const ir=n.observations.filter(o=>o.modality==='IR');
  const at=(x:number)=>ir.find(o=>Math.abs(o.value-x)<=3)!;
  expect(at(1525)).toBeDefined();expect(at(1345)).toBeDefined();expect(at(3100)).toBeDefined();
  expect(at(1525).relativeIntensity!).toBeGreaterThan(at(3100).relativeIntensity!);
  expect(at(1345).relativeIntensity!).toBeGreaterThan(at(850).relativeIntensity!);
  expect(n.nitrogenEvidence!.mode).toBe('EVIDENCE');
  const a=plan(piece(syntheticSegmentedIRImage([])));
  const air=a.observations.filter(o=>o.modality==='IR');
  const strongest=air.reduce((b,o)=>(o.relativeIntensity??0)>(b.relativeIntensity??0)?o:b);
  expect(Math.abs(strongest.value-1240)).toBeLessThan(4);   // the deepest synthetic band
  expect(a.nitrogenEvidence!.mode).toBe('NONE');
 });
});
