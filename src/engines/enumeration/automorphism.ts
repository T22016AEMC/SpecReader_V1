/**
 * Exact automorphism orbits of a small labelled graph (the heavy-atom graph of one assembled molecule).
 *
 * An orbit is a set of vertices that some automorphism maps onto each other. The test for a pair (u, v) is a backtracking search for an
 * automorphism with u → v: both copies of the graph are refined together (colour refinement is only used to prune the search), and when
 * the refinement does not decide the mapping a vertex is individualised and every candidate image is tried. A mapping is accepted only
 * after every edge has been checked, so the result never depends on the refinement being "complete": it is exact in both directions
 * (no true automorphism is missed, no false one is accepted).
 */
export interface AutGraph {
  n: number;
  /** Vertex labels: vertices of one orbit have equal labels (element, charge, hydrogens, aromatic flag, …). */
  vertexLabel: number[];
  /** Undirected labelled edges: label = bond order, or a distinct code for aromatic bonds. */
  edges: {a: number; b: number; label: number}[];
}

interface Prepared {n: number; vertexLabel: number[]; adj: {to: number; label: number}[][]; edgeLabel: Map<number, number>}

function prepare(g: AutGraph): Prepared {
  const adj: Prepared['adj'] = Array.from({length: g.n}, () => []);
  const edgeLabel = new Map<number, number>();
  for (const e of g.edges) {
    adj[e.a].push({to: e.b, label: e.label}); adj[e.b].push({to: e.a, label: e.label});
    edgeLabel.set(e.a * g.n + e.b, e.label); edgeLabel.set(e.b * g.n + e.a, e.label);
  }
  return {n: g.n, vertexLabel: g.vertexLabel, adj, edgeLabel};
}

/** Refines two colourings of the same graph with a shared signature dictionary; false = the colour histograms differ (no automorphism). */
function refineTogether(G: Prepared, ca: number[], cb: number[]): boolean {
  const n = G.n;
  let classes = -1;
  for (;;) {
    const dict = new Map<string, number>();
    const sa: string[] = new Array(n), sb: string[] = new Array(n);
    const sig = (c: number[], v: number): string => {
      const parts = G.adj[v].map(e => `${e.label}:${c[e.to]}`).sort();
      return `${c[v]}|${parts.join(',')}`;
    };
    for (let v = 0; v < n; v++) { sa[v] = sig(ca, v); sb[v] = sig(cb, v); }
    const keys = [...new Set([...sa, ...sb])].sort();
    keys.forEach((k, i) => dict.set(k, i));
    const na = sa.map(k => dict.get(k)!), nb = sb.map(k => dict.get(k)!);
    const ha = [...na].sort((x, y) => x - y).join(','), hb = [...nb].sort((x, y) => x - y).join(',');
    if (ha !== hb) return false;
    for (let v = 0; v < n; v++) { ca[v] = na[v]; cb[v] = nb[v]; }
    const count = keys.length;
    if (count === classes) return true;
    classes = count;
  }
}

class SearchLimit extends Error {}
/** Shared search-node counter of one orbitPartition call (a safety limit; molecular graphs stay far below it). */
interface Budget {left: number}

/** An automorphism φ with φ(u) = v, or null. Colourings are modified in place (callers pass copies). Throws SearchLimit when the budget is spent. */
function findMapping(G: Prepared, ca: number[], cb: number[], budget: Budget): number[] | null {
  if (--budget.left < 0) throw new SearchLimit();
  if (!refineTogether(G, ca, cb)) return null;
  const n = G.n;
  const sizes = new Map<number, number>();
  for (let v = 0; v < n; v++) sizes.set(ca[v], (sizes.get(ca[v]) ?? 0) + 1);
  let target = -1, best = Infinity;
  for (const [c, s] of sizes) if (s > 1 && (s < best || (s === best && c < target))) { best = s; target = c; }
  if (target < 0) {
    // Discrete: the colour classes are singletons, so the mapping is forced. Verify it exactly.
    const imageOf = new Map<number, number>();
    for (let v = 0; v < n; v++) imageOf.set(cb[v], v);
    const phi = new Array<number>(n);
    for (let v = 0; v < n; v++) phi[v] = imageOf.get(ca[v])!;
    for (let v = 0; v < n; v++) {
      if (G.vertexLabel[phi[v]] !== G.vertexLabel[v]) return null;
      for (const e of G.adj[v]) if (G.edgeLabel.get(phi[v] * n + phi[e.to]) !== e.label) return null;
    }
    return phi;
  }
  const x = ca.findIndex(c => c === target);
  const fresh = Math.max(...ca, ...cb) + 1;
  for (let y = 0; y < n; y++) {
    if (cb[y] !== target) continue;
    const a2 = ca.slice(), b2 = cb.slice();
    a2[x] = fresh; b2[y] = fresh;
    const phi = findMapping(G, a2, b2, budget);
    if (phi) return phi;
  }
  return null;
}

export const DEFAULT_ORBIT_NODE_LIMIT = 200_000;
/**
 * orbitId[v] = smallest vertex index in the orbit of v. Exact; only when the search needs more than `nodeLimit` nodes (never seen on a
 * molecular graph, but a worst-case guard for the worker thread) it gives up and returns null — callers then must not exclude anything.
 */
export function orbitPartition(g: AutGraph, interest?: number[], nodeLimit = DEFAULT_ORBIT_NODE_LIMIT): number[] | null {
  try { return orbitPartitionExact(g, interest, {left: nodeLimit}); } catch (e) { if (e instanceof SearchLimit) return null; throw e; }
}
function orbitPartitionExact(g: AutGraph, interest: number[] | undefined, budget: Budget): number[] {
  const G = prepare(g);
  const n = g.n;
  const uf = Array.from({length: n}, (_, i) => i);
  const find = (x: number): number => { while (uf[x] !== x) { uf[x] = uf[uf[x]]; x = uf[x]; } return x; };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) { if (ra < rb) uf[rb] = ra; else uf[ra] = rb; } };
  // Stable colouring of the plain graph: vertices of different colour are in different orbits.
  const base = G.vertexLabel.slice();
  refineTogether(G, base, base.slice());
  const wanted = interest ?? Array.from({length: n}, (_, i) => i);
  for (const u of wanted) {
    for (let v = 0; v < n; v++) {
      if (v === u || base[v] !== base[u] || find(u) === find(v)) continue;
      const ca = base.slice(), cb = base.slice();
      const fresh = Math.max(...base) + 1;
      ca[u] = fresh; cb[v] = fresh;
      const phi = findMapping(G, ca, cb, budget);
      if (phi) for (let i = 0; i < n; i++) union(i, phi[i]);
    }
  }
  return Array.from({length: n}, (_, i) => find(i));
}

/** True when all listed vertices lie in one orbit. */
export function sameOrbit(orbit: number[], vertices: number[]): boolean {
  return vertices.every(v => orbit[v] === orbit[vertices[0]]);
}

/**
 * Can every demand (a signal with that many atoms) be placed entirely inside one orbit of the pool, using each pool atom at most once?
 * `poolOrbitSizes` = number of pool atoms in each orbit. Exact (backtracking over the few demands).
 */
export function canPackDemands(demands: number[], poolOrbitSizes: number[]): boolean {
  const sorted = [...demands].sort((a, b) => b - a);
  const room = poolOrbitSizes.slice();
  const place = (i: number): boolean => {
    if (i === sorted.length) return true;
    const seen = new Set<number>();
    for (let o = 0; o < room.length; o++) {
      if (room[o] < sorted[i] || seen.has(room[o])) continue;
      seen.add(room[o]);   // orbits with equal room are interchangeable at this point
      room[o] -= sorted[i];
      if (place(i + 1)) { room[o] += sorted[i]; return true; }
      room[o] += sorted[i];
    }
    return false;
  };
  return place(0);
}
