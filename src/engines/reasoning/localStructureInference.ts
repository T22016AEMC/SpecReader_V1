import type {ChemicalHypothesis,HypothesisKind,LocalStructureHypothesis,LocalAtom,LocalBond} from './types';
const VALENCE:Record<string,number>={C:4,N:3,O:2};
/** Generic atom/bond primitives only. No whole-compound answers. */
export function inferLocalStructures(hypotheses:ChemicalHypothesis[]):LocalStructureHypothesis[]{
 const result:LocalStructureHypothesis[]=[];
 const add=(h:ChemicalHypothesis,atoms:LocalAtom[],bonds:LocalBond[],description:string,sites?:number[])=>{
  const key=h.kind+':'+description;const old=result.find(v=>v.kind+':'+v.description===key);
  if(old){old.hypothesisIds.push(h.id);old.observationIds=[...new Set([...old.observationIds,...h.observationIds])];if(h.level==='SUPPORTED')old.supportLevel=h.level;return;}
  result.push({id:`local-${result.length}`,kind:h.kind,description,atoms,bonds,ports:atoms.flatMap((a,i)=>{const free=VALENCE[a.element]-bonds.reduce((n,b)=>n+(b.a===i||b.b===i?b.order:0),0);return free>0?[{atom:i,availableValence:free}]:[];}),substitutionSites:sites,hypothesisIds:[h.id],observationIds:h.observationIds,support:h.support,unknown:['開放價數可由H或未知取代基滿足；不是已確認完整分子','端點為可組裝位置，不是已觀測的2D交叉峰'],status:'LOCAL_HYPOTHESIS',constraintStrength:'SOFT',supportLevel:h.level,relations:[]});
 };
 const carbonRing=()=>Array.from({length:6},()=>({element:'C'}));
 const ringBonds=()=>Array.from({length:6},(_,i)=>({a:i,b:(i+1)%6,order:i%2?1:2}));
 for(const h of hypotheses){
  if(['AROMATIC','ARYL_PARA','ARYL_META','ARYL_ORTHO'].includes(h.kind))add(h,carbonRing(),ringBonds(),h.kind==='AROMATIC'?'六碳芳香環局部骨架':h.description,h.kind==='AROMATIC'?undefined:[0,h.constraints.substitutionDistance??3]);
  if(h.kind==='HYDROXYL')add(h,[{element:'O'}],[],'O–H／含氧端點競爭假設');
  if(h.kind==='AMINO'||h.kind==='NITROGENATED')add(h,[{element:'C'},{element:'N'}],[{a:0,b:1,order:1}],'C–N局部環境，N–H／取代數未知');
  if(h.kind==='OXYGENATED')add(h,[{element:'C'},{element:'O'}],[{a:0,b:1,order:1}],'C–O局部連接，醇／醚競爭');
  if(h.kind==='CARBONYL')add(h,[{element:'C'},{element:'O'}],[{a:0,b:1,order:2}],'C=O兩側連接尚未確認');
  if(h.kind==='ETHYL')add(h,[{element:'C'},{element:'C'}],[{a:0,b:1,order:1}],'CH₂–CH₃局部耦合假設');
  if(h.kind==='ALKYNE'||h.kind==='NITRILE')add(h,[{element:'C'},{element:h.kind==='NITRILE'?'N':'C'}],[{a:0,b:1,order:3}],'sp 三鍵局部環境；另一端連接未知');
  if(h.kind==='ALKENE')add(h,[{element:'C'},{element:'C'}],[{a:0,b:1,order:2}],'C=C局部骨架（芳香假設的競爭解釋）');
  if(h.kind==='ALKYL')add(h,[{element:'C'}],[],'sp³碳環境；CHn及倍率尚未知');
 }
 // Cross-modal OH + aromatic evidence supports a phenolic connection as one branch,
 // while keeping an alcohol attached elsewhere as a competing branch.
 const oh=hypotheses.filter(h=>h.kind==='HYDROXYL'),ar=hypotheses.filter(h=>h.kind==='AROMATIC'||h.kind==='ARYL_PARA');
 if(oh.length&&ar.length){const combined:ChemicalHypothesis={...oh[0],id:oh[0].id,observationIds:[...new Set([...oh[0].observationIds,...ar[0].observationIds])],support:[...oh[0].support,'芳香及羥基證據允許酚連接，但不能證明OH一定直接在環上']};add(combined,[...carbonRing(),{element:'O'}],[...ringBonds(),{a:0,b:6,order:1}],'可能酚類局部連接（與苄醇／其他醇競爭）');result[result.length-1].hypothesisIds=[...new Set([oh[0].id,ar[0].id])];}
 for(const a of result)for(const b of result){if(a===b)continue;const aFree=a.ports.length,bFree=b.ports.length;
  const alternatives=a.observationIds.some(id=>b.observationIds.includes(id));
  a.relations.push({otherId:b.id,kind:!aFree||!bFree?'EXCLUDED_BY_VALENCE':alternatives?'UNKNOWN':'POSSIBLE_CONNECTION',reason:!aFree||!bFree?'沒有可用價數':alternatives?'共享觀測／競爭解釋，不可將同一訊號當作兩個獨立片段必須共存':'有開放價數可嘗試接合；沒有COSY/HSQC/HMBC直接觀測連接'});
 }
 return result;
}
