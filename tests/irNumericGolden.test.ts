import fs from 'node:fs';
import path from 'node:path';
import {beforeAll,describe,expect,it} from 'vitest';
import {initializeRDKit} from '../src/engines/scientificEngines/rdkitAdapter';
import {SpectrumParser} from '../src/engines/spectrumParser';
import {BANDS,transmittance} from './irAxisFixture';

// v1.1.8 T4: the numeric-file IR path is untouched; its output equals the recorded pre-change result. SYNTHETIC curve (irAxisFixture bands).
beforeAll(()=>initializeRDKit());
const csv=()=>['wavenumber,transmittance',...Array.from({length:1700},(_,i)=>{const x=4000-2*i;return `${x},${transmittance(x,BANDS).toFixed(3)}`;})].join('\n');
async function run(){
 const s=await SpecReader(csv());
 return {n:s.points.length,peaks:s.peaks.map(p=>({x:p.x,y:Number(p.y.toFixed(6)),prominence:p.prominence===undefined?null:Number(p.prominence.toFixed(6)),width:p.width??null,area:p.area===undefined?null:Number(p.area.toFixed(6)),rel:p.relativeIntensity===undefined?null:Number(p.relativeIntensity.toFixed(6)),norm:p.normalizedIntensity===undefined?null:Number(p.normalizedIntensity.toFixed(6))}))};
}
const SpecReader=(text:string)=>SpectrumParser.parseUploadedFile(new File([text],'synthetic-ir.csv'),'IR',undefined,{disableAutoPeakDetection:false});
describe('numeric IR path',()=>{
 it('matches the golden recorded before v1.1.8',async()=>{
  const out=await run();
  const file=path.resolve(__dirname,'goldens','irNumeric.pre118.json');
  if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify(out,null,1));
  expect(out).toEqual(JSON.parse(fs.readFileSync(file,'utf8')));
  expect(out.peaks.length).toBeGreaterThan(4);
 });
});
