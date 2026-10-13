import type {ProtonEnvironment} from '../../types/spectrum';
export function compatiblePair(a:ProtonEnvironment,b:ProtonEnvironment,ratio:number,tolerance=.25):boolean {
  const ai=a.rawIntegralValue??a.integration,bi=b.rawIntegralValue??b.integration;
  if(ai==null||bi==null||ai<=0||bi<=0||Math.abs(bi/ai-ratio)>tolerance) return false;
  return !a.jCouplingHz.length||!b.jCouplingHz.length||a.jCouplingHz.some(j=>b.jCouplingHz.some(k=>Math.abs(j-k)<=1.6));
}
export function findEthylPairs(envs:ProtonEnvironment[]):[ProtonEnvironment,ProtonEnvironment][] {
  const qs=envs.filter(e=>e.shiftPpm>=1.1&&e.shiftPpm<=4.65&&(e.multiplicity==='q'||e.multiplicity==='quartet'));
  const ts=envs.filter(e=>e.shiftPpm>=.65&&e.shiftPpm<=1.8&&(e.multiplicity==='t'||e.multiplicity==='triplet'));
  return qs.flatMap(q=>ts.filter(t=>compatiblePair(q,t,1.5)).map(t=>[q,t] as [ProtonEnvironment,ProtonEnvironment]));
}
export function findIsopropylPairs(envs:ProtonEnvironment[]):[ProtonEnvironment,ProtonEnvironment][] {
  return envs.filter(e=>e.shiftPpm>=1.3&&e.shiftPpm<=5.2&&e.multiplicity==='sept').flatMap(ch=>envs.filter(e=>e.shiftPpm>=.6&&e.shiftPpm<=1.6&&e.multiplicity==='d'&&compatiblePair(ch,e,6,.8)).map(ch3=>[ch,ch3] as [ProtonEnvironment,ProtonEnvironment]));
}
