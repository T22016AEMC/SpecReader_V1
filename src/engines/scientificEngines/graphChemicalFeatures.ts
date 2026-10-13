import {StructureParserAdapter,type ParsedSmilesGraph,type SmilesAtomNode} from '../chemistryEngine';
export function graphChemicalFeatures(smiles:string) {
  const graph=StructureParserAdapter.parseSmilesGraph(smiles).graph;
  const atoms=graph?.atoms??[];
  const neighbors=(a:SmilesAtomNode)=>a.neighbors.map(n=>({atom:atoms[n.toAtom],order:n.order}));
  const carbonyl=(a:SmilesAtomNode)=>a.element==='C'&&neighbors(a).some(n=>n.order===2&&n.atom.element==='O');
  const carbonyls=atoms.filter(carbonyl);
  const hydroxyls=atoms.filter(a=>a.element==='O'&&a.totalHydrogens>0&&neighbors(a).some(n=>n.atom.element==='C'&&!carbonyl(n.atom)));
  const amines=atoms.filter(a=>a.element==='N'&&!a.isAromatic&&a.formalCharge===0&&!neighbors(a).some(n=>carbonyl(n.atom)||n.order>=2));
  return {graph,
    aromatic:atoms.some(a=>a.isAromatic),heteroaromatic:atoms.some(a=>a.isAromatic&&a.element==='N'),
    acid:carbonyls.some(a=>neighbors(a).some(n=>n.order===1&&n.atom.element==='O'&&n.atom.totalHydrogens>0)),
    ester:carbonyls.some(a=>neighbors(a).some(n=>n.order===1&&n.atom.element==='O'&&n.atom.totalHydrogens===0&&n.atom.neighbors.some(m=>m.toAtom!==a.index&&atoms[m.toAtom].element==='C'))),
    aldehyde:carbonyls.some(a=>a.totalHydrogens>0),ketone:carbonyls.some(a=>neighbors(a).filter(n=>n.atom.element==='C').length===2),
    amide:carbonyls.some(a=>neighbors(a).some(n=>n.order===1&&n.atom.element==='N')),
    primaryAmide:carbonyls.some(a=>neighbors(a).some(n=>n.atom.element==='N'&&n.atom.totalHydrogens>=2)),
    tertiaryAmide:carbonyls.some(a=>neighbors(a).some(n=>n.atom.element==='N'&&n.atom.totalHydrogens===0)),
    phenol:hydroxyls.some(a=>neighbors(a).some(n=>n.atom.isAromatic)),alcohol:hydroxyls.some(a=>neighbors(a).some(n=>!n.atom.isAromatic)),
    tertiaryAlcohol:hydroxyls.some(a=>neighbors(a).some(n=>n.atom.element==='C'&&neighbors(n.atom).filter(m=>m.atom.element==='C').length>=3)),
    secondaryAlcohol:hydroxyls.some(a=>neighbors(a).some(n=>n.atom.element==='C'&&neighbors(n.atom).filter(m=>m.atom.element==='C').length===2)),
    primaryAmine:amines.some(a=>a.totalHydrogens>=2),secondaryAmine:amines.some(a=>a.totalHydrogens===1),amine:amines.length>0,
    ether:atoms.some(a=>a.element==='O'&&a.totalHydrogens===0&&neighbors(a).length===2&&neighbors(a).every(n=>n.order===1&&n.atom.element==='C'&&!carbonyl(n.atom))),
    nitrile:atoms.some(a=>a.element==='C'&&neighbors(a).some(n=>n.order===3&&n.atom.element==='N')),
    nitro:atoms.some(a=>a.element==='N'&&neighbors(a).filter(n=>n.atom.element==='O').length>=2),
    sulfonyl:atoms.some(a=>a.element==='S'&&neighbors(a).filter(n=>n.atom.element==='O'&&n.order===2).length>=2),
    conjugatedCarbonyl:carbonyls.some(a=>neighbors(a).some(n=>n.atom.element==='C'&&(n.atom.isAromatic||neighbors(n.atom).some(m=>m.atom.index!==a.index&&m.order===2)))),
    aromaticEsterO:carbonyls.some(a=>neighbors(a).some(n=>n.atom.element==='O'&&neighbors(n.atom).some(m=>m.atom.index!==a.index&&m.atom.isAromatic))),
    carbonylCount:carbonyls.length,
  };
}
export function componentAfterCut(graph:ParsedSmilesGraph,start:number,a:number,b:number):Set<number> {
  const seen=new Set<number>(),stack=[start];
  while(stack.length) {const i=stack.pop()!;if(seen.has(i))continue;seen.add(i);for(const n of graph.atoms[i].neighbors)if(!((i===a&&n.toAtom===b)||(i===b&&n.toAtom===a)))stack.push(n.toAtom);}
  return seen;
}
