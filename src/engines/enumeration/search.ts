import {ENUMERATION_CONFIG as CFG} from './enumerationConfig';
import type {Problem} from './problem';

/**
 * Backtracking search over the symmetric matrix of NEW bond orders (0…maxBondOrder) between atoms, in row-major order of
 * the upper triangle. A complete assignment is a leaf; every leaf is a molecule that satisfies the formula, the fragments and
 * connectivity. Pruning only removes branches that provably cannot lead to a leaf, or leaves that are the image of another
 * leaf under a symmetry of the problem (see docs/P1B_DESIGN.md, "Completeness").
 */
export interface EarlyRules {
  /** No new O–O bond (plausibility rule PEROXIDE without a user formula). */
  noPeroxide: boolean;
  /** No new N–O bond (plausibility rules N_O_N / N_DI_OH / N_O_LINK without N–O evidence). */
  noNitrogenOxygen: boolean;
}
export interface NewBond {a: number; b: number; order: number}
export type RunResult = 'DONE' | 'PAUSED' | 'STOPPED';

export class Searcher {
  visited = 0;
  leaves = 0;
  /** Set when the fragments themselves already break an early rule: the problem has no solution (complete, empty). */
  readonly rootRejection: string | null;
  private readonly n: number;
  private readonly P: Problem;
  private readonly pi: number[] = [];
  private readonly pj: number[] = [];
  private readonly rowsAt: number[][];
  private readonly rootRows: number[] = [];
  private readonly d: number[];
  private readonly M: Uint8Array;
  private U = 0;
  private remTotal: number;
  private remForced: number;
  private readonly bi: number[] = [];
  private readonly bj: number[] = [];
  private readonly bv: number[] = [];
  private bTop = 0;
  private readonly applied: number[];
  private readonly nextVal: number[];
  private p = 0;
  private started = false;
  private done = false;
  private stopRequested = false;
  private readonly uf: number[];
  /** Union-find with rollback over fixed + chosen bonds: the number of components bounds the units still needed. */
  private readonly dsuParent: number[];
  private readonly dsuSize: number[];
  private readonly dsuStack: number[] = [];
  private comps: number;
  private readonly elIndex: number[];
  private readonly hasNoHC: boolean;
  private readonly hasAlkene: boolean;
  /** Double bonds per atom: from the fixed fragment bonds, and from the new bonds chosen so far. */
  private readonly fixedDbl: number[];
  private readonly dbl: number[];
  constructor(problem: Problem, rules: EarlyRules, private readonly onLeaf: (bonds: NewBond[]) => void) {
    const P = (this.P = problem);
    const n = (this.n = P.n);
    this.d = new Array(n).fill(0);
    this.M = new Uint8Array(n * n);
    this.uf = new Array(n).fill(0);
    this.dsuParent = Array.from({length: n}, (_, i) => i);
    this.dsuSize = new Array(n).fill(1);
    this.comps = n;
    const elNames = [...new Set(P.el)];
    this.elIndex = P.el.map(e => elNames.indexOf(e));
    this.hasNoHC = P.noHC.some(Boolean);
    this.hasAlkene = P.alkene.some(Boolean);
    this.fixedDbl = new Array(n).fill(0);
    this.dbl = new Array(n).fill(0);
    for (const b of P.fixedBonds) if (b.order === 2) { this.fixedDbl[b.a]++; this.fixedDbl[b.b]++; }
    for (const b of P.fixedBonds) this.dsuUnion(b.a, b.b, false);
    // Early rules on the fixed fragment bonds.
    let rejection: string | null = null;
    for (const b of P.fixedBonds) {
      if (rules.noPeroxide && P.el[b.a] === 'O' && P.el[b.b] === 'O') rejection = '片段含 O–O 鍵';
      if (rules.noNitrogenOxygen && ((P.el[b.a] === 'N' && P.el[b.b] === 'O') || (P.el[b.a] === 'O' && P.el[b.b] === 'N'))) rejection = '片段含 N–O 鍵';
    }
    this.rootRejection = rejection;
    // Pair list: only pairs that can carry a new bond.
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (P.cap[i] === 0 || P.cap[j] === 0 || P.fixedOrder[i][j] > 0) continue;
      if (rules.noPeroxide && P.el[i] === 'O' && P.el[j] === 'O') continue;
      if (rules.noNitrogenOxygen && ((P.el[i] === 'N' && P.el[j] === 'O') || (P.el[i] === 'O' && P.el[j] === 'N'))) continue;
      // v1.2 singlet rule: a no-H-carbon-neighbour atom is never bound to a carbon that carries a fixed hydrogen.
      if ((P.noHC[i] && P.el[j] === 'C' && P.fixedH[j] > 0) || (P.noHC[j] && P.el[i] === 'C' && P.fixedH[i] > 0)) continue;
      this.pi.push(i); this.pj.push(j);
    }
    const PN = this.pi.length;
    this.applied = new Array(PN + 1).fill(-1);
    this.nextVal = new Array(PN + 1).fill(0);
    // Row r is final once every pair with first index ≤ r is decided.
    this.rowsAt = Array.from({length: PN + 1}, () => []);
    let lastPos = -1, q = 0;
    for (let r = 0; r < n; r++) {
      while (q < PN && this.pi[q] <= r) { lastPos = q; q++; }
      if (lastPos < 0) this.rootRows.push(r); else this.rowsAt[lastPos].push(r);
    }
    this.remTotal = P.cap.reduce((s, c) => s + c, 0);
    this.remForced = P.cap.reduce((s, c, i) => s + (P.forced[i] ? c : 0), 0);
  }

  requestStop(): void { this.stopRequested = true; }

  private dsuFind(x: number): number { while (this.dsuParent[x] !== x) x = this.dsuParent[x]; return x; }
  /** Returns true when two components were merged (and, if `record`, pushes the change for rollback). */
  private dsuUnion(a: number, b: number, record: boolean): boolean {
    let ra = this.dsuFind(a), rb = this.dsuFind(b);
    if (ra === rb) { if (record) this.dsuStack.push(-1); return false; }
    if (this.dsuSize[ra] < this.dsuSize[rb]) { const t = ra; ra = rb; rb = t; }
    this.dsuParent[rb] = ra; this.dsuSize[ra] += this.dsuSize[rb]; this.comps--;
    if (record) this.dsuStack.push(rb);
    return true;
  }
  private dsuRollback(): void {
    const rb = this.dsuStack.pop()!;
    if (rb < 0) return;
    const ra = this.dsuParent[rb];
    this.dsuSize[ra] -= this.dsuSize[rb]; this.dsuParent[rb] = rb; this.comps++;
  }

  /** Runs at most `maxSteps` bond-order attempts. 'DONE' = the whole space is explored. */
  run(maxSteps: number): RunResult {
    const P = this.P, PN = this.pi.length, d = this.d, cap = P.cap;
    if (!this.started) {
      this.started = true;
      const B = P.targetUnits;
      if (this.rootRejection || 2 * B > this.remTotal || 2 * B < this.remForced || this.comps - 1 > B) this.done = true;
      else for (const r of this.rootRows) if (!this.checkRow(r)) { this.done = true; break; }
      this.p = 0;
      if (!this.done && PN > 0) { this.nextVal[0] = 0; this.applied[0] = -1; }
    }
    if (this.done) return 'DONE';
    let steps = 0;
    for (;;) {
      if (this.stopRequested) return 'STOPPED';
      if (this.p === PN) {
        if (this.U === P.targetUnits && this.connected() && this.blockSwapsOk()) {
          this.leaves++;
          this.onLeaf(this.currentBonds());
          if (this.stopRequested) return 'STOPPED';
        }
        this.p--;
        if (this.p < 0) { this.done = true; return 'DONE'; }
      }
      const p = this.p, i = this.pi[p], j = this.pj[p];
      if (this.applied[p] >= 0) { this.undo(p, this.applied[p]); this.applied[p] = -1; }
      // `nextVal` counts attempts at this position (0 = first attempt); the bond order tried is ascending or descending in the attempt number.
      let k = this.nextVal[p];
      const maxv = Math.min(CFG.maxBondOrder, cap[i] - d[i], cap[j] - d[j]);
      let advanced = false;
      while (k <= maxv) {
        if (steps >= maxSteps) { this.nextVal[p] = k; return 'PAUSED'; }
        const v = CFG.bondOrderSearchOrder === 'DESCENDING' ? maxv - k : k;
        steps++; this.visited++;
        if (this.apply(p, v)) {
          this.applied[p] = v; this.nextVal[p] = k + 1;
          this.p = p + 1;
          if (this.p < PN) { this.nextVal[this.p] = 0; this.applied[this.p] = -1; }
          advanced = true;
          break;
        }
        k++;
      }
      if (!advanced) {
        this.nextVal[p] = 0;
        this.p = p - 1;
        if (this.p < 0) { this.done = true; return 'DONE'; }
      }
    }
  }

  private apply(p: number, v: number): boolean {
    const P = this.P, n = this.n, i = this.pi[p], j = this.pj[p], d = this.d;
    d[i] += v; d[j] += v; this.U += v;
    this.M[i * n + j] = v; this.M[j * n + i] = v;
    this.remTotal -= 2 * v;
    this.remForced -= v * ((P.forced[i] ? 1 : 0) + (P.forced[j] ? 1 : 0));
    if (v === 2) { this.dbl[i]++; this.dbl[j]++; }
    if (v > 0) { this.bi[this.bTop] = i; this.bj[this.bTop] = j; this.bv[this.bTop] = v; this.bTop++; this.dsuUnion(i, j, true); }
    if (this.checkAfterApply(p, i, j)) return true;
    this.undo(p, v);
    return false;
  }

  private checkAfterApply(p: number, i: number, j: number): boolean {
    const P = this.P, n = this.n, d = this.d, cap = P.cap;
    const rem = P.targetUnits - this.U;
    if (rem < 0 || 2 * rem > this.remTotal || 2 * rem < this.remForced) return false;
    if (p === this.pi.length - 1 && rem !== 0) return false;
    // v1.2 vinyl CH: no triple bond, the double bond goes to a carbon, and there is at most one.
    if (this.hasAlkene) {
      const v = this.M[i * n + j];
      if (v >= 2) for (const [x, y] of [[i, j], [j, i]]) {
        if (P.alkene[x] && (v === 3 || P.el[y] !== 'C' || this.dbl[x] + this.fixedDbl[x] > 1)) return false;
      }
    }
    // Joining c components needs at least c-1 more bonds.
    if (this.comps - 1 > rem) return false;
    if (P.forced[i]) {
      let pot = 0;
      for (let l = j + 1; l < n; l++) { const c = cap[l] - d[l]; pot += c < CFG.maxBondOrder ? c : CFG.maxBondOrder; }
      if (cap[i] - d[i] > pot) return false;
    }
    for (const r of this.rowsAt[p]) if (!this.checkRow(r)) return false;
    return true;
  }

  private undo(p: number, v: number): void {
    const P = this.P, n = this.n, i = this.pi[p], j = this.pj[p], d = this.d;
    d[i] -= v; d[j] -= v; this.U -= v;
    this.M[i * n + j] = 0; this.M[j * n + i] = 0;
    this.remTotal += 2 * v;
    this.remForced += v * ((P.forced[i] ? 1 : 0) + (P.forced[j] ? 1 : 0));
    if (v === 2) { this.dbl[i]--; this.dbl[j]--; }
    if (v > 0) { this.bTop--; this.dsuRollback(); }
  }

  /** Checks that become decidable when row r is final. */
  private checkRow(r: number): boolean {
    const P = this.P, n = this.n, d = this.d;
    if (P.forced[r] && d[r] !== P.cap[r]) return false;
    // Hydrogens already implied on finished free/flex atoms cannot exceed the formula's free hydrogens.
    let finishedH = 0;
    for (let k = 0; k <= r; k++) if (P.slack[k]) finishedH += P.cap[k] - d[k];
    if (finishedH > P.hFree) return false;
    // Interchangeable free atoms (r-1, r): the lexicographically smaller image must not be a different leaf (lex-leader).
    for (const [a, b] of P.freePairs) if (b === r && !this.pairOrdered(a, b)) return false;
    // v1.2: interchangeable single atoms of identical signature (same lex-leader check).
    for (const [a, b] of P.symPairs) if (b === r && !this.pairOrdered(a, b)) return false;
    // v1.2: members of one equivalence group need the same bonded elements and bond orders (both rows are final).
    if (P.eqFirst[r] >= 0 && this.bondKey(r) !== this.bondKey(P.eqFirst[r])) return false;
    // v1.2 vinyl CH: the finished row must hold exactly one double bond.
    if (this.hasAlkene && P.alkene[r] && this.dbl[r] + this.fixedDbl[r] !== 1) return false;
    // v1.2 singlet rule for carbons whose hydrogens are not fixed (flex / free): a carbon next to a no-H-neighbour atom may not keep an implicit H.
    if (this.hasNoHC && P.slack[r] && P.el[r] === 'C' && P.cap[r] - d[r] > 0) {
      for (let y = 0; y < n; y++) if (P.noHC[y] && this.M[r * n + y] > 0) return false;
    }
    // A component made only of finished atoms can never be joined to the rest.
    if (n > 1) {
      const uf = this.uf;
      for (let k = 0; k < n; k++) uf[k] = k;
      const find = (x: number): number => { while (uf[x] !== x) { uf[x] = uf[uf[x]]; x = uf[x]; } return x; };
      for (const b of P.fixedBonds) uf[find(b.a)] = find(b.b);
      for (let t = 0; t < this.bTop; t++) uf[find(this.bi[t])] = find(this.bj[t]);
      const maxIdx = new Array<number>(n).fill(-1), size = new Array<number>(n).fill(0);
      for (let k = 0; k < n; k++) { const root = find(k); size[root]++; if (k > maxIdx[root]) maxIdx[root] = k; }
      for (let k = 0; k < n; k++) if (find(k) === k && size[k] < n && maxIdx[k] <= r) return false;
    }
    return true;
  }

  /** Sorted multiset of (element, bond order) over all bonds of atom x (fixed and new): equal for atoms of one orbit. */
  private bondKey(x: number): string {
    const n = this.n, P = this.P, out: number[] = [];
    for (let y = 0; y < n; y++) { const o = P.fixedOrder[x][y] + this.M[x * n + y]; if (o > 0) out.push(this.elIndex[y] * 4 + o); }
    return out.sort((a, b) => a - b).join(',');
  }

  /** key(x) <= key(swap(a,b) x) with key = (degree vector, upper-triangle matrix). Needs rows a and b final. */
  private pairOrdered(a: number, b: number): boolean {
    const n = this.n, d = this.d, M = this.M;
    if (d[a] !== d[b]) return d[a] < d[b];
    for (let k = 0; k < n; k++) {
      if (k === a || k === b) continue;
      const u = M[k * n + a], v = M[k * n + b];
      if (u !== v) return u < v;
    }
    return true;
  }

  private blockSwapsOk(): boolean {
    const n = this.n, d = this.d, M = this.M;
    for (const sigma of this.P.blockSwaps) {
      let decided = false;
      for (let i = 0; i < n && !decided; i++) {
        const other = d[sigma[i]];
        if (d[i] !== other) { if (d[i] > other) return false; decided = true; }
      }
      if (decided) continue;
      for (let i = 0; i < n && !decided; i++) for (let j = i + 1; j < n; j++) {
        const x = M[i * n + j], y = M[sigma[i] * n + sigma[j]];
        if (x !== y) { if (x > y) return false; decided = true; break; }
      }
    }
    return true;
  }

  private connected(): boolean {
    const P = this.P, n = this.n;
    if (n <= 1) return true;
    const seen = new Array<boolean>(n).fill(false), stack = [0];
    seen[0] = true;
    let count = 1;
    while (stack.length) {
      const x = stack.pop()!;
      for (let y = 0; y < n; y++) {
        if (seen[y] || (P.fixedOrder[x][y] === 0 && this.M[x * n + y] === 0)) continue;
        seen[y] = true; count++; stack.push(y);
      }
    }
    return count === n;
  }

  private currentBonds(): NewBond[] {
    const out: NewBond[] = [];
    for (let t = 0; t < this.bTop; t++) out.push({a: this.bi[t], b: this.bj[t], order: this.bv[t]});
    return out;
  }
}
