// Natural abundances are reference values, not sample-specific isotope measurements.
// NIST Atomic Weights and Isotopic Compositions (see scientific references).
const isotopes:Record<string,[number,number][]>={
  H:[[0,.999885],[1.00627674589,.000115]], C:[[0,.9893],[1.00335483507,.0107]],
  N:[[0,.99636],[.99703489445,.00364]], O:[[0,.99757],[1.00421713693,.00038],[2.00424499329,.00205]],
  S:[[0,.9499],[.9993877354,.0075],[1.9957958296,.0425],[3.9950095356,.0001]],
  Cl:[[0,.7576],[1.99704992,.2424]], Br:[[0,.5069],[1.9979535,.4931]],
  Si:[[0,.92223],[.99956813,.04685],[1.9968436,.03092]],
  F:[[0,1]],P:[[0,1]],I:[[0,1]],
};
export interface IsotopeEnvelopePeak {nominalOffset:number;massOffset:number;probability:number;relativeIntensity:number}
export function isotopeEnvelope(counts:Record<string,number>,maxOffset=8):IsotopeEnvelopePeak[] {
  let envelope=new Map<number,{p:number;m:number}>([[0,{p:1,m:0}]]);
  for(const [element,count] of Object.entries(counts)) {
    if (!Number.isInteger(count)||count<0||count>300||!isotopes[element]) throw new RangeError('Unsupported isotope composition');
    for(let atom=0;atom<count;atom++) {
      const next=new Map<number,{p:number;m:number}>();
      for(const [bin,value] of envelope) for(const [delta,abundance] of isotopes[element]) {
        const target=bin+Math.round(delta);if(target>maxOffset) continue;
        const p=value.p*abundance,m=p*(value.m/value.p+delta),old=next.get(target)??{p:0,m:0};
        next.set(target,{p:old.p+p,m:old.m+m});
      }
      envelope=next;
    }
  }
  const max=Math.max(...[...envelope.values()].map(v=>v.p));
  return [...envelope].sort(([a],[b])=>a-b).map(([nominalOffset,v])=>({nominalOffset,massOffset:v.m/v.p,probability:v.p,relativeIntensity:100*v.p/max}));
}
