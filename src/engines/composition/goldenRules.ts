import {COMPOSITION_CONFIG as CFG} from './compositionConfig';
import {COMPOSITION_ELEMENTS,type CompositionElement,type ElementCounts} from './types';

/** Monoisotopic masses (same values as formulaEngine.ts; NIST/IUPAC). */
export const MONO_MASS:Record<CompositionElement,number>={C:12,H:1.00782503223,N:14.00307400443,O:15.99491461957,S:31.9720711744,P:30.97376199842,F:18.99840316273,Cl:34.968852682,Br:78.9183376,I:126.9044719,Si:27.97692653465};
/** Lowest common valence used for DBE and SENIOR (P trivalent, S divalent). */
export const VALENCE:Record<CompositionElement,number>={C:4,H:1,N:3,O:2,S:2,P:3,F:1,Cl:1,Br:1,I:1,Si:4};
/** Hill order, identical to ChemistryEngine.formatFormula so formulas compare as strings. */
const HILL:readonly CompositionElement[]=['C','H','Br','Cl','F','I','N','O','P','S','Si'];

const n=(c:ElementCounts,e:CompositionElement)=>c[e]??0;
export function formatHill(c:ElementCounts):string {
 return HILL.map(e=>n(c,e)?e+(n(c,e)===1?'':n(c,e)):'').join('');
}
export function parseCounts(formula:string):ElementCounts|null {
 const out:ElementCounts={};const re=/([A-Z][a-z]?)(\d*)/g;let m:RegExpExecArray|null;let consumed='';
 while((m=re.exec(formula))!==null){
  if(!m[0])break;consumed+=m[0];
  if(!(COMPOSITION_ELEMENTS as readonly string[]).includes(m[1]))return null;
  out[m[1] as CompositionElement]=(out[m[1] as CompositionElement]??0)+(m[2]?Number(m[2]):1);
 }
 return consumed===formula.replace(/\s+/g,'')&&consumed?out:null;
}
export function monoisotopicMass(c:ElementCounts):number {
 return COMPOSITION_ELEMENTS.reduce((s,e)=>s+n(c,e)*MONO_MASS[e],0);
}
export function dbeOf(c:ElementCounts):number {
 return n(c,'C')+n(c,'Si')+1+(n(c,'N')+n(c,'P'))/2-(n(c,'H')+n(c,'F')+n(c,'Cl')+n(c,'Br')+n(c,'I'))/2;
}
/** SENIOR rules (Kind & Fiehn rule 2): even valence sum and a connected graph is possible. */
export function seniorOk(c:ElementCounts):boolean {
 let sum=0,atoms=0;
 for(const e of COMPOSITION_ELEMENTS){sum+=n(c,e)*VALENCE[e];atoms+=n(c,e);}
 return sum%2===0&&sum>=2*(atoms-1);
}
/** Hard filters: DBE non-negative integer, SENIOR, Golden Rules 1/4/5/6 (extended ranges). Returns a reason or null. */
export function hardViolation(c:ElementCounts,mass:number):string|null {
 const dbe=dbeOf(c);
 if(dbe<0||!Number.isInteger(dbe))return `DBE=${dbe} 不是非負整數`;
 if(!seniorOk(c))return 'SENIOR 價數規則不成立';
 const bracket=CFG.goldenRule1.find(b=>mass<b.maxMass);
 if(bracket)for(const [e,max] of Object.entries(bracket.caps))if(n(c,e as CompositionElement)>max)return `Golden Rule 1：${e}>${max}（質量<${bracket.maxMass}）`;
 const C=n(c,'C');
 if(C<1)return '不含碳';
 const hc=n(c,'H')/C;
 if(hc<CFG.hcHard[0]||hc>CFG.hcHard[1])return `Golden Rule 4：H/C=${hc.toFixed(2)} 超出 ${CFG.hcHard.join('–')}`;
 for(const [e,max] of Object.entries(CFG.ratioHard))if(n(c,e as CompositionElement)/C>max)return `Golden Rule 5：${e}/C>${max}`;
 for(const rule of CFG.goldenRule6){
  if(Object.entries(rule.when).every(([e,v])=>n(c,e as CompositionElement)>v)&&Object.entries(rule.limits).some(([e,v])=>n(c,e as CompositionElement)>=v))return 'Golden Rule 6：多元素組合機率檢查不通過';
 }
 return null;
}
/** Golden Rules common ranges (soft). */
export function commonRangeViolations(c:ElementCounts):string[] {
 const C=n(c,'C'),out:string[]=[];
 if(!C)return out;
 const hc=n(c,'H')/C;
 if(hc<CFG.hcCommon[0]||hc>CFG.hcCommon[1])out.push(`H/C=${hc.toFixed(2)} 不在常見範圍 ${CFG.hcCommon.join('–')}`);
 for(const [e,max] of Object.entries(CFG.ratioCommon))if(n(c,e as CompositionElement)/C>max)out.push(`${e}/C=${(n(c,e as CompositionElement)/C).toFixed(2)} 超過常見上限 ${max}`);
 return out;
}
