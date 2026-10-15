import {beforeAll,it,expect} from 'vitest';
import {baselineAt,mirrorIR,correctFivePointBaseline} from '../src/engines/scientificEngines/irManualBaseline';
import {globalPeakAssignment} from '../src/engines/scientificEngines/globalPeakAssignment';
import {searchMolecularGraphs} from '../src/engines/scientificEngines/deNovoGraphSearch';
import {initializeRDKit,canonicalizeMolecule} from '../src/engines/scientificEngines/rdkitAdapter';
import {processIRSeries} from '../src/engines/scientificEngines/irSignalProcessing';
import {traceIRPixels} from '../src/engines/scientificEngines/irImageTrace';
import {SpectrumParser} from '../src/engines/spectrumParser';
import {WorkbenchOrchestrator} from '../src/engines/workbenchOrchestrator';
import {spectrum} from './fixtures';
beforeAll(()=>initializeRDKit());
it('鏡像保留 x 與相對幾何距離，原始資料不覆寫',()=>{
 const raw=[{x:4000,y:80},{x:1700,y:20},{x:400,y:70}],copy=JSON.stringify(raw);
 const up=mirrorIR(raw,'DOWN',50);
 expect(up.map(p=>p.x)).toEqual(raw.map(p=>p.x));expect(up[1].y-up[0].y).toBe(60);expect(JSON.stringify(raw)).toBe(copy);
});
it('像素曲線通過人工波數校正，正式候選管線呼叫圖生成',()=>{
 const original=SpectrumParser.createImageSpectrum({modality:'IR',fileName:'engineering-image.png',originalImageUrl:'data:image/png;base64,',imageDimensions:{width:100,height:80},detectedSignals:[],digitizationMethod:'Canvas'});
 original.irPixelCurve=Array.from({length:61},(_,i)=>({x:10+i,y:20+Math.max(0,20-Math.abs(i-30)*2)}));
 const calibrated=SpectrumParser.calibrateImageFromTwoPoints(original,{pixelX:10,physicalX:4000},{pixelX:70,physicalX:400});
 expect(calibrated.points.length).toBe(61);expect(calibrated.validation.isValid).toBe(true);expect(calibrated.originalImageUrl).toBe(original.originalImageUrl);
 const result=WorkbenchOrchestrator.runModeAPipeline({}, {molecularFormula:'C2H6O'});
 expect(result.solvedConstraintSpace.solverLog.some(s=>s.includes('圖搜尋'))).toBe(true);
 expect(result.rankedCandidates.some(c=>c.sourceProvenance?.includes('De novo'))).toBe(true);
 const ir=WorkbenchOrchestrator.runModeAPipeline({IR:spectrum('IR',[{id:'band',x:3350,y:70,width:110,isBroad:true},{id:'co',x:1050,y:100}],'Relative intensity')});
 expect(ir.solvedConstraintSpace.solverLog.some(s=>s.includes('圖搜尋'))).toBe(true);
});
it('非等距五點插值、端點延伸與負校正值',()=>{
 const anchors=[{x:0,y:1},{x:2,y:3},{x:5,y:6},{x:9,y:4},{x:10,y:5}];
 expect(baselineAt(3,anchors)).toBe(4);expect(baselineAt(-1,anchors)).toBe(1);expect(baselineAt(11,anchors)).toBe(5);
 expect(correctFivePointBaseline([{x:3,y:2}],anchors)[0].y).toBe(-2);
});
it('全域配對優於逐列貪婪且不重複使用環境',()=>{
 const m=globalPeakAssignment([[.9,.8],[.85,.1]]);expect(m.get(0)).toBe(1);expect(m.get(1)).toBe(0);
});
it('原始像素擷取回傳實際座標，不繪製或补峰',()=>{
 const data=new Uint8ClampedArray(100*60*4).fill(255);
 for(let x=5;x<95;x++){const y=20+Math.round(5*Math.sin(x/8)),k=(y*100+x)*4;data[k]=0;data[k+1]=0;data[k+2]=0;}
 const result=traceIRPixels(data,100,60,{plotLeftPx:3,plotRightPx:97,plotTopPx:3,plotBottomPx:55,xAxisStart:4000,xAxisEnd:400,xAxisDirection:'DESCENDING',confidence:.5,source:'DEFAULT_FALLBACK'});
 expect(result.pixels.length).toBeGreaterThan(40);
 for(const p of result.pixels)expect(data[(Math.round(p.y)*100+p.x)*4]).toBe(0);
});
it('幾何訊號產生峰形資料，圖枚舉具有有效性與資源狀態',()=>{
 const points=Array.from({length:41},(_,i)=>({x:1000+i*2,y:100-Math.max(0,20-Math.abs(i-20)*2)}));
 const processed=processIRSeries(points,'PERCENT_TRANSMITTANCE');
 expect(processed.mirrored[20].x).toBe(points[20].x);expect(processed.peaks[0].fwhm).toBeGreaterThan(0);expect(processed.peaks[0].area).toBeGreaterThan(0);
 const result=searchMolecularGraphs('C2H6O',{timeMs:100,maxStates:100,maxResults:5});
 expect(result.status).toBe('BOUNDED');expect(result.smiles.length).toBeGreaterThan(0);expect(result.visited).toBeLessThanOrEqual(101);
 for(const s of result.smiles)expect(canonicalizeMolecule(s).valid).toBe(true);
 const larger=searchMolecularGraphs('C30H62',{maxStates:1,timeMs:100});expect(larger.status).toBe('BOUNDED');expect(larger.termination).toBe('STATE_BUDGET');
});
