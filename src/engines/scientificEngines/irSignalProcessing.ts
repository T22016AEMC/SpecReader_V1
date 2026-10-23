import type { DataPoint, ExperimentalSpectrumData, SpectralPeak } from '../../types/spectrum';
import {asymmetricBaseline} from './whittakerBaseline';
import {baselineAt,pixelIRX,inferIRDirection,physicalIRInputs,relativeIRSignal,type IRManualSettings} from './irManualBaseline';
import {IR_PEAK_CONFIG} from './irPeakConfig';

export type IRIntensityScale = 'ABSORBANCE' | 'TRANSMITTANCE' | 'PERCENT_TRANSMITTANCE' | 'NORMALIZED' | 'UNKNOWN';
export function resolveIRScale(unit: string, explicit?: IRIntensityScale): IRIntensityScale {
  if (explicit) return explicit;
  if (/absorb|吸光|吸收度/i.test(unit)) return 'ABSORBANCE';
  if (/transmitt|透過|穿透|%t|t%/i.test(unit)) return /%|percent/i.test(unit) ? 'PERCENT_TRANSMITTANCE' : 'TRANSMITTANCE';
  return /normal|relative|相對|正規/i.test(unit) ? 'NORMALIZED' : 'UNKNOWN';
}

/** Versioned source metadata only: original pixels, raw numbers and manual
 * observations remain unchanged; every consumer reuses the same settings. */
export function refreshIRSnapshot(source:ExperimentalSpectrumData,previous?:ExperimentalSpectrumData,previousRankingKey=''):ExperimentalSpectrumData {
  if(!source.irManualSettings)return source;
  const calibrationChanged=JSON.stringify(source.imageCalibration)!==JSON.stringify(previous?.imageCalibration);
  const settings={...source.irManualSettings};
  if(calibrationChanged&&previous?.irManualSettings&&settings.revision===previous.irManualSettings.revision)settings.revision=(settings.revision??0)+1;
  const next={...source,irManualSettings:settings,irProcessingApplied:false,dataVersion:Math.max(source.dataVersion??0,(previous?.dataVersion??0)+1)};
  const processed=prepareIR(next);
  const featureSignature=JSON.stringify(processed.peaks.map(p=>[p.x,Number(p.y.toFixed(3)),p.fwhm,p.shape,p.observedRange]));
  const points=processed.irCorrectedPoints??[];
  const curveSignature=JSON.stringify(points.filter((_,i)=>i%Math.max(1,Math.floor(points.length/20))===0).map(p=>[p.x,Number(p.y.toFixed(4))]));
  return {...next,irAnalysisSnapshot:{settingsVersion:settings.revision??0,sourceVersion:next.dataVersion,featureSignature,curveSignature,featureChanged:previous?.irAnalysisSnapshot?.featureSignature!==featureSignature,previousRankingKey,curvePoints:points.length,peakCount:processed.peaks.length}};
}
/** Only actual calibrated samples are measured. No chemical inference and no
 * fabricated width. Half-height endpoints must both exist in the supplied curve. */
export function measureIRBandMorphology(s:ExperimentalSpectrumData,p:SpectralPeak):{shape:SpectralPeak['shape'];fwhm?:number} {
 if((p.irShapeSource==='USER'||!p.irShapeSource&&p.userOverride)&&(p.shape==='broad'||p.shape==='sharp'))return {shape:p.shape};
 if(p.pixelX!==undefined&&!p.isCalibrated)return {shape:'UNRESOLVED'};
 const {raw,anchors}=physicalIRInputs(s),points=raw.filter(q=>Number.isFinite(q.x)&&Number.isFinite(q.y)).sort((a,b)=>a.x-b.x);
 if(points.length<5)return {shape:'UNRESOLVED'};
 const scale=resolveIRScale(s.yUnit,s.irManualSettings?.intensityScale??s.irIntensityScale),setting=s.irManualSettings?.direction;
 const direction=setting&&setting!=='AUTO'?setting:scale==='ABSORBANCE'?'UP':scale==='TRANSMITTANCE'||scale==='PERCENT_TRANSMITTANCE'?'DOWN':inferIRDirection(points).direction;
 const sign=direction==='DOWN'?-1:1,hasBaseline=s.irManualSettings?.enabled&&anchors.length===5;
 const reference=direction==='DOWN'?Math.max(...points.map(q=>q.y)):Math.min(...points.map(q=>q.y));
 const signal=points.map(q=>({x:q.x,y:sign*(q.y-(hasBaseline?baselineAt(q.x,anchors):reference))}));
 let i=signal.reduce((best,q,k)=>Math.abs(q.x-p.x)<Math.abs(signal[best].x-p.x)?k:best,0);
 if(i===0||i===signal.length-1||signal[i].y<=0)return {shape:'UNRESOLVED'};
 // A mark off the actual peak top does not define a measured FWHM.
 if(signal[i-1].y>signal[i].y||signal[i+1].y>signal[i].y)return {shape:'UNRESOLVED'};
 const half=signal[i].y/2;let l=i,r=i;while(l>0&&signal[l].y>half)l--;while(r<signal.length-1&&signal[r].y>half)r++;
 if(signal[l].y>half||signal[r].y>half||r-l<2)return {shape:'UNRESOLVED'};
 const crossing=(a:number,b:number)=>signal[a].x+(half-signal[a].y)*(signal[b].x-signal[a].x)/(signal[b].y-signal[a].y);
 const width=crossing(r-1,r)-crossing(l,l+1);
 return Number.isFinite(width)&&width>0?{shape:width>=55?'broad':'sharp',fwhm:width}:{shape:'UNRESOLVED'};
}
export function toAbsorbance(value: number, scale: IRIntensityScale): number | null {
  if (!Number.isFinite(value)) return null;
  if (scale === 'TRANSMITTANCE' || scale === 'PERCENT_TRANSMITTANCE') {
    const t = scale === 'PERCENT_TRANSMITTANCE' ? value / 100 : value;
    // Saturation is missing information, never a fabricated infinite absorption.
    return t > 0 && t <= 1 ? -Math.log10(t) : null;
  }
  return value;
}
const quantile = (values: number[], q: number): number => {
  const a = values.slice().sort((x,y) => x-y);
  return a[Math.floor((a.length-1)*q)] ?? 0;
};
/** Depth from the peak to the higher of the two lowest points reached before a higher point (or the edge) on each side. */
export function topographicProminence(series:DataPoint[],i:number):number {
  const y=series[i].y;
  let left=y,right=y;
  for(let j=i-1;j>=0&&series[j].y<=y;j--)left=Math.min(left,series[j].y);
  for(let j=i+1;j<series.length&&series[j].y<=y;j++)right=Math.min(right,series[j].y);
  return y-Math.max(left,right);
}
/** True when the signal range within ±halfWindow (x units) of point i stays below `minRange`. */
export function isFlatAround(series:DataPoint[],i:number,halfWindow:number,minRange:number):boolean {
  let lo=Infinity,hi=-Infinity;
  for(let j=i;j>=0&&series[i].x-series[j].x<=halfWindow;j--){lo=Math.min(lo,series[j].y);hi=Math.max(hi,series[j].y);}
  for(let j=i;j<series.length&&series[j].x-series[i].x<=halfWindow;j++){lo=Math.min(lo,series[j].y);hi=Math.max(hi,series[j].y);}
  return hi-lo<minRange;
}
export function processIRSeries(points: DataPoint[], scale: IRIntensityScale,settings?:IRManualSettings): {points: DataPoint[]; peaks: SpectralPeak[]; invalidCount: number; mirrored:DataPoint[]; corrected:DataPoint[];baseline:DataPoint[]; uncertain:boolean} {
  const valid = points.flatMap(p => {
    const y = Number.isFinite(p.y)?p.y:null;
    return Number.isFinite(p.x) && y !== null ? [{x:p.x,y}] : [];
  }).sort((a,b) => a.x-b.x);
  const inferred=inferIRDirection(valid);
  const direction=settings?.direction&&settings.direction!=='AUTO'?settings.direction:scale==='TRANSMITTANCE'||scale==='PERCENT_TRANSMITTANCE'?'DOWN':scale==='ABSORBANCE'?'UP':inferred.direction;
  const sign=direction==='DOWN'?-1:1;
  const mirrored=valid; // Deprecated result alias: original coordinates, never a display mirror.
  if (valid.length < 5) return {points:valid,peaks:[],invalidCount:points.length-valid.length,mirrored,corrected:valid,baseline:[],uncertain:inferred.uncertain};
  const dx = quantile(valid.slice(1).map((p,i) => p.x-valid[i].x).filter(d=>d>0), .5) || 1;
  // Scale the second-difference penalty with physical sampling interval.
  // Broad-band retention still depends on lambda: report as a processing model.
  const uniform = valid.slice(1).every((p,i)=>Math.abs((p.x-valid[i].x)-dx)<dx*.05);
  const validAnchors=settings?.anchors.length===5&&new Set(settings.anchors.map(p=>p.x)).size===5&&settings.anchors.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
  const needsAutomatic=settings===undefined||(settings.enabled&&!validAnchors);
  const fallback=quantile(valid.map(p=>sign*p.y),.05);
  const orientedBackground=needsAutomatic&&uniform?asymmetricBaseline(valid.map(p=>sign*p.y),Math.min(1e11,Math.max(1e4,(250/dx)**4))):valid.map(()=>fallback);
  const reference=direction==='DOWN'?(scale==='PERCENT_TRANSMITTANCE'?100:scale==='TRANSMITTANCE'?1:Math.max(...valid.map(q=>q.y))):0;
  const baseline=valid.map((p,i)=>({x:p.x,y:settings?.enabled&&validAnchors?baselineAt(p.x,settings.anchors):settings?.enabled===false?reference:sign*orientedBackground[i]}));
  const corrected = relativeIRSignal(valid,baseline,direction);
  const smooth = corrected.map((p,i) => ({x:p.x,y:(corrected[Math.max(0,i-1)].y + 2*p.y + corrected[Math.min(corrected.length-1,i+1)].y)/4}));
  const max = Math.max(...smooth.map(p=>p.y), 0);
  if (max <= 0) return {points:smooth,peaks:[],invalidCount:points.length-valid.length,mirrored,corrected,baseline,uncertain:inferred.uncertain};
  const diffs = smooth.slice(1).map((p,i)=>Math.abs(p.y-smooth[i].y));
  const noise = quantile(diffs,.5)/.67449;
  const threshold = Math.max(IR_PEAK_CONFIG.minHeightNoiseMultiple*noise, max*IR_PEAK_CONFIG.minHeightFractionOfMax);
  const minProminence = Math.max(IR_PEAK_CONFIG.minProminenceNoiseMultiple*noise, max*IR_PEAK_CONFIG.minProminenceFractionOfMax);
  const peaks: SpectralPeak[] = [];
  for (let i=1;i<smooth.length-1;i++) {
    const p=smooth[i];
    if (p.y < threshold || p.y <= smooth[i-1].y || p.y < smooth[i+1].y) continue;
    // v1.1.7-hotfix.1: no peaks in flat stretches, and no ripples without real topographic prominence.
    if (isFlatAround(smooth,i,IR_PEAK_CONFIG.flatHalfWindowCm,IR_PEAK_CONFIG.flatRangeNoiseMultiple*noise)) continue;
    if (topographicProminence(smooth,i) < minProminence) continue;
    let l=i,r=i;
    while(l>0 && smooth[l].y>p.y/2) l--;
    while(r<smooth.length-1 && smooth[r].y>p.y/2) r++;
    const width=smooth[r].x-smooth[l].x;
    let area=0;for(let j=l+1;j<=r;j++)area+=(smooth[j].x-smooth[j-1].x)*(smooth[j].y+smooth[j-1].y)/2;
    const localBase=Math.max(smooth[l].y,smooth[r].y),prominence=p.y-localBase;
    peaks.push({id:`ir-series-${i}`,x:p.x,y:100*p.y/max,prominence:100*prominence/max,width,fwhm:width,area,asymmetry:(smooth[r].x-p.x)/Math.max(dx,p.x-smooth[l].x),signalToNoise:prominence/Math.max(noise,1e-10),localBaseline:localBase,isBroad:width>=55,shape:width>=55?'broad':'sharp',detectionSource:'AUTO'});
  }
  const totalArea=peaks.reduce((sum,p)=>sum+Math.max(0,p.area??0),0);peaks.forEach(p=>p.relativeArea=totalArea>0?(p.area??0)/totalArea:0);
  return {points:smooth.map(p=>({x:p.x,y:100*p.y/max})),peaks,invalidCount:points.length-valid.length,mirrored,corrected,baseline,uncertain:inferred.uncertain};
}
export function irRangeCovered(s: ExperimentalSpectrumData, min: number, max: number): boolean {
  if(s.observationCoverage!=='CONFIRMED_COMPLETE')return false;
  if (s.digitizedFromImage || s.sourceType==='IMAGE_EXPERIMENTAL' || s.sourceType==='IMAGE_DIGITIZED') return false;
  // Peak lists don't prove the absence of unreported bands.
  const xs = s.rawExperimentalSnapshot?.rawX ?? s.points.map(p=>p.x);
  const scale=resolveIRScale(s.yUnit,s.irManualSettings?.intensityScale??s.irIntensityScale);
  if(scale==='UNKNOWN')return false; // 未知強度方向不能據缺峰作陰性證據。
  const raw=s.rawExperimentalSnapshot?.rawPoints ?? s.points;
  if (raw.some(p=>p.x>=min&&p.x<=max&&toAbsorbance(p.y,scale)===null)) return false;
  return xs.length >= 2 && Math.min(...xs)<=min && Math.max(...xs)>=max;
}
export function prepareIR(s: ExperimentalSpectrumData): ExperimentalSpectrumData {
  if (s.irProcessingApplied) return s;
  const scale=resolveIRScale(s.yUnit,s.irManualSettings?.intensityScale??s.irIntensityScale);
  const isImage=s.digitizedFromImage||s.sourceType==='IMAGE_EXPERIMENTAL'||s.sourceType==='IMAGE_DIGITIZED';
  const {raw,anchors}=physicalIRInputs(s);
  const effectiveScale=isImage&&!s.irManualSettings?.yAxisRange?'UNKNOWN':scale;
  const continuous=raw.length>=5&&(!isImage||['USER_CALIBRATED','USER_CORRECTED','USER_3PT_CALIBRATED'].includes(s.imageCalibration?.source??''));
  const processed=continuous ? processIRSeries(raw,scale,s.irManualSettings?{...s.irManualSettings,anchors,coordinateSpace:'PHYSICAL'}:undefined) : null;
  const down=s.irManualSettings?.direction==='DOWN'||(s.irManualSettings?.direction!=='UP'&&(scale==='TRANSMITTANCE'||scale==='PERCENT_TRANSMITTANCE'));
  const reference=scale==='TRANSMITTANCE'?1:scale==='PERCENT_TRANSMITTANCE'?100:Math.max(0,...raw.map(p=>p.y).filter(Number.isFinite));
  const converted=s.peaks.map(p=>p.observedRange?{...p,observedRange:[Math.min(...p.observedRange),Math.max(...p.observedRange)] as [number,number]}:p).filter(p=>p.pixelX===undefined||p.isCalibrated===true).flatMap(p=>{
    if(p.observedRange&&p.rangeCoordinateSpace==='PIXEL'&&s.imageCalibration){
      const c=s.imageCalibration,a=pixelIRX(p.observedRange[0],c),b=pixelIRX(p.observedRange[1],c);
      p={...p,observedRange:[Math.min(a,b),Math.max(a,b)],rangeCoordinateSpace:'PHYSICAL',width:Math.abs(a-b),fwhm:p.isBroad?Math.abs(a-b):p.fwhm};
    }
    const y=Number.isFinite(p.y)?down?reference-p.y:p.y:null; return y!==null && Number.isFinite(p.x) ? [{...p,y}] : [];
  });
  const max=Math.max(...converted.map(p=>p.y),0);
  const manual=converted.filter(p=>p.detectionSource==='MANUAL'||p.detectionSource==='USER_MARKED'||p.manualPeak||p.manualEdited||p.userModified);
  const peaks=(processed ? [...processed.peaks.filter(p=>!manual.some(m=>Math.abs(m.x-p.x)<Math.max(2,m.width??2))),...manual.map(p=>{
    const measured=processed.peaks.find(q=>Math.abs(q.x-p.x)<Math.max(3,p.width??3));
    const nearby=processed.points.reduce((best,q)=>Math.abs(q.x-p.x)<Math.abs(best.x-p.x)?q:best,processed.points[0]);
    const morphology=measureIRBandMorphology(s,p);
    return {...measured,...p,shape:morphology.shape,isBroad:morphology.shape==='broad',y:nearby?.y??p.y,intensityKnown:nearby?true:p.intensityKnown,fwhm:morphology.fwhm??measured?.fwhm,area:p.area??measured?.area,relativeArea:p.relativeArea??measured?.relativeArea,signalToNoise:p.signalToNoise??measured?.signalToNoise};
  })] : converted.map(p=>({...p,y:max>0?100*p.y/max:0}))).filter(p=>p.y>0||p.intensityKnown===false);
  return {...s,rawExperimentalSnapshot:s.rawExperimentalSnapshot??{rawPoints:raw.map(p=>({...p})),rawX:raw.map(p=>p.x),rawY:raw.map(p=>p.y),originalImageUrl:s.originalImageUrl},peaks,irIntensityScale:effectiveScale,irProcessingApplied:true,irDataQuality:(isImage?s.irDataQuality??.45:processed?.invalidCount?.6:.85)*(s.irManualSettings?.enabled?.85:1),irProcessingWarnings:[...(s.irProcessingWarnings??[]),...(effectiveScale==='UNKNOWN'?['Y 刻度未確認；僅使用相對強度，原始尺度標籤只用於吸收方向判斷。']:[]),...(processed?.uncertain&&(!s.irManualSettings||s.irManualSettings.direction==='AUTO')?['峰方向判斷不確定，請手動確認。']:[]),...(s.irManualSettings?.enabled?['五點基線採端點常數延伸；控制點穿過寬峰可能移除真實訊號，請對照原圖。']:[]),...(processed?.invalidCount?['無效數值已排除。']:[])], ...(processed?{points:processed.points,irBaselinePoints:processed.baseline,irCorrectedPoints:processed.corrected}: {})};
}

