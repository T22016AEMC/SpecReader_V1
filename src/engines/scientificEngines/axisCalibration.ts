import {AXIS_CALIBRATION_CONFIG as CFG,type AxisPresetId} from './axisCalibrationConfig';

/**
 * Piecewise-linear image x-axis calibration (v1.1.7-hotfix.2). Knots are sorted by pixel; between two neighbouring
 * knots the mapping is linear; beyond the ends the nearest segment's slope is used. Every user point is a knot, so it
 * maps back to its own value; an optional preset may add inferred knots (e.g. a scale break at 2000 cm⁻¹).
 */
export interface AxisPoint {pixelX:number;physicalX:number}
export interface AxisKnot extends AxisPoint {inferred?:boolean}
export type PiecewiseAxisResult =
 |{ok:true;knots:AxisKnot[];inferredKnots:AxisKnot[];presetId:AxisPresetId|null;residuals:number[];tolerance:number}
 |{ok:false;error:string};

const span=(pts:AxisPoint[])=>Math.max(...pts.map(p=>p.physicalX))-Math.min(...pts.map(p=>p.physicalX));
export const reproductionTolerance=(physicalSpan:number)=>Math.max(CFG.pointReproductionToleranceAbsolute,CFG.pointReproductionToleranceFraction*Math.abs(physicalSpan));

export function physicalFromPixel(knots:AxisPoint[],pixelX:number):number {
 const k=knots;let i=0;
 if(pixelX<=k[0].pixelX)i=0;else if(pixelX>=k[k.length-1].pixelX)i=k.length-2;else while(i<k.length-2&&pixelX>k[i+1].pixelX)i++;
 const a=k[i],b=k[i+1];
 return a.physicalX+(pixelX-a.pixelX)*(b.physicalX-a.physicalX)/(b.pixelX-a.pixelX);
}
export function pixelFromPhysical(knots:AxisPoint[],physicalX:number):number {
 const k=knots,descending=k[k.length-1].physicalX<k[0].physicalX;
 const before=(v:number,ref:number)=>descending?v>=ref:v<=ref;
 let i=0;
 if(before(physicalX,k[0].physicalX))i=0;else if(!before(physicalX,k[k.length-1].physicalX))i=k.length-2;else while(i<k.length-2&&!before(physicalX,k[i+1].physicalX))i++;
 const a=k[i],b=k[i+1];
 return a.pixelX+(physicalX-a.physicalX)*(b.pixelX-a.pixelX)/(b.physicalX-a.physicalX);
}

/** Inferred knots for a scale-break preset: the break itself, plus one past it when all points lie on one side. */
function presetKnots(sorted:AxisPoint[],presetId:AxisPresetId):AxisKnot[]|{error:string} {
 const p=CFG.presets[presetId],B=p.breakPhysical,r=p.belowToAboveScaleRatio;
 if(sorted.some(q=>Math.abs(q.physicalX-B)<=reproductionTolerance(span(sorted))))return [];   // the break is already a user point
 // pixels per physical unit: |Δpx| = scale × |Δν|, scale below the break = r × scale above it
 for(let i=0;i<sorted.length-1;i++){
  const a=sorted[i],b=sorted[i+1];
  if((a.physicalX-B)*(b.physicalX-B)<0){
   const above=a.physicalX>B?a:b,below=above===a?b:a;
   const fraction=(above.physicalX-B)/((above.physicalX-B)+r*(B-below.physicalX));
   return [{pixelX:above.pixelX+(below.pixelX-above.pixelX)*fraction,physicalX:B,inferred:true}];
  }
 }
 // All points on one side: extend the nearest segment to the break, then continue with the preset's other slope.
 const allAbove=sorted.every(q=>q.physicalX>B);
 const byDistance=[...sorted].sort((x,y)=>Math.abs(x.physicalX-B)-Math.abs(y.physicalX-B));
 const n1=byDistance[0],n2=byDistance[1];
 const pxPerUnit=(n1.pixelX-n2.pixelX)/(n1.physicalX-n2.physicalX);   // signed
 const breakPx=n1.pixelX+(B-n1.physicalX)*pxPerUnit;
 const otherPxPerUnit=allAbove?pxPerUnit*r:pxPerUnit/r;
 const farPhysical=allAbove?B-p.extensionPhysical:B+p.extensionPhysical;
 return [{pixelX:breakPx,physicalX:B,inferred:true},{pixelX:breakPx+(farPhysical-B)*otherPxPerUnit,physicalX:farPhysical,inferred:true}];
}

/** Validates the points and builds the knots. Errors are user-facing (Traditional Chinese). */
export function buildPiecewiseAxis(points:AxisPoint[],options:{presetId?:AxisPresetId|null}={}):PiecewiseAxisResult {
 if(points.length<CFG.piecewiseMinPoints||points.length>CFG.piecewiseMaxPoints)return {ok:false,error:`分段線性校正需要 ${CFG.piecewiseMinPoints}–${CFG.piecewiseMaxPoints} 個校正點（目前 ${points.length} 個）。`};
 if(points.some(p=>!Number.isFinite(p.pixelX)||!Number.isFinite(p.physicalX)))return {ok:false,error:'校正點的像素位置與數值都必須是有效數字。'};
 const sorted=[...points].sort((a,b)=>a.pixelX-b.pixelX);
 const s=span(sorted);
 for(let i=0;i<sorted.length-1;i++)if(sorted[i+1].pixelX-sorted[i].pixelX<CFG.minPixelSeparation)return {ok:false,error:`有兩個校正點的像素位置重複或過近（px ${sorted[i].pixelX} 與 ${sorted[i+1].pixelX}，相距需 ≥ ${CFG.minPixelSeparation} px）。`};
 for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length;j++)if(Math.abs(sorted[i].physicalX-sorted[j].physicalX)<=CFG.minPhysicalSeparationFraction*Math.max(s,1e-9))return {ok:false,error:`有兩個校正點的數值相同或過近（${sorted[i].physicalX} 與 ${sorted[j].physicalX}）。`};
 const steps=sorted.slice(1).map((p,i)=>Math.sign(p.physicalX-sorted[i].physicalX));
 if(!steps.every(d=>d===steps[0]))return {ok:false,error:'校正點順序不一致：依像素位置排序後，數值必須一路遞增或一路遞減。請檢查是否有校正點的數值輸入錯誤或點錯位置。'};
 let inferred:AxisKnot[]=[];
 if(options.presetId){
  const extra=presetKnots(sorted,options.presetId);
  if('error' in extra)return {ok:false,error:extra.error};
  inferred=extra;
 }
 const knots:AxisKnot[]=[...sorted,...inferred].sort((a,b)=>a.pixelX-b.pixelX);
 const kSteps=knots.slice(1).map((p,i)=>Math.sign(p.physicalX-knots[i].physicalX));
 for(let i=0;i<knots.length-1;i++)if(knots[i+1].pixelX-knots[i].pixelX<1e-6||kSteps[i]!==steps[0])return {ok:false,error:`預設「${CFG.presets[options.presetId!].label}」推出的轉折點與校正點不相容（轉折點落在校正點之間的錯誤位置）。請改用不含預設的分段模式，或重新點選校正點。`};
 const tolerance=reproductionTolerance(s);
 const residuals=sorted.map(p=>physicalFromPixel(knots,p.pixelX)-p.physicalX);
 const bad=residuals.findIndex(r=>Math.abs(r)>tolerance);
 if(bad>=0)return {ok:false,error:`校正點 px ${sorted[bad].pixelX} 重算為 ${(sorted[bad].physicalX+residuals[bad]).toFixed(3)}，與輸入 ${sorted[bad].physicalX} 相差超過容許值 ${tolerance.toFixed(3)}。`};
 return {ok:true,knots,inferredKnots:inferred,presetId:options.presetId??null,residuals,tolerance};
}

export interface LinearityCheck {maxResidual:number;tolerance:number;flagged:{point:AxisPoint;residual:number}[];warning:string|null}
/** Residual of each point against an existing (straight-line) mapping; flags points beyond the configured fraction of span. */
export function checkLinearity(points:AxisPoint[],map:(pixelX:number)=>number):LinearityCheck {
 const valid=points.filter(p=>Number.isFinite(p.pixelX)&&Number.isFinite(p.physicalX));
 const tolerance=CFG.linearityResidualFractionOfSpan*(valid.length>=2?span(valid):0);
 const rows=valid.map(point=>({point,residual:point.physicalX-map(point.pixelX)}));
 const flagged=valid.length>=2?rows.filter(r=>Math.abs(r.residual)>tolerance):[];
 return {maxResidual:Math.max(0,...rows.map(r=>Math.abs(r.residual))),tolerance,flagged,warning:flagged.length?CFG.linearityWarningText:null};
}
