import type { DataPoint, ExperimentalSpectrumData, SpectralPeak } from '../../types/spectrum';
import {asymmetricBaseline} from './whittakerBaseline';
import {mirrorIR,correctFivePointBaseline,inferIRDirection,type IRManualSettings} from './irManualBaseline';

export type IRIntensityScale = 'ABSORBANCE' | 'TRANSMITTANCE' | 'PERCENT_TRANSMITTANCE' | 'NORMALIZED' | 'UNKNOWN';
export function resolveIRScale(unit: string, explicit?: IRIntensityScale): IRIntensityScale {
  if (explicit) return explicit;
  if (/absorb|吸光|吸收度/i.test(unit)) return 'ABSORBANCE';
  if (/transmitt|透過|穿透|%t|t%/i.test(unit)) return /%|percent/i.test(unit) ? 'PERCENT_TRANSMITTANCE' : 'TRANSMITTANCE';
  return /normal|relative|相對|正規/i.test(unit) ? 'NORMALIZED' : 'UNKNOWN';
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
export function processIRSeries(points: DataPoint[], scale: IRIntensityScale,settings?:IRManualSettings): {points: DataPoint[]; peaks: SpectralPeak[]; invalidCount: number; mirrored:DataPoint[]; corrected:DataPoint[]; uncertain:boolean} {
  const valid = points.flatMap(p => {
    const y = Number.isFinite(p.y)?p.y:null;
    return Number.isFinite(p.x) && y !== null ? [{x:p.x,y}] : [];
  }).sort((a,b) => a.x-b.x);
  const inferred=inferIRDirection(valid);
  const direction=settings?.direction&&settings.direction!=='AUTO'?settings.direction:scale==='TRANSMITTANCE'||scale==='PERCENT_TRANSMITTANCE'?'DOWN':scale==='ABSORBANCE'?'UP':inferred.direction;
  const mirrored=mirrorIR(valid,direction);
  if (valid.length < 5) return {points:mirrored,peaks:[],invalidCount:points.length-valid.length,mirrored,corrected:mirrored,uncertain:inferred.uncertain};
  const dx = quantile(valid.slice(1).map((p,i) => p.x-valid[i].x).filter(d=>d>0), .5) || 1;
  // Scale the second-difference penalty with physical sampling interval.
  // Broad-band retention still depends on lambda: report as a processing model.
  const uniform = valid.slice(1).every((p,i)=>Math.abs((p.x-valid[i].x)-dx)<dx*.05);
  const baseline = uniform ? asymmetricBaseline(mirrored.map(p=>p.y),Math.min(1e11,Math.max(1e4,(250/dx)**4))) : mirrored.map(()=>quantile(mirrored.map(p=>p.y),.05));
  const validAnchors=settings?.anchors.length===5&&new Set(settings.anchors.map(p=>p.x)).size===5&&settings.anchors.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
  const corrected = settings?.enabled&&validAnchors?correctFivePointBaseline(mirrored,settings.anchors):mirrored.map((p,i)=>({x:p.x,y:p.y-baseline[i]}));
  const smooth = corrected.map((p,i) => ({x:p.x,y:(corrected[Math.max(0,i-1)].y + 2*p.y + corrected[Math.min(corrected.length-1,i+1)].y)/4}));
  const max = Math.max(...smooth.map(p=>p.y), 0);
  if (max <= 0) return {points:smooth,peaks:[],invalidCount:points.length-valid.length,mirrored,corrected,uncertain:inferred.uncertain};
  const diffs = smooth.slice(1).map((p,i)=>Math.abs(p.y-smooth[i].y));
  const noise = quantile(diffs,.5)/.67449;
  const threshold = Math.max(3*noise, max*.02);
  const peaks: SpectralPeak[] = [];
  for (let i=1;i<smooth.length-1;i++) {
    const p=smooth[i];
    if (p.y < threshold || p.y <= smooth[i-1].y || p.y < smooth[i+1].y) continue;
    let l=i,r=i;
    while(l>0 && smooth[l].y>p.y/2) l--;
    while(r<smooth.length-1 && smooth[r].y>p.y/2) r++;
    const width=smooth[r].x-smooth[l].x;
    let area=0;for(let j=l+1;j<=r;j++)area+=(smooth[j].x-smooth[j-1].x)*(smooth[j].y+smooth[j-1].y)/2;
    const localBase=Math.max(smooth[l].y,smooth[r].y),prominence=p.y-localBase;
    peaks.push({id:`ir-series-${i}`,x:p.x,y:100*p.y/max,prominence:100*prominence/max,width,fwhm:width,area,asymmetry:(smooth[r].x-p.x)/Math.max(dx,p.x-smooth[l].x),signalToNoise:prominence/Math.max(noise,1e-10),localBaseline:localBase,isBroad:width>=55,shape:width>=55?'broad':'sharp',detectionSource:'AUTO'});
  }
  const totalArea=peaks.reduce((sum,p)=>sum+Math.max(0,p.area??0),0);peaks.forEach(p=>p.relativeArea=totalArea>0?(p.area??0)/totalArea:0);
  return {points:smooth.map(p=>({x:p.x,y:100*p.y/max})),peaks,invalidCount:points.length-valid.length,mirrored,corrected,uncertain:inferred.uncertain};
}
export function irRangeCovered(s: ExperimentalSpectrumData, min: number, max: number): boolean {
  if (s.digitizedFromImage || s.sourceType==='IMAGE_EXPERIMENTAL' || s.sourceType==='IMAGE_DIGITIZED') return false;
  // Peak lists don't prove the absence of unreported bands.
  const xs = s.rawExperimentalSnapshot?.rawX ?? s.points.map(p=>p.x);
  const scale=resolveIRScale(s.yUnit,s.irIntensityScale);
  if(scale==='UNKNOWN')return false; // 未知強度方向不能據缺峰作陰性證據。
  const raw=s.rawExperimentalSnapshot?.rawPoints ?? s.points;
  if (raw.some(p=>p.x>=min&&p.x<=max&&toAbsorbance(p.y,scale)===null)) return false;
  return xs.length >= 30 && Math.min(...xs)<=min && Math.max(...xs)>=max;
}
export function prepareIR(s: ExperimentalSpectrumData): ExperimentalSpectrumData {
  if (s.irProcessingApplied) return s;
  const scale=resolveIRScale(s.yUnit,s.irIntensityScale);
  const isImage=s.digitizedFromImage||s.sourceType==='IMAGE_EXPERIMENTAL'||s.sourceType==='IMAGE_DIGITIZED';
  const raw=isImage?s.points:s.rawExperimentalSnapshot?.rawPoints ?? s.points;
  const continuous=raw.length>=30&&(!isImage||['USER_CALIBRATED','USER_CORRECTED','USER_3PT_CALIBRATED'].includes(s.imageCalibration?.source??''));
  const processed=continuous ? processIRSeries(raw,scale,s.irManualSettings) : null;
  const converted=s.peaks.filter(p=>p.pixelX===undefined||p.isCalibrated===true).flatMap(p=>{
    const y=Number.isFinite(p.y)?p.y:null; return y!==null && Number.isFinite(p.x) ? [{...p,y}] : [];
  });
  const max=Math.max(...converted.map(p=>p.y),0);
  const manual=converted.filter(p=>p.detectionSource==='MANUAL'||p.detectionSource==='USER_MARKED'||p.manualPeak||p.manualEdited||p.userModified);
  const peaks=processed ? [...processed.peaks.filter(p=>!manual.some(m=>Math.abs(m.x-p.x)<Math.max(2,m.width??2))),...manual.map(p=>{
    const measured=processed.peaks.find(q=>Math.abs(q.x-p.x)<Math.max(3,p.width??3));
    const nearby=processed.points.reduce((best,q)=>Math.abs(q.x-p.x)<Math.abs(best.x-p.x)?q:best,processed.points[0]);
    return {...measured,...p,y:nearby?.y??p.y,fwhm:p.fwhm??measured?.fwhm,area:p.area??measured?.area,relativeArea:p.relativeArea??measured?.relativeArea,signalToNoise:p.signalToNoise??measured?.signalToNoise};
  })] : converted.map(p=>({...p,y:max>0?100*p.y/max:0}));
  return {...s,rawExperimentalSnapshot:s.rawExperimentalSnapshot??{rawPoints:raw.map(p=>({...p})),rawX:raw.map(p=>p.x),rawY:raw.map(p=>p.y),originalImageUrl:s.originalImageUrl},peaks,irIntensityScale:scale,irProcessingApplied:true,irDataQuality:(isImage?s.irDataQuality??.45:processed?.invalidCount?.6:.85)*(s.irManualSettings?.enabled?.85:1),irProcessingWarnings:[...(s.irProcessingWarnings??[]),...(scale==='UNKNOWN'?['強度尺度未知；僅使用相對強度，未推定透射率。']:[]),...(processed?.uncertain&&(!s.irManualSettings||s.irManualSettings.direction==='AUTO')?['峰方向判斷不確定，請手動確認。']:[]),...(s.irManualSettings?.enabled?['五點基線採端點常數延伸；控制點穿過寬峰可能移除真實訊號，請對照原圖。']:[]),...(processed?.invalidCount?['無效數值已排除。']:[])], ...(processed?{points:processed.points,irMirroredPoints:processed.mirrored,irCorrectedPoints:processed.corrected}: {})};
}

