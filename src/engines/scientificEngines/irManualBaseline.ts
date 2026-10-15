import type {DataPoint,ImageSpectrumCalibration,ExperimentalSpectrumData} from '../../types/spectrum';
export type IRPeakDirection='UP'|'DOWN'|'AUTO';
export interface IRManualSettings {direction:IRPeakDirection;anchors:DataPoint[];enabled:boolean;coordinateSpace?:'PIXEL'|'PHYSICAL';intensityScale?:'ABSORBANCE'|'TRANSMITTANCE'|'PERCENT_TRANSMITTANCE'|'NORMALIZED'|'UNKNOWN';yAxisRange?:[number,number];revision?:number}
export function pixelIRX(x:number,c:ImageSpectrumCalibration):number {
  if(Number.isFinite(c.slope)&&Number.isFinite(c.intercept))return c.intercept!+x*c.slope!;
  if(c.referencePointA&&c.referencePointB){const a=c.referencePointA,b=c.referencePointB;if(b.pixelX!==a.pixelX)return a.physicalX+(x-a.pixelX)*(b.physicalX-a.physicalX)/(b.pixelX-a.pixelX);}
  return c.xAxisStart+(x-c.plotLeftPx)*(c.xAxisEnd-c.xAxisStart)/Math.max(1e-9,c.plotRightPx-c.plotLeftPx);
}
export function pixelIRY(y:number,c:ImageSpectrumCalibration,settings?:IRManualSettings):number {
  const [bottom,top]=settings?.yAxisRange??[0,100];
  return bottom+(c.plotBottomPx-y)*(top-bottom)/Math.max(1e-9,c.plotBottomPx-c.plotTopPx);
}
export function physicalIRInputs(s:ExperimentalSpectrumData,settings=s.irManualSettings):{raw:DataPoint[];anchors:DataPoint[]} {
  const c=s.imageCalibration;
  const raw=s.irPixelCurve&&c?s.irPixelCurve.map(p=>({x:pixelIRX(p.x,c),y:pixelIRY(p.y,c,settings)})):s.rawExperimentalSnapshot?.rawPoints?.length?s.rawExperimentalSnapshot.rawPoints:s.points;
  const anchors=settings?.coordinateSpace==='PIXEL'&&c?settings.anchors.map(p=>({x:pixelIRX(p.x,c),y:pixelIRY(p.y,c,settings)})):settings?.anchors??[];
  return {raw,anchors};
}
export function defaultPixelBaseline(s:ExperimentalSpectrumData,c:ImageSpectrumCalibration):IRManualSettings {
  const trace=s.irPixelCurve??[],ys=trace.map(p=>p.y).sort((a,b)=>a-b);
  const physical=trace.map(p=>({x:p.x,y:-p.y}));
  const direction=s.irManualSettings?.direction??'AUTO';
  const down=direction==='DOWN'||direction==='AUTO'&&(s.irIntensityScale==='PERCENT_TRANSMITTANCE'||s.irIntensityScale==='TRANSMITTANCE'||s.irIntensityScale!=='ABSORBANCE'&&(inferIRDirection(physical).direction==='DOWN'||!ys.length));
  const y=ys.length?ys[Math.floor((ys.length-1)*(down?.2:.8))]:c.plotTopPx+.12*(c.plotBottomPx-c.plotTopPx);
  return {direction,coordinateSpace:'PIXEL',enabled:false,intensityScale:s.irIntensityScale??'UNKNOWN',anchors:Array.from({length:5},(_,i)=>({x:c.plotLeftPx+(c.plotRightPx-c.plotLeftPx)*i/4,y}))};
}
export function relativeIRSignal(points:DataPoint[],baseline:DataPoint[],direction:'UP'|'DOWN'):DataPoint[]{
  return points.map((p,i)=>({x:p.x,y:(direction==='DOWN'?-1:1)*(p.y-(baseline[i]?.y??0))}));
}
export const irSettingsKey=(s?:IRManualSettings)=>JSON.stringify(s?{direction:s.direction,anchors:s.anchors,enabled:s.enabled,coordinateSpace:s.coordinateSpace,intensityScale:s.intensityScale,yAxisRange:s.yAxisRange}:null);
export function baselineAt(x:number,anchors:DataPoint[]):number {
  const a=anchors.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)).slice().sort((p,q)=>p.x-q.x);
  if(a.length!==5||a.some((p,i)=>i>0&&p.x===a[i-1].x))throw new Error('基線需要五個不同波數的有效控制點');
  if(x<=a[0].x)return a[0].y;
  if(x>=a[4].x)return a[4].y;
  const i=a.findIndex(p=>p.x>=x),l=a[i-1],r=a[i];return l.y+(r.y-l.y)*(x-l.x)/(r.x-l.x);
}
export function mirrorIR(points:DataPoint[],direction:IRPeakDirection,axis=0):DataPoint[]{
  return points.map(p=>({x:p.x,y:direction==='DOWN'?2*axis-p.y:p.y}));
}
export function correctFivePointBaseline(points:DataPoint[],anchors:DataPoint[]):DataPoint[]{
  return points.map(p=>({x:p.x,y:p.y-baselineAt(p.x,anchors)}));
}
export function inferIRDirection(points:DataPoint[]):{direction:'UP'|'DOWN';uncertain:boolean}{
  const ys=points.map(p=>p.y).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!ys.length)return {direction:'UP',uncertain:true};
  const mid=ys[Math.floor(ys.length/2)],lo=mid-ys[0],hi=ys[ys.length-1]-mid;
  return {direction:lo>hi?'DOWN':'UP',uncertain:Math.max(lo,hi)<1.5*Math.min(lo,hi)};
}
