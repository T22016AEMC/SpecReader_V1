import {COMPOSITION_CONFIG as CFG} from './compositionConfig';
import {MONO_MASS,hardViolation,monoisotopicMass} from './goldenRules';
import type {CompositionElement,ElementCounts} from './types';

export interface EnumerationSpec {
 /** Neutral monoisotopic mass and tolerance; omit both for the no-mass route. */
 neutralMass?:number;
 toleranceDa?:number;
 /** Maximum count per heavy element; elements absent here are not used. C must be present. */
 caps:ElementCounts;
 /** Minimum count per element (hard bounds only). */
 mins:ElementCounts;
 /** Allowed carbon range (inclusive). */
 carbonRange:[number,number];
 /** No-mass route only: the H counts to try; null means 0 … the DBE ≥ 0 limit. */
 hydrogenSet?:number[]|null;
 /** Hard minimum H (e.g. from DEPT). */
 hydrogenMin?:number;
 /** Hard minimum DBE. */
 dbeMin?:number;
 maxNodes?:number;
}
export interface EnumeratedFormula {counts:ElementCounts;mass:number}
export interface EnumerationOutcome {formulas:EnumeratedFormula[];nodes:number;passedHardFilters:number;truncated:boolean}

/** Heavy elements, heaviest first so the mass bound prunes early (same strategy as mf-finder). */
const ORDER:readonly CompositionElement[]=['I','Br','Cl','S','P','Si','F','O','N','C'];

/** Bounded, deterministic enumeration of neutral closed-shell formulas. Order of results is the loop order. */
export function enumerateFormulas(spec:EnumerationSpec):EnumerationOutcome {
 const maxNodes=spec.maxNodes??CFG.maxNodes;
 const elements=ORDER.filter(e=>e==='C'||(spec.caps[e]??0)>0);
 const out:EnumerationOutcome={formulas:[],nodes:0,passedHardFilters:0,truncated:false};
 const counts:ElementCounts={};
 const hasMass=spec.neutralMass!==undefined;
 const upper=hasMass?spec.neutralMass!+(spec.toleranceDa??0):CFG.maxNeutralMass;
 const lower=hasMass?spec.neutralMass!-(spec.toleranceDa??0):0;
 const accept=(h:number)=>{
  const c:ElementCounts={...counts,H:h};
  for(const k of Object.keys(c) as CompositionElement[])if(!c[k])delete c[k];
  const mass=monoisotopicMass(c);
  if(mass>upper||mass<lower)return;
  if(h<(spec.hydrogenMin??0)||h<(spec.mins.H??0))return;
  if(hardViolation(c,mass))return;
  const dbe=c.C!+(c.Si??0)+1+((c.N??0)+(c.P??0))/2-(h+(c.F??0)+(c.Cl??0)+(c.Br??0)+(c.I??0))/2;
  if(dbe<(spec.dbeMin??0))return;
  out.passedHardFilters++;out.formulas.push({counts:c,mass});
 };
 const visit=(depth:number,mass:number)=>{
  if(out.truncated)return;
  if(++out.nodes>maxNodes){out.truncated=true;return;}
  if(depth===elements.length){
   if(!counts.C)return;
   const maxH=2*counts.C+2+(counts.N??0)+(counts.P??0)+2*(counts.Si??0);
   if(hasMass){
    const lo=Math.max(0,Math.ceil((lower-mass)/MONO_MASS.H)),hi=Math.min(maxH,Math.floor((upper-mass)/MONO_MASS.H));
    for(let h=lo;h<=hi;h++)accept(h);
   }else{
    const hs=spec.hydrogenSet??Array.from({length:maxH+1},(_,i)=>i);
    for(const h of hs)if(h<=maxH)accept(h);
   }
   return;
  }
  const e=elements[depth];
  let lo=spec.mins[e]??0,hi=spec.caps[e]??0;
  if(e==='C'){lo=Math.max(lo,spec.carbonRange[0],1);hi=Math.min(hi,spec.carbonRange[1]);}
  for(let k=lo;k<=hi;k++){
   const m=mass+k*MONO_MASS[e];
   if(m>upper)break;
   counts[e]=k;visit(depth+1,m);
   if(out.truncated)break;
  }
  delete counts[e];
 };
 visit(0,0);
 return out;
}
