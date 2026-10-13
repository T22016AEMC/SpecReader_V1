import {convert} from 'jcampconverter';
import type {DataPoint} from '../../types/spectrum';
interface DecodedSpectrum {data?:{x?:unknown;y?:unknown};xUnits?:unknown;yUnits?:unknown}
/** MIT jcampconverter 9.6.4. Decode factors, SQZ/DIF/DUP; never reinterpret T as 100−T. */
export function decodeJcamp(text:string):{points:DataPoint[];xUnit:string;yUnit:string} {
  if(text.length>12*1024*1024)throw new Error('JCAMP 檔案超過 12 MB 限制。');
  const declared=Number(text.match(/^##NPOINTS\s*=\s*(\d+)/mi)?.[1]);
  if(declared>50000)throw new Error('桌面科學流程目前限制 50,000 點；請先按儀器解析度合理降採樣。');
  const result=convert(text,{noContour:true});
  const spectra=result.flatten.flatMap(e=>e.spectra) as DecodedSpectrum[];
  if(spectra.length!==1)throw new Error('需要單一一維 JCAMP 光譜；多區塊／二維資料請先分離。');
  const spectrum=spectra[0],x=spectrum.data?.x,y=spectrum.data?.y;
  if(!Array.isArray(x)||!Array.isArray(y)||x.length!==y.length||!x.length||x.length>50000)throw new Error('JCAMP 數值資料無效或超過 50,000 點限制。');
  const points=x.map((value,i)=>({x:Number(value),y:Number(y[i])}));
  if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw new Error('JCAMP 含無效座標。');
  return {points,xUnit:String(spectrum.xUnits??'Unknown'),yUnit:String(spectrum.yUnits??'Unknown')};
}
