import type {ExperimentalSpectrumData,StructuralConstraints} from '../../types/spectrum';
/** Manual/selected observations are not a complete peak census or chemical assignments. */
export function observationSpectrum(s:ExperimentalSpectrumData):ExperimentalSpectrumData {
 return {...s,observationCoverage:s.observationCoverage??'PARTIAL_MARKERS',peaks:s.peaks.map(p=>p.isPredictedPeak?p:{...p,role:'ANALYTE',signalRole:'ANALYTE',userClassification:'COMPOUND',classificationTag:'COMPOUND',isSolventVerified:false})};
}
export function softenNMRConstraints(c:StructuralConstraints):StructuralConstraints {
 const groups=(c.requiredFunctionalGroups??[]).map(g=>({...g,status:'CANDIDATE' as const,confidence:Math.min(g.confidence,65)}));
 const motifs=(c.requiredSubstructures??[]).filter(m=>!/pyridin|pyrimid|quinolin|heteroaromat/i.test(m.motifId+' '+m.motifLabel)).map(m=>({...m,status:'PROBABLE' as const,confidence:Math.min(m.confidence,60)}));
 return {...c,heteroaromaticConstraints:undefined,requiredFunctionalGroups:groups,requiredSubstructures:motifs,excludedFunctionalGroups:[],
  aromaticity:c.aromaticity?.status==='ABSENT'?undefined:c.aromaticity?{...c.aromaticity,status:'POSSIBLE',confidence:Math.min(c.aromaticity.confidence,65)}:undefined,
  carbonyl:c.carbonyl?.status==='ABSENT'?undefined:c.carbonyl?{...c.carbonyl,status:'POSSIBLE',excludedSubtypes:[],confidence:Math.min(c.carbonyl.confidence,65)}:undefined,
  dbe:c.dbe?{...c.dbe,minDbe:0,confidence:Math.min(c.dbe.confidence??50,50)}:undefined,
 };
}
