import {describe,expect,it} from 'vitest';
import {SpectrumParser} from '../src/engines/spectrumParser';
import {isFlatAround,processIRSeries,topographicProminence} from '../src/engines/scientificEngines/irSignalProcessing';
import type {DataPoint} from '../src/types/spectrum';

// Work 3 (v1.1.7-hotfix.1), acceptance D: SYNTHETIC IR spectra (Gaussian bands + noise, long flat stretches).
const bands:[number,number,number][]=[[3300,150,40],[3050,15,12],[2960,12,35],[2870,12,25],[1600,10,25],[1510,10,35],[1385,6,15],[1365,6,18],[1240,20,45],[830,12,30]];
function synthetic(noiseAmplitude:number,seed=11):DataPoint[] {
 let s=seed;const rnd=()=>{s=(s*16807)%2147483647;return s/2147483647-.5;};
 const out:DataPoint[]=[];
 for(let x=4000;x>=600;x-=2){let y=95;for(const [c,w,h] of bands)y-=h*Math.exp(-.5*((x-c)/w)**2);out.push({x,y:y+noiseAmplitude*rnd()});}
 return out;
}
const csv=(pts:DataPoint[])=>['wavenumber,transmittance',...pts.map(p=>`${p.x},${p.y.toFixed(3)}`)].join('\n');
const flat=(x:number)=>(x>=1700&&x<=2300)||x>3600;

describe('IR peak detection thresholds (acceptance D)',()=>{
 for(const amplitude of [0.6,1.5]){
  it(`no peaks in flat stretches, real bands kept (noise amplitude ${amplitude} %T, UI upload path)`,async()=>{
   const parsed=await SpectrumParser.parseUploadedFile(new File([csv(synthetic(amplitude))],'synthetic-ir.csv'),'IR',undefined,{disableAutoPeakDetection:false});
   const xs=parsed.peaks.map(p=>p.x);
   expect(xs.filter(flat)).toEqual([]);
   for(const [c] of bands)expect(xs.some(x=>Math.abs(x-c)<=12)).toBe(true);
   // The broad 3300 band is one peak, not a row of ripples that could mimic an N–H doublet.
   expect(xs.filter(x=>x>=3150&&x<=3500)).toHaveLength(1);
  });
 }
 it('the traced curve of a calibrated image (pixel jitter, flat regions) yields no flat-region peaks',()=>{
  // Calibrated image tracing feeds processIRSeries with 0–100 values on a coarse grid with pixel-level jitter.
  let s=5;const rnd=()=>{s=(s*16807)%2147483647;return s/2147483647-.5;};
  const traced=synthetic(0).filter((_,i)=>i%3===0).map(p=>({x:p.x,y:Math.round(p.y+2*rnd())}));
  const peaks=processIRSeries(traced,'UNKNOWN').peaks;
  expect(peaks.map(p=>p.x).filter(flat)).toEqual([]);
  expect(peaks.some(p=>Math.abs(p.x-1240)<=12)&&peaks.some(p=>Math.abs(p.x-2960)<=12)).toBe(true);
 });
 it('helpers: prominence ignores ripples on a shoulder; flat windows are recognised',()=>{
  const ys=[0,1,5,9,10,9.6,9.8,9.5,6,2,0];
  const series=ys.map((y,i)=>({x:i*10,y}));
  expect(topographicProminence(series,4)).toBeCloseTo(10,6);      // main peak
  expect(topographicProminence(series,6)).toBeCloseTo(0.2,6);     // ripple: 9.8 − 9.6 (higher saddle, toward the main peak)
  const plateau=Array.from({length:40},(_,i)=>({x:i*2,y:5+(i%2)*0.05}));
  expect(isFlatAround(plateau,20,30,0.5)).toBe(true);
  expect(isFlatAround(series,4,30,0.5)).toBe(false);
 });
});
