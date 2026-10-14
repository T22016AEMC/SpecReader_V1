import type {DataPoint} from '../../types/spectrum';
export type IRPeakDirection='UP'|'DOWN'|'AUTO';
export interface IRManualSettings {direction:IRPeakDirection;anchors:DataPoint[];enabled:boolean}
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
