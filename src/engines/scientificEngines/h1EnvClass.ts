import type {ParsedSmilesGraph} from '../chemistryEngine';

/**
 * v1.4.0 stops 10-12: the class of the hydrogen-bearing atom of a 1H environment, from the structure graph only (no shift value is looked at). The fine names are the classes of the stop-10/11/12 reports; coarseClass
 * groups them into the classes of the solvent study (alkyl CH, O-CH, N-CH, aromatic CH, vinyl CH, next to a carbonyl, exchangeable, CHCl3-type).
 */
export function envCategoryOfGraph(g: ParsedSmilesGraph, atomIdx: number): string {
  const a = g.atoms[atomIdx], at = (i: number) => g.atoms[i];
  const nb = a.neighbors.map(n => ({...n, atom: at(n.toAtom)}));
  const dbO = (x: typeof a) => x.neighbors.some(n => n.order === 2 && at(n.toAtom).element === 'O');
  const H = a.totalHydrogens;
  if (a.element === 'O') {
    const c = nb.find(n => n.atom.element === 'C')?.atom;
    if (!c) return 'exch_OH_water';
    if (c.isAromatic) return 'exch_OH_phenol';
    return dbO(c) ? 'exch_OH_acid' : 'exch_OH_alcohol';
  }
  if (a.element === 'N') return 'exch_NH';
  if (a.element === 'S') return 'exch_SH';
  if (a.element !== 'C') return `other_${a.element}`;
  if (a.isAromatic) {
    const hetero = (() => { const seen = new Set<number>(), q = [atomIdx]; while (q.length) { const u = q.shift()!; if (seen.has(u)) continue; seen.add(u); if (at(u).element !== 'C') return true; for (const n of at(u).neighbors) if (at(n.toAtom).isAromatic) q.push(n.toAtom); } return false; })();
    return hetero ? 'aromatic_hetero_CH' : 'aromatic_benzene_CH';
  }
  if (nb.some(n => n.order === 3)) return 'alkyne_CH';
  if (nb.some(n => n.order === 2 && n.atom.element === 'C')) return H === 2 ? 'vinyl_CH2' : 'vinyl_CH';
  if (dbO(a)) return nb.some(n => n.atom.element === 'N') ? 'CHO_formamide' : nb.some(n => n.atom.element === 'O' && n.order === 1) ? 'CHO_formate' : 'CHO_aldehyde';
  const hal = nb.filter(n => ['F', 'Cl', 'Br', 'I'].includes(n.atom.element)), os = nb.filter(n => n.atom.element === 'O'), ns = nb.filter(n => n.atom.element === 'N'), ss = nb.filter(n => n.atom.element === 'S'), si = nb.filter(n => n.atom.element === 'Si');
  const hn = `CH${H === 3 ? '3' : H === 2 ? '2' : ''}`;
  if (si.length) return 'Si_CH3';
  if (hal.length >= 2 || (hal.length === 1 && H === 1)) return hal.length >= 2 ? `polyhalo_${hn}` : 'halo_CH';
  if (hal.length === 1) return `halo_${hn}`;
  if (os.length >= 2) return `acetal_${hn}`;
  if (os.length === 1) {
    const o = os[0].atom, other = o.neighbors.find(n => n.toAtom !== atomIdx);
    const oc = other ? at(other.toAtom) : null;
    if (!oc) return `O_${hn}_alcohol`;
    if (oc.element === 'C' && dbO(oc)) return `O_${hn}_ester`;
    if (oc.isAromatic) return `O_${hn}_arylether`;
    if (oc.element === 'C') return `O_${hn}_ether`;
    return `O_${hn}_other`;
  }
  if (ns.length) {
    const n0 = ns[0].atom;
    if (n0.neighbors.filter(n => at(n.toAtom).element === 'O').length >= 2 || n0.formalCharge > 0) return `N_${hn}_nitro`;
    if (n0.neighbors.some(n => at(n.toAtom).element === 'C' && dbO(at(n.toAtom)))) return `N_${hn}_amide`;
    if (n0.neighbors.some(n => n.order === 2 || n.order === 3)) return `N_${hn}_other`;
    return `N_${hn}_amine`;
  }
  if (ss.length) {
    const s0 = ss[0].atom;
    if (s0.totalHydrogens > 0) return `S_${hn}_thiol`;
    if (s0.neighbors.some(n => at(n.toAtom).element === 'O')) return `S_${hn}_sulfoxide`;
    if (s0.neighbors.some(n => at(n.toAtom).isAromatic)) return `S_${hn}_arylthioether`;
    return `S_${hn}_thioether`;
  }
  // carbon-only neighbours
  if (nb.some(n => dbO(n.atom))) return `alphaCO_${hn}`;
  if (nb.some(n => n.atom.isAromatic)) return `benzylic_${hn}`;
  if (nb.some(n => n.atom.element === 'C' && n.atom.neighbors.some(m => m.order === 3))) return `propargylic_${hn}`;
  if (nb.some(n => n.atom.element === 'C' && n.atom.neighbors.some(m => m.order === 2 && at(m.toAtom).element === 'C'))) return `allylic_${hn}`;
  if (nb.some(n => n.atom.element === 'C' && n.atom.neighbors.some(m => m.order === 3 && at(m.toAtom).element === 'N'))) return `alphaCN_${hn}`;
  const ringSize = smallestRing(g, atomIdx);
  if (ringSize === 3) return 'cyclopropane_CH';
  if (ringSize === 4) return 'cyclobutane_CH';
  return `alkyl_${hn}`;
}
function smallestRing(g: ParsedSmilesGraph, idx: number): number | null {
  let best: number | null = null;
  for (const n of g.atoms[idx].neighbors) {
    const dist = new Map<number, number>([[n.toAtom, 1]]), q = [n.toAtom];
    while (q.length) {
      const u = q.shift()!;
      for (const m of g.atoms[u].neighbors) {
        if (u === n.toAtom && m.toAtom === idx) continue;
        if (m.toAtom === idx) { const len = dist.get(u)! + 1; if (best === null || len < best) best = len; continue; }
        if (!dist.has(m.toAtom)) { dist.set(m.toAtom, dist.get(u)! + 1); q.push(m.toAtom); }
      }
    }
  }
  return best;
}
/** The coarse classes of the solvent study (alkyl CH, O-CH, N-CH, aromatic CH, vinyl CH, next to a carbonyl, exchangeable, CHCl3-type) plus 'other'. */
export function coarseClass(cat: string): string {
  if (cat.startsWith('exch_')) return 'exchangeable';
  if (cat.startsWith('aromatic')) return 'aromatic CH';
  if (cat.startsWith('vinyl')) return 'vinyl CH';
  if (cat.startsWith('O_') || cat.startsWith('acetal_')) return 'O-CH';
  if (cat.startsWith('N_')) return 'N-CH';
  if (cat.startsWith('polyhalo') || cat === 'halo_CH') return 'CHCl3-type';
  if (cat.startsWith('alphaCO') || cat.startsWith('CHO')) return 'next to carbonyl';
  if (cat.startsWith('alkyl_') || cat.startsWith('cyclo')) return 'alkyl CH';
  return 'other';
}
