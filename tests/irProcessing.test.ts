import {describe,it,expect} from 'vitest';
import {asymmetricBaseline} from '../src/engines/scientificEngines/whittakerBaseline';
import {processIRSeries,irRangeCovered} from '../src/engines/scientificEngines/irSignalProcessing';
import {spectrum} from './fixtures';
describe('IR 前處理與寬峰（合成資料）',()=>{
  it('未知強度方向的完整掃描仍不能作缺峰反證',()=>{
    const s=spectrum('IR',[], 'Unknown');s.points=Array.from({length:901},(_,i)=>({x:400+4*i,y:.5}));
    expect(irRangeCovered(s,2500,3670)).toBe(false);
    expect(irRangeCovered({...s,yUnit:'Absorbance'},2500,3670)).toBe(true);
  });
  it('Whittaker 二階懲罰保留線性基線',()=>{
    const y=Array.from({length:101},(_,i)=>.1+.001*i);
    const z=asymmetricBaseline(y,1e5);
    expect(Math.max(...z.map((v,i)=>Math.abs(v-y[i])))).toBeLessThan(1e-7);
  });
  it('有傾斜基線時保留 OH 寬峰與羰基峰，峰高縮放不改變峰位置',()=>{
    const points=Array.from({length:901},(_,i)=>{const x=400+4*i;return {x,y:.1+.00003*x+.6*Math.exp(-(((x-3350)/120)**2))+.8*Math.exp(-(((x-1720)/15)**2))}});
    const a=processIRSeries(points,'ABSORBANCE'),b=processIRSeries(points.map(p=>({...p,y:10*p.y})),'ABSORBANCE');
    expect(a.peaks.some(p=>Math.abs(p.x-3350)<12&&p.isBroad)).toBe(true);
    expect(a.peaks.some(p=>Math.abs(p.x-1720)<8)).toBe(true);
    expect(b.peaks.map(p=>p.x)).toEqual(a.peaks.map(p=>p.x));
  });
});
