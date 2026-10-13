import { ParsedChemicalStructure, StructureIntegrityReport } from "../types/spectrum";
import { TheoreticalModelRegistry } from "../models/theoreticalModelRegistry";

const ATOMIC_WEIGHTS: Record<string, number> = {
  H: 1.00794,
  B: 10.811,
  C: 12.0107,
  N: 14.0067,
  O: 15.9994,
  F: 18.9984,
  Na: 22.98977,
  Si: 28.0855,
  P: 30.9738,
  S: 32.065,
  Cl: 35.453,
  K: 39.0983,
  Br: 79.904,
  I: 126.9045,
};

const MONOISOTOPIC_MASSES: Record<string, number> = {
  H: 1.007825,
  B: 11.009305,
  C: 12.0,
  N: 14.003074,
  O: 15.994915,
  F: 18.998403,
  Na: 22.989769,
  Si: 27.976927,
  P: 30.973762,
  S: 31.972071,
  Cl: 34.968853,
  K: 38.963707,
  Br: 78.918338,
  I: 126.904473,
};

export interface ComputationalBackendStatus {
  engineName: string;
  rdkitConnected: boolean;
  quantumDftConnected: boolean;
  pubchemApiConnected: boolean;
  nistSdbsConnected: boolean;
  calculationMode: string;
  disclosureText: string;
}

export class ComputationalBackend {
  static getStatus(): ComputationalBackendStatus {
    return {
      engineName: "SpecReader 可插拔模型架構介面 (TheoreticalModelRegistry v2.0)",
      rdkitConnected: false,
      quantumDftConnected: TheoreticalModelRegistry.quantumAdapter.isAvailable,
      pubchemApiConnected: true,
      nistSdbsConnected: false,
      calculationMode: "內建快速經驗模型 (Internal Empirical Model) + PubChem 即時查詢",
      disclosureText: TheoreticalModelRegistry.quantumAdapter.getUnavailableReason(),
    };
  }
}

export interface SmilesAtomNode {
  index: number;
  element: string;
  isAromatic: boolean;
  explicitHydrogens: number | null;
  formalCharge: number;
  implicitHydrogens: number;
  totalHydrogens: number;
  neighbors: { toAtom: number; order: number; isAromatic: boolean }[];
}

export interface ParsedSmilesGraph {
  atoms: SmilesAtomNode[];
  bonds: { from: number; to: number; order: number; isAromatic: boolean }[];
  atomCounts: Record<string, number>;
  totalFormalCharge: number;
  ringClosureCount: number;
  disconnectedComponentsCount: number;
  aromaticAtomCount: number;
  ringSubstitutionTopology:
    | "1,4-para"
    | "1,2-ortho"
    | "1,3-meta"
    | "monosubstituted"
    | "polysubstituted"
    | "non-aromatic"
    | "unknown";
  detectedFunctionalGroups: string[];
}

export class StructureParserAdapter {
  static get fullChemistryParserAvailable() { return rdkitStatus().available; }
  static readonly internalParserActive = true;

  static getStatusLabel(): string {
    return rdkitStatus().available ? `RDKit ${rdkitStatus().version} / 內建化學環境圖模型` : "內建分子圖解析器（RDKit 尚未載入；進階驗證有限）";
  }

  static parseSmilesGraph(smiles: string): {
    valid: boolean;
    reason?: string;
    graph?: ParsedSmilesGraph;
  } {
    const canonical = canonicalizeMolecule(smiles.trim());
    if (canonical.available && !canonical.valid) return {valid:false,reason:"RDKit 拒絕非法 SMILES／價態"};
    const s = canonical.canonical;
    if (!s || s.length === 0) {
      return { valid: false, reason: "SMILES 字串為空" };
    }
    if (/\s/.test(s)) {
      return { valid: false, reason: "SMILES 不應包含空白字元" };
    }

    const atoms: SmilesAtomNode[] = [];
    const bonds: { from: number; to: number; order: number; isAromatic: boolean }[] = [];
    const branchStack: number[] = [];
    const openRings = new Map<
      string,
      { atomIndex: number; pendingOrder: number | null; pendingAromatic: boolean }
    >();

    let currentAtomIndex: number | null = null;
    let pendingBondOrder: number | null = null;
    let pendingBondAromatic = false;
    let disconnectedComponentsCount = 1;
    let ringClosureCount = 0;

    const addBond = (u: number, v: number, order: number, isAromatic: boolean) => {
      if (u === v) return;
      if (atoms[u].neighbors.some((n) => n.toAtom === v)) return;
      atoms[u].neighbors.push({ toAtom: v, order, isAromatic });
      atoms[v].neighbors.push({ toAtom: u, order, isAromatic });
      bonds.push({ from: u, to: v, order, isAromatic });
    };

    let i = 0;
    while (i < s.length) {
      const ch = s[i];

      if (ch === "(") {
        if (currentAtomIndex === null) {
          return { valid: false, reason: "分支括號 '(' 前缺少起始原子" };
        }
        branchStack.push(currentAtomIndex);
        i++;
        continue;
      }

      if (ch === ")") {
        if (branchStack.length === 0) {
          return { valid: false, reason: "分支括號 ')' 不平衡" };
        }
        currentAtomIndex = branchStack.pop()!;
        pendingBondOrder = null;
        pendingBondAromatic = false;
        i++;
        continue;
      }

      if (ch === ".") {
        currentAtomIndex = null;
        pendingBondOrder = null;
        pendingBondAromatic = false;
        disconnectedComponentsCount++;
        i++;
        continue;
      }

      if (ch === "-" || ch === "=" || ch === "#" || ch === ":" || ch === "/" || ch === "\\") {
        if (ch === "=") pendingBondOrder = 2;
        else if (ch === "#") pendingBondOrder = 3;
        else if (ch === ":") {
          pendingBondOrder = 1.5;
          pendingBondAromatic = true;
        } else {
          pendingBondOrder = 1;
        }
        i++;
        continue;
      }

      if (ch === "%" || (ch >= "0" && ch <= "9")) {
        if (currentAtomIndex === null) {
          return { valid: false, reason: "環閉合標記前缺少原子" };
        }
        let ringId = ch;
        if (ch === "%") {
          if (i + 2 >= s.length || !/^\d\d$/.test(s.slice(i + 1, i + 3))) {
            return { valid: false, reason: "無效的雙位數環閉合標記" };
          }
          ringId = s.slice(i + 1, i + 3);
          i += 3;
        } else {
          i++;
        }

        if (openRings.has(ringId)) {
          const opened = openRings.get(ringId)!;
          openRings.delete(ringId);
          ringClosureCount++;
          const isArom =
            pendingBondAromatic ||
            opened.pendingAromatic ||
            (atoms[currentAtomIndex].isAromatic &&
              atoms[opened.atomIndex].isAromatic &&
              pendingBondOrder === null &&
              opened.pendingOrder === null);
          const order =
            pendingBondOrder ?? opened.pendingOrder ?? (isArom ? 1.5 : 1);
          addBond(opened.atomIndex, currentAtomIndex, order, isArom);
        } else {
          openRings.set(ringId, {
            atomIndex: currentAtomIndex,
            pendingOrder: pendingBondOrder,
            pendingAromatic: pendingBondAromatic,
          });
        }
        pendingBondOrder = null;
        pendingBondAromatic = false;
        continue;
      }

      if (ch === "[") {
        const closeIdx = s.indexOf("]", i + 1);
        if (closeIdx === -1) {
          return { valid: false, reason: "原子中括號 '[' 未閉合" };
        }
        const content = s.slice(i + 1, closeIdx);
        const m = content.match(
          /^(\d+)?([A-Za-z][a-z]?)(@{1,2})?(H\d*)?([+-]\d*|\+\+|--)?$/
        );
        if (!m) {
          return { valid: false, reason: `無法解析中括號原子 [${content}]` };
        }
        const rawSym = m[2];
        const isAromatic =
          rawSym === "c" ||
          rawSym === "n" ||
          rawSym === "o" ||
          rawSym === "s" ||
          rawSym === "p" ||
          rawSym === "b";
        const element = rawSym.charAt(0).toUpperCase() + rawSym.slice(1).toLowerCase();
        if (!(element in ATOMIC_WEIGHTS)) {
          return { valid: false, reason: `不支援或未知的元素符號 ${element}` };
        }

        let explicitH = 0;
        if (m[4]) {
          explicitH = m[4].length === 1 ? 1 : parseInt(m[4].slice(1), 10);
        }

        let charge = 0;
        if (m[5]) {
          if (m[5] === "+") charge = 1;
          else if (m[5] === "++") charge = 2;
          else if (m[5] === "-") charge = -1;
          else if (m[5] === "--") charge = -2;
          else if (m[5].startsWith("+")) charge = parseInt(m[5].slice(1), 10) || 1;
          else if (m[5].startsWith("-")) charge = -(parseInt(m[5].slice(1), 10) || 1);
        }

        const newIdx = atoms.length;
        atoms.push({
          index: newIdx,
          element,
          isAromatic,
          explicitHydrogens: explicitH,
          formalCharge: charge,
          implicitHydrogens: 0,
          totalHydrogens: explicitH,
          neighbors: [],
        });

        if (currentAtomIndex !== null) {
          const isArom =
            pendingBondAromatic ||
            (atoms[currentAtomIndex].isAromatic && isAromatic && pendingBondOrder === null);
          const order = pendingBondOrder ?? (isArom ? 1.5 : 1);
          addBond(currentAtomIndex, newIdx, order, isArom);
        }
        currentAtomIndex = newIdx;
        pendingBondOrder = null;
        pendingBondAromatic = false;
        i = closeIdx + 1;
        continue;
      }

      let rawSym = "";
      if (s.slice(i, i + 2) === "Cl" || s.slice(i, i + 2) === "Br" || s.slice(i, i + 2) === "Si") {
        rawSym = s.slice(i, i + 2);
        i += 2;
      } else if (/^[BCNOPSFIbcnops]$/.test(ch)) {
        rawSym = ch;
        i += 1;
      } else {
        return { valid: false, reason: `SMILES 含有無效語法字元 '${ch}'` };
      }

      const isAromatic = /^[bcnops]$/.test(rawSym);
      const element =
        rawSym.length === 2
          ? rawSym
          : rawSym.toUpperCase();

      const newIdx = atoms.length;
      atoms.push({
        index: newIdx,
        element,
        isAromatic,
        explicitHydrogens: null,
        formalCharge: 0,
        implicitHydrogens: 0,
        totalHydrogens: 0,
        neighbors: [],
      });

      if (currentAtomIndex !== null) {
        const isArom =
          pendingBondAromatic ||
          (atoms[currentAtomIndex].isAromatic && isAromatic && pendingBondOrder === null);
        const order = pendingBondOrder ?? (isArom ? 1.5 : 1);
        addBond(currentAtomIndex, newIdx, order, isArom);
      }
      currentAtomIndex = newIdx;
      pendingBondOrder = null;
      pendingBondAromatic = false;
    }

    if (branchStack.length !== 0) {
      return { valid: false, reason: "分支括號 '(' 未閉合" };
    }
    if (openRings.size !== 0) {
      return {
        valid: false,
        reason: `環閉合數字 (${Array.from(openRings.keys()).join(", ")}) 未配對閉合`,
      };
    }
    if (atoms.length === 0) {
      return { valid: false, reason: "未解析出任何有效原子" };
    }

    const atomCounts: Record<string, number> = {};
    let totalFormalCharge = 0;
    let aromaticAtomCount = 0;

    for (const atom of atoms) {
      totalFormalCharge += atom.formalCharge;
      if (atom.isAromatic) aromaticAtomCount++;

      if (atom.element === "H") {
        atomCounts.H = (atomCounts.H || 0) + 1;
        continue;
      }

      atomCounts[atom.element] = (atomCounts[atom.element] || 0) + 1;

      if (atom.explicitHydrogens !== null) {
        atom.implicitHydrogens = 0;
        atom.totalHydrogens = atom.explicitHydrogens;
      } else {
        let bondSum = 0;
        for (const nb of atom.neighbors) {
          if (atoms[nb.toAtom].element === "H") {
            bondSum += 1;
          } else {
            bondSum += nb.order;
          }
        }
        let targetValence = 0;
        switch (atom.element) {
          case "B":
            targetValence = 3;
            break;
          case "C":
          case "Si":
            targetValence = 4;
            break;
          case "N":
          case "P":
            targetValence = bondSum <= 3 ? 3 : 5;
            break;
          case "O":
            targetValence = 2;
            break;
          case "S":
            targetValence = bondSum <= 2 ? 2 : bondSum <= 4 ? 4 : 6;
            break;
          case "F":
          case "Cl":
          case "Br":
          case "I":
            targetValence = 1;
            break;
          default:
            targetValence = 0;
        }
        const effectiveBondOrder = Math.round(bondSum);
        const implicitH = Math.max(0, targetValence + atom.formalCharge - effectiveBondOrder);
        atom.implicitHydrogens = implicitH;
        atom.totalHydrogens = implicitH;
      }

      atomCounts.H = (atomCounts.H || 0) + atom.totalHydrogens;
    }

    const groups = new Set<string>();
    const aromaticAtoms = atoms.filter((a) => a.isAromatic);
    const aromaticNAtoms = aromaticAtoms.filter((a) => a.element === "N");
    const aromaticOAtoms = aromaticAtoms.filter((a) => a.element === "O");
    const aromaticSAtoms = aromaticAtoms.filter((a) => a.element === "S");

    let ringSubstitutionTopology: ParsedSmilesGraph["ringSubstitutionTopology"] =
      aromaticAtomCount >= 5 ? "unknown" : "non-aromatic";

    if (aromaticAtomCount >= 5) {
      if (aromaticNAtoms.length > 0) {
        const pyrrolicNH = aromaticNAtoms.some((a) => a.totalHydrogens >= 1);
        if (pyrrolicNH || aromaticAtomCount === 5 || aromaticAtomCount === 9) {
          groups.add("吡咯 / 吲哚環 (Pyrrole / Indole Ring)");
          groups.add("含氮芳香雜環 (N-Heteroaromatic Ring)");
        } else {
          groups.add("吡啶環 / 含氮芳香雜環 (Pyridine / N-Heteroaromatic Ring)");
          groups.add("含氮芳香雜環 (N-Heteroaromatic Ring)");
        }
      }
      if (aromaticOAtoms.length > 0) {
        groups.add("呋喃環 / 含氧芳香雜環 (Furan / O-Heteroaromatic Ring)");
      }
      if (aromaticSAtoms.length > 0) {
        groups.add("噻吩環 / 含硫芳香雜環 (Thiophene / S-Heteroaromatic Ring)");
      }

      const substitutedAromaticAtoms = atoms.filter(
        (a) =>
          a.isAromatic &&
          a.element === "C" &&
          a.totalHydrogens === 0 &&
          a.neighbors.some((nb) => !atoms[nb.toAtom].isAromatic || nb.order >= 1)
      );

      if (
        aromaticAtomCount === 6 &&
        aromaticNAtoms.length === 1 &&
        substitutedAromaticAtoms.length === 0
      ) {
        ringSubstitutionTopology = "monosubstituted";
      } else if (
        aromaticAtomCount === 6 &&
        aromaticNAtoms.length === 1 &&
        substitutedAromaticAtoms.length === 1
      ) {
        const start = aromaticNAtoms[0].index;
        const target = substitutedAromaticAtoms[0].index;
        const dist = new Map<number, number>([[start, 0]]);
        const q = [start];
        while (q.length > 0) {
          const u = q.shift()!;
          for (const nb of atoms[u].neighbors) {
            if (atoms[nb.toAtom].isAromatic && !dist.has(nb.toAtom)) {
              dist.set(nb.toAtom, dist.get(u)! + 1);
              q.push(nb.toAtom);
            }
          }
        }
        const pathLen = dist.get(target);
        if (pathLen === 3) {
          ringSubstitutionTopology = "1,4-para";
          groups.add("對位雙取代芳香環 (1,4-Disubstituted Aromatic)");
        } else if (pathLen === 1) {
          ringSubstitutionTopology = "1,2-ortho";
        } else if (pathLen === 2) {
          ringSubstitutionTopology = "1,3-meta";
        }
      } else if (substitutedAromaticAtoms.length === 1 && aromaticNAtoms.length === 0) {
        ringSubstitutionTopology = "monosubstituted";
        groups.add("單取代芳香環 (Monosubstituted Aromatic Ring)");
      } else if (
        substitutedAromaticAtoms.length === 2 &&
        aromaticAtomCount === 6 &&
        aromaticNAtoms.length === 0
      ) {
        const start = substitutedAromaticAtoms[0].index;
        const target = substitutedAromaticAtoms[1].index;
        const dist = new Map<number, number>([[start, 0]]);
        const q = [start];
        while (q.length > 0) {
          const u = q.shift()!;
          for (const nb of atoms[u].neighbors) {
            if (atoms[nb.toAtom].isAromatic && !dist.has(nb.toAtom)) {
              dist.set(nb.toAtom, dist.get(u)! + 1);
              q.push(nb.toAtom);
            }
          }
        }
        const pathLen = dist.get(target);
        if (pathLen === 3) {
          ringSubstitutionTopology = "1,4-para";
          groups.add("對位雙取代芳香環 (1,4-Disubstituted Aromatic)");
        } else if (pathLen === 1) {
          ringSubstitutionTopology = "1,2-ortho";
          groups.add("鄰位雙取代芳香環 (1,2-Ortho Disubstituted Aromatic)");
        } else if (pathLen === 2) {
          ringSubstitutionTopology = "1,3-meta";
          groups.add("間位雙取代芳香環 (1,3-Meta Disubstituted Aromatic)");
        } else {
          groups.add("苯環 / 芳香環系統 (Benzenoid Aromatic)");
        }
      } else {
        ringSubstitutionTopology = "polysubstituted";
        if (aromaticNAtoms.length === 0 && aromaticOAtoms.length === 0 && aromaticSAtoms.length === 0) {
          groups.add("苯環 / 芳香環系統 (Benzenoid Aromatic)");
        }
      }
    }

    for (const atom of atoms) {
      if (atom.element === "C") {
        const doubleBondO = atom.neighbors.find(
          (nb) => nb.order === 2 && atoms[nb.toAtom].element === "O"
        );
        if (doubleBondO) {
          const singleBondO = atom.neighbors.find(
            (nb) => nb.order === 1 && atoms[nb.toAtom].element === "O"
          );
          const singleBondN = atom.neighbors.find(
            (nb) => nb.order === 1 && atoms[nb.toAtom].element === "N"
          );
          const singleBondCl = atom.neighbors.find(
            (nb) => nb.order === 1 && atoms[nb.toAtom].element === "Cl"
          );
          if (singleBondCl) {
            groups.add("醯氯 (Acyl Chloride -COCl)");
          } else if (singleBondO) {
            const oAtom = atoms[singleBondO.toAtom];
            const attachedToSecondCarbonyl = oAtom.neighbors.some((onb) => {
              if (onb.toAtom === atom.index) return false;
              const otherC = atoms[onb.toAtom];
              return (
                otherC.element === "C" &&
                otherC.neighbors.some((cnb) => cnb.order === 2 && atoms[cnb.toAtom].element === "O")
              );
            });
            if (attachedToSecondCarbonyl) {
              groups.add("酸酐 (Anhydride -CO-O-CO-)");
            } else if (oAtom.totalHydrogens >= 1) {
              groups.add("羧酸 (-COOH)");
            } else {
              groups.add("酯基 (Ester R-C(=O)O-R')");
            }
          } else if (singleBondN) {
            groups.add("醯胺基 (Amide -CONH-)");
          } else if (atom.totalHydrogens >= 1) {
            groups.add("醛基 (-CHO)");
          } else {
            groups.add("酮基 (Ketone R-C(=O)-R')");
          }
        }

        const tripleBondN = atom.neighbors.find(
          (nb) => nb.order === 3 && atoms[nb.toAtom].element === "N"
        );
        if (tripleBondN) {
          groups.add("腈基 (Nitrile -C≡N)");
        }

        const tripleBondC = atom.neighbors.find(
          (nb) => nb.order === 3 && atoms[nb.toAtom].element === "C"
        );
        if (tripleBondC) {
          groups.add("炔基 (Alkyne -C≡C-)");
        }

        const doubleBondC = atom.neighbors.find(
          (nb) => nb.order === 2 && !nb.isAromatic && atoms[nb.toAtom].element === "C"
        );
        if (doubleBondC) {
          groups.add("烯基 (Alkene C=C)");
        }
      }

      if (atom.element === "O" && !atom.isAromatic && atom.neighbors.every((nb) => nb.order === 1)) {
        const attachedToCarbonyl = atom.neighbors.some((nb) => {
          const cAtom = atoms[nb.toAtom];
          return (
            cAtom.element === "C" &&
            cAtom.neighbors.some((cnb) => cnb.order === 2 && atoms[cnb.toAtom].element === "O")
          );
        });
        if (!attachedToCarbonyl) {
          if (atom.totalHydrogens >= 1) {
            groups.add("醇或酚羥基 (-OH)");
          } else if (atom.neighbors.length === 2) {
            groups.add("醚基 / 烷氧基 (Ether R-O-R')");
          }
        }
      }

      if (atom.element === "N") {
        const oxyNeighbors = atom.neighbors.filter((nb) => atoms[nb.toAtom].element === "O");
        if (oxyNeighbors.length >= 2) {
          groups.add("硝基 (-NO₂)");
        } else if (!atom.isAromatic) {
          const attachedToCarbonylOrNitrile = atom.neighbors.some((nb) => {
            const cAtom = atoms[nb.toAtom];
            return (
              cAtom.element === "C" &&
              (nb.order === 3 ||
                cAtom.neighbors.some(
                  (cnb) => cnb.order === 2 && atoms[cnb.toAtom].element === "O"
                ))
            );
          });
          if (!attachedToCarbonylOrNitrile) {
            groups.add("胺基 (-NH₂ / -NR₂)");
          }
        }
      }

      if (atom.element === "S" && !atom.isAromatic) {
        const oxyNeighbors = atom.neighbors.filter(
          (nb) => nb.order === 2 && atoms[nb.toAtom].element === "O"
        );
        if (oxyNeighbors.length >= 2) {
          groups.add("磺醯基 / 磺酸衍生物 (Sulfonyl -SO₂-)");
        }
      }

      if (atom.element === "Si") {
        groups.add("矽氧烷 / 有機矽 (Si-O-Si / Si-CH₃)");
      }
      if (atom.element === "Br") groups.add("溴代基 (C-Br)");
      if (atom.element === "Cl") {
        const onCarbonyl = atom.neighbors.some((nb) => {
          const cAtom = atoms[nb.toAtom];
          return (
            cAtom.element === "C" &&
            cAtom.neighbors.some((cnb) => cnb.order === 2 && atoms[cnb.toAtom].element === "O")
          );
        });
        if (!onCarbonyl) groups.add("氯代基 (C-Cl)");
      }
      if (atom.element === "F") groups.add("氟代基 (C-F)");
      if (atom.element === "I") groups.add("碘代基 (C-I)");
    }

    if (groups.size === 0) {
      groups.add("脂肪族碳氫骨架 (Aliphatic Backbone)");
    }

    return {
      valid: true,
      graph: {
        atoms,
        bonds,
        atomCounts,
        totalFormalCharge,
        ringClosureCount,
        disconnectedComponentsCount,
        aromaticAtomCount,
        ringSubstitutionTopology,
        detectedFunctionalGroups: Array.from(groups),
      },
    };
  }

  static validateSmilesSyntax(smiles: string): { valid: boolean; reason?: string } {
    const res = this.parseSmilesGraph(smiles);
    return { valid: res.valid, reason: res.reason };
  }
}

export interface KnownCompoundEntry {
  id: string;
  name: string;
  iupacName: string;
  smilesAliases: string[];
  inchiPrefix: string;
  formula: string;
  pubchemCid: number;
  functionalGroups: string[];
  symmetryFactor: string;
  uniqueH: number;
  uniqueC: number;
  keyIrPeaks: number[];
  keyH1Shifts: { ppm: number; integ: number; mult: string; j?: number }[];
  keyC13Shifts: number[];
  keyMsBasePeak: number;
}

export const KNOWN_STRUCTURAL_LIBRARY: KnownCompoundEntry[] = [
  {
    id: "lib-p-anisaldehyde",
    name: "對甲氧基苯甲醛 (4-Methoxybenzaldehyde / p-Anisaldehyde)",
    iupacName: "4-methoxybenzaldehyde",
    smilesAliases: ["COc1ccc(C=O)cc1", "O=Cc1ccc(OC)cc1", "COc1ccc(cc1)C=O"],
    inchiPrefix: "InChI=1S/C8H8O2/c1-10-8-4-2-7(6-9)3-5-8",
    formula: "C8H8O2",
    pubchemCid: 31244,
    functionalGroups: ["醛基 (-CHO)", "對位雙取代芳香環 (1,4-Disubstituted Benzene)", "芳基烷基醚 (-OCH₃)"],
    symmetryFactor: "C₂v 對位芳香環對稱性（AA'BB' 自旋系統：4 個芳香氫呈現 2 組 2H 雙重峰，8 個碳呈現 6 組 ¹³C 訊號）",
    uniqueH: 4,
    uniqueC: 6,
    keyIrPeaks: [1696, 1600, 1512, 1260, 1026, 833, 2838, 2740],
    keyH1Shifts: [
      { ppm: 9.88, integ: 1, mult: "s" },
      { ppm: 7.84, integ: 2, mult: "d", j: 8.7 },
      { ppm: 7.01, integ: 2, mult: "d", j: 8.7 },
      { ppm: 3.89, integ: 3, mult: "s" },
    ],
    keyC13Shifts: [190.8, 164.6, 132.0, 130.0, 114.3, 55.6],
    keyMsBasePeak: 135,
  },
  {
    id: "lib-o-anisaldehyde",
    name: "鄰甲氧基苯甲醛 (2-Methoxybenzaldehyde / o-Anisaldehyde)",
    iupacName: "2-methoxybenzaldehyde",
    smilesAliases: ["COc1ccccc1C=O", "O=Cc1ccccc1OC"],
    inchiPrefix: "InChI=1S/C8H8O2/c1-10-8-5-3-2-4-7(8)6-9",
    formula: "C8H8O2",
    pubchemCid: 8658,
    functionalGroups: ["醛基 (-CHO)", "鄰位雙取代芳香環 (1,2-Disubstituted Benzene)", "芳基烷基醚 (-OCH₃)"],
    symmetryFactor: "無 C₂ 對稱軸（4 個芳香氫互不等價，8 個碳呈現 8 組獨立 ¹³C 訊號）",
    uniqueH: 6,
    uniqueC: 8,
    keyIrPeaks: [1690, 1600, 1485, 1248, 1022, 756, 2840, 2750],
    keyH1Shifts: [
      { ppm: 10.48, integ: 1, mult: "s" },
      { ppm: 7.83, integ: 1, mult: "dd", j: 7.8 },
      { ppm: 7.55, integ: 1, mult: "m" },
      { ppm: 7.02, integ: 2, mult: "m" },
      { ppm: 3.93, integ: 3, mult: "s" },
    ],
    keyC13Shifts: [189.8, 161.8, 135.9, 128.5, 124.8, 120.6, 111.6, 55.6],
    keyMsBasePeak: 136,
  },
  {
    id: "lib-methyl-benzoate",
    name: "苯甲酸甲酯 (Methyl Benzoate)",
    iupacName: "methyl benzoate",
    smilesAliases: ["COC(=O)c1ccccc1", "O=C(OC)c1ccccc1"],
    inchiPrefix: "InChI=1S/C8H8O2/c1-10-8(9)7-5-3-2-4-6-7",
    formula: "C8H8O2",
    pubchemCid: 7150,
    functionalGroups: ["芳香酯基 (Ester -COOCH₃)", "單取代苯環 (Monosubstituted Phenyl)"],
    symmetryFactor: "單取代苯環對稱性（5 個芳香氫分屬 3 種環境，8 個碳呈現 6 組 ¹³C 訊號）",
    uniqueH: 4,
    uniqueC: 6,
    keyIrPeaks: [1724, 1602, 1452, 1278, 1111, 710],
    keyH1Shifts: [
      { ppm: 8.04, integ: 2, mult: "d", j: 7.5 },
      { ppm: 7.56, integ: 1, mult: "t", j: 7.4 },
      { ppm: 7.44, integ: 2, mult: "t", j: 7.6 },
      { ppm: 3.92, integ: 3, mult: "s" },
    ],
    keyC13Shifts: [167.1, 132.9, 130.2, 129.6, 128.4, 52.1],
    keyMsBasePeak: 105,
  },
  {
    id: "lib-phenylacetic-acid",
    name: "苯乙酸 (Phenylacetic Acid)",
    iupacName: "2-phenylacetic acid",
    smilesAliases: ["OC(=O)Cc1ccccc1", "O=C(O)Cc1ccccc1"],
    inchiPrefix: "InChI=1S/C8H8O2/c9-8(10)6-7-4-2-1-3-5-7",
    formula: "C8H8O2",
    pubchemCid: 999,
    functionalGroups: ["羧酸基 (-COOH)", "單取代苯環 (Monosubstituted Phenyl)", "苄基亞甲基 (-CH₂-)"],
    symmetryFactor: "單取代苯環 + 苄基 CH₂（6 組獨特 ¹³C 訊號）",
    uniqueH: 5,
    uniqueC: 6,
    keyIrPeaks: [3000, 1705, 1496, 1412, 1230, 702],
    keyH1Shifts: [
      { ppm: 11.2, integ: 1, mult: "br s" },
      { ppm: 7.32, integ: 5, mult: "m" },
      { ppm: 3.64, integ: 2, mult: "s" },
    ],
    keyC13Shifts: [178.1, 133.3, 129.4, 128.6, 127.3, 41.1],
    keyMsBasePeak: 91,
  },
  {
    id: "lib-benzocaine",
    name: "對胺基苯甲酸乙酯 (Ethyl 4-aminobenzoate / Benzocaine)",
    iupacName: "ethyl 4-aminobenzoate",
    smilesAliases: ["CCOC(=O)c1ccc(N)cc1", "Nc1ccc(C(=O)OCC)cc1", "CCOC(=O)c1ccc(cc1)N"],
    inchiPrefix: "InChI=1S/C9H11NO2/c1-2-12-9(11)7-3-5-8(10)6-4-7",
    formula: "C9H11NO2",
    pubchemCid: 2337,
    functionalGroups: ["共軛酯基 (Ester -COOCH₂CH₃)", "一級芳香胺 (-NH₂)", "對位雙取代芳香環"],
    symmetryFactor: "對位雙取代芳香環對稱性（AA'BB' 自旋系統，9 個碳呈現 7 組 ¹³C 訊號）",
    uniqueH: 5,
    uniqueC: 7,
    keyIrPeaks: [3422, 3342, 1716, 1634, 1603, 1278, 1110, 842],
    keyH1Shifts: [
      { ppm: 7.85, integ: 2, mult: "d", j: 8.6 },
      { ppm: 6.64, integ: 2, mult: "d", j: 8.6 },
      { ppm: 4.31, integ: 2, mult: "q", j: 7.1 },
      { ppm: 4.08, integ: 2, mult: "br s" },
      { ppm: 1.36, integ: 3, mult: "t", j: 7.1 },
    ],
    keyC13Shifts: [166.7, 150.8, 131.6, 120.1, 113.8, 60.4, 14.4],
    keyMsBasePeak: 120,
  },
  {
    id: "lib-ethyl-anthranilate",
    name: "鄰胺基苯甲酸乙酯 (Ethyl 2-aminobenzoate)",
    iupacName: "ethyl 2-aminobenzoate",
    smilesAliases: ["CCOC(=O)c1ccccc1N"],
    inchiPrefix: "InChI=1S/C9H11NO2/c1-2-12-9(11)7-5-3-4-6-8(7)10",
    formula: "C9H11NO2",
    pubchemCid: 6826,
    functionalGroups: ["共軛酯基 (Ester -COOCH₂CH₃)", "一級芳香胺 (-NH₂)", "鄰位雙取代芳香環"],
    symmetryFactor: "鄰位雙取代無對稱軸（9 個碳呈現 9 組 ¹³C 訊號）",
    uniqueH: 7,
    uniqueC: 9,
    keyIrPeaks: [3470, 3370, 1685, 1615, 1245, 752],
    keyH1Shifts: [
      { ppm: 7.88, integ: 1, mult: "dd", j: 8.0 },
      { ppm: 7.25, integ: 1, mult: "t", j: 7.8 },
      { ppm: 6.65, integ: 2, mult: "m" },
      { ppm: 5.75, integ: 2, mult: "br s" },
      { ppm: 4.32, integ: 2, mult: "q", j: 7.1 },
      { ppm: 1.38, integ: 3, mult: "t", j: 7.1 },
    ],
    keyC13Shifts: [168.1, 150.5, 134.0, 131.2, 116.7, 116.3, 111.0, 60.3, 14.3],
    keyMsBasePeak: 119,
  },
  {
    id: "lib-4-bromoacetophenone",
    name: "對溴苯乙酮 (4-Bromoacetophenone)",
    iupacName: "1-(4-bromophenyl)ethanone",
    smilesAliases: ["CC(=O)c1ccc(Br)cc1", "Brc1ccc(C(C)=O)cc1", "CC(=O)c1ccc(cc1)Br"],
    inchiPrefix: "InChI=1S/C8H7BrO/c1-6(10)7-2-4-8(9)5-3-7",
    formula: "C8H7BrO",
    pubchemCid: 7476,
    functionalGroups: ["共軛甲基酮 (Aryl-C(=O)CH₃)", "芳基溴 (Aryl-Br)", "對位雙取代芳香環"],
    symmetryFactor: "對位雙取代芳香環對稱性（AA'BB' 自旋系統，8 個碳呈現 6 組 ¹³C 訊號）",
    uniqueH: 3,
    uniqueC: 6,
    keyIrPeaks: [1685, 1586, 1396, 826, 590],
    keyH1Shifts: [
      { ppm: 7.82, integ: 2, mult: "d", j: 8.5 },
      { ppm: 7.61, integ: 2, mult: "d", j: 8.5 },
      { ppm: 2.59, integ: 3, mult: "s" },
    ],
    keyC13Shifts: [197.0, 135.8, 131.9, 129.8, 128.3, 26.5],
    keyMsBasePeak: 183,
  },
  {
    id: "lib-3-bromoacetophenone",
    name: "間溴苯乙酮 (3-Bromoacetophenone)",
    iupacName: "1-(3-bromophenyl)ethanone",
    smilesAliases: ["CC(=O)c1cccc(Br)c1"],
    inchiPrefix: "InChI=1S/C8H7BrO/c1-6(10)7-3-2-4-8(9)5-7",
    formula: "C8H7BrO",
    pubchemCid: 16509,
    functionalGroups: ["共軛甲基酮 (Aryl-C(=O)CH₃)", "芳基溴 (Aryl-Br)", "間位雙取代芳香環"],
    symmetryFactor: "間位雙取代無 C₂ 對稱（8 個碳呈現 8 組獨立 ¹³C 訊號）",
    uniqueH: 5,
    uniqueC: 8,
    keyIrPeaks: [1688, 1568, 1418, 785, 680],
    keyH1Shifts: [
      { ppm: 8.09, integ: 1, mult: "s" },
      { ppm: 7.88, integ: 1, mult: "d", j: 7.8 },
      { ppm: 7.69, integ: 1, mult: "d", j: 7.9 },
      { ppm: 7.36, integ: 1, mult: "t", j: 7.8 },
      { ppm: 2.60, integ: 3, mult: "s" },
    ],
    keyC13Shifts: [196.7, 138.8, 136.1, 131.4, 130.2, 126.9, 122.9, 26.6],
    keyMsBasePeak: 183,
  },
  {
    id: "lib-ibuprofen",
    name: "布洛芬 (Ibuprofen)",
    iupacName: "2-[4-(2-methylpropyl)phenyl]propanoic acid",
    smilesAliases: ["CC(C)Cc1ccc(cc1)C(C)C(=O)O", "CC(C)Cc1ccc(C(C)C(=O)O)cc1"],
    inchiPrefix: "InChI=1S/C13H18O2/c1-9(2)8-11-4-6-12(7-5-11)10(3)13(14)15",
    formula: "C13H18O2",
    pubchemCid: 3672,
    functionalGroups: ["羧酸基 (-COOH)", "對位雙取代芳香環", "異丁基與丙酸脂肪鏈"],
    symmetryFactor: "對位芳香環對稱 + 異丁基雙甲基等價（13 個碳呈現 10 組 ¹³C 訊號）",
    uniqueH: 8,
    uniqueC: 10,
    keyIrPeaks: [2955, 1712, 1510, 1420, 1232, 935],
    keyH1Shifts: [
      { ppm: 11.4, integ: 1, mult: "br s" },
      { ppm: 7.22, integ: 2, mult: "d", j: 8.1 },
      { ppm: 7.10, integ: 2, mult: "d", j: 8.1 },
      { ppm: 3.71, integ: 1, mult: "q", j: 7.2 },
      { ppm: 2.45, integ: 2, mult: "d", j: 7.2 },
      { ppm: 1.85, integ: 1, mult: "sept", j: 6.8 },
      { ppm: 1.49, integ: 3, mult: "d", j: 7.2 },
      { ppm: 0.90, integ: 6, mult: "d", j: 6.8 },
    ],
    keyC13Shifts: [181.2, 140.8, 137.0, 129.4, 127.3, 45.1, 45.0, 30.2, 22.4, 18.1],
    keyMsBasePeak: 161,
  },
  {
    id: "lib-pdms",
    name: "八甲基三矽氧烷 / 聚二甲基矽氧烷寡聚物 (PDMS Oligomer)",
    iupacName: "1,1,1,3,3,5,5,5-octamethyltrisiloxane",
    smilesAliases: ["C[Si](C)(C)O[Si](C)(C)O[Si](C)(C)C", "C[Si](C)(O[Si](C)(C)C)O[Si](C)(C)C"],
    inchiPrefix: "InChI=1S/C8H24O2Si3",
    formula: "C8H24O2Si3",
    pubchemCid: 24705,
    functionalGroups: ["矽氧烷主鏈 (Si-O-Si)", "矽甲基 (Si-CH₃)"],
    symmetryFactor: "高對稱性矽氧烷鏈（末端 M-unit 與中間 D-unit 兩種化學環境）",
    uniqueH: 2,
    uniqueC: 2,
    keyIrPeaks: [2963, 1261, 1085, 1022, 800],
    keyH1Shifts: [
      { ppm: 0.09, integ: 18, mult: "s" },
      { ppm: 0.05, integ: 6, mult: "s" },
    ],
    keyC13Shifts: [1.8, 1.1],
    keyMsBasePeak: 73,
  },
  {
    id: "lib-aspirin",
    name: "乙醯水楊酸 (Aspirin / Acetylsalicylic Acid)",
    iupacName: "2-acetoxybenzoic acid",
    smilesAliases: ["CC(=O)Oc1ccccc1C(=O)O", "O=C(O)c1ccccc1OC(C)=O"],
    inchiPrefix: "InChI=1S/C9H8O4/c1-6(10)13-8-5-3-2-4-7(8)9(11)12",
    formula: "C9H8O4",
    pubchemCid: 2244,
    functionalGroups: ["羧酸基 (-COOH)", "酚乙酸酯基 (-OCOCH₃)", "鄰位雙取代芳香環 (1,2-Disubstituted Benzene)"],
    symmetryFactor: "鄰位雙取代無對稱軸（4 個芳香氫互不等價，9 個碳呈現 9 組獨立 ¹³C 訊號）",
    uniqueH: 6,
    uniqueC: 9,
    keyIrPeaks: [2980, 1754, 1688, 1605, 1305, 1188, 756],
    keyH1Shifts: [
      { ppm: 11.2, integ: 1, mult: "br s" },
      { ppm: 8.12, integ: 1, mult: "dd", j: 7.8 },
      { ppm: 7.62, integ: 1, mult: "td", j: 7.8 },
      { ppm: 7.35, integ: 1, mult: "td", j: 7.6 },
      { ppm: 7.14, integ: 1, mult: "dd", j: 8.1 },
      { ppm: 2.35, integ: 3, mult: "s" },
    ],
    keyC13Shifts: [170.2, 169.7, 151.2, 134.8, 132.4, 126.1, 124.0, 122.4, 21.0],
    keyMsBasePeak: 120,
  },
  {
    id: "lib-4-acetoxybenzoic",
    name: "對乙醯氧基苯甲酸 (4-Acetoxybenzoic Acid)",
    iupacName: "4-acetoxybenzoic acid",
    smilesAliases: ["CC(=O)Oc1ccc(C(=O)O)cc1"],
    inchiPrefix: "InChI=1S/C9H8O4/c1-6(10)13-8-4-2-7(3-5-8)9(11)12",
    formula: "C9H8O4",
    pubchemCid: 16869,
    functionalGroups: ["羧酸基 (-COOH)", "酚乙酸酯基 (-OCOCH₃)", "對位雙取代芳香環 (1,4-Disubstituted Benzene)"],
    symmetryFactor: "C₂v 對位芳香環對稱性（AA'BB' 雙二重峰，9 個碳呈現 7 組 ¹³C 訊號）",
    uniqueH: 4,
    uniqueC: 7,
    keyIrPeaks: [2980, 1750, 1685, 1602, 1220, 845],
    keyH1Shifts: [
      { ppm: 11.5, integ: 1, mult: "br s" },
      { ppm: 8.05, integ: 2, mult: "d", j: 8.6 },
      { ppm: 7.21, integ: 2, mult: "d", j: 8.6 },
      { ppm: 2.32, integ: 3, mult: "s" },
    ],
    keyC13Shifts: [170.5, 168.9, 154.5, 131.6, 127.0, 121.8, 21.1],
    keyMsBasePeak: 138,
  },
];

export class ChemistryEngine {
  static parseFormulaCounts(formulaStr: string): Record<string, number> {
    const counts: Record<string, number> = {};
    const primaryToken = formulaStr.trim().split(/[\s(（\[]/)[0] || "";
    const cleaned = primaryToken.replace(/\s+/g, "");
    const regex = /([A-Z][a-z]?)(\d*)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(cleaned)) !== null) {
      const elem = match[1];
      const num = match[2] ? parseInt(match[2], 10) : 1;
      if (elem && ATOMIC_WEIGHTS[elem] !== undefined) {
        counts[elem] = (counts[elem] || 0) + num;
      }
    }
    return counts;
  }

  static formatFormula(counts: Record<string, number>): string {
    const order = ["C", "H", "Br", "Cl", "F", "I", "N", "O", "P", "S", "Si"];
    const parts: string[] = [];
    for (const el of order) {
      if (counts[el] && counts[el] > 0) {
        parts.push(counts[el] === 1 ? el : `${el}${counts[el]}`);
      }
    }
    return parts.join("");
  }

  static calculateMasses(counts: Record<string, number>): { mw: number; exactMass: number } {
    let mw = 0;
    let exactMass = 0;
    for (const [el, count] of Object.entries(counts)) {
      mw += (ATOMIC_WEIGHTS[el] || 0) * count;
      exactMass += (MONOISOTOPIC_MASSES[el] || 0) * count;
    }
    return {
      mw: Number(mw.toFixed(2)),
      exactMass: Number(exactMass.toFixed(4)),
    };
  }

  static calculateDBE(counts: Record<string, number>): number {
    const C = counts.C || 0;
    const Si = counts.Si || 0;
    const H = counts.H || 0;
    const halogens = (counts.F || 0) + (counts.Cl || 0) + (counts.Br || 0) + (counts.I || 0);
    const N = counts.N || 0;
    const P = counts.P || 0;
    if (C === 0 && Si === 0) return 0;
    const dbe = C + Si - (H + halogens) / 2 + (N + P) / 2 + 1;
    return Math.max(0, Number(dbe.toFixed(1)));
  }

  static detectFunctionalGroupsFromSmiles(smiles: string): string[] {
    const parsed = StructureParserAdapter.parseSmilesGraph(smiles);
    if (parsed.valid && parsed.graph) {
      return parsed.graph.detectedFunctionalGroups;
    }
    return [];
  }

  static estimateFormulaFromSmiles(smiles: string): Record<string, number> | null {
    const matched = KNOWN_STRUCTURAL_LIBRARY.find((k) =>
      k.smilesAliases.some((a) => a.toLowerCase() === smiles.trim().toLowerCase())
    );
    if (matched) {
      return this.parseFormulaCounts(matched.formula);
    }

    const parsed = StructureParserAdapter.parseSmilesGraph(smiles);
    if (!parsed.valid || !parsed.graph) {
      return null;
    }
    return parsed.graph.atomCounts;
  }

  static validateStructureIntegrity(structure: ParsedChemicalStructure): StructureIntegrityReport {
    const hasSmiles = Boolean(structure.smiles && structure.smiles.trim().length > 0);
    const graphRes = hasSmiles
      ? StructureParserAdapter.parseSmilesGraph(structure.smiles)
      : { valid: false };

    const smilesSyntaxValid = hasSmiles && graphRes.valid;
    const hasMolecularFormula = Boolean(
      structure.molecularFormula &&
        structure.molecularFormula !== "無法解析" &&
        Object.keys(structure.atomCounts || {}).length > 0
    );
    const exactMassValid = Number.isFinite(structure.exactMass) && structure.exactMass > 0;
    const molecularWeightValid =
      Number.isFinite(structure.molecularWeight) && structure.molecularWeight > 0;
    const dbeValid = Number.isFinite(structure.dbe) && structure.dbe >= -0.5;
    const formalCharge =
      structure.formalCharge ?? (graphRes.graph ? graphRes.graph.totalFormalCharge : 0);
    const elementCompositionValid =
      hasMolecularFormula &&
      Object.entries(structure.atomCounts).every(([el, n]) => el in ATOMIC_WEIGHTS && n >= 0);

    const isFormulaOnly = Boolean(structure.isFormulaOnly || !smilesSyntaxValid);
    const hasVerifiableConnectivity = smilesSyntaxValid && !structure.isFormulaOnly;
    const pubchemVerified = structure.pubchemStatus === "SUCCESS";
    const isInternalKnownCompound = KNOWN_STRUCTURAL_LIBRARY.some(
      (k) =>
        hasSmiles &&
        k.smilesAliases.some((a) => a.toLowerCase() === structure.smiles.trim().toLowerCase())
    );

    let statusSummaryZh = "結構已具備可驗證之原子連接性 (Verifiable Connectivity)";
    if (structure.parseFailed) {
      statusSummaryZh = structure.parseErrorMessage || "結構解析失敗，無有效化學資訊";
    } else if (!hasVerifiableConnectivity) {
      if (structure.inchi) {
        statusSummaryZh = "尚未取得可驗證 connectivity（僅含 InChI 與分子式）";
      } else {
        statusSummaryZh = "僅具分子式約束 (Formula-Only)，尚未取得可驗證 connectivity";
      }
    }

    return {
      smilesSyntaxValid,
      hasMolecularFormula,
      exactMassValid,
      molecularWeightValid,
      dbeValid,
      formalCharge,
      elementCompositionValid,
      isFormulaOnly,
      hasVerifiableConnectivity,
      pubchemVerified,
      isInternalKnownCompound,
      disconnectedComponentsCount: graphRes.graph?.disconnectedComponentsCount ?? 0,
      ringClosureCount: graphRes.graph?.ringClosureCount ?? 0,
      aromaticAtomCount: graphRes.graph?.aromaticAtomCount ?? 0,
      ringSubstitutionTopology: graphRes.graph?.ringSubstitutionTopology ?? "unknown",
      statusSummaryZh,
      integritySummaryZh: statusSummaryZh,
    };
  }

  static getIsomersForFormula(formula: string): KnownCompoundEntry[] {
    const clean = formula.trim();
    return KNOWN_STRUCTURAL_LIBRARY.filter((k) => k.formula === clean);
  }

  static parseStructureInput(
    input:
      | string
      | { smiles?: string; formula?: string; name?: string },
    method: "SMILES" | "InChI" | "Molecular Formula" | "Structure Sketch" | "Structure Image" = "SMILES"
  ): ParsedChemicalStructure {
    const rawStr =
      typeof input === "string"
        ? input
        : input?.smiles || input?.formula || "";
    const customName =
      typeof input === "object" && input !== null ? input.name : undefined;
    const effectiveMethod =
      typeof input === "object" && input !== null && !input.smiles && input.formula
        ? "Molecular Formula"
        : method;
    const trimmed = rawStr.trim();
    const parserAdapterStatus = StructureParserAdapter.getStatusLabel();

    const finalize = (raw: ParsedChemicalStructure): ParsedChemicalStructure => {
      const integrity = this.validateStructureIntegrity(raw);
      return {
        ...raw,
        name: customName || raw.name,
        formalCharge: integrity.formalCharge,
        hasVerifiableConnectivity: integrity.hasVerifiableConnectivity,
        integrity,
        structureIntegrity: integrity,
      };
    };

    const explicitlySmilesObject =
      typeof input === "object" &&
      input !== null &&
      Boolean(input.smiles && input.smiles.trim().length > 0);

    // Check if repeated uppercase element symbols appear without digits (e.g. "CCCC", "CCO", "COCCOC"), which is a SMILES chain, not a Hill molecular formula
    const elementTokens = trimmed.match(/[A-Z][a-z]?/g) || [];
    const hasDuplicateElementSymbols =
      new Set(elementTokens).size !== elementTokens.length;

    const looksLikeFormulaOnly =
      effectiveMethod === "Molecular Formula" ||
      (!explicitlySmilesObject &&
        /^[A-Z][a-z]?\d*([A-Z][a-z]?\d*)+$/.test(trimmed) &&
        !/[()=#c\[\]]/.test(trimmed) &&
        (!hasDuplicateElementSymbols || /\d/.test(trimmed)));

    if (looksLikeFormulaOnly) {
      const atomCounts = this.parseFormulaCounts(trimmed);
      const { mw, exactMass } = this.calculateMasses(atomCounts);
      const dbe = this.calculateDBE(atomCounts);
      const formatted = this.formatFormula(atomCounts);
      const isomers = this.getIsomersForFormula(formatted);

      if (!formatted || mw <= 0) {
        return finalize({
          name: "分子式無法解析",
          smiles: "",
          molecularFormula: "無法解析",
          molecularWeight: 0,
          exactMass: 0,
          dbe: 0,
          atomCounts: {},
          detectedFunctionalGroups: ["分子式格式無效"],
          symmetryFactor: "未知",
          uniqueProtonEnvironmentsCount: null,
          uniqueCarbonEnvironmentsCount: null,
          isFormulaOnly: true,
          parseFailed: true,
          parseErrorMessage: "分子式格式無法可靠解析，請輸入標準元素符號與數字（如 C8H8O2）。",
          parserAdapterStatus,
          pubchemStatus: "NOT_QUERIED",
          sourceMethod: "Molecular Formula",
        });
      }

      return finalize({
        name: `分子式輸入 (${formatted} — 含多種可能憲法異構物)`,
        smiles: "",
        molecularFormula: formatted,
        molecularWeight: mw,
        exactMass,
        dbe,
        atomCounts,
        detectedFunctionalGroups: [
          `不飽和度 DBE = ${dbe}（可對應芳香環或多重雙鍵/環系）`,
          isomers.length > 0
            ? `內建參考庫中包含 ${isomers.length} 個常見憲法異構物（如：${isomers
                .map((i) => i.name.split(" ")[0])
                .join("、")}）`
            : "需搭配 IR / NMR / MS 光譜約束方能決定連接性",
        ],
        symmetryFactor: "未知（單憑分子式無法決定分子對稱性）",
        uniqueProtonEnvironmentsCount: null,
        uniqueCarbonEnvironmentsCount: null,
        isFormulaOnly: true,
        formulaIsomerWarning:
          "此分子式可能對應多個異構物，目前無法唯一決定結構（尚未取得可驗證 connectivity）。",
        parserAdapterStatus,
        pubchemStatus: "NOT_QUERIED",
        sourceMethod: "Molecular Formula",
      });
    }

    const known = KNOWN_STRUCTURAL_LIBRARY.find(
      (k) =>
        k.smilesAliases.some((a) => a.toLowerCase() === trimmed.toLowerCase()) ||
        (trimmed.startsWith("InChI=") && trimmed.startsWith(k.inchiPrefix))
    );

    if (known) {
      const atomCounts = this.parseFormulaCounts(known.formula);
      const { mw, exactMass } = this.calculateMasses(atomCounts);
      const dbe = this.calculateDBE(atomCounts);
      return finalize({
        name: known.name,
        iupacName: known.iupacName,
        smiles: known.smilesAliases[0],
        inchi: `${known.inchiPrefix}`,
        molecularFormula: known.formula,
        molecularWeight: mw,
        exactMass,
        dbe,
        atomCounts,
        detectedFunctionalGroups: known.functionalGroups,
        symmetryFactor: known.symmetryFactor,
        uniqueProtonEnvironmentsCount: known.uniqueH,
        uniqueCarbonEnvironmentsCount: known.uniqueC,
        isFormulaOnly: false,
        parserAdapterStatus,
        pubchemCid: known.pubchemCid,
        pubchemUrl: `https://pubchem.ncbi.nlm.nih.gov/compound/${known.pubchemCid}`,
        pubchemStatus: "SUCCESS",
        sourceMethod: method,
      });
    }

    if (trimmed.startsWith("InChI=") || method === "InChI") {
      const parts = trimmed.split("/");
      const formulaPart = parts.length >= 2 ? parts[1] : "";
      const atomCounts = this.parseFormulaCounts(formulaPart);
      const formatted = this.formatFormula(atomCounts);

      if (!trimmed.startsWith("InChI=") || !formatted) {
        return finalize({
          name: "InChI 結構無法可靠解析",
          smiles: "",
          inchi: trimmed,
          molecularFormula: "無法解析",
          molecularWeight: 0,
          exactMass: 0,
          dbe: 0,
          atomCounts: {},
          detectedFunctionalGroups: ["尚未取得可驗證 connectivity"],
          symmetryFactor: "未知",
          uniqueProtonEnvironmentsCount: null,
          uniqueCarbonEnvironmentsCount: null,
          isFormulaOnly: true,
          parseFailed: true,
          parseErrorMessage: "尚未取得可驗證 connectivity（InChI 語法無效或缺少分子式層）。",
          parserAdapterStatus,
          pubchemStatus: "NOT_QUERIED",
          sourceMethod: "InChI",
        });
      }

      const { mw, exactMass } = this.calculateMasses(atomCounts);
      const dbe = this.calculateDBE(atomCounts);
      return finalize({
        name: `InChI 待驗證結構 (${formatted})`,
        smiles: "",
        inchi: trimmed,
        molecularFormula: formatted,
        molecularWeight: mw,
        exactMass,
        dbe,
        atomCounts,
        detectedFunctionalGroups: [
          "尚未取得可驗證 connectivity（需透過 PubChem 查詢轉換為 Canonical SMILES）。",
        ],
        symmetryFactor: "Unknown（尚未取得可驗證 connectivity）",
        uniqueProtonEnvironmentsCount: null,
        uniqueCarbonEnvironmentsCount: null,
        isFormulaOnly: true,
        formulaIsomerWarning: "尚未取得可驗證 connectivity",
        parserAdapterStatus,
        pubchemStatus: "NOT_QUERIED",
        pubchemMessage: "尚未取得可驗證 connectivity，正在查詢 PubChem...",
        sourceMethod: "InChI",
      });
    }

    const parsedGraphRes = StructureParserAdapter.parseSmilesGraph(trimmed);
    if (!parsedGraphRes.valid || !parsedGraphRes.graph) {
      return finalize({
        name: "SMILES 結構無法可靠解析",
        smiles: "",
        molecularFormula: "無法解析",
        molecularWeight: 0,
        exactMass: 0,
        dbe: 0,
        atomCounts: {},
        detectedFunctionalGroups: ["SMILES 結構無法可靠解析。"],
        symmetryFactor: "未知",
        uniqueProtonEnvironmentsCount: null,
        uniqueCarbonEnvironmentsCount: null,
        isFormulaOnly: false,
        parseFailed: true,
        parseErrorMessage: `SMILES 結構無法可靠解析（${parsedGraphRes.reason || "語法錯誤"}）。`,
        parserAdapterStatus,
        pubchemStatus: "NOT_QUERIED",
        sourceMethod: method,
      });
    }

    const graph = parsedGraphRes.graph;
    const atomCounts = graph.atomCounts;
    const molecularFormula = this.formatFormula(atomCounts);
    const { mw, exactMass } = this.calculateMasses(atomCounts);
    const dbe = this.calculateDBE(atomCounts);
    const detectedFunctionalGroups = graph.detectedFunctionalGroups;
    const isPara = graph.ringSubstitutionTopology === "1,4-para";
    const isMono = graph.ringSubstitutionTopology === "monosubstituted";
    const isUnsubstitutedPyridine =
      molecularFormula === "C5H5N" &&
      graph.aromaticAtomCount === 6 &&
      graph.atoms.some((a) => a.isAromatic && a.element === "N");

    let displayName = `SMILES 化學結構 (${molecularFormula})`;
    let symmetryFactor = "Unknown（一般分子結構 · 未對稱假設）";
    let uniqueH: number | null = null;
    let uniqueC: number | null = null;

    if (isUnsubstitutedPyridine) {
      displayName = "Pyridine (吡啶 · C5H5N)";
      symmetryFactor = "C₂v 對稱吡啶芳香雜環 (3 組等效 ¹H 環境 2H:1H:2H · 3 組等效 ¹³C 環境)";
      uniqueH = 3;
      uniqueC = 3;
    } else if (isPara) {
      symmetryFactor = "對位雙取代芳香環對稱性 (1,4-Para AA'BB' 自旋系統)";
      uniqueH = 4;
      uniqueC = Math.max(4, (atomCounts.C || 6) - 2);
    } else if (isMono) {
      symmetryFactor = "C₂v 單取代芳香環對稱性 (3 組芳香環氫 2H:2H:1H)";
      uniqueH = 3 + Math.max(0, (atomCounts.C || 6) - 6);
      uniqueC = Math.max(4, (atomCounts.C || 6) - 2);
    }

    return finalize({
      name: displayName,
      smiles: trimmed,
      molecularFormula,
      molecularWeight: mw,
      exactMass,
      dbe,
      formalCharge: graph.totalFormalCharge,
      atomCounts,
      detectedFunctionalGroups,
      symmetryFactor,
      uniqueProtonEnvironmentsCount: uniqueH,
      uniqueCarbonEnvironmentsCount: uniqueC,
      isFormulaOnly: false,
      parserAdapterStatus,
      pubchemStatus: "NOT_QUERIED",
      sourceMethod: method,
    });
  }

  static async enrichWithPubChem(
    structure: ParsedChemicalStructure
  ): Promise<ParsedChemicalStructure> {
    const finalize = (raw: ParsedChemicalStructure): ParsedChemicalStructure => {
      const integrity = this.validateStructureIntegrity(raw);
      return {
        ...raw,
        formalCharge: integrity.formalCharge,
        hasVerifiableConnectivity: integrity.hasVerifiableConnectivity,
        integrity,
        structureIntegrity: integrity,
      };
    };

    if (structure.parseFailed) {
      return finalize(structure);
    }

    if (structure.sourceMethod === "Molecular Formula" && !structure.inchi && !structure.smiles) {
      return finalize({
        ...structure,
        pubchemStatus: "NOT_QUERIED",
        pubchemMessage: "僅輸入分子式時不直接指定單一 PubChem 化合物。",
      });
    }

    if (!structure.smiles && !structure.inchi) {
      return finalize({
        ...structure,
        pubchemStatus: "NOT_QUERIED",
        pubchemMessage: "無可用於查詢之 SMILES 或 InChI。",
      });
    }

    try {
      const isInchiQuery = Boolean(structure.inchi && !structure.smiles);
      const query = isInchiQuery ? structure.inchi! : structure.smiles || structure.name;
      const type = isInchiQuery ? "inchi" : structure.smiles ? "smiles" : "name";

      const res = await fetch(
        `/api/pubchem/compound?q=${encodeURIComponent(query)}&type=${type}`
      );
      const data = await res.json();

      if (!res.ok || !data.found) {
        if (isInchiQuery) {
          return finalize({
            ...structure,
            smiles: "",
            isFormulaOnly: true,
            formulaIsomerWarning: "尚未取得可驗證 connectivity",
            pubchemStatus: data.pubchemStatus || "NOT_FOUND",
            pubchemMessage: "尚未取得可驗證 connectivity（PubChem 查無對應紀錄）。",
          });
        }
        return finalize({
          ...structure,
          pubchemStatus: data.pubchemStatus || "NOT_FOUND",
          pubchemMessage: data.message || "PubChem 查詢失敗或未找到對應化合物紀錄。",
        });
      }

      const canonicalSmiles = data.canonicalSmiles || structure.smiles || "";
      const atomCounts = this.parseFormulaCounts(
        data.molecularFormula || structure.molecularFormula
      );
      const dbe = this.calculateDBE(atomCounts);
      const detectedGroups = canonicalSmiles
        ? this.detectFunctionalGroupsFromSmiles(canonicalSmiles)
        : structure.detectedFunctionalGroups;

      return finalize({
        ...structure,
        name:
          (structure.name.startsWith("SMILES 化學結構") ||
            structure.name.startsWith("InChI 待驗證結構")) &&
          data.iupacName
            ? `${data.iupacName} (${data.molecularFormula})`
            : structure.name,
        iupacName: data.iupacName || structure.iupacName,
        smiles: canonicalSmiles,
        molecularFormula: data.molecularFormula || structure.molecularFormula,
        molecularWeight: data.molecularWeight || structure.molecularWeight,
        exactMass: data.exactMass || structure.exactMass,
        inchi: data.inchi || structure.inchi,
        detectedFunctionalGroups: detectedGroups,
        isFormulaOnly: !canonicalSmiles,
        formulaIsomerWarning: canonicalSmiles ? undefined : "尚未取得可驗證 connectivity",
        pubchemCid: data.cid,
        pubchemUrl: data.pubchemUrl,
        pubchemStatus: "SUCCESS",
        pubchemMessage: `已成功自 PubChem 驗證結構與連接性 (CID: ${data.cid})`,
        atomCounts,
        dbe,
      });
    } catch {
      if (structure.inchi && !structure.smiles) {
        return finalize({
          ...structure,
          smiles: "",
          isFormulaOnly: true,
          formulaIsomerWarning: "尚未取得可驗證 connectivity",
          pubchemStatus: "API_ERROR",
          pubchemMessage: "尚未取得可驗證 connectivity（PubChem 查詢失敗）。",
        });
      }
      return finalize({
        ...structure,
        pubchemStatus: "API_ERROR",
        pubchemMessage: "PubChem 查詢失敗（網路或服務異常，未使用任何假資料替代）。",
      });
    }
  }
}
import {canonicalizeMolecule, rdkitStatus} from './scientificEngines/rdkitAdapter';
