import type {DataPoint,ImageSpectrumCalibration} from '../../types/spectrum';
/** Deterministic original-pixel tracing. No interpolated or AI supplied peaks.
 * Reject continuous axis/grid runs, prefer chromatic or dark thin strokes and
 * continuity; ambiguous columns are omitted rather than invented.
 */
export function traceIRPixels(rgba:Uint8ClampedArray,width:number,height:number,c:ImageSpectrumCalibration):{pixels:DataPoint[];quality:number} {
  const left=Math.max(1,Math.ceil(c.plotLeftPx)+2),right=Math.min(width-2,Math.floor(c.plotRightPx)-2);
  const top=Math.max(1,Math.ceil(c.plotTopPx)+2),bottom=Math.min(height-2,Math.floor(c.plotBottomPx)-2);
  const rowDensity=new Map<number,number>();
  const ink=(x:number,y:number)=>{const k=(y*width+x)*4,r=rgba[k],g=rgba[k+1],b=rgba[k+2];return rgba[k+3]>100&&(Math.min(r,g,b)<145||Math.max(r,g,b)-Math.min(r,g,b)>60);};
  for(let y=top;y<=bottom;y++){let count=0;for(let x=left;x<=right;x++)if(ink(x,y))count++;rowDensity.set(y,count/Math.max(1,right-left));}
  const pixels:DataPoint[]=[];let prev:number|undefined;
  for(let x=left;x<=right;x++){
    const runs:{y:number;score:number}[]=[];
    for(let y=top;y<=bottom;y++)if(ink(x,y)){
      const start=y;while(y<bottom&&ink(x,y+1))y++;
      if(y-start>Math.max(10,(bottom-top)*.15))continue;
      const mid=(start+y)/2,k=(Math.round(mid)*width+x)*4;
      const chroma=Math.max(rgba[k],rgba[k+1],rgba[k+2])-Math.min(rgba[k],rgba[k+1],rgba[k+2]);
      if((rowDensity.get(Math.round(mid))??0)>.9&&chroma<40)continue;
      const distance=prev===undefined?0:Math.abs(mid-prev);
      runs.push({y:mid,score:chroma/255+1/(1+distance/8)});
    }
    runs.sort((a,b)=>b.score-a.score);
    if(!runs.length||runs.length>8||(runs[1]&&runs[0].score-runs[1].score<.05))continue;
    prev=runs[0].y;pixels.push({x,y:prev});
  }
  return {pixels,quality:pixels.length/Math.max(1,right-left+1)};
}
