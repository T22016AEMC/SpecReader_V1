import {it,expect} from 'vitest';
import {SpectrumParser} from '../src/engines/spectrumParser';
import {decodeJcamp} from '../src/engines/scientificEngines/jcampAdapter';
import {prepareIR} from '../src/engines/scientificEngines/irSignalProcessing';
import * as XLSX from 'xlsx';
it('JCAMP XYDATA 因子與全部逐點值解壓；保留透射率及原始快照',()=>{
  const text='##TITLE=synthetic test\n##JCAMP-DX=5.00\n##DATA TYPE=INFRARED SPECTRUM\n##XUNITS=1/CM\n##YUNITS=TRANSMITTANCE\n##XFACTOR=1\n##YFACTOR=0.01\n##FIRSTX=1000\n##LASTX=1004\n##NPOINTS=5\n##DELTAX=1\n##XYDATA=(X++(Y..Y))\n1000 100 90 50 90 100\n##END=';
  const decoded=decodeJcamp(text);expect(decoded.points).toHaveLength(5);expect(decoded.points[2].y).toBe(.5);
  const s=SpectrumParser.parseTextSpectrum('IR','synthetic.jdx',text);
  expect(s.sourceFormat).toBe('JCAMP-DX');expect(s.rawExperimentalSnapshot!.rawY![2]).toBe(.5);expect(s.irIntensityScale).toBe('TRANSMITTANCE');
  expect(prepareIR(s).peaks.every(p=>Number.isFinite(p.y))).toBe(true);
});
it('CSV HRMS 不先四捨五入到小數二位；較多 NMR 標注仍保留積分／多重性',()=>{
  const ms=SpectrumParser.parseTextSpectrum('MS','synthetic.csv','m/z,intensity\n47.049141234,100\n48.0525,2');
  expect(ms.points[0].x).toBe(47.049141234);
  const nmr=SpectrumParser.parseTextSpectrum('1H_NMR','synthetic.csv','ppm,intensity,integration,multiplicity\n'+Array.from({length:24},(_,i)=>`${i*.1},1,${i%3+1},t`).join('\n'));
  expect(nmr.peaks).toHaveLength(24);expect(nmr.peaks.every(p=>p.integration!=null&&p.multiplicity==='t')).toBe(true);
});
it('更新的 SheetJS 可實際讀取 xlsx 二進位，保留相對積分與多重性',()=>{
  const sheet=XLSX.utils.aoa_to_sheet([['ppm','intensity','integration','multiplicity'],[1.2,100,3,'t'],[3.6,90,2,'q']]);
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'NMR');
  const bytes=XLSX.write(book,{type:'array',bookType:'xlsx'}) as ArrayBuffer;
  const s=SpectrumParser.parseExcelSpectrum('1H_NMR','synthetic.xlsx',bytes);
  expect(s.peaks.map(p=>p.integration)).toEqual([3,2]);expect(s.peaks.map(p=>p.multiplicity)).toEqual(['t','q']);
});
it('超大圖片與惡意巨大 JCAMP 宣告在讀檔／解壓前受控拒絕',async()=>{
  const file=new File([new Uint8Array(13*1024*1024)],'large.png',{type:'image/png'});
  await expect(SpectrumParser.parseUploadedFile(file,'IR')).rejects.toThrow('12 MB');
  expect(()=>decodeJcamp('##TITLE=synthetic\n##NPOINTS=1000000000\n##END=')).toThrow('50,000');
});
