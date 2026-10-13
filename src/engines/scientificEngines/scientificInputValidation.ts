import type {ExperimentalSpectrumData} from '../../types/spectrum';
export function validateScientificInput(s:ExperimentalSpectrumData):ExperimentalSpectrumData {
  const z=s.msParams?.chargeState,adduct=s.msParams?.adductType;
  const invalidCharge=z!==undefined&&(!Number.isInteger(z)||z===0||Math.abs(z)>10);
  const unspecifiedStoichiometry=z!==undefined&&Math.abs(z)>1&&(adduct==='[M+Na]+'||adduct==='[M+NH4]+');
  const invalidMass=s.modality==='MS'&&s.peaks.some(p=>!Number.isFinite(p.x)||p.x<=0);
  if(!invalidCharge&&!unspecifiedStoichiometry&&!invalidMass)return s;
  return {...s,peaks:[],validation:{...s.validation,isValid:false,issues:[...s.validation.issues,{severity:'error',code:'INVALID_SCIENTIFIC_INPUT',message:unspecifiedStoichiometry?'多價 Na／NH4 加合尚需明確化學計量；不自動當作單加合。':'質量或電荷無效，未執行此模態分析。',recommendation:'請核對正有限 m/z 與非零整數電荷；其他有效模態仍可獨立分析。'}]}};
}
