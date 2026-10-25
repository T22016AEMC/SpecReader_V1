import type {StructuralConstraints} from '../../types/spectrum';
import type {DeNovoSearchResult} from '../scientificEngines/deNovoGraphSearch';
import {ChemistryEngine} from '../chemistryEngine';
import {ENUMERATION_CONFIG as ENUM} from '../enumeration/enumerationConfig';
import {REASON_LABEL} from '../enumeration/compositionPanelModel';
/** v1.2 reason codes are shown in words (the v1.1 codes keep their old text in this message). */
const V12_REASONS=['INVENTORY_ALTERNATIVES_TRUNCATED','AROMATIC_TEMPLATE_LIMITED','VINYL_READINGS_BUDGET','V12_CONSTRAINTS_FALLBACK'] as const;
const reasonText=(r:string)=>(V12_REASONS as readonly string[]).includes(r)?REASON_LABEL[r as (typeof V12_REASONS)[number]]:r;
export type GenerationCode='CANCELLED'|'INPUT_MISSING'|'CANDIDATES_FOUND'|'PARTIAL_CANDIDATES'|'FORMULA_NOT_PROVIDED'|'INVALID_FORMULA_FORMAT'|'CHEMICALLY_INVALID_FORMULA'|'SEARCH_LIMIT'|'TIME_BUDGET'|'STATE_BUDGET'|'SEARCH_INCOMPLETE'|'HARD_CONSTRAINT_CONFLICT'|'NO_MATCH_WITHIN_SEARCH'|'EXECUTION_ERROR'|'LOCAL_HYPOTHESES_ONLY';
export interface GenerationStatus {code:GenerationCode;message:string;userFormula:string|null;inferredFormulas:string[];heavyAtoms:number|null;dbe:number|null;limits:string;termination?:string;partialHypotheses?:string[];}
export function generationStatus(c:StructuralConstraints,count:number,logs:string[],error?:string,search?:DeNovoSearchResult):GenerationStatus {
 const raw=c.userSuppliedFormula?.rawInput??c.userSuppliedFormulaValidation?.targetFormula??null;
 const counts=raw?ChemistryEngine.parseFormulaCounts(raw):{},heavy=raw?Object.entries(counts).reduce((s,[e,n])=>s+(e==='H'?0:n),0):null;
 const limits='中性 C/N/O/F/Cl/Br 的有界圖擴展（非稠合芳環／鏈／有限閉環）；正式Worker採12秒／120000狀態、4096前沿、48輸出，可取消；同步相容入口仍採短預算；沒有產品級重原子數拒絕條件，非完整異構物搜尋。';
 const en=search?.enumeration?.used?search.enumeration:null;
 const exhaustiveLimits=`片段組裝窮舉（中性 C/N/O/S/F/Cl/Br/I，鍵階 1–3，S 僅二價；不含立體化學）：每次分析時間 ${ENUM.analysis.timeMs/1000} 秒、${ENUM.analysis.maxStates.toLocaleString('en-US')} 步、每個分子式 ${ENUM.analysis.maxCandidatesPerFormula.toLocaleString('en-US')} 個候選上限，超過 ${ENUM.analysis.maxScoredCandidates} 個候選時其餘保留但不進入完整評分，可取消。COMPLETE 只代表在目前分子式與片段約束下所有分支都走完，不代表列出所有可能結構；INCOMPLETE 會列出原因。舊 beam 搜尋保留為無法窮舉時的退路。`;
 const base={userFormula:raw,inferredFormulas:[],heavyAtoms:heavy,dbe:raw?ChemistryEngine.calculateDBE(counts):null,limits:en?exhaustiveLimits:limits,termination:search?.termination,partialHypotheses:search?.partialHypotheses??[]};
 if(error||search?.termination==='EXECUTION_ERROR')return {...base,code:'EXECUTION_ERROR',message:'資料處理或執行失敗：'+(error??search?.error??search?.note)};
 if(!raw&&c.contributingSources?.length===0&&!search)return {...base,code:'INPUT_MISSING',message:'尚無可分析的實測觀測或使用者組成；不執行任意結構搜尋。'};
 const v=c.userSuppliedFormulaValidation;
 if(raw&&!v?.isValid&&!/^(?:[A-Z][a-z]?\d*)+$/.test(raw))return {...base,code:'INVALID_FORMULA_FORMAT',message:'分子式格式錯誤；原始輸入已保留，請修正格式。'};
 if(v&&!v.isSupported||search?.termination==='UNSUPPORTED_CHEMISTRY'||search?.termination==='UNAVAILABLE')return {...base,code:'SEARCH_LIMIT',message:'組成／化學物種或計算工具超出目前支援範圍，不等於化學上不可能。'+(v?.validationErrors.join('；')??search?.note)};
 if(v&&!v.isValid||search?.termination==='INVALID_COMPOSITION')return {...base,code:'CHEMICALLY_INVALID_FORMULA',message:'分子式違反目前中性閉殼層價態／DBE 限制：'+(v?.validationErrors.join('；')??'DBE／價態不相容')};
 if(search?.termination==='CANCELLED')return {...base,code:'CANCELLED',message:`搜尋已取消；保留 ${count} 個已驗證候選及局部推論，搜尋未完成。`};
 if(count)return {...base,code:search&&!search.complete?'PARTIAL_CANDIDATES':'CANDIDATES_FOUND',message:`${raw?'使用者分子式 '+raw+'：':''}取得 ${count} 個有效圖候選；${en?`在目前約束下的窮舉${en.complete?'完整走完（COMPLETE）':'未完整（INCOMPLETE：'+[...new Set(en.runs.flatMap(r=>r.used?r.incompleteReasons:[]))].map(reasonText).join('、')+(en.runs.some(r=>!r.used)?'；部分分子式改用舊搜尋：'+en.runs.filter(r=>!r.used).map(r=>r.fallbackReason).join('；'):'')+'）'}，共列舉 ${en.enumerated} 個${en.deferred.count?`，${en.deferred.count} 個超過評分上限而未評分`:''}；`:search&&!search.complete?'搜尋未完整完成，':''}${raw?'符合使用者組成，仍非唯一連接方式。':'由局部證據引導的代表性結構，總組成尚未確認。'}`};
 if(search?.smiles.length&&!count&&search.rejectedByComposition)return {...base,code:'HARD_CONSTRAINT_CONFLICT',message:'搜尋已有圖，但未通過指定組成或圖合法性硬限制；未以其他加分掩蓋衝突。'};
 if(search?.termination==='TIME_BUDGET')return {...base,code:'TIME_BUDGET',message:'搜尋達到時間預算，尚未完成；保留局部證據，不代表組成不合法。'};
 if(search?.termination==='STATE_BUDGET')return {...base,code:'STATE_BUDGET',message:'搜尋達到狀態預算，尚未完成；保留局部證據。'};
 if(search?.termination==='BEAM_PRUNED'||search?.termination==='OUTPUT_BUDGET')return {...base,code:'SEARCH_INCOMPLETE',message:'有界圖搜尋曾剪枝或達輸出上限，尚未完整搜尋；未取得可報告的完整候選。'};
 if(search?.rejectedByComposition)return {...base,code:'HARD_CONSTRAINT_CONFLICT',message:'已生成的圖與指定組成或可靠質量約束衝突；保留輸入及局部證據，不忽略硬限制。'};
 if(search?.termination==='INSUFFICIENT_CONSTRAINTS')return {...base,code:'LOCAL_HYPOTHESES_ONLY',message:'目前只支持局部環境／片段；未確認完整組成，不強迫猜測小分子式或完整結構。'};
 if(logs.some(s=>/已達資源界限/.test(s)))return {...base,code:'SEARCH_LIMIT',message:'搜尋達資源界限，尚未完成。'};
 if(!raw&&!search)return {...base,code:'FORMULA_NOT_PROVIDED',message:'分子式為選填；目前保留已提供的局部證據，沒有足夠資訊形成完整候選。'};
 return {...base,code:'NO_MATCH_WITHIN_SEARCH',message:'指定圖文法的有限搜尋未取得符合條件的候選；不是全部化學結構已被排除。'};
}
