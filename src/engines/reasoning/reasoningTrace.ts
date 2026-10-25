import type {CandidateResult} from '../../types/spectrum';
import type {DeNovoSearchResult} from '../scientificEngines/deNovoGraphSearch';
import type {ReasoningPlan,ReasoningTrace} from './types';
export function completeReasoningTrace(plan:ReasoningPlan,search:DeNovoSearchResult|undefined,candidates:CandidateResult[]):ReasoningTrace {
 const records=candidates.map(c=>{const assembly=search?.derivations?.[c.smiles]??null;const localIds=assembly?.localStructureIds??[];
  return {candidateId:c.id,smiles:c.smiles,formula:c.molecularFormula,localStructureIds:localIds,assembly,compositionHypothesisIds:search?.formulaSources?.[c.smiles]??[],hypothesisIds:[...new Set(plan.localStructures.filter(l=>localIds.includes(l.id)).flatMap(l=>l.hypothesisIds))],evidence:(c.scientificScoreLedger?.entries??[]).map(e=>({observationIds:e.display?[]:e.observationIds,modality:e.sourceModality,status:e.compatibility===null?'UNKNOWN' as const:e.compatibility>=.55?'SUPPORT' as const:e.compatibility<.25?'CONTRADICTION' as const:'UNKNOWN' as const,method:e.method})),limitations:['組裝來源是搜尋提案，非額外獨立實驗加分','相對分數未經正確率校準；部分局部結構與連接未唯一確認']};});
 return {...plan,computation:'LOCAL_DETERMINISTIC',candidates:records,stages:[
  {step:1,module:'collectObservedEvidence',inputIds:plan.observations.map(o=>o.sourceId),outputIds:plan.observations.map(o=>o.id),summary:`${plan.observations.length}個實際觀測；精度未知保留null`},
  {step:2,module:'generateChemicalHypotheses',inputIds:plan.observations.map(o=>o.id),outputIds:plan.hypotheses.map(h=>h.id),summary:`${plan.hypotheses.length}個競爭環境／耦合假設；共享峰不重複作獨立證據`},
  {step:3,module:'inferLocalStructures',inputIds:plan.hypotheses.map(h=>h.id),outputIds:plan.localStructures.map(l=>l.id),summary:`${plan.localStructures.length}個含原子、鍵與開放連接點的局部圖；無2D直接連接宣稱`},
  {step:4,module:'searchMolecularGraphs / searchMolecularGraphsAsync',inputIds:plan.localStructures.map(l=>l.id),outputIds:search?.smiles??[],summary:`已展開${search?.visited??0}狀態；${search?.termination??'未搜尋'}；組成由圖產生，非猜式先行`},
  {step:5,module:'ChemicalHardConstraintValidator + scoreScientificEvidence',inputIds:search?.smiles??[],outputIds:records.map(r=>r.candidateId),summary:`${records.length}個候選通過硬限制並核對已提供光譜；組裝偏好不另加分`},
  {step:6,module:'StructureRenderer2D + ReasoningPanel',inputIds:records.map(r=>r.candidateId),outputIds:records.map(r=>r.smiles),summary:'由完整SMILES生成真實2D圖；失敗保留SMILES，不用R代替具體取代基'}
 ]};
}
