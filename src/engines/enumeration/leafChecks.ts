import {canonicalizeMolecule, openLeafMol, type LeafQueries} from '../scientificEngines/rdkitAdapter';
import {canPackDemands, orbitPartition, sameOrbit, type AutGraph} from './automorphism';
import {buildMolBlock} from './molBlock';
import type {Problem} from './problem';
import type {NewBond} from './search';
import type {LeafCost} from './types';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const AROMATIC_BOND_LABEL = 10;

export type LeafStage = 'aromatic' | 'required' | 'equivalence' | 'alkene';
export type LeafVerdict =
  | {kind: 'invalid'}
  /** The molecule is already a candidate. */
  | {kind: 'known'; smiles: string}
  /** The molecule was rejected earlier by a check that does not depend on how the atoms are labelled (it can be skipped). */
  | {kind: 'seenRejected'; smiles: string}
  | {kind: 'rejected'; smiles: string; stage: LeafStage; /** true: the verdict is a property of the molecule alone */ remember: boolean; /** stage 'required': the substructure that is missing */ requiredId?: string}
  | {kind: 'ok'; smiles: string};

export const emptyLeafCost = (): LeafCost => ({leaves: 0, parseMs: 0, checksMs: 0, orbitChecks: 0, orbitMs: 0, requiredMatches: 0});

/**
 * The v1.2 leaf pipeline for one assembled molecule, cheapest first: one RDKit parse (sanitize; canonical SMILES) → already known? →
 * required substructures → aromatic atoms → equivalence (exact orbits). The aromatic and equivalence verdicts depend on how the output
 * molecule is labelled by the search, so a molecule is only reported as rejected once ("remember: false"): another labelling of the same
 * molecule may still pass, and a molecule is a candidate as soon as one labelling passes.
 */
export function analyseLeaf(P: Problem, newBonds: NewBond[], queries: LeafQueries, lookup: (smiles: string) => 'known' | 'seenRejected' | 'new', cost: LeafCost): LeafVerdict {
  cost.leaves++;
  const t0 = now();
  const mol = openLeafMol(buildMolBlock(P, newBonds), queries);
  try {
    if (!mol.valid) { cost.parseMs += now() - t0; return {kind: 'invalid'}; }
    // Zero coordinates prevent stereo perception; strip any marker that still appears (same safety net as the v1.1.8 leaf).
    const smiles = /[\\/@]/.test(mol.smiles) ? canonicalizeMolecule(mol.smiles.replace(/[\\/]/g, '').replace(/@+/g, '')).canonical : mol.smiles;
    const t1 = now();
    cost.parseMs += t1 - t0;
    const seen = lookup(smiles);
    if (seen === 'known') return {kind: 'known', smiles};
    if (seen === 'seenRejected') return {kind: 'seenRejected', smiles};
    for (let i = 0; i < P.required.length; i++) {
      cost.requiredMatches++;
      if (mol.matchCount(i, P.required[i].minMatches) < P.required[i].minMatches) { cost.checksMs += now() - t1; return {kind: 'rejected', smiles, stage: 'required', remember: true, requiredId: P.required[i].id}; }
    }
    const needOrbits = P.eqGroups.length > 0 || P.pools.length > 0;
    const hasAlkene = P.alkene.some(Boolean);
    let aromaticAtoms: Uint8Array | null = null;
    if (P.aromaticFlag.some(Boolean) || needOrbits) aromaticAtoms = mol.aromaticAtoms(P.n);
    if (aromaticAtoms) for (let i = 0; i < P.n; i++) if (P.aromaticFlag[i] && !aromaticAtoms[i]) { cost.checksMs += now() - t1; return {kind: 'rejected', smiles, stage: 'aromatic', remember: false}; }
    const aromaticBonds = needOrbits || hasAlkene ? mol.aromaticBonds() : [];
    if (hasAlkene && !alkeneHolds(P, newBonds, aromaticBonds)) { cost.checksMs += now() - t1; return {kind: 'rejected', smiles, stage: 'alkene', remember: false}; }
    if (needOrbits) {
      const t2 = now();
      cost.orbitChecks++;
      const ok = equivalenceHolds(P, newBonds, aromaticAtoms!, aromaticBonds, cost);
      cost.orbitMs += now() - t2;
      if (!ok) { cost.checksMs += now() - t1; return {kind: 'rejected', smiles, stage: 'equivalence', remember: false}; }
    }
    cost.checksMs += now() - t1;
    return {kind: 'ok', smiles};
  } finally { mol.close(); }
}

/** Every vinyl CH atom's double bond (to its carbon partner, guaranteed by the search) must not be an aromatic bond of the sanitized molecule. */
function alkeneHolds(P: Problem, newBonds: NewBond[], aromaticBonds: [number, number][]): boolean {
  const n = P.n;
  const arom = new Set<number>();
  for (const [a, b] of aromaticBonds) arom.add(Math.min(a, b) * n + Math.max(a, b));
  for (const b of [...P.fixedBonds, ...newBonds]) {
    if (b.order !== 2) continue;
    if ((P.alkene[b.a] || P.alkene[b.b]) && arom.has(Math.min(b.a, b.b) * n + Math.max(b.a, b.b))) return false;
  }
  return true;
}

/** Equivalence groups lie in one orbit, and the demands of every pool can be packed into the pool's orbits. */
function equivalenceHolds(P: Problem, newBonds: NewBond[], aromaticAtoms: Uint8Array, aromaticBonds: [number, number][], cost: LeafCost): boolean {
  const n = P.n;
  const degNew = new Array<number>(n).fill(0);
  for (const b of newBonds) { degNew[b.a] += b.order; degNew[b.b] += b.order; }
  const labels = new Map<string, number>();
  const vertexLabel = P.el.map((e, i) => {
    const h = P.fixedH[i] + (P.slack[i] ? P.cap[i] - degNew[i] : 0);
    const key = `${e}|${P.charge[i]}|${h}|${aromaticAtoms[i]}`;
    if (!labels.has(key)) labels.set(key, labels.size);
    return labels.get(key)!;
  });
  const arom = new Set<number>();
  for (const [a, b] of aromaticBonds) arom.add(Math.min(a, b) * n + Math.max(a, b));
  const edges: AutGraph['edges'] = [];
  for (const b of [...P.fixedBonds, ...newBonds]) edges.push({a: b.a, b: b.b, label: arom.has(Math.min(b.a, b.b) * n + Math.max(b.a, b.b)) ? AROMATIC_BOND_LABEL : b.order});
  const interest = [...new Set([...P.eqGroups.flatMap(g => g.atoms), ...P.pools.flatMap(p => p.atoms)])];
  const orbit = orbitPartition({n, vertexLabel, edges}, interest);
  // Search limit reached: nothing is excluded (the output can only be a superset, never miss a molecule).
  if (!orbit) { cost.orbitGiveUps = (cost.orbitGiveUps ?? 0) + 1; return true; }
  for (const g of P.eqGroups) if (!sameOrbit(orbit, g.atoms)) return false;
  for (const pool of P.pools) {
    const sizes = new Map<number, number>();
    for (const a of pool.atoms) sizes.set(orbit[a], (sizes.get(orbit[a]) ?? 0) + 1);
    if (!canPackDemands(pool.demands, [...sizes.values()])) return false;
  }
  return true;
}
