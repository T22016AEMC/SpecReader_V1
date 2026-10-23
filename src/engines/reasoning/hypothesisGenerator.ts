import type {IntegratedAnalysisBundle} from '../chemicalFeatureEngine';
import {sourceSpectra,uniqueObservations} from '../scientificEngines/evidenceLedger';
import {prepareIR} from '../scientificEngines/irSignalProcessing';
import {inferSignalEnvironments} from '../scientificEngines/atomicChemicalEnvironment';
import type {ObservedEvidence,ChemicalHypothesis,HypothesisKind,ReasoningPlan} from './types';
import {inferLocalStructures} from './localStructureInference';
import {assessNitrogenEvidence,NITROGEN_AMBIGUITY_NOTE,type NitrogenEvidence} from '../composition/nitrogenEvidence';

/** Observations remain separate from all chemical assignments. No absent-peak inference. */
export function collectObservedEvidence(bundle:IntegratedAnalysisBundle):ObservedEvidence[]{
 const result:ObservedEvidence[]=[];
 for(const [modality,raw] of Object.entries(sourceSpectra(bundle))){
  if(!raw||!raw.validation.isValid||raw.isSimulated||raw.digitizationFailed)continue;
  const s=modality==='IR'?prepareIR(raw):raw;
  for(const p of uniqueObservations(s.peaks)){
   const unknown:string[]=[];if(p.integration==null&&p.integral==null)unknown.push('未提供相對積分');if(!p.jValues?.length)unknown.push('未提供J');if(!p.multiplicity||p.multiplicity==='unresolved')unknown.push('未提供已知裂分');
   result.push({id:`${modality}:${raw.sourceId??raw.fileName}:${p.x}`,signalId:p.id,sourceId:raw.sourceId??raw.fileName,modality:modality as ObservedEvidence['modality'],value:p.x,unit:raw.xUnit,relativeIntensity:p.intensityKnown===false?null:p.y,relativeIntegral:p.integration??p.integral??null,multiplicity:p.multiplicity??null,jHz:p.jValues??[],shape:p.shape==='broad'||p.isBroad?'BROAD':p.shape==='sharp'?'NARROW':'UNKNOWN',uncertainty:null,origin:p.manualPeak||p.manualEdited||p.detectionSource==='MANUAL'?'MANUAL':'EXTRACTED',userOverride:p.userOverride??false,metadata:{solvent:raw.nmrSolvent??'Unknown',frequencyMHz:raw.spectrometerFrequencyMHz,temperatureK:raw.temperatureK,irScale:s.irIntensityScale,mass:raw.msParams},coverage:raw.observationCoverage==='CONFIRMED_COMPLETE'?'CONFIRMED_COMPLETE':'PARTIAL',unknown:[...unknown,'量測精度未確認；模型容差不是儀器精度'],...(p.optionalObservation?{optional:true}:{})});
  }
 }
 return result;
}
export function generateChemicalHypotheses(bundle:IntegratedAnalysisBundle,obs:ObservedEvidence[],nitrogen:NitrogenEvidence={mode:'EVIDENCE',allowed:true,reasons:[],note:''}):ChemicalHypothesis[]{
 // v1.1.6: without N-specific evidence, ambiguous O/N assignments default to O and N branches are not generated.
 const nAllowed=nitrogen.allowed;
 const hypotheses:ChemicalHypothesis[]=[];
 const add=(kind:HypothesisKind,description:string,roots:ObservedEvidence[],support:string[],constraints:ChemicalHypothesis['constraints'],level:ChemicalHypothesis['level']='POSSIBLE')=>{
  const h:ChemicalHypothesis={id:`hyp-${hypotheses.length}`,kind,description,observationIds:[...new Set(roots.map(o=>o.id))],support,uncertainties:['經驗環境假設，不是完整分子確認','未標記訊號為未知；無2D資料時連接不是直接觀測'],level,alternativeIds:[],compatibleIds:[],conflictIds:[],constraints};hypotheses.push(h);return h;
 };
 for(const o of obs){
  if(o.modality==='IR'){
   for(const f of bundle.irFindings.filter(f=>Math.abs(f.observedPeak-o.value)<2)){
    const family=f.family.toLowerCase();const kind:HypothesisKind|null=/alcohol|phenol|carboxylic acid/.test(family)&&o.value>2400?'HYDROXYL':/amine/.test(family)?'AMINO':/amide|ketone|aldehyde|ester|anhydride|acid|acyl/.test(family)&&o.value<1900&&o.value>1600?'CARBONYL':/aromatic/.test(family)?'AROMATIC':/alkene/.test(family)?'ALKENE':/alkyne/.test(family)?'ALKYNE':/nitrile/.test(family)?'NITRILE':/ether|c-o/.test(family)?'OXYGENATED':/amide/.test(family)&&o.value>3000?'AMINO':null;
    if(!kind)continue;
    if(!nAllowed&&(kind==='AMINO'||kind==='NITRILE')){
     // A broad 3300 band or a generic amine family is not N-specific; keep it as O–H with a note. A nitrile family without the C≡N band is dropped.
     if(kind==='AMINO'&&o.value>3000)add('HYDROXYL',`${f.functionalGroup}（${NITROGEN_AMBIGUITY_NOTE}；預設歸 O–H）`,[o],[f.reasoning,NITROGEN_AMBIGUITY_NOTE],{elementPossibilities:['O'],bondOrders:[1]},'POSSIBLE');
     continue;
    }
    const companions=obs.filter(q=>q.modality==='IR'&&q.id!==o.id&&f.companionPeaksObserved.some(r=>{const nums=r.match(/\d+/g)?.map(Number);return nums&&q.value>=nums[0]&&q.value<=nums[1];}));
    add(kind,f.functionalGroup,[o,...companions],[f.reasoning],{elementPossibilities:kind==='HYDROXYL'||kind==='OXYGENATED'?['O']:kind==='AMINO'?['N']:kind==='CARBONYL'?['C','O']:['C'],bondOrders:kind==='CARBONYL'||kind==='ALKENE'?[2]:kind==='AROMATIC'?[1,2]:[1],aromatic:kind==='AROMATIC'},f.matchLevel==='Strong'?'SUPPORTED':'POSSIBLE');
   }
  }else if(o.modality==='1H_NMR'||o.modality==='13C_NMR'){
   const p={id:o.signalId,x:o.value,y:o.relativeIntensity??0,integration:o.relativeIntegral,multiplicity:o.multiplicity as import('../../types/spectrum').SpectralPeak['multiplicity'],jValues:o.jHz,isBroad:o.shape==='BROAD'};
   for(const e of inferSignalEnvironments(o.modality,p,o.metadata.solvent??'Unknown',{nitrogenAllowed:nAllowed})){
    const key=e.id;const kind:HypothesisKind=/aromatic/.test(key)?'AROMATIC':/nitrile/.test(key)?'NITRILE':/alkyne|^sp-c$/.test(key)?'ALKYNE':/vinyl|alkene/.test(key)?'ALKENE':/acid-derivative|aldehyde-ketone|aldehyde-h/.test(key)?'CARBONYL':/exchange|acid-h/.test(key)?'HYDROXYL':e.neighborElements.includes('O')?'OXYGENATED':e.neighborElements.includes('N')?'NITROGENATED':'ALKYL';
    add(kind,e.label,[o],e.support,{elementPossibilities:e.neighborElements,bondOrders:e.hybridization==='sp2'?[1,2]:e.hybridization==='sp'?[1,3]:[1]},'POSSIBLE');
    if(nAllowed&&e.neighborElements.includes('N')&&!['AROMATIC','NITROGENATED','NITRILE','CARBONYL'].includes(kind))add(kind==='HYDROXYL'?'AMINO':'NITROGENATED',e.label+'：含N競爭解釋',[o],e.support,{elementPossibilities:['C','N'],bondOrders:[1]},'POSSIBLE');
   }
  }else{
   const kind=o.modality==='MS'?'ION':o.modality==='MS/MS'?'FRAGMENT':'SURFACE';
   add(kind,o.modality==='ToF-SIMS'?'表面二次離子／片段觀測':o.modality==='MS/MS'?'實測產品離子；連接需候選驗證':'離子m/z觀測',[o],[`實測 m/z ${o.value}；${o.metadata.mass?.ionAssignmentConfirmed?'離子假設由實驗確認':'電荷／加合未確認時不等於中性質量'}`],{elementPossibilities:[],bondOrders:[]},'POSSIBLE');
  }
 }
 const h=obs.filter(o=>o.modality==='1H_NMR');
 for(let i=0;i<h.length;i++)for(let j=i+1;j<h.length;j++){
  const a=h[i],b=h[j],shared=a.jHz.filter(v=>b.jHz.some(w=>Math.abs(v-w)<1.5));
  const equal=a.relativeIntegral!=null&&b.relativeIntegral!=null&&a.relativeIntegral>0&&b.relativeIntegral>0&&Math.abs(Math.log(a.relativeIntegral/b.relativeIntegral))<.2;
  if(a.value>=6.3&&a.value<=8.5&&b.value>=6.3&&b.value<=8.5&&a.multiplicity==='d'&&b.multiplicity==='d'&&equal){
   for(const [kind,distance,label] of [['ARYL_PARA',3,'對位雙取代'],['ARYL_META',2,'間位／偶然重疊'],['ARYL_ORTHO',1,'鄰位／偶然等價']] as const)add(kind,`${label}芳香環局部假設`,[a,b],[`兩組芳香區doublet、相對積分相等；${shared.length?'共同J='+shared.join(',')+' Hz':'J未知，支持較弱'}`],{elementPossibilities:['C'],bondOrders:[1,2],aromatic:true,relativeRatio:[1,1],jHz:shared,substitutionDistance:distance},kind==='ARYL_PARA'&&shared.some(v=>v>=6&&v<=10)?'SUPPORTED':'POSSIBLE');
  }
  const q=a.multiplicity==='q'?a:b,t=a.multiplicity==='t'?a:b;
  if(q!==t&&q.multiplicity==='q'&&t.multiplicity==='t'&&q.value<4.8&&t.value<2.5&&q.relativeIntegral!=null&&t.relativeIntegral!=null&&Math.abs(q.relativeIntegral/t.relativeIntegral-2/3)<.15&&shared.length)add('ETHYL','可能CH₂–CH₃局部連接',[q,t],['q/t、約2:3的相對比例與相容J共同支持；不是總氫數'],{elementPossibilities:['C'],bondOrders:[1],relativeRatio:[2,3],jHz:shared},'SUPPORTED');
 }
 for(const a of hypotheses)for(const b of hypotheses){if(a===b)continue;const shared=a.observationIds.some(id=>b.observationIds.includes(id));if(shared&&a.kind!==b.kind)a.alternativeIds.push(b.id);else if(!shared&&a.kind===b.kind)a.compatibleIds.push(b.id);}
 return hypotheses;
}
export function createReasoningPlan(bundle:IntegratedAnalysisBundle):ReasoningPlan {
 const observations=collectObservedEvidence(bundle),userFormula=bundle.userSuppliedFormula??null;
 const nitrogenEvidence=assessNitrogenEvidence({observations,spectra:sourceSpectra(bundle),userFormula});
 const hypotheses=generateChemicalHypotheses(bundle,observations,nitrogenEvidence);
 return {observations,hypotheses,localStructures:inferLocalStructures(hypotheses),userFormula,nitrogenEvidence,unknown:['部分人工峰表不表示其餘區域無訊號','無獨立絕對積分校準；無2D直接連接資料',...(nitrogenEvidence.allowed?[]:[nitrogenEvidence.note])]};
}
