import type {LocalStructureHypothesis} from '../reasoning/types';
import {ENUMERATION_CONFIG as CFG} from './enumerationConfig';
import type {FragmentAlternativeSet, FragmentAtomSpec, FragmentBondSpec, FragmentSpec} from './types';

/**
 * Converts the evidence-derived LocalStructureHypothesis list (and the symmetric-unit multiple k) into alternative fragment sets
 * for the enumerator. Rules (docs/P1B_DESIGN.md §6):
 *  - every atom becomes a FLEX atom: its remaining valence may be implicit H or a new bond. The adapter never decides an H count;
 *  - bonds and skeleton are kept unchanged; 6-membered rings keep their Kekulé orders (aromatic flag set);
 *  - readings of the evidence: each observation is explained by one local structure that contains it (see `readings`); the fragments of
 *    a reading are the union of the chosen structures; hypotheses explaining the same observation differently are alternatives;
 *  - symmetric unit: every fragment of a set gets count = k (interchangeable copies);
 *  - charged groups (nitro, amine N-oxide) are converted to their fixed charged closed form (see CHARGED_GROUPS);
 *  - anything that cannot be converted makes the whole request fall back to the legacy beam search, with the reason recorded.
 */
export interface AdaptedConversion {
  localId: string; kind: string; rule: string;
  /** The converted fragment (before any fragment is dropped as vacuous). */
  fragment: FragmentSpec;
  /**
   * A single flex atom without bonds only says "this element occurs", which the formula already guarantees (the adapter checks the
   * counts). It adds no constraint and is left out of the fragment sets: this removes search symmetry cost and cannot change the result.
   */
  vacuous: boolean;
}
export interface AdapterResult {
  /** False = the request must use the legacy search; `fallbackReason` says why. */
  ok: boolean;
  fallbackReason: string | null;
  sets: FragmentAlternativeSet[];
  /** Per alternative set: the local structure ids it stands for (copies of the unit carry `#j` suffixes, as in prepareSymmetry). */
  setLocalIds: Record<string, string[]>;
  setObservationIds: Record<string, string[]>;
  conversions: AdaptedConversion[];
  notes: string[];
}

/** Local structure kinds the adapter knows how to convert. ION, FRAGMENT and SURFACE are not produced by inferLocalStructures. */
export const CONVERTIBLE_KINDS = ['AROMATIC', 'ARYL_PARA', 'ARYL_META', 'ARYL_ORTHO', 'ALKENE', 'ALKYNE', 'NITRILE', 'ALKYL', 'OXYGENATED', 'NITROGENATED', 'HYDROXYL', 'AMINO', 'CARBONYL', 'ETHYL'];
const AROMATIC_KINDS = ['AROMATIC', 'ARYL_PARA', 'ARYL_META', 'ARYL_ORTHO'];

/** Charged groups whose chemical form is fixed (the attachment atom stays open; everything else is closed). */
export const CHARGED_GROUPS: {id: string; match: RegExp; atoms: FragmentAtomSpec[]; bonds: FragmentBondSpec[]; basis: string}[] = [
  {
    id: 'NITRO', match: /硝基|nitro/i,
    atoms: [{element: 'N', charge: 1, open: true}, {element: 'O'}, {element: 'O', charge: -1}],
    bonds: [{a: 0, b: 1, order: 2}, {a: 0, b: 2, order: 1}],
    basis: '硝基只有一種中性閉殼層寫法 R–[N+](=O)[O-]；只保留與骨架相接的 N⁺ 位置（open），兩個 O 為 closed',
  },
  {
    id: 'AMINE_N_OXIDE', match: /N-氧化物|N氧化物|N-oxide/i,
    atoms: [{element: 'N', charge: 1, open: true}, {element: 'O', charge: -1}],
    bonds: [{a: 0, b: 1, order: 1}],
    basis: '胺 N-氧化物的固定形式 R3N⁺–O⁻；N⁺ 保留三個 open 價，O⁻ 為 closed',
  },
];

const empty = (reason: string, notes: string[] = []): AdapterResult => ({ok: false, fallbackReason: reason, sets: [], setLocalIds: {}, setObservationIds: {}, conversions: [], notes});

/** Optional explicit hydrogen counts per atom of a local structure (index = atom index; null/undefined = unknown). Not produced anywhere in v1.1.7; the entry for a later 1H-derived source (planned for v1.4.0). */
export type FixedHydrogenInfo = Record<string, (number | null | undefined)[]>;

function convertOne(local: LocalStructureHypothesis, notes: string[], hInfo?: FixedHydrogenInfo): {fragment: FragmentSpec; rule: string} | string {
  const group = CHARGED_GROUPS.find(g => (local.kind === 'NITROGENATED' || local.kind === 'AMINO') && g.match.test(local.description));
  if (group) return {fragment: {id: local.id, atoms: group.atoms.map(a => ({...a})), bonds: group.bonds.map(b => ({...b}))}, rule: `charged-group:${group.id}（${group.basis}）`};
  if (!CONVERTIBLE_KINDS.includes(local.kind)) return `局部結構類型 ${local.kind}（${local.id}）沒有轉換規則`;
  if (!local.atoms.length) return `局部結構 ${local.id} 沒有原子`;
  for (const a of local.atoms) if (CFG.valence[a.element] === undefined) return `局部結構 ${local.id} 含不支援的元素 ${a.element}`;
  for (const b of local.bonds) {
    if (!Number.isInteger(b.a) || !Number.isInteger(b.b) || b.a < 0 || b.b < 0 || b.a >= local.atoms.length || b.b >= local.atoms.length || b.a === b.b) return `局部結構 ${local.id} 有無效的鍵 (${b.a}, ${b.b})`;
    if (!Number.isInteger(b.order) || b.order < 1 || b.order > CFG.maxBondOrder) return `局部結構 ${local.id} 的鍵階 ${b.order} 無法判定`;
  }
  let aromatic = false;
  if (AROMATIC_KINDS.includes(local.kind) || (local.atoms.length >= 6 && local.bonds.length >= 6 && local.atoms.slice(0, 6).every(a => a.element === 'C') && /芳香|酚|aromatic/i.test(local.description))) {
    // Aromatic: the six ring atoms must carry explicit alternating Kekulé orders; otherwise the bond orders / aromaticity are not decidable.
    const ring = local.bonds.filter(b => b.a < 6 && b.b < 6);
    const orders = ring.map(b => b.order);
    const alternating = ring.length === 6 && orders.filter(o => o === 2).length === 3 && orders.filter(o => o === 1).length === 3;
    if (!alternating || local.atoms.length < 6) return `局部結構 ${local.id}（${local.kind}）的芳香環鍵階不是明確的 Kekulé 交替形式，無法判定鍵階或芳香性`;
    aromatic = true;
  }
  let sites: number[] = [];
  if (CFG.adapter.useSubstitutionSitesAsOpen && local.substitutionSites?.length) sites = local.substitutionSites;
  else if (local.substitutionSites?.length) notes.push(`${local.id}：取代位置 ${JSON.stringify(local.substitutionSites)} 未當作約束（所有原子維持 flex）`);
  const known = hInfo?.[local.id];
  const atoms: FragmentAtomSpec[] = local.atoms.map((a, i) => {
    const h = known?.[i];
    if (typeof h === 'number') return {element: a.element, fixedH: h, open: true};   // explicit H count: the atom is open with that H fixed
    return sites.includes(i) ? {element: a.element, open: true} : {element: a.element, flex: true};
  });
  const bonds: FragmentBondSpec[] = local.bonds.map(b => ({a: b.a, b: b.b, order: b.order as 1 | 2 | 3, ...(aromatic && b.a < 6 && b.b < 6 ? {aromatic: true} : {})}));
  return {fragment: {id: local.id, atoms, bonds}, rule: (aromatic ? 'flex-kekule-ring' : 'flex') + (known?.some(h => typeof h === 'number') ? '+fixedH' : '')};
}

/**
 * Readings of the evidence: every observation must be explained by one local structure that contains it; the fragments of a reading
 * are the union of the chosen ones. Hypotheses that explain the same observation differently (aromatic ring vs alkene vs alkyne for
 * the same signal) are therefore alternatives, while hypotheses for different observations are required together. Generated by a
 * depth-first choice for the first still-unexplained observation (minimal-by-construction covers, de-duplicated).
 * Returns null when there are more readings than `maxAlternativeSets`.
 */
function readings(locals: LocalStructureHypothesis[]): LocalStructureHypothesis[][] | null {
  const options = new Map<string, LocalStructureHypothesis[]>();
  for (const l of locals) for (const o of l.observationIds) (options.get(o) ?? options.set(o, []).get(o)!).push(l);
  const observations = [...options.keys()];
  const found = new Map<string, LocalStructureHypothesis[]>();
  let overflow = false;
  const visit = (chosen: LocalStructureHypothesis[], covered: Set<string>): void => {
    if (overflow) return;
    const next = observations.find(o => !covered.has(o));
    if (next === undefined) {
      const ordered = locals.filter(l => chosen.includes(l));
      const key = ordered.map(l => l.id).join('|');
      if (!found.has(key)) { found.set(key, ordered); if (found.size > CFG.adapter.maxAlternativeSets) overflow = true; }
      return;
    }
    for (const l of options.get(next)!) visit([...chosen, l], new Set([...covered, ...l.observationIds]));
  };
  visit([], new Set());
  return overflow ? null : [...found.values()];
}

export function adaptLocalStructures(input: {localStructures: LocalStructureHypothesis[]; symmetryMultiple: number | null; formula?: Record<string, number>; fixedHydrogens?: FixedHydrogenInfo}): AdapterResult {
  const notes: string[] = [];
  const k = input.symmetryMultiple && input.symmetryMultiple >= 2 && input.localStructures.length ? input.symmetryMultiple : 1;
  // A local structure whose atoms alone (× k) already need more atoms of an element than the formula has cannot be part of any
  // molecule with this formula: it is left out of the readings (its observations stay unexplained), and the note says so.
  const locals = input.formula
    ? input.localStructures.filter(l => {
        const need: Record<string, number> = {};
        for (const a of l.atoms) need[a.element] = (need[a.element] ?? 0) + k;
        const lacking = Object.entries(need).find(([e, n]) => n > (input.formula![e] ?? 0));
        if (lacking) notes.push(`${l.id}（${l.kind}）需要 ${lacking[1]} 個 ${lacking[0]}，分子式只有 ${input.formula![lacking[0]] ?? 0} 個：不納入任何讀法`);
        return !lacking;
      })
    : input.localStructures;
  const converted = new Map<string, {fragment: FragmentSpec; rule: string}>();
  const conversions: AdaptedConversion[] = [];
  for (const l of locals) {
    const c = convertOne(l, notes, input.fixedHydrogens);
    if (typeof c === 'string') return empty(c, notes);
    converted.set(l.id, c);
    const f = c.fragment;
    conversions.push({localId: l.id, kind: l.kind, rule: c.rule, fragment: f, vacuous: f.atoms.length === 1 && f.bonds.length === 0 && f.atoms[0].flex === true && !f.atoms[0].charge});
  }
  const sets: FragmentAlternativeSet[] = [];
  const setLocalIds: Record<string, string[]> = {};
  const setObservationIds: Record<string, string[]> = {};
  const all = locals.length ? readings(locals) : [[]];
  if (all === null) return empty(`局部結構的讀法超過上限 ${CFG.adapter.maxAlternativeSets} 組`, notes);
  for (const picked of all) {
    const id = locals.length ? `reading-${sets.length + 1}` : 'FREE';
    sets.push({id, fragments: picked.filter(l => !conversions.find(c => c.localId === l.id)!.vacuous).map(l => ({...converted.get(l.id)!.fragment, count: k}))});
    setLocalIds[id] = picked.flatMap(l => [l.id, ...Array.from({length: k - 1}, (_, j) => `${l.id}#${j + 2}`)]);
    setObservationIds[id] = [...new Set(picked.flatMap(l => [...l.observationIds, ...Array.from({length: k - 1}, (_, j) => l.observationIds.map(o => `${o}#${j + 2}`)).flat()]))];
  }
  if (locals.length) notes.push(`${locals.length} 個局部結構形成 ${sets.length} 種讀法（每個觀測由一個含它的局部結構解釋，片段為所選結構的聯集）`);
  if (k > 1) notes.push(`對稱單元 ×${k}：每個片段 count = ${k}`);
  return {ok: true, fallbackReason: null, sets, setLocalIds, setObservationIds, conversions, notes};
}
