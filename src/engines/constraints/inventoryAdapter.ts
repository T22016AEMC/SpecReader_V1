import type {FragmentAlternativeSet, FragmentAtomSpec, FragmentBondSpec, FragmentSpec, RequiredSubstructureSpec} from '../enumeration/types';
import type {InventoryAlternative, RingInstancePlan} from './atomInventory';
import {V12_CONFIG, type RingTemplateDef} from './v12Config';
import {v140CoverageActive} from '../composition/planningGate';

export interface InventorySetInfo {
  alternativeId: string;
  k: number;
  extraExchangeable: number;
  /** Which substitution patterns of the rings this set stands for, e.g. "benzene[1,4]". */
  patternLabel: string;
  /** The alternative holds a constrained vinyl reading. */
  hasVinyl: boolean;
}
export interface AdaptedInventory {
  sets: FragmentAlternativeSet[];
  info: Record<string, InventorySetInfo>;
  /** More pattern combinations than `maxPatternSetsPerAlternative`: only the first ones are in `sets`. */
  truncated: boolean;
}

const templateOf = (id: string): RingTemplateDef => {
  const t = V12_CONFIG.ringTemplates.find(x => x.id === id);
  if (!t) throw new Error(`unknown ring template ${id}`);
  return t;
};

/** Label of the pool of all aromatic CH atoms (their hydrogens belong to several signals, see FragmentAlternativeSet.equivalencePools). */
export const AROMATIC_CH_POOL = 'aromaticCH';

/**
 * One ring fragment: CH positions closed with one H, substituted positions open with H = 0, fusion atoms and ring N closed. Every ring
 * atom carries the aromatic flag (checked on the sanitized molecule); CH atoms are labelled with the pool when equivalence is demanded.
 */
function ringFragment(id: string, t: RingTemplateDef, substituents: number[], count: number, pooled: boolean): FragmentSpec {
  const sub = new Set(substituents);
  const peripheral = new Set(t.peripheral);
  const atoms: FragmentAtomSpec[] = t.elements.map((element, i) => {
    if (!peripheral.has(i)) return {element, aromatic: true};
    return sub.has(i) ? {element, open: true, aromatic: true} : {element, fixedH: 1, aromatic: true, ...(pooled ? {group: AROMATIC_CH_POOL} : {})};
  });
  const bonds: FragmentBondSpec[] = t.bonds.map(([a, b, order]) => ({a, b, order, aromatic: true}));
  return {id, atoms, bonds, count};
}

/** Multisets of `m` items out of `n` (indices, non-decreasing). */
function multisets(n: number, m: number): number[][] {
  const out: number[][] = [];
  const cur: number[] = [];
  const rec = (from: number) => {
    if (cur.length === m) { out.push(cur.slice()); return; }
    for (let i = from; i < n; i++) { cur.push(i); rec(i); cur.pop(); }
  };
  rec(0);
  return out;
}

/**
 * InventoryAlternative → fragment sets for the enumerator: one single-atom open fragment (fixed H) per kind of atom, the remaining formula
 * atoms as H = 0 open atoms, and the aromatic CH as ring templates. Every substitution pattern of the rings is its own set (docs/P1C_DESIGN.md D4).
 */
export function inventoryToFragmentSets(alt: InventoryAlternative, options: {required?: RequiredSubstructureSpec[]; nitroVariant?: boolean} = {}): AdaptedInventory {
  // v1.4.0 stop 10 (v140.coverage): the atoms of the inventory are free and neutral, so a nitro group (R-[N+](=O)[O-], charged) could never be built from them; nitromethane (CH3NO2, 4.33 s) therefore had no candidate at all.
  // When a signal is read as a nitroalkane C-H (class NITRO_CH) and the unassigned atoms hold one N and two O, the alternative is ALSO offered with a fixed nitro fragment (the same charged form as CHARGED_GROUPS 'NITRO' of the adapter).
  if (options.nitroVariant === undefined && v140CoverageActive() && alt.groups.some(g => g.shiftClasses.includes('NITRO_CH')) && (alt.zeroHAtoms.N ?? 0) >= 1 && (alt.zeroHAtoms.O ?? 0) >= 2) {
    const plain = inventoryToFragmentSets(alt, {...options, nitroVariant: false});
    const zero: Record<string, number> = {...alt.zeroHAtoms, N: alt.zeroHAtoms.N - 1, O: alt.zeroHAtoms.O - 2};
    for (const el of Object.keys(zero)) if (zero[el] <= 0) delete zero[el];
    const withNitro = inventoryToFragmentSets({...alt, zeroHAtoms: zero}, {...options, nitroVariant: true});
    const nitro: FragmentSpec = {id: 'nitro', atoms: [{element: 'N', charge: 1, open: true}, {element: 'O'}, {element: 'O', charge: -1}], bonds: [{a: 0, b: 1, order: 2}, {a: 0, b: 2, order: 1}], count: 1};
    const sets2 = withNitro.sets.map(s => ({...s, baseId: s.id, id: `${s.id}/nitro`, fragments: [...s.fragments, nitro]}));
    const info2: Record<string, InventorySetInfo> = {};
    for (const s of sets2) info2[s.id] = {...withNitro.info[s.baseId], patternLabel: [withNitro.info[s.baseId]?.patternLabel, 'nitro'].filter(Boolean).join(' + ')};
    for (const s of sets2) delete (s as {baseId?: string}).baseId;
    return {sets: [...plain.sets, ...sets2], info: {...plain.info, ...info2}, truncated: plain.truncated || withNitro.truncated};
  }
  const frags: FragmentSpec[] = [];
  // Atoms of identical kind (element, H, flags) are interchangeable whatever signal they belong to, so they share one fragment (count = n).
  // A group that must be topologically equivalent keeps its own fragment and label.
  const atomKinds = new Map<string, {element: string; h: number; count: number; group?: string; noHC: boolean; alkene: boolean}>();
  const equivalentGroups: string[] = [];
  const addKind = (element: string, h: number, count: number, noHC = false, group?: string, alkene = false) => {
    const key = `${element}|${h}${noHC ? '|noHC' : ''}${alkene ? '|alkene' : ''}${group ? `|${group}` : ''}`;
    const kind = atomKinds.get(key);
    if (kind) kind.count += count; else atomKinds.set(key, {element, h, count, noHC, alkene, ...(group ? {group} : {})});
  };
  const demands: number[] = [];
  for (const g of alt.groups) {
    if (g.aromatic) { if (g.equivalent && g.atomCount >= 2) demands.push(g.atomCount); continue; }
    const group = g.equivalent && g.atomCount >= 2 ? g.groupId : undefined;
    if (group) equivalentGroups.push(group);
    addKind(g.element, g.hPerAtom, g.atomCount, g.singletNoHNeighbors, group, g.alkene);
  }
  if (alt.extraExchangeable > 0 && alt.extraElement) addKind(alt.extraElement, 1, alt.extraExchangeable);
  for (const [el, n] of Object.entries(alt.zeroHAtoms)) addKind(el, 0, n);
  for (const [key, kind] of atomKinds) {
    const atom: FragmentAtomSpec = {element: kind.element, fixedH: kind.h, open: true, ...(kind.group ? {group: kind.group} : {}), ...(kind.noHC ? {noHCarbonNeighbors: true} : {}), ...(kind.alkene ? {alkeneCH: true} : {})};
    frags.push({id: `atoms:${key}`, count: kind.count, atoms: [atom], bonds: []});
  }
  const pooled = demands.length > 0;
  // Rings: instances of the same (template, ch) are interchangeable, so their patterns are chosen as a multiset.
  const classes = new Map<string, RingInstancePlan[]>();
  for (const r of alt.rings.rings) {
    const key = `${r.templateId}/${r.ch}`;
    classes.set(key, [...(classes.get(key) ?? []), r]);
  }
  const classList = [...classes.values()];
  const perClass = classList.map(instances => multisets(instances[0].substituentPositionPatterns.length, instances.length));
  const sets: FragmentAlternativeSet[] = [];
  const info: Record<string, InventorySetInfo> = {};
  let truncated = false;
  const idx = classList.map(() => 0);
  const total = perClass.reduce((p, l) => p * l.length, 1);
  for (let n = 0; n < total; n++) {
    if (sets.length >= V12_CONFIG.maxPatternSetsPerAlternative) { truncated = true; break; }
    const ringFrags: FragmentSpec[] = [];
    const labels: string[] = [];
    classList.forEach((instances, c) => {
      const t = templateOf(instances[0].templateId);
      const chosen = perClass[c][idx[c]];
      // Equal patterns of one class become one fragment with count > 1.
      const byPattern = new Map<number, number>();
      for (const p of chosen) byPattern.set(p, (byPattern.get(p) ?? 0) + 1);
      for (const [p, count] of byPattern) {
        const pattern = instances[0].substituentPositionPatterns[p];
        ringFrags.push(ringFragment(`ring${ringFrags.length + 1}:${t.id}[${pattern.join(',')}]`, t, pattern, count, pooled));
        labels.push(`${count > 1 ? `${count}×` : ''}${t.id}[${pattern.join(',')}]`);
      }
    });
    const id = alt.rings.rings.length ? `${alt.id}/p${sets.length + 1}` : alt.id;
    sets.push({id, fragments: [...frags, ...ringFrags], ...(equivalentGroups.length ? {equivalentGroups: [...equivalentGroups]} : {}), ...(pooled ? {equivalencePools: [{group: AROMATIC_CH_POOL, demands: [...demands]}]} : {}), ...(options.required?.length ? {required: options.required.map(r => ({...r}))} : {})});
    info[id] = {alternativeId: alt.id, k: alt.k, extraExchangeable: alt.extraExchangeable, patternLabel: labels.join(' + '), hasVinyl: alt.hasVinyl};
    // odometer over the classes
    for (let c = classList.length - 1; c >= 0; c--) { if (++idx[c] < perClass[c].length) break; idx[c] = 0; }
  }
  return {sets, info, truncated};
}
