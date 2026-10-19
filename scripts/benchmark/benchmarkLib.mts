import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import type {MainModule} from '@rdkit/rdkit';
import {SpectrumParser} from '../../src/engines/spectrumParser';
import {WorkbenchOrchestrator} from '../../src/engines/workbenchOrchestrator';
import {ChemistryEngine} from '../../src/engines/chemistryEngine';
import {executeSixStepAnalysis} from '../../src/engines/reasoning/sixStepAnalysis';
import {initializeRDKit,rdkitStatus} from '../../src/engines/scientificEngines/rdkitAdapter';
import type {ExperimentalSpectrumData,IonizationMode,MSParameters,NMRSolvent,SpectralPeak} from '../../src/types/spectrum';

/**
 * Benchmark harness (P0, v1.1.4). It measures the current Mode A; it never changes it.
 * Every case goes through the production entry executeSixStepAnalysis with the same
 * AnalysisInput shape the UI sends to modeA.worker.ts. Numeric spectra are parsed by
 * SpectrumParser.parseUploadedFile (the UI upload path). Peak-table JSON files follow
 * tests/fixtures.ts and enter the system as manually marked peaks.
 */
export const BENCHMARK_FORMAT_VERSION=1;
export const MODALITIES=['IR','1H_NMR','13C_NMR','MS'] as const;
export type BenchModality=(typeof MODALITIES)[number];
export const CONDITIONS=['noFormula','withFormula'] as const;
export type ConditionName=(typeof CONDITIONS)[number];
export interface RunBudget {mode:'deterministic'|'ui';timeMs:number;maxStates:number}
/** State count is the budget; the time limit is only a safety net so results do not vary with machine speed. */
export const DETERMINISTIC_BUDGET:RunBudget={mode:'deterministic',timeMs:600000,maxStates:120000};
/** Same limits as the production UI (executeSixStepAnalysis defaults). */
export const UI_BUDGET:RunBudget={mode:'ui',timeMs:12000,maxStates:120000};

const NMR_SOLVENTS:readonly NMRSolvent[]=['CDCl3','DMSO-d6','CD3OD','D2O','Acetone-d6','CD3CN','C6D6','THF-d8','CD2Cl2','Toluene-d8','Unknown'];
const C13_MODES=['BROADBAND_DECOUPLED','1D_PROTON_DECOUPLED','DEPT_90','DEPT_135','APT','UNKNOWN'] as const;
const IONIZATIONS:readonly IonizationMode[]=['EI','ESI+','ESI-','APCI','SIMS / ToF-SIMS','ToF-SIMS+','ToF-SIMS-','Other','Auto / Unknown'];
const ADDUCTS:readonly NonNullable<MSParameters['adductType']>[]=['Auto','[M]+•','[M+H]+','[M+Na]+','[M+NH4]+','[M-H]-'];
const ENTRY_KEYS:Record<BenchModality,readonly string[]>={
 IR:['file'],
 '1H_NMR':['file','solvent','frequencyMHz'],
 '13C_NMR':['file','solvent','frequencyMHz','dept'],
 MS:['file','ionization','adduct','ionAssignmentConfirmed','highResolution','chargeState'],
};
const PEAK_KEYS=['x','y','integration','integral','multiplicity','j','jValues','width','shape','isBroad','irIntensity','assignment','deptType','intensityKnown'];
const IMAGE_EXT=['png','jpg','jpeg','webp','gif','bmp','tif','tiff','pdf'];
const NUMERIC_EXT=['csv','txt','tsv','jdx','dx','jcm','jcamp','xls','xlsx'];

export interface SpectrumEntry {file:string;[key:string]:unknown}
export interface BenchmarkCase {id:string;name:string;answerSmiles:string;formula?:string;source?:{name?:string;url?:string;notes?:string};tags:string[];spectra:Record<string,SpectrumEntry>}
export interface LoadedCase {folder:string;dir:string;case:BenchmarkCase|null;loadError:string|null;warnings:string[]}
export interface BuiltSpectra {spectra:Partial<Record<BenchModality,ExperimentalSpectrumData>>;skipped:{modality:string;reason:string}[];unmapped:string[];notes:string[]}
export interface ConditionResult {
 condition:ConditionName;status:'OK'|'ERROR'|'SKIPPED';rank:number|null;candidateCount:number|null;formulaRank:number|null;
 termination:string|null;visitedStates:number|null;elapsedMs:number|null;searchElapsedMs:number|null;generationCode:string|null;engineUserFormula:string|null;
 error:string|null;skipReason:string|null;
}
export interface CaseRecord {
 id:string;name:string;answerSmiles:string;answerCanonical:string|null;answerFormula:string|null;caseFormula:string|null;tags:string[];synthetic:boolean;
 declaredModalities:string[];modalities:BenchModality[];modalityKey:string;skippedSpectra:{modality:string;reason:string}[];unmappedFields:string[];notes:string[];warnings:string[];
 status:'EVALUATED'|'SKIPPED'|'ERROR';error:string|null;results:Partial<Record<ConditionName,ConditionResult>>;
}
export interface Metrics {n:number;top1:number;top5:number;top10:number;found:number;formulaFound:number;errors:number}
export interface Aggregate {
 aggregates:Record<ConditionName,{overall:Metrics;byModalities:Record<string,Metrics>}>;
 counts:{total:number;evaluated:number;skipped:number;error:number;synthetic:number};
}
export interface BenchmarkRun {
 harness:{formatVersion:number;appVersion:string;commit:string|null;node:string;startedAt:string;finishedAt:string;caseFilter:string[]};
 budget:RunBudget;records:CaseRecord[];aggregate:Aggregate;
}

const isRecord=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
/** Windows PowerShell 5.1 and Notepad write a UTF-8 BOM that JSON.parse rejects. */
const readJson=(file:string):unknown=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^﻿/,''));
const isSynthetic=(id:string,tags:string[])=>tags.includes('synthetic')||id.startsWith('synthetic_');

// ---------------------------------------------------------------- chemistry comparison
let rdkitCompare:Promise<MainModule>|null=null;
/** Separate RDKit instance for answer comparison; the engine's own instance is not exposed. */
function comparisonRDKit():Promise<MainModule> {
 rdkitCompare??=import('@rdkit/rdkit').then(m=>(m.default as unknown as (o?:unknown)=>Promise<MainModule>)());
 return rdkitCompare;
}
/** Canonical SMILES with stereochemistry removed; null when RDKit cannot parse it. */
export async function stereoFreeCanonical(smiles:string):Promise<string|null> {
 const rdkit=await comparisonRDKit();
 const mol=rdkit.get_mol(smiles);
 if(!mol)return null;
 try {return mol.is_valid()?mol.get_smiles(JSON.stringify({doIsomericSmiles:false})):null;}
 finally {mol.delete();}
}
export async function sameStructure(a:string,b:string):Promise<boolean> {
 const [x,y]=await Promise.all([stereoFreeCanonical(a),stereoFreeCanonical(b)]);
 return x!==null&&x===y;
}
export function normalizeFormula(formula:string):string {
 return ChemistryEngine.formatFormula(ChemistryEngine.parseFormulaCounts(formula));
}

// ---------------------------------------------------------------- case loading
function parseCaseJson(raw:unknown,folder:string):{case:BenchmarkCase|null;error:string|null;warnings:string[]} {
 const warnings:string[]=[];
 if(!isRecord(raw))return {case:null,error:'case.json 必須是 JSON 物件',warnings};
 const str=(key:string)=>typeof raw[key]==='string'&&(raw[key] as string).trim()?(raw[key] as string).trim():null;
 const id=str('id');if(!id)return {case:null,error:'case.json 缺少 id',warnings};
 const answer=str('answerSmiles');if(!answer)return {case:null,error:'case.json 缺少 answerSmiles',warnings};
 if(id!==folder)warnings.push(`id「${id}」與資料夾名稱「${folder}」不同`);
 if(!isRecord(raw.spectra)||!Object.keys(raw.spectra).length)return {case:null,error:'case.json 的 spectra 不可為空',warnings};
 const spectra:Record<string,SpectrumEntry>={};
 for(const [key,entry] of Object.entries(raw.spectra)){
  if(!isRecord(entry)||typeof entry.file!=='string'||!entry.file.trim())return {case:null,error:`spectra.${key} 缺少 file`,warnings};
  spectra[key]={...entry,file:entry.file};
 }
 const tags=Array.isArray(raw.tags)?raw.tags.filter((t):t is string=>typeof t==='string'):[];
 const source=isRecord(raw.source)?{name:typeof raw.source.name==='string'?raw.source.name:undefined,url:typeof raw.source.url==='string'?raw.source.url:undefined,notes:typeof raw.source.notes==='string'?raw.source.notes:undefined}:undefined;
 return {case:{id,name:str('name')??id,answerSmiles:answer,formula:str('formula')??undefined,source,tags,spectra},error:null,warnings};
}
export function loadCases(benchmarkDir:string):{status:'NO_DIR'|'NO_CASES'|'OK';casesDir:string;cases:LoadedCase[]} {
 const casesDir=path.join(benchmarkDir,'cases');
 if(!fs.existsSync(casesDir)||!fs.statSync(casesDir).isDirectory())return {status:'NO_DIR',casesDir,cases:[]};
 const folders=fs.readdirSync(casesDir,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name).sort();
 const cases:LoadedCase[]=[];
 for(const folder of folders){
  const dir=path.join(casesDir,folder),file=path.join(dir,'case.json');
  if(!fs.existsSync(file))continue;
  try {
   const parsed=parseCaseJson(readJson(file),folder);
   cases.push({folder,dir,case:parsed.case,loadError:parsed.error,warnings:parsed.warnings});
  }catch(error){cases.push({folder,dir,case:null,loadError:`case.json 無法解析：${error instanceof Error?error.message:String(error)}`,warnings:[]});}
 }
 return {status:cases.length?'OK':'NO_CASES',casesDir,cases};
}

// ---------------------------------------------------------------- spectra construction
function peakTableSpectrum(modality:BenchModality,fileName:string,rows:unknown,unmapped:string[],label:string):ExperimentalSpectrumData {
 if(!Array.isArray(rows)||!rows.length)throw new Error(`${label} 峰表必須是非空陣列`);
 const unknownKeys=new Set<string>();
 const peaks:SpectralPeak[]=rows.map((row,i)=>{
  if(!isRecord(row)||typeof row.x!=='number'||!Number.isFinite(row.x))throw new Error(`${label} 第 ${i+1} 筆缺少數值 x`);
  for(const key of Object.keys(row))if(!PEAK_KEYS.includes(key))unknownKeys.add(key);
  if(row.y!==undefined&&(typeof row.y!=='number'||!Number.isFinite(row.y)))throw new Error(`${label} 第 ${i+1} 筆 y 不是數值`);
  const j=row.jValues??row.j;
  if(j!==undefined&&!(Array.isArray(j)&&j.every(v=>typeof v==='number')))throw new Error(`${label} 第 ${i+1} 筆 j 必須是數值陣列`);
  const peak:SpectralPeak={id:`${modality}-p${i+1}`,x:row.x,y:typeof row.y==='number'?row.y:100,manualPeak:true,detectionSource:'MANUAL'};
  if(typeof row.y!=='number')peak.intensityKnown=false;
  if(row.integration!==undefined)peak.integration=row.integration as number|null;
  if(row.integral!==undefined)peak.integral=row.integral as number;
  if(row.multiplicity!==undefined)peak.multiplicity=row.multiplicity as SpectralPeak['multiplicity'];
  if(j!==undefined)peak.jValues=j as number[];
  for(const key of ['width','shape','isBroad','irIntensity','assignment','deptType','intensityKnown'] as const)if(row[key]!==undefined)(peak as unknown as Record<string,unknown>)[key]=row[key];
  return peak;
 });
 for(const key of unknownKeys)unmapped.push(`${label} 峰表欄位「${key}」`);
 return {modality,fileName,sourceFormat:'CSV',isSimulated:false,sourceType:'NUMERIC_EXPERIMENTAL',xUnit:modality==='IR'?'cm⁻¹':modality==='MS'?'m/z':'ppm',yUnit:'Intensity',points:peaks.map(p=>({x:p.x,y:p.y})),peaks,validation:{isValid:true,qualityScore:95,issues:[]}};
}
function applyNmrConditions(spec:ExperimentalSpectrumData,modality:'1H_NMR'|'13C_NMR',entry:SpectrumEntry,unmapped:string[],label:string):ExperimentalSpectrumData {
 let out=spec;
 if(entry.solvent!==undefined&&entry.solvent!==null){
  if(typeof entry.solvent==='string'&&(NMR_SOLVENTS as readonly string[]).includes(entry.solvent))out=WorkbenchOrchestrator.applyNmrSolventTagging(out,entry.solvent as NMRSolvent);
  else unmapped.push(`${label}.solvent「${String(entry.solvent)}」不是 SpectrumParser 支援的溶劑（${NMR_SOLVENTS.join('、')}）`);
 }
 if(entry.frequencyMHz!==undefined&&entry.frequencyMHz!==null){
  if(typeof entry.frequencyMHz==='number'&&entry.frequencyMHz>0)out={...out,spectrometerFrequencyMHz:entry.frequencyMHz};
  else unmapped.push(`${label}.frequencyMHz「${String(entry.frequencyMHz)}」不是正數`);
 }
 if(modality==='13C_NMR'&&entry.dept!==undefined&&entry.dept!==null){
  const mode=typeof entry.dept==='string'?entry.dept.trim().toUpperCase().replace(/-/g,'_'):'';
  if((C13_MODES as readonly string[]).includes(mode))out={...out,c13ExperimentMode:mode as (typeof C13_MODES)[number]};
  else unmapped.push(`${label}.dept「${String(entry.dept)}」無法對應 c13ExperimentMode（${C13_MODES.join('、')}）`);
 }
 return out;
}
/** Mirrors MassExperimentConditions.update(): the same msParams fields the UI edits for MS. */
function applyMsConditions(spec:ExperimentalSpectrumData,entry:SpectrumEntry,unmapped:string[],notes:string[],label:string):ExperimentalSpectrumData {
 const patch:Partial<MSParameters>={};
 if(entry.ionization!==undefined&&entry.ionization!==null){
  if(typeof entry.ionization==='string'&&(IONIZATIONS as readonly string[]).includes(entry.ionization))patch.ionization=entry.ionization as IonizationMode;
  else unmapped.push(`${label}.ionization「${String(entry.ionization)}」不在 IonizationMode（${IONIZATIONS.join('、')}）`);
 }
 if(entry.adduct!==undefined&&entry.adduct!==null){
  if(typeof entry.adduct==='string'&&(ADDUCTS as readonly string[]).includes(entry.adduct))patch.adductType=entry.adduct as MSParameters['adductType'];
  else unmapped.push(`${label}.adduct「${String(entry.adduct)}」不在 adductType（${ADDUCTS.join('、')}）`);
 }
 if(entry.highResolution!==undefined&&entry.highResolution!==null){
  if(typeof entry.highResolution==='boolean')patch.isHighResolution=entry.highResolution;
  else unmapped.push(`${label}.highResolution 必須是布林值`);
 }
 if(entry.chargeState!==undefined&&entry.chargeState!==null){
  if(typeof entry.chargeState==='number'&&Number.isInteger(entry.chargeState)&&entry.chargeState!==0)patch.chargeState=entry.chargeState;
  else unmapped.push(`${label}.chargeState 必須是非零整數`);
 }
 if(entry.ionAssignmentConfirmed!==undefined&&entry.ionAssignmentConfirmed!==null){
  if(typeof entry.ionAssignmentConfirmed!=='boolean')unmapped.push(`${label}.ionAssignmentConfirmed 必須是布林值`);
  else if(entry.ionAssignmentConfirmed){
   // The UI only enables this checkbox once a charge and a concrete adduct are set.
   if(!patch.adductType||patch.adductType==='Auto')unmapped.push(`${label}.ionAssignmentConfirmed=true 但沒有具體 adduct；UI 不允許此組合，已忽略確認旗標`);
   else {
    if(patch.chargeState===undefined){patch.chargeState=1;notes.push(`${label}：case.json 未提供電荷，依單電荷加合 ${patch.adductType} 設為 chargeState=1（UI 需先填電荷才能確認離子歸屬）`);}
    patch.ionAssignmentConfirmed=true;
   }
  }else patch.ionAssignmentConfirmed=false;
 }
 return {...spec,msParams:{msType:'EI-MS',ionization:'Auto / Unknown',...spec.msParams,...patch}};
}
export async function buildCaseSpectra(caseDir:string,c:BenchmarkCase):Promise<BuiltSpectra> {
 const out:BuiltSpectra={spectra:{},skipped:[],unmapped:[],notes:[]};
 for(const [key,entry] of Object.entries(c.spectra)){
  const label=`${c.id}.${key}`;
  if(!(MODALITIES as readonly string[]).includes(key)){
   out.skipped.push({modality:key,reason:'P0 評測工具只支援 IR／1H_NMR／13C_NMR／MS'});out.unmapped.push(`${label}（未知或不支援的模態）`);continue;
  }
  const modality=key as BenchModality;
  for(const k of Object.keys(entry))if(!ENTRY_KEYS[modality].includes(k))out.unmapped.push(`${label}.${k}（${modality} 沒有對應的 SpectrumParser／ExperimentalSpectrumData 欄位）`);
  const file=path.resolve(caseDir,entry.file);
  if(path.relative(caseDir,file).startsWith('..')||path.isAbsolute(path.relative(caseDir,file)))throw new Error(`${label}.file 必須位於案例資料夾內`);
  const ext=path.extname(file).slice(1).toLowerCase();
  if(IMAGE_EXT.includes(ext)){out.skipped.push({modality,reason:'需人工轉成峰表（圖片型光譜無法無頭評測）'});continue;}
  if(!fs.existsSync(file))throw new Error(`${label} 找不到檔案 ${entry.file}`);
  let spec:ExperimentalSpectrumData;
  if(ext==='json')spec=peakTableSpectrum(modality,path.basename(file),readJson(file),out.unmapped,label);
  else if(NUMERIC_EXT.includes(ext)){
   // Same call the UI makes in handleFileUpload; MS conditions are applied afterwards, as in the UI.
   spec=await SpectrumParser.parseUploadedFile(new File([fs.readFileSync(file)],path.basename(file)),modality,undefined,{disableAutoPeakDetection:false});
  }else{out.skipped.push({modality,reason:`不支援的副檔名 .${ext}`});continue;}
  if(modality==='1H_NMR'||modality==='13C_NMR')spec=applyNmrConditions(spec,modality,entry,out.unmapped,label);
  else if(modality==='MS')spec=applyMsConditions(spec,entry,out.unmapped,out.notes,label);
  out.spectra[modality]=spec;
 }
 return out;
}

// ---------------------------------------------------------------- running
const emptyResult=(condition:ConditionName):ConditionResult=>({condition,status:'OK',rank:null,candidateCount:null,formulaRank:null,termination:null,visitedStates:null,elapsedMs:null,searchElapsedMs:null,generationCode:null,engineUserFormula:null,error:null,skipReason:null});
export async function runCondition(spectra:Partial<Record<BenchModality,ExperimentalSpectrumData>>,condition:ConditionName,formula:string|null,answerCanonical:string,answerFormula:string,budget:RunBudget):Promise<ConditionResult> {
 const result=emptyResult(condition);
 const started=performance.now();
 try {
  // Production input shape (App.tsx extraChemicalInput): the user's formula travels in extraInput.molecularFormula.
  const extraInput=condition==='withFormula'&&formula?{molecularFormula:formula}:{};
  const analysis=await executeSixStepAnalysis({spectra:structuredClone(spectra),extraInput},{timeMs:budget.timeMs,maxStates:budget.maxStates});
  result.elapsedMs=performance.now()-started;
  const search=analysis.solvedConstraintSpace.searchResult;
  result.termination=search?.termination??analysis.generationStatus?.termination??null;
  result.visitedStates=search?.visited??null;
  result.searchElapsedMs=search?.elapsedMs??null;
  result.generationCode=analysis.generationStatus?.code??null;
  result.engineUserFormula=analysis.generationStatus?.userFormula??null;
  const ranked=analysis.rankedCandidates;
  result.candidateCount=ranked.length;
  const target=normalizeFormula(answerFormula);
  for(let i=0;i<ranked.length;i++){
   if(result.formulaRank===null&&normalizeFormula(ranked[i].molecularFormula)===target)result.formulaRank=i+1;
   if(result.rank===null&&await sameStructure(ranked[i].smiles,answerCanonical))result.rank=i+1;
   if(result.rank!==null&&result.formulaRank!==null)break;
  }
 }catch(error){
  result.status='ERROR';result.error=error instanceof Error?error.message:String(error);result.elapsedMs=performance.now()-started;
 }
 return result;
}
export async function evaluateCase(loaded:LoadedCase,budget:RunBudget,log:(message:string)=>void=()=>{}):Promise<CaseRecord> {
 const c=loaded.case;
 const base:CaseRecord={id:c?.id??loaded.folder,name:c?.name??loaded.folder,answerSmiles:c?.answerSmiles??'',answerCanonical:null,answerFormula:null,caseFormula:c?.formula??null,tags:c?.tags??[],synthetic:false,declaredModalities:c?Object.keys(c.spectra):[],modalities:[],modalityKey:'',skippedSpectra:[],unmappedFields:[],notes:[],warnings:[...loaded.warnings],status:'ERROR',error:null,results:{}};
 base.synthetic=isSynthetic(base.id,base.tags);
 if(!c){base.error=loaded.loadError;return base;}
 try {
  const answerCanonical=await stereoFreeCanonical(c.answerSmiles);
  if(!answerCanonical)throw new Error(`answerSmiles 無法由 RDKit 解析：${c.answerSmiles}`);
  base.answerCanonical=answerCanonical;
  const answerFormula=ChemistryEngine.parseStructureInput(answerCanonical).molecularFormula;
  base.answerFormula=answerFormula;
  if(c.formula&&normalizeFormula(c.formula)!==normalizeFormula(answerFormula))base.warnings.push(`formula「${c.formula}」與 answerSmiles 計算出的分子式「${answerFormula}」不一致；正確分子式指標以 answerSmiles 為準，withFormula 仍使用 case.json 的 formula`);
  const built=await buildCaseSpectra(loaded.dir,c);
  base.skippedSpectra=built.skipped;base.unmappedFields=built.unmapped;base.notes=built.notes;
  base.modalities=MODALITIES.filter(m=>built.spectra[m]);
  base.modalityKey=base.modalities.join('+');
  if(!base.modalities.length){base.status='SKIPPED';base.error=built.skipped.length?built.skipped.map(s=>`${s.modality}：${s.reason}`).join('；'):'沒有可評測的光譜';return base;}
  base.status='EVALUATED';
  for(const condition of CONDITIONS){
   if(condition==='withFormula'&&!c.formula){base.results[condition]={...emptyResult(condition),status:'SKIPPED',skipReason:'case.json 沒有 formula'};continue;}
   const result=await runCondition(built.spectra,condition,c.formula??null,answerCanonical,answerFormula,budget);
   base.results[condition]=result;
   log(`  ${condition}: ${result.status==='ERROR'?'ERROR '+result.error:`名次=${result.rank??'—'} 候選=${result.candidateCount} 分子式名次=${result.formulaRank??'—'} ${result.termination} 狀態=${result.visitedStates} ${((result.elapsedMs??0)/1000).toFixed(1)}s`}`);
  }
 }catch(error){base.status='ERROR';base.error=error instanceof Error?error.message:String(error);}
 return base;
}

// ---------------------------------------------------------------- aggregation
const emptyMetrics=():Metrics=>({n:0,top1:0,top5:0,top10:0,found:0,formulaFound:0,errors:0});
function addMetric(m:Metrics,r:ConditionResult){
 m.n++;
 if(r.status==='ERROR')m.errors++;
 if(r.rank!==null){m.found++;if(r.rank<=1)m.top1++;if(r.rank<=5)m.top5++;if(r.rank<=10)m.top10++;}
 if(r.formulaRank!==null)m.formulaFound++;
}
/** Synthetic smoke-test cases never count toward accuracy; skipped and load-error cases have no result and do not either. */
export function aggregate(records:CaseRecord[]):Aggregate {
 const aggregates={} as Aggregate['aggregates'];
 for(const condition of CONDITIONS)aggregates[condition]={overall:emptyMetrics(),byModalities:{}};
 for(const record of records){
  if(record.synthetic||record.status!=='EVALUATED')continue;
  for(const condition of CONDITIONS){
   const r=record.results[condition];
   if(!r||r.status==='SKIPPED')continue;
   addMetric(aggregates[condition].overall,r);
   addMetric(aggregates[condition].byModalities[record.modalityKey]??=emptyMetrics(),r);
  }
 }
 return {aggregates,counts:{total:records.length,evaluated:records.filter(r=>r.status==='EVALUATED').length,skipped:records.filter(r=>r.status==='SKIPPED').length,error:records.filter(r=>r.status==='ERROR').length,synthetic:records.filter(r=>r.synthetic).length}};
}

// ---------------------------------------------------------------- reports
const pct=(k:number,n:number)=>n?`${(100*k/n).toFixed(1)}%`:'—';
const cell=(value:unknown)=>String(value??'—').replace(/\|/g,'\\|').replace(/\r?\n/g,' ');
const seconds=(ms:number|null)=>ms===null?'—':(ms/1000).toFixed(1);
function metricsTable(title:string,groups:Record<string,Metrics>):string[] {
 const rows=Object.entries(groups);
 if(!rows.length)return [`### ${title}`,'','（沒有可計入的案例）',''];
 return [`### ${title}`,'','| 模態組合 | n | top-1 | top-5 | top-10 | 找到率 | 正確分子式找到率 | 執行錯誤 |','|---|---|---|---|---|---|---|---|',...rows.map(([key,m])=>`| ${cell(key)} | ${m.n} | ${pct(m.top1,m.n)} (${m.top1}) | ${pct(m.top5,m.n)} (${m.top5}) | ${pct(m.top10,m.n)} (${m.top10}) | ${pct(m.found,m.n)} (${m.found}) | ${pct(m.formulaFound,m.n)} (${m.formulaFound}) | ${m.errors} |`),''];
}
function aggregateSections(run:BenchmarkRun):string[] {
 const lines:string[]=['## 匯總指標','','分母只含實際執行該條件的非 synthetic 案例；執行錯誤計為未找到。noFormula 為主要指標。',''];
 for(const condition of CONDITIONS){
  const a=run.aggregate.aggregates[condition];
  lines.push(`## 條件：${condition}`,'',...metricsTable('全部案例',{全部:a.overall}),...metricsTable('依提供的模態組合',a.byModalities));
 }
 return lines;
}
function headerLines(run:BenchmarkRun,title:string):string[] {
 const c=run.aggregate.counts;
 return [`# ${title}`,'',
  `- 應用版本：${run.harness.appVersion}（commit ${run.harness.commit??'未知'}）；Node ${run.harness.node}`,
  `- 執行時間：${run.harness.startedAt} → ${run.harness.finishedAt}`,
  `- 搜尋預算：${run.budget.mode==='ui'?'正式 UI 預算':'可重現預算（以狀態數為準）'}；maxStates=${run.budget.maxStates}；timeMs=${run.budget.timeMs}`,
  ...(run.harness.caseFilter.length?[`- 範圍：只執行 --case 篩選的案例（${run.harness.caseFilter.join('、')}），為局部結果`]:[]),
  `- 案例：共 ${c.total}；已評測 ${c.evaluated}；略過 ${c.skipped}；錯誤 ${c.error}；synthetic（不計入準確率）${c.synthetic}`,''];
}
function modalityLabel(r:CaseRecord){return r.modalityKey||'—';}
function conditionCell(r:ConditionResult|undefined){
 if(!r)return '—';
 if(r.status==='SKIPPED')return `略過：${r.skipReason}`;
 if(r.status==='ERROR')return `錯誤：${r.error}`;
 return `${r.rank??'—'}`;
}
export function renderFullMarkdown(run:BenchmarkRun):string {
 const lines=[...headerLines(run,'SpecReader 基準評測完整結果'),...aggregateSections(run)];
 lines.push('## 逐案例結果','','名次＝正確結構在 rankedCandidates 中的名次（去除立體資訊後比對）；— 表示沒有找到。','',
  '| 案例 | 條件 | 模態 | 名次 | 候選數 | 正確分子式名次 | 終止原因 | 展開狀態 | 搜尋耗時(s) | 總耗時(s) | 引擎看到的分子式 | 錯誤 |','|---|---|---|---|---|---|---|---|---|---|---|---|');
 for(const r of run.records){
  const tag=r.synthetic?'（synthetic）':'';
  if(r.status!=='EVALUATED'){lines.push(`| ${cell(r.id+tag)} | — | ${cell(modalityLabel(r))} | — | — | — | — | — | — | — | — | ${cell(r.status+'：'+r.error)} |`);continue;}
  for(const condition of CONDITIONS){
   const x=r.results[condition];
   if(!x)continue;
   lines.push(`| ${cell(r.id+tag)} | ${condition} | ${cell(modalityLabel(r))} | ${x.status==='OK'?x.rank??'—':'—'} | ${x.candidateCount??'—'} | ${x.formulaRank??'—'} | ${cell(x.termination)} | ${x.visitedStates??'—'} | ${seconds(x.searchElapsedMs)} | ${seconds(x.elapsedMs)} | ${cell(x.engineUserFormula)} | ${cell(x.status==='OK'?'':x.status==='SKIPPED'?'略過：'+x.skipReason:x.error)} |`);
  }
 }
 const flagged=run.records.filter(r=>r.skippedSpectra.length||r.unmappedFields.length||r.warnings.length||r.notes.length);
 lines.push('','## 案例資料備註','');
 if(!flagged.length)lines.push('（無）');
 for(const r of flagged){
  lines.push(`### ${r.id}`,'');
  for(const s of r.skippedSpectra)lines.push(`- 略過光譜 ${s.modality}：${s.reason}`);
  for(const u of r.unmappedFields)lines.push(`- 無法對應：${u}`);
  for(const w of r.warnings)lines.push(`- 警告：${w}`);
  for(const n of r.notes)lines.push(`- 備註：${n}`);
  lines.push('');
 }
 return lines.join('\n')+'\n';
}
/** Repository copy: ids, names, answer SMILES and metrics only. No spectrum values, file names or local paths. */
export function renderSummaryMarkdown(run:BenchmarkRun):string {
 const lines=[...headerLines(run,`SpecReader 基準評測匯總 v${run.harness.appVersion}`),...aggregateSections(run)];
 lines.push('## 案例清單','','| 案例 | 名稱 | 答案 SMILES | 模態 | noFormula 名次 | withFormula 名次 | 正確分子式名次(noFormula) |','|---|---|---|---|---|---|---|');
 for(const r of run.records)lines.push(`| ${cell(r.id+(r.synthetic?'（synthetic）':''))} | ${cell(r.name)} | ${cell(r.answerSmiles)} | ${cell(modalityLabel(r))} | ${cell(conditionCell(r.results.noFormula))} | ${cell(conditionCell(r.results.withFormula))} | ${r.results.noFormula?.formulaRank??'—'} |`);
 return lines.join('\n')+'\n';
}
const stamp=(d:Date)=>{const p=(n:number)=>String(n).padStart(2,'0');return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;};
export function writeReports(run:BenchmarkRun,dirs:{notesDir:string;summaryDir:string}):{json:string;markdown:string;summary:string|null} {
 const version=run.harness.appVersion,fullDir=path.join(dirs.notesDir,`v${version}`);
 fs.mkdirSync(fullDir,{recursive:true});
 const base=path.join(fullDir,`benchmark-${stamp(new Date(run.harness.startedAt))}`);
 fs.writeFileSync(base+'.json',JSON.stringify(run,null,2)+'\n','utf8');
 fs.writeFileSync(base+'.md',renderFullMarkdown(run),'utf8');
 // A --case run is partial and must not replace the repository summary; the UI-budget run has its own file.
 if(run.harness.caseFilter.length)return {json:base+'.json',markdown:base+'.md',summary:null};
 fs.mkdirSync(dirs.summaryDir,{recursive:true});
 const summary=path.join(dirs.summaryDir,`summary-v${version}${run.budget.mode==='ui'?'-ui-budget':''}.md`);
 fs.writeFileSync(summary,renderSummaryMarkdown(run),'utf8');
 return {json:base+'.json',markdown:base+'.md',summary};
}

// ---------------------------------------------------------------- orchestration
export const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export function readAppVersion(root:string=repoRoot):string {
 return (JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')) as {version:string}).version;
}
function gitCommit(root:string):string|null {
 try {return execFileSync('git',['rev-parse','--short','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()||null;}catch{return null;}
}
export interface RunOptions {benchmarkDir:string;notesDir:string;summaryDir:string;budget?:RunBudget;caseFilter?:string[];appVersion?:string;log?:(message:string)=>void}
export async function runBenchmark(options:RunOptions):Promise<{status:'NO_CASES'|'DONE';message:string;run?:BenchmarkRun;paths?:ReturnType<typeof writeReports>}> {
 const log=options.log??(()=>{});
 const loaded=loadCases(options.benchmarkDir);
 let cases=loaded.cases;
 if(options.caseFilter?.length)cases=cases.filter(c=>options.caseFilter!.includes(c.case?.id??c.folder)||options.caseFilter!.includes(c.folder));
 if(!cases.length){
  const where=loaded.status==='NO_DIR'?`找不到案例資料夾：${loaded.casesDir}`:options.caseFilter?.length?`依 --case 篩選後沒有符合的案例（${loaded.casesDir}）`:`${loaded.casesDir} 底下沒有任何含 case.json 的資料夾`;
  return {status:'NO_CASES',message:`尚無案例。${where}。格式見 docs/BENCHMARK_FORMAT.md。`};
 }
 await initializeRDKit();
 if(!rdkitStatus().available)throw new Error('RDKit/WASM 無法載入，無法評測');
 const budget=options.budget??DETERMINISTIC_BUDGET;
 const startedAt=new Date();
 const records:CaseRecord[]=[];
 for(let i=0;i<cases.length;i++){
  log(`[${i+1}/${cases.length}] ${cases[i].case?.id??cases[i].folder}`);
  const record=await evaluateCase(cases[i],budget,log);
  if(record.status!=='EVALUATED')log(`  ${record.status}: ${record.error}`);
  records.push(record);
 }
 const root=repoRoot;
 const run:BenchmarkRun={harness:{formatVersion:BENCHMARK_FORMAT_VERSION,appVersion:options.appVersion??readAppVersion(root),commit:gitCommit(root),node:process.version,startedAt:startedAt.toISOString(),finishedAt:new Date().toISOString(),caseFilter:options.caseFilter??[]},budget,records,aggregate:aggregate(records)};
 const paths=writeReports(run,{notesDir:options.notesDir,summaryDir:options.summaryDir});
 return {status:'DONE',message:'完成',run,paths};
}
