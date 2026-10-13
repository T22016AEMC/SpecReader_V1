export interface GraphAtomNode {
  index: number;
  element: string;
  aromatic: boolean;
  explicitBondOrderSum: number;
  implicitHydrogens: number;
  standardValence: number;
  isValenceValid: boolean;
}

export interface GraphBondEdge {
  from: number;
  to: number;
  order: 1 | 1.5 | 2 | 3;
}

export interface MolecularGraphValidationResult {
  smiles: string;
  isValid: boolean;
  isConnected: boolean;
  isRingClosureBalanced: boolean;
  allValencesValid: boolean;
  computedFormula: string;
  computedAtomCounts: Record<string, number>;
  computedDBE: number;
  heavyAtomCount: number;
  ringCount: number;
  atoms: GraphAtomNode[];
  bonds: GraphBondEdge[];
  errors: string[];
}

const STANDARD_VALENCES: Record<string, number[]> = {
  C: [4],
  N: [3, 5],
  O: [2],
  S: [2, 4, 6],
  P: [3, 5],
  F: [1],
  Cl: [1],
  Br: [1],
  I: [1],
  H: [1],
};

export class MolecularGraphValidator {
  /**
   * 確定性分子圖驗證器 (Deterministic Molecular Graph Validator)：
   * 解析 SMILES 拓撲結構，嚴格檢查：
   * 1. 括號分支平衡與環閉合數字配對
   * 2. 圖連通性 (Single connected component)
   * 3. 每個原子的化合價合法性 (C=4, O=2, N=3/5, 鹵素=1)
   * 4. 隱式氫數推導、分子式與不飽和度 (DBE/IHD) 精確計算
   */
  static validateSmilesGraph(
    smiles: string,
    expectedFormula?: string
  ): MolecularGraphValidationResult {
    const clean = smiles.trim();
    const errors: string[] = [];

    if (!clean) {
      return {
        smiles: clean,
        isValid: false,
        isConnected: false,
        isRingClosureBalanced: false,
        allValencesValid: false,
        computedFormula: "",
        computedAtomCounts: {},
        computedDBE: 0,
        heavyAtomCount: 0,
        ringCount: 0,
        atoms: [],
        bonds: [],
        errors: ["SMILES 字串為空"],
      };
    }

    const atoms: Array<{
      element: string;
      aromatic: boolean;
      explicitHydrogens?: number;
      formalCharge?: number;
    }> = [];
    const bonds: GraphBondEdge[] = [];
    const branchStack: number[] = [];
    const ringOpenings = new Map<number, { atomIdx: number; order: 1 | 1.5 | 2 | 3 }>();

    let currentAtom = -1;
    let pendingBondOrder: 1 | 1.5 | 2 | 3 | null = null;
    let i = 0;

    while (i < clean.length) {
      const ch = clean[i];

      if (ch === "(") {
        if (currentAtom === -1) {
          errors.push("分支左括號 '(' 出現在起始原子之前");
        }
        branchStack.push(currentAtom);
        i++;
        continue;
      }

      if (ch === ")") {
        if (branchStack.length === 0) {
          errors.push(`位置 ${i} 出現未配對之右括號 ')'`);
        } else {
          currentAtom = branchStack.pop()!;
        }
        i++;
        continue;
      }

      if (ch === "-") {
        pendingBondOrder = 1;
        i++;
        continue;
      }
      if (ch === "=") {
        pendingBondOrder = 2;
        i++;
        continue;
      }
      if (ch === "#") {
        pendingBondOrder = 3;
        i++;
        continue;
      }
      if (ch === ":") {
        pendingBondOrder = 1.5;
        i++;
        continue;
      }

      // 環閉合數字 (1-9)
      if (ch >= "1" && ch <= "9") {
        const ringNum = parseInt(ch, 10);
        if (currentAtom === -1) {
          errors.push(`環閉合標記 ${ringNum} 無歸屬原子`);
        } else if (ringOpenings.has(ringNum)) {
          const openInfo = ringOpenings.get(ringNum)!;
          ringOpenings.delete(ringNum);
          const isArom =
            atoms[openInfo.atomIdx]?.aromatic && atoms[currentAtom]?.aromatic;
          const order =
            pendingBondOrder || openInfo.order || (isArom ? 1.5 : 1);
          bonds.push({
            from: openInfo.atomIdx,
            to: currentAtom,
            order,
          });
          pendingBondOrder = null;
        } else {
          const isArom = atoms[currentAtom]?.aromatic;
          ringOpenings.set(ringNum, {
            atomIdx: currentAtom,
            order: pendingBondOrder || (isArom ? 1.5 : 1),
          });
          pendingBondOrder = null;
        }
        i++;
        continue;
      }

      // 方括號原子如 [nH], [N+], [O-] 等完整解析顯式氫與形式電荷
      if (ch === "[") {
        const closeIdx = clean.indexOf("]", i);
        if (closeIdx === -1) {
          errors.push("未閉合之方括號 '['");
          break;
        }
        const inside = clean.slice(i + 1, closeIdx);
        const bracketMatch = inside.match(
          /^(\d+)?([A-Za-z][a-z]?)(@{1,2})?(H\d*)?([+-]\d*|\+\+|--)?$/
        );
        const elemMatch = bracketMatch
          ? [bracketMatch[0], bracketMatch[2]]
          : inside.match(/([A-Z][a-z]?|[cnosp])/);
        if (elemMatch) {
          const rawElem = elemMatch[1];
          const isArom = rawElem === rawElem.toLowerCase();
          const element =
            rawElem.charAt(0).toUpperCase() + rawElem.slice(1).toLowerCase();
          let explicitH = 0;
          if (bracketMatch && bracketMatch[4]) {
            explicitH =
              bracketMatch[4].length === 1
                ? 1
                : parseInt(bracketMatch[4].slice(1), 10);
          }
          let formalCharge = 0;
          if (bracketMatch && bracketMatch[5]) {
            const qStr = bracketMatch[5];
            if (qStr === "+") formalCharge = 1;
            else if (qStr === "++") formalCharge = 2;
            else if (qStr === "-") formalCharge = -1;
            else if (qStr === "--") formalCharge = -2;
            else if (qStr.startsWith("+"))
              formalCharge = parseInt(qStr.slice(1), 10) || 1;
            else if (qStr.startsWith("-"))
              formalCharge = -(parseInt(qStr.slice(1), 10) || 1);
          }
          const newIdx = atoms.length;
          atoms.push({
            element,
            aromatic: isArom,
            explicitHydrogens: explicitH,
            formalCharge,
          });
          if (currentAtom !== -1) {
            const bothArom = atoms[currentAtom].aromatic && isArom;
            const order = pendingBondOrder || (bothArom ? 1.5 : 1);
            bonds.push({ from: currentAtom, to: newIdx, order });
            pendingBondOrder = null;
          }
          currentAtom = newIdx;
        }
        i = closeIdx + 1;
        continue;
      }

      // 雙字元元素 Cl, Br, Si
      const twoChar = clean.slice(i, i + 2);
      if (twoChar === "Cl" || twoChar === "Br" || twoChar === "Si") {
        const newIdx = atoms.length;
        atoms.push({ element: twoChar, aromatic: false });
        if (currentAtom !== -1) {
          const order = pendingBondOrder || 1;
          bonds.push({ from: currentAtom, to: newIdx, order });
          pendingBondOrder = null;
        }
        currentAtom = newIdx;
        i += 2;
        continue;
      }

      // 單字元有機子集原子 B, C, N, O, S, P, F, I, b, c, n, o, s, p
      if ("BCNOSPFIbcnosp".includes(ch)) {
        const isArom = ch === ch.toLowerCase();
        const element = ch.toUpperCase();
        const newIdx = atoms.length;
        atoms.push({ element, aromatic: isArom });
        if (currentAtom !== -1) {
          const bothArom = atoms[currentAtom].aromatic && isArom;
          const order = pendingBondOrder || (bothArom ? 1.5 : 1);
          bonds.push({ from: currentAtom, to: newIdx, order });
          pendingBondOrder = null;
        }
        currentAtom = newIdx;
        i++;
        continue;
      }

      if (ch === "/" || ch === "\\") {
        pendingBondOrder = 1;
        i++;
        continue;
      }

      if (ch === ".") {
        errors.push("SMILES 包含不連通之點號 '.' (Disconnected components)");
        currentAtom = -1;
        pendingBondOrder = null;
        i++;
        continue;
      }

      errors.push(`SMILES 位置 ${i} 含有無法解析或未支援之字元 '${ch}'`);
      i++;
    }

    if (branchStack.length > 0) {
      errors.push("存在未閉合之分支括號 '('");
    }
    const isRingClosureBalanced = ringOpenings.size === 0;
    if (!isRingClosureBalanced) {
      errors.push(
        `存在未配對之環閉合數字：${Array.from(ringOpenings.keys()).join(", ")}`
      );
    }

    // 檢查圖連通性 (BFS)
    let isConnected = atoms.length > 0;
    if (atoms.length > 1) {
      const visited = new Set<number>([0]);
      const queue = [0];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        for (const b of bonds) {
          if (b.from === curr && !visited.has(b.to)) {
            visited.add(b.to);
            queue.push(b.to);
          } else if (b.to === curr && !visited.has(b.from)) {
            visited.add(b.from);
            queue.push(b.from);
          }
        }
      }
      isConnected = visited.size === atoms.length;
      if (!isConnected) {
        errors.push("分子圖非單一連通圖 (Disconnected components)");
      }
    }

    // 計算每個原子之鍵級總和、隱式氫數與化合價合法性
    const atomNodes: GraphAtomNode[] = [];
    const atomCounts: Record<string, number> = {};
    let totalImplicitH = 0;
    let allValencesValid = true;

    for (let idx = 0; idx < atoms.length; idx++) {
      const a = atoms[idx];
      atomCounts[a.element] = (atomCounts[a.element] || 0) + 1;

      const incidentBonds = bonds.filter((b) => b.from === idx || b.to === idx);
      const rawBondSum = incidentBonds.reduce((acc, b) => acc + b.order, 0);
      const effectiveOrderSum = Math.round(rawBondSum);

      const allowedValences = STANDARD_VALENCES[a.element] || [4];
      const chargeAdj = a.formalCharge || 0;
      const maxAllowed =
        Math.max(...allowedValences) + (chargeAdj > 0 ? chargeAdj : 0);
      const targetValence =
        a.explicitHydrogens !== undefined
          ? Math.max(effectiveOrderSum + a.explicitHydrogens, allowedValences[0] + chargeAdj)
          : allowedValences.find((v) => v >= effectiveOrderSum) ??
            allowedValences[allowedValences.length - 1];

      const isValenceValid =
        a.explicitHydrogens !== undefined
          ? effectiveOrderSum + a.explicitHydrogens <= maxAllowed
          : effectiveOrderSum <= targetValence;
      if (!isValenceValid) {
        allValencesValid = false;
        errors.push(
          `原子 #${idx + 1} (${a.element}) 鍵級總和 (${effectiveOrderSum}) 超出標準最大價數 (${targetValence})`
        );
      }

      const implicitHydrogens =
        a.explicitHydrogens !== undefined
          ? a.explicitHydrogens
          : Math.max(0, targetValence - effectiveOrderSum);
      totalImplicitH += implicitHydrogens;

      atomNodes.push({
        index: idx,
        element: a.element,
        aromatic: a.aromatic,
        explicitBondOrderSum: effectiveOrderSum,
        implicitHydrogens,
        standardValence: targetValence,
        isValenceValid,
      });
    }

    if (totalImplicitH > 0) {
      atomCounts.H = (atomCounts.H || 0) + totalImplicitH;
    }

    // Hill System 分子式格式化（支援全部有機與主族元素）
    const c = (atomCounts.C || 0) + (atomCounts.Si || 0);
    const h = atomCounts.H || 0;
    const n = (atomCounts.N || 0) + (atomCounts.P || 0);
    const cl = atomCounts.Cl || 0;
    const br = atomCounts.Br || 0;

    const parts: string[] = [];
    if ((atomCounts.C || 0) > 0) {
      parts.push(`C${atomCounts.C > 1 ? atomCounts.C : ""}`);
      if (h > 0) {
        parts.push(`H${h > 1 ? h : ""}`);
      }
      const otherEls = Object.keys(atomCounts)
        .filter((k) => k !== "C" && k !== "H" && (atomCounts[k] || 0) > 0)
        .sort((a, b) => a.localeCompare(b));
      for (const el of otherEls) {
        const cnt = atomCounts[el];
        parts.push(`${el}${cnt > 1 ? cnt : ""}`);
      }
    } else {
      const sortedEls = Object.keys(atomCounts)
        .filter((k) => (atomCounts[k] || 0) > 0)
        .sort((a, b) => a.localeCompare(b));
      for (const el of sortedEls) {
        const cnt = atomCounts[el];
        parts.push(`${el}${cnt > 1 ? cnt : ""}`);
      }
    }
    const computedFormula = parts.join("");

    const halogens = (atomCounts.F || 0) + cl + br + (atomCounts.I || 0);
    const computedDBE = c - (h + halogens) / 2 + n / 2 + 1;
    const ringCount = Math.max(0, bonds.length - atoms.length + 1);

    if (expectedFormula && computedFormula !== expectedFormula.trim()) {
      errors.push(
        `SMILES 計算分子式 (${computedFormula}) 與目標分子式 (${expectedFormula.trim()}) 不一致`
      );
    }

    const isValid =
      errors.length === 0 &&
      isConnected &&
      isRingClosureBalanced &&
      allValencesValid;

    return {
      smiles: clean,
      isValid,
      isConnected,
      isRingClosureBalanced,
      allValencesValid,
      computedFormula,
      computedAtomCounts: atomCounts,
      computedDBE,
      heavyAtomCount: atoms.length,
      ringCount,
      atoms: atomNodes,
      bonds,
      errors,
    };
  }
}
