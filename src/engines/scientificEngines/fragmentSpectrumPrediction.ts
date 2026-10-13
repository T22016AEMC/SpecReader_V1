import {ChemistryEngine} from '../chemistryEngine';
import type {ExperimentalSpectrumData,ParsedChemicalStructure,SpectralPeak} from '../../types/spectrum';
import {graphFragments} from './graphFragmentation';
import {ionMz,ELECTRON_MASS} from './ionMass';
export function predictFragmentSpectrum(structure:ParsedChemicalStructure,kind:'MS/MS'|'ToF-SIMS',negative=false):ExperimentalSpectrumData {
  const mass=ChemistryEngine.calculateMasses(structure.atomCounts).exactMass;
  const parent=kind==='MS/MS'?ionMz(mass,negative?'[M-H]-':'[M+H]+'):(mass+(negative?ELECTRON_MASS:-ELECTRON_MASS));
  const fragments=graphFragments(structure.smiles,negative?'[M-H]-':'[M+H]+',negative?-1:1,kind==='ToF-SIMS');
  const peaks:SpectralPeak[]=[{id:'possible-parent-ion',x:parent,y:100,isPredictedPeak:true,assignment:'可能的前驅／分子二次離子；出現與產率未預測',width:.1},...fragments.map((f,i)=>({id:`graph-fragment-${i}`,x:f.mz,y:100*f.plausibility,isPredictedPeak:true,assignment:`可能式 ${f.formula}${negative?'−':'+'}；${f.method}；圖原子斷鍵 ${f.cutAtoms.join('–')}`,width:.1}))];
  const limitations=kind==='MS/MS'?'單鍵斷裂與元素守恆的候選碎片；未建模完整重排、碰撞能量或經驗強度。':'表面正／負二次離子候選；未模擬基質、基底、初級離子束或離子產率，不能當作 ESI-MS。';
  return {modality:'MS',canonicalModality:kind==='MS/MS'?'MSMS':'TOF_SIMS',fileName:`${structure.molecularFormula}_${kind}_possible_ions`,sourceFormat:'SIMULATED',sourceType:'PREDICTED_SPECTRUM',dataOrigin:'EMPIRICAL_SIMULATION',modelType:'EMPIRICAL',isSimulated:true,xUnit:'m/z',yUnit:'示意權重（非預測離子產率）',points:peaks.map(p=>({x:p.x,y:p.y})),peaks,predictionNotes:[limitations,'峰是可能式，未聲稱必然出現；顯示權重僅供視覺化，非物理強度或機率。'],msParams:{msType:kind,ionization:kind==='MS/MS'?(negative?'ESI-':'ESI+'):(negative?'ToF-SIMS-':'ToF-SIMS+'),adductType:kind==='MS/MS'?(negative?'[M-H]-':'[M+H]+'):'[M]+•',chargeState:negative?-1:1,...(kind==='MS/MS'?{precursorMz:parent}:{})},validation:{isValid:true,qualityScore:40,issues:[{severity:'info',code:'UNVALIDATED_FRAGMENT_MODEL',message:limitations,recommendation:"以實测光譜與量測條件驗證；勿視為完整碎裂預測。"}]}};
}

