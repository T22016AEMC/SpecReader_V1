import type { DataPoint, ExperimentalSpectrumData, SpectralPeak } from '../../types/spectrum';

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
export function processIRSeries(points: DataPoint[], scale: IRIntensityScale): {points: DataPoint[]; peaks: SpectralPeak[]; invalidCount: number} {
  const valid = points.flatMap(p => {
    const y = toAbsorbance(p.y, scale);
    return Number.isFinite(p.x) && y !== null ? [{x:p.x,y}] : [];
  }).sort((a,b) => a.x-b.x);
  if (valid.length < 5) return {points:valid,peaks:[],invalidCount:points.length-valid.length};
  const dx = quantile(valid.slice(1).map((p,i) => p.x-valid[i].x).filter(d=>d>0), .5) || 1;
  // A local lower quantile removes slow baseline drift. Window is in cm^-1,
  // so changing sampling density does not change its physical scale.
  const window = Math.min(301, Math.max(5, Math.round(180/dx)));
  const corrected = valid.map((p,i) => ({x:p.x,y:Math.max(0,p.y-quantile(valid.slice(Math.max(0,i-window),Math.min(valid.length,i+window+1)).map(v=>v.y),.1))}));
  const smooth = corrected.map((p,i) => ({x:p.x,y:(corrected[Math.max(0,i-1)].y + 2*p.y + corrected[Math.min(corrected.length-1,i+1)].y)/4}));
  const max = Math.max(...smooth.map(p=>p.y), 0);
  if (max <= 0) return {points:smooth,peaks:[],invalidCount:points.length-valid.length};
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
    peaks.push({id:`ir-series-${i}`,x:p.x,y:100*p.y/max,prominence:100*p.y/max,width,isBroad:width>=55,shape:width>=55?'broad':'sharp',detectionSource:'AUTO'});
  }
  return {points:smooth.map(p=>({x:p.x,y:100*p.y/max})),peaks,invalidCount:points.length-valid.length};
}
export function irRangeCovered(s: ExperimentalSpectrumData, min: number, max: number): boolean {
  // Peak lists don't prove the absence of unreported bands.
  const xs = s.rawExperimentalSnapshot?.rawX ?? s.points.map(p=>p.x);
  return xs.length >= 30 && Math.min(...xs)<=min && Math.max(...xs)>=max;
}
export function prepareIR(s: ExperimentalSpectrumData): ExperimentalSpectrumData {
  if (s.irProcessingApplied) return s;
  const scale=resolveIRScale(s.yUnit,s.irIntensityScale);
  const raw=s.rawExperimentalSnapshot?.rawPoints ?? s.points;
  const continuous=raw.length>=30;
  const processed=continuous ? processIRSeries(raw,scale) : null;
  const converted=s.peaks.flatMap(p=>{
    const y=toAbsorbance(p.y,scale); return y!==null && Number.isFinite(p.x) ? [{...p,y}] : [];
  });
  const max=Math.max(...converted.map(p=>p.y),0);
  const manual=s.peaks.filter(p=>p.detectionSource==='MANUAL');
  const peaks=processed ? [...processed.peaks.filter(p=>!manual.some(m=>Math.abs(m.x-p.x)<Math.max(2,m.width??2))),...manual.map(p=>({...p,y:max>0?100*p.y/max:p.y}))] : converted.map(p=>({...p,y:max>0?100*p.y/max:0}));
  return {...s,peaks,irIntensityScale:scale,irProcessingApplied:true,irProcessingWarnings:[...(scale==='UNKNOWN'?['強度尺度未知；仅使用相對強度，未推定透射率。']:[]),...(processed?.invalidCount?['無效或飽和透射率已排除；該區域不能作陰性證據。']:[])], ...(processed?{points:processed.points}: {})};
}
