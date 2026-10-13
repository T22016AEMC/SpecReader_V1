import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {SpectrumParser} from '../src/engines/spectrumParser';
import {IRAnalysisEngine} from '../src/engines/irEngine';
import {initializeRDKit} from '../src/engines/scientificEngines/rdkitAdapter';
import {WorkbenchOrchestrator} from '../src/engines/workbenchOrchestrator';
const manifest=JSON.parse(fs.readFileSync('validation/measured-ir-manifest.json','utf8')) as {name:string;file:string;smiles:string;url:string;expected:string[];sha256:string;conditions:string[]}[];
const cache=process.env.MEASURED_DATA_DIR??'data-cache';fs.mkdirSync(cache,{recursive:true});
const v0Root=process.env.V0_ROOT;
const v0Parser=v0Root?await import(pathToFileURL(path.resolve(v0Root,'src/engines/spectrumParser.ts')).href):null;
const v0IR=v0Root?await import(pathToFileURL(path.resolve(v0Root,'src/engines/irEngine.ts')).href):null;
await initializeRDKit();
type BenchmarkRow=(typeof manifest)[number]&{v1PointCount:number;v1Families:string[];v0OriginalPointCount:number|null;v0OriginalFamilies:string[]|null;v0DecodedFamilies:string[]|null;modeBIRMatch:number|null};
const rows:BenchmarkRow[]=[];
for(const record of manifest){
  const file=path.join(cache,record.file);
  if(!fs.existsSync(file)){
    if(!process.argv.includes('--download'))throw Error('資料未快取；請於遵守 NIST 資料條款後使用 --download。');
    const response=await fetch(record.url,{signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error(`資料取得失敗：${record.name}`);fs.writeFileSync(file,await response.text());
  }
  const raw=fs.readFileSync(file,'utf8');
  if(createHash('sha256').update(raw).digest('hex')!==record.sha256)throw Error(`資料雜湊改變：${record.name}，須重新審查版本，不能混入配對比较。`);
  const s=SpectrumParser.parseTextSpectrum('IR',record.file,raw);
  const findings=IRAnalysisEngine.analyzeExperimentalIR(s).findings;
  const v0Spectrum=v0Parser?.SpectrumParser.parseTextSpectrum('IR',record.file,raw);
  const original=v0Spectrum?v0IR!.IRAnalysisEngine.analyzeExperimentalIR(v0Spectrum):null;
  const decoded=v0IR?.IRAnalysisEngine.analyzeExperimentalIR(s);
  const modeB=WorkbenchOrchestrator.runModeBPrediction(record.smiles,['IR'],{IR:s});
  rows.push({...record,v1PointCount:s.points.length,v1Families:[...new Set(findings.map(f=>f.family))],v0OriginalPointCount:v0Spectrum?.points.length??null,v0OriginalFamilies:original?[...new Set<string>(original.findings.map((f:{family:string})=>f.family))]:null,v0DecodedFamilies:decoded?[...new Set<string>(decoded.findings.map((f:{family:string})=>f.family))]:null,modeBIRMatch:modeB.bidirectionalReport?.modalityReports.IR.consistencyScore??null});
}
const labels=['Alcohol','Phenol','Aromatic','Ketone','Ester','Carboxylic acid','Amide','Amine','Nitrile','Nitro'];
function metrics(key:'v0OriginalFamilies'|'v0DecodedFamilies'|'v1Families'){
  if(rows.some(r=>r[key]===null))return null;
  let tp=0,fp=0,fn=0;for(const r of rows)for(const label of labels){const predicted=r[key]!.includes(label),truth=r.expected.includes(label);if(predicted&&truth)tp++;else if(predicted)fp++;else if(truth)fn++;}
  return {tp,fp,fn,precision:tp+fp?tp/(tp+fp):0,recall:tp+fn?tp/(tp+fn):0,f1:2*tp+fp+fn?2*tp/(2*tp+fp+fn):0};
}
const result={date:new Date().toISOString(),dataNature:'PUBLIC_MEASURED_IR',selection:'四份可取得 NIST 氣相 IR；開發便利樣本，非預留盲測資料集',labels,rows,metrics:{v0Original:metrics('v0OriginalFamilies'),v0Decoded:metrics('v0DecodedFamilies'),v1:metrics('v1Families')},limitations:['模式 B 相容分不是波形誤差或真實機率','V0Decoded 使用 V1 解碼／峰值，不能稱獨立端對端 V0','泛用 Alcohol 類別仍包含醇／酚競爭假設；Phenol 分類不足','原始光譜版權保留；快取不可提交 GitHub；其他五模態及 Top-k 尚未實測驗證']};
fs.writeFileSync('validation/measured-ir-comparison.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result.metrics,null,2));

