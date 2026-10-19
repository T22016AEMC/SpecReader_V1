import type {ExperimentalSpectrumData,SpectralPeak,StructuralConstraints} from '../../types/spectrum';
const NON_ANALYTE_CLASSES=['SOLVENT','IMPURITY','NOISE'];
const NON_ANALYTE_ROLES=['SOLVENT','IMPURITY','WATER','MOISTURE','REFERENCE_TMS'];
/** The non-analyte label carried by a peak, from any of the classification fields; null when it is an analyte. */
export function nonAnalyteLabel(p:SpectralPeak):string|null {
 for(const v of [p.userClassification,p.classificationTag])if(v&&NON_ANALYTE_CLASSES.includes(v))return v;
 for(const v of [p.role,p.signalRole])if(v&&NON_ANALYTE_ROLES.includes(v))return v;
 return p.isSolventVerified?'SOLVENT':null;
}
/**
 * Manual/selected observations are not a complete peak census or chemical assignments.
 * Only peaks explicitly classified by the user (classificationSource 'USER') leave the Mode A observations;
 * automatic solvent/reference matches stay in as optional observations with their label preserved (P1a 審核決定 1, 6).
 */
export function observationSpectrum(s:ExperimentalSpectrumData):ExperimentalSpectrumData {
 const excluded:NonNullable<ExperimentalSpectrumData['excludedObservations']>=[];
 const peaks:SpectralPeak[]=[];
 for(const p of s.peaks){
  if(p.isPredictedPeak){peaks.push(p);continue;}
  const label=nonAnalyteLabel(p);
  if(label&&p.classificationSource==='USER'){excluded.push({peakId:p.id,x:p.x,label});continue;}
  peaks.push({...p,role:'ANALYTE',signalRole:'ANALYTE',userClassification:'COMPOUND',classificationTag:'COMPOUND',isSolventVerified:false,...(label?{optionalObservation:true,autoNonAnalyteLabel:label}:{})});
 }
 return {...s,observationCoverage:s.observationCoverage??'PARTIAL_MARKERS',peaks,...(excluded.length?{excludedObservations:[...(s.excludedObservations??[]),...excluded]}:{})};
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
