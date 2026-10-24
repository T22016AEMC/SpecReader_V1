import {StructureParserAdapter} from '../chemistryEngine';
import {plausibilityViolations, type PlausibilityEvidence} from '../scientificEngines/structurePlausibility';
import {ENUMERATION_CONFIG as CFG} from './enumerationConfig';
import type {EnumerationDiagnostics} from './types';

/**
 * Topological equivalence classes of a molecule by colour refinement (1-dimensional Weisfeiler–Leman) on the heavy-atom graph.
 * Atom colour starts from (element, charge, hydrogens, aromatic flag); each round appends the sorted (bond order, neighbour colour)
 * multiset. Atoms that are equivalent under a graph symmetry always end in the same class, so the class count is a lower bound of
 * the number of symmetry-distinct environments and never larger than it. (RDKit's tie-free canonical atom ranking is not exposed
 * by the RDKit.js build used here; no dependency was added.)
 *  - hClasses: classes among atoms that carry at least one hydrogen  (topological 1H environments, not stereo-resolved);
 *  - cClasses: classes among carbon atoms (topological 13C environments).
 */
export function topologyClasses(smiles: string): {hClasses: number; cClasses: number} | null {
  const parsed = StructureParserAdapter.parseSmilesGraph(smiles);
  if (!parsed.valid || !parsed.graph) return null;
  const atoms = parsed.graph.atoms as {element: string; isAromatic: boolean; totalHydrogens: number; formalCharge: number; neighbors: {toAtom: number; order: number; isAromatic: boolean}[]}[];
  let colour = atoms.map(a => `${a.element}|${a.formalCharge}|${a.totalHydrogens}|${a.isAromatic ? 1 : 0}`);
  let classes = new Set(colour).size;
  for (let round = 0; round < atoms.length; round++) {
    const next = atoms.map((a, i) => `${colour[i]}(${a.neighbors.map(n => `${n.isAromatic ? 'a' : n.order}:${colour[n.toAtom]}`).sort().join(',')})`);
    // Re-index so strings do not grow without bound.
    const index = new Map<string, number>();
    [...new Set(next)].sort().forEach((c, k) => index.set(c, k));
    const compact = next.map(c => `#${index.get(c)}`);
    const count = new Set(compact).size;
    colour = compact;
    if (count === classes) break;
    classes = count;
  }
  const h = new Set<string>(), c = new Set<string>();
  atoms.forEach((a, i) => { if (a.totalHydrogens > 0) h.add(colour[i]); if (a.element === 'C') c.add(colour[i]); });
  return {hClasses: h.size, cClasses: c.size};
}

/**
 * Cheap pre-ranking when more candidates were enumerated than may be scored. Candidates whose topological 1H environments are fewer
 * than the observed 1H signals (or whose carbon classes are fewer than the observed 13C signals) cannot reproduce the observed
 * signal count; candidates with a linkage the plausibility gate rejects (when evidence is given) are also ranked after the others;
 * nothing is deleted. Inside the passing part, candidates whose number of environments is closest to the number of observed signals come
 * first (more environments than observed signals means unobserved or overlapped signals); ties keep the incoming order.
 */
export function capScored(smiles: string[], observed: {h1: number | null | undefined; c13: number | null | undefined}, maxScored: number, plausibility?: PlausibilityEvidence): {scored: string[]; deferred: string[]; prefilter: NonNullable<EnumerationDiagnostics['deferred']['prefilter']> | null} {
  if (smiles.length <= maxScored) return {scored: smiles, deferred: [], prefilter: null};
  const h1 = observed.h1 && observed.h1 > 0 ? observed.h1 : null, c13 = observed.c13 && observed.c13 > 0 ? observed.c13 : null;
  const passing: {s: string; gap: number; i: number}[] = [], failing: string[] = [];
  smiles.forEach((s, i) => {
    const t = h1 === null && c13 === null ? null : topologyClasses(s);
    const countsOk = !t || ((h1 === null || t.hClasses >= h1) && (c13 === null || t.cClasses >= c13));
    // Linkages the plausibility gate would reject anyway are ranked last (they stay in the list; the gate records them if scored).
    const ok = countsOk && (!plausibility || plausibilityViolations(s, plausibility).length === 0);
    if (ok) passing.push({s, gap: t ? (h1 === null ? 0 : t.hClasses - h1) + (c13 === null ? 0 : t.cClasses - c13) : 0, i}); else failing.push(s);
  });
  passing.sort((a, b) => a.gap - b.gap || a.i - b.i);
  const ordered = [...passing.map(x => x.s), ...failing];
  return {scored: ordered.slice(0, maxScored), deferred: ordered.slice(maxScored), prefilter: {h1Required: h1, c13Required: c13, passing: passing.length, failing: failing.length}};
}

/** Samples of the deferred list kept in the diagnostics. */
export const deferredSamples = (deferred: string[]): string[] => deferred.slice(0, CFG.adapter.maxDeferredListed);
