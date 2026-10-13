import type {IonizationMode,MolecularFormulaCandidate} from "../types/spectrum";
import {ionMz,massError,neutralMassFromIon,type IonAdduct} from "./scientificEngines/ionMass";

export interface FormulaSearchInput {
  observedIonMz:number;ionization:IonizationMode;
  adductPreference?:"Auto"|IonAdduct;massToleranceDa?:number;massTolerancePpm?:number;
  isHighResolution?:boolean;chargeState?:number;hasBromine?:boolean;hasChlorine?:boolean;
  hasSulfurOrSilicon?:boolean;estimatedCarbonCount?:number|null;
}
const masses:Record<string,number>={C:12,H:1.00782503223,N:14.00307400443,O:15.99491461957,S:31.9720711744,Si:27.97692653465,Cl:34.968852682,Br:78.9183376,P:30.97376199842,F:18.99840316273,I:126.9044719};
/** Bounded exact-mass enumeration. No structure library is required.
 * A finite search is not exhaustive identification; isotope and elemental hints remain soft.
 */
export class MolecularFormulaCandidateEngine {
  static generateCandidates(input:FormulaSearchInput):MolecularFormulaCandidate[] {
    if(!Number.isFinite(input.observedIonMz)||input.observedIonMz<=0) return [];
    const z=input.chargeState??1;if(!Number.isInteger(z)||z===0||Math.abs(z)>4) return [];
    const adducts:IonAdduct[]=input.adductPreference&&input.adductPreference!=="Auto"?[input.adductPreference]:input.ionization==="ESI-"?["[M-H]-"]:input.ionization==="ESI+"||input.ionization==="APCI"?["[M+H]+","[M+Na]+","[M+NH4]+"]:["[M]+•"];
    const candidates:MolecularFormulaCandidate[]=[];
    for(const adduct of adducts) {
      if(Math.abs(z)>1&&(adduct==="[M+Na]+"||adduct==="[M+NH4]+")) continue;
      const target=neutralMassFromIon(input.observedIonMz,adduct,z);
      if(target<12||target>600) continue;
      const tolerance=input.isHighResolution?input.observedIonMz*(input.massTolerancePpm??5)/1e6:(input.massToleranceDa??.5);
      const neutralTolerance=tolerance*Math.abs(z);
      const counts:Record<string,number>={};let nodes=0,truncated=false;
      // Bounds are explicit applicability limits rather than asserted elemental identities.
      const bounds:[string,number][]=[["Br",input.hasBromine?3:1],["Cl",input.hasChlorine?3:1],["Si",input.hasSulfurOrSilicon?3:1],["S",2],["P",1],["F",3],["I",1],["N",4],["O",12],["C",35]];
      const visit=(depth:number,mass:number)=>{
        if(++nodes>250000){truncated=true;return;}
        if(depth<bounds.length){const [e,max]=bounds[depth];for(let n=0;n<=Math.min(max,Math.floor((target+neutralTolerance-mass)/masses[e]));n++){counts[e]=n;visit(depth+1,mass+n*masses[e]);}return;}
        const h=Math.round((target-mass)/masses.H);if(h<0||h>100||counts.C<1) return;
        const dbe=counts.C+counts.Si+1+(counts.N+counts.P)/2-(h+counts.F+counts.Cl+counts.Br+counts.I)/2;
        if(dbe<0||Math.abs(dbe-Math.round(dbe))>.01) return;
        const neutral=mass+h*masses.H,mz=ionMz(neutral,adduct,z),error=massError(input.observedIonMz,mz);
        if(Math.abs(error.da)>tolerance) return;
        const formula=["C","H","Br","Cl","F","I","N","O","P","S","Si"].map(e=>{const n=e==="H"?h:counts[e];return n?e+(n===1?"":n):""}).join("");
        const isotopeHint=(input.hasBromine&&counts.Br>0)||(input.hasChlorine&&counts.Cl>0);
        candidates.push({formula,neutralExactMass:neutral,theoreticalIonMz:mz,observedIonMz:input.observedIonMz,adductLabel:adduct,massErrorDa:error.da,massErrorPpm:error.ppm,dbe,nitrogenRuleValid:Math.round(neutral)%2===counts.N%2,isotopeCompatibility:"Not evaluated",halogenSignatureMatch:isotopeHint?"同位素提示相容，仍需完整包絡比對":"未使用同位素提示確認元素",score:Math.max(0,100*(1-Math.abs(error.da)/tolerance)),notes:"精確質量容差內的組成假設；非唯一分子式；搜尋 C≤35／N≤4／O≤12／質量≤600 Da。"});
      };
      visit(0,0);
      if(truncated) for(const c of candidates)c.notes+=" 搜尋達到節點上限，候選集合不完整。";
    }
    return candidates.sort((a,b)=>Math.abs(a.massErrorDa)-Math.abs(b.massErrorDa)).slice(0,24);
  }
}
