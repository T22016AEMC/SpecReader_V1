import {describe,it,expect} from 'vitest';
import {toAbsorbance,processIRSeries,irRangeCovered} from '../src/engines/scientificEngines/irSignalProcessing';
import {ionMz,massError,neutralMassFromIon,PROTON_MASS,ELECTRON_MASS,type IonAdduct} from '../src/engines/scientificEngines/ionMass';
import {ChemicalGraphValidator} from '../src/engines/candidateGeneration/graphValidator';
import {ChemicalHardConstraintValidator} from '../src/engines/scientificEngines/chemicalHardConstraintValidator';
import {NMRAnalysisEngine} from '../src/engines/nmrEngine';
import type {ExperimentalSpectrumData,SpectralPeak} from '../src/types/spectrum';
export function spectrum(modality:ExperimentalSpectrumData['modality'],peaks:SpectralPeak[],unit='Intensity'):ExperimentalSpectrumData {
  return {modality,fileName:'synthetic-fixture.csv',sourceFormat:'CSV',isSimulated:false,sourceType:'NUMERIC_EXPERIMENTAL',xUnit:modality==='IR'?'cm⁻¹':modality==='MS'?'m/z':'ppm',yUnit:unit,points:peaks.map(p=>({x:p.x,y:p.y})),peaks,validation:{isValid:true,qualityScore:95,issues:[]}};
}
describe('P0 科學不變量（合成資料，非實測準確率）',()=>{
  it('透射率與 %T 依 Beer–Lambert 轉為吸光度',()=>{
    expect(toAbsorbance(.1,'TRANSMITTANCE')).toBeCloseTo(1,12);
    expect(toAbsorbance(10,'PERCENT_TRANSMITTANCE')).toBeCloseTo(1,12);
    for(const t of [0,-1,101,NaN,Infinity]) expect(toAbsorbance(t,'PERCENT_TRANSMITTANCE')).toBeNull();
  });
  it('不同強度尺度與掃描方向保留同一吸收峰',()=>{
    const points=Array.from({length:201},(_,i)=>({x:1600+i,y:.1+.8*Math.exp(-(((i-100)/8)**2))}));
    const absorb=processIRSeries(points,'ABSORBANCE');
    const transmission=processIRSeries(points.map(p=>({x:p.x,y:100*10**(-p.y)})).reverse(),'PERCENT_TRANSMITTANCE');
    expect(absorb.peaks.some(p=>Math.abs(p.x-1700)<2)).toBe(true);
    expect(transmission.peaks.map(p=>p.x)).toEqual(absorb.peaks.map(p=>p.x));
    expect(irRangeCovered(spectrum('IR',[{id:'p',x:1700,y:100}]),3200,3670)).toBe(false);
  });
  it.each(['[M]+•','[M+H]+','[M+Na]+','[M+NH4]+','[M-H]-'] as const)('加合離子 %s 的正逆計算與質量誤差',(adduct:IonAdduct)=>{
    const mz=ionMz(46.041864812,adduct);
    expect(neutralMassFromIon(mz,adduct)).toBeCloseTo(46.041864812,9);
    expect(massError(mz+.001,mz).da).toBeCloseTo(.001,10);
    expect(massError(mz+.001,mz).ppm).toBeGreaterThan(0);
  });
  it('二價與自由基陽離子的電子質量',()=>{
    expect(ionMz(100,'[M+H]+',2)).toBeCloseTo(50+PROTON_MASS,10);
    expect(ionMz(100,'[M]+•')).toBeCloseTo(100-ELECTRON_MASS,10);
    expect(()=>ionMz(100,'[M+H]+',0)).toThrow();
  });
  it('相對積分縮放不產生絕對氫數，分子式不循環校準',()=>{
    for(const scale of [1,2,10]) {
      const s=spectrum('1H_NMR',[{id:'q',x:4.1,y:100,integration:2*scale,multiplicity:'q',jValues:[7]},{id:'t',x:1.2,y:90,integration:3*scale,multiplicity:'t',jValues:[7]}]);
      const result=NMRAnalysisEngine.analyzeExperimental1HNMR(s);
      const summary=ChemicalHardConstraintValidator.analyzeH1NMRIntegrationSemantics(result.environments,false,false,{H:10});
      expect(summary.normalizedRatios.slice().sort()).toEqual([2,3]);
      expect(summary.canDetermineAbsoluteProtonCount).toBe(false);
      expect(summary.inferredTotalProtons).toBeNull();
      expect(result.protonSummary.spinSystems.some(p=>p.patternName.includes('乙'))).toBe(true);
      expect(result.protonSummary.solvent).toBe('Unknown');
    }
  });
  it('單一 quartet 或不相容 J 不足以確認乙基',()=>{
    const s=spectrum('1H_NMR',[{id:'q',x:4.1,y:100,integration:2,multiplicity:'q',jValues:[7]},{id:'t',x:1.2,y:90,integration:3,multiplicity:'t',jValues:[12]}]);
    expect(NMRAnalysisEngine.analyzeExperimental1HNMR(s).protonSummary.spinSystems.some(p=>p.patternName.includes('乙'))).toBe(false);
  });
  it('過氧鍵與偕二醇不屬非法價態',()=>{
    expect(ChemicalGraphValidator.validateCandidateSmiles('COOC').valid).toBe(true);
    expect(ChemicalGraphValidator.validateCandidateSmiles('C(O)O').valid).toBe(true);
  });
});
