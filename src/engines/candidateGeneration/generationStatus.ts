import type {StructuralConstraints} from '../../types/spectrum';
import {ChemistryEngine} from '../chemistryEngine';
export type GenerationCode='CANDIDATES_FOUND'|'FORMULA_NOT_PROVIDED'|'INVALID_FORMULA_FORMAT'|'CHEMICALLY_INVALID_FORMULA'|'SEARCH_LIMIT'|'NO_MATCH_WITHIN_SEARCH'|'EXECUTION_ERROR';
export interface GenerationStatus {code:GenerationCode;message:string;userFormula:string|null;inferredFormulas:string[];heavyAtoms:number|null;dbe:number|null;limits:string;}
export function generationStatus(c:StructuralConstraints,count:number,logs:string[],error?:string):GenerationStatus {
 const raw=c.userSuppliedFormula?.rawInput??c.userSuppliedFormulaValidation?.targetFormula??null;
 const counts=raw?ChemistryEngine.parseFormulaCounts(raw):{},heavy=raw?Object.entries(counts).reduce((s,[e,n])=>s+(e==='H'?0:n),0):null;
 const limits='分子圖枚舉：中性 C/N/O/F/Cl/Br、最多九重原子、450ms／36輸出；另有非完整片段組裝。';
 const base={userFormula:raw,inferredFormulas:(c.molecularFormula?.candidates??[]).map(f=>f.formula),heavyAtoms:heavy,dbe:raw?ChemistryEngine.calculateDBE(counts):null,limits};
 if(error)return {...base,code:'EXECUTION_ERROR',message:'資料處理或執行失敗：'+error};
 const v=c.userSuppliedFormulaValidation;
 if(raw&&!v?.isValid&&!/^(?:[A-Z][a-z]?\d*)+$/.test(raw))return {...base,code:'INVALID_FORMULA_FORMAT',message:'分子式格式錯誤；原始輸入已保留，請修正格式。'};
 if(v&&!v.isSupported)return {...base,code:'SEARCH_LIMIT',message:'分子式或化學物種超出目前模型支援範圍，不等於化學上不可能。'+v.validationErrors.join('；')};
 if(v&&!v.isValid)return {...base,code:'CHEMICALLY_INVALID_FORMULA',message:'分子式違反目前採用的化學限制：'+v.validationErrors.join('；')};
 if(count)return {...base,code:'CANDIDATES_FOUND',message:`產生 ${count} 個化學有效候選；分子式只是組成限制，不確認連接方式。`};
 if((heavy??0)>9||logs.some(s=>/已達資源界限|RDKit 未載入|UNSUPPORTED|最多九|至多九/.test(s)))return {...base,code:'SEARCH_LIMIT',message:`${raw??'目前資料'}：未在支援的搜尋範圍／資源內取得候選。${raw?'已收到分子式，':'分子式為選填；'}不代表該組成不合法。`};
 if(!raw)return {...base,code:'FORMULA_NOT_PROVIDED',message:'未提供分子式；仍可分析已提供光譜。目前搜尋未取得完整候選，可保留局部環境或選填組成。'};
 return {...base,code:'NO_MATCH_WITHIN_SEARCH',message:'已完成指定有界搜尋，未找到同時滿足已確認條件的候選；不是所有化學結構已被排除。請檢查證據相容性及搜尋限制。'};
}
