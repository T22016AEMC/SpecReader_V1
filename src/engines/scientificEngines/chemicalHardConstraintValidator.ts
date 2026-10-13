import {
  CandidateHardValidationResult,
  CandidateProtonConsistencyReport,
  H1NMRIntegrationSummary,
  ProtonEnvironment,
} from "../../types/spectrum";
import { ChemicalGraphValidator } from "../candidateGeneration/graphValidator";
import { StructureParserAdapter } from "../chemistryEngine";

const SUPPORTED_ORGANIC_EXACT_MASSES: Record<string, number> = {
  H: 1.007825,
  B: 11.009305,
  C: 12.0,
  N: 14.003074,
  O: 15.994915,
  F: 18.998403,
  Si: 27.976927,
  P: 30.973762,
  S: 31.972071,
  Cl: 34.968853,
  Br: 78.918338,
  I: 126.904473,
};

const SUPPORTED_ORGANIC_NOMINAL_MASSES: Record<string, number> = {
  H: 1,
  B: 11,
  C: 12,
  N: 14,
  O: 16,
  F: 19,
  Si: 28,
  P: 31,
  S: 32,
  Cl: 35,
  Br: 79,
  I: 127,
};

const KNOWN_UNSUPPORTED_ELEMENTS = new Set([
  "He",
  "Li",
  "Be",
  "Ne",
  "Na",
  "Mg",
  "Al",
  "Ar",
  "K",
  "Ca",
  "Sc",
  "Ti",
  "V",
  "Cr",
  "Mn",
  "Fe",
  "Co",
  "Ni",
  "Cu",
  "Zn",
  "Ga",
  "Ge",
  "As",
  "Se",
  "Kr",
  "Rb",
  "Sr",
  "Y",
  "Zr",
  "Nb",
  "Mo",
  "Tc",
  "Ru",
  "Rh",
  "Pd",
  "Ag",
  "Cd",
  "In",
  "Sn",
  "Sb",
  "Te",
  "Xe",
  "Cs",
  "Ba",
  "La",
  "Ce",
  "Pr",
  "Nd",
  "Pm",
  "Sm",
  "Eu",
  "Gd",
  "Tb",
  "Dy",
  "Ho",
  "Er",
  "Tm",
  "Yb",
  "Lu",
  "Hf",
  "Ta",
  "W",
  "Re",
  "Os",
  "Ir",
  "Pt",
  "Au",
  "Hg",
  "Tl",
  "Pb",
  "Bi",
  "Po",
  "At",
  "Rn",
  "Fr",
  "Ra",
  "Ac",
  "Th",
  "Pa",
  "U",
]);

const SUBSCRIPT_MAP: Record<string, string> = {
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
  "⁺": "+",
  "⁻": "-",
};

export class ChemicalHardConstraintValidator {
  /**
   * 將原子計數轉換為標準 Hill System 分子式 (C 優先，次為 H，其餘元素依字母排序)
   */
  static formatHillFormula(atomCounts: Record<string, number>): string {
    const keys = Object.keys(atomCounts).filter((k) => (atomCounts[k] || 0) > 0);
    if (keys.length === 0) return "";

    const parts: string[] = [];
    if ((atomCounts.C || 0) > 0) {
      parts.push(`C${atomCounts.C > 1 ? atomCounts.C : ""}`);
      if ((atomCounts.H || 0) > 0) {
        parts.push(`H${atomCounts.H > 1 ? atomCounts.H : ""}`);
      }
      const otherEls = keys
        .filter((k) => k !== "C" && k !== "H")
        .sort((a, b) => a.localeCompare(b));
      for (const el of otherEls) {
        const cnt = atomCounts[el];
        parts.push(`${el}${cnt > 1 ? cnt : ""}`);
      }
    } else {
      const sortedEls = keys.slice().sort((a, b) => a.localeCompare(b));
      for (const el of sortedEls) {
        const cnt = atomCounts[el];
        parts.push(`${el}${cnt > 1 ? cnt : ""}`);
      }
    }
    return parts.join("");
  }

  /**
   * 比較兩組原子計數是否完全相等
   */
  static areAtomCountsEqual(
    a: Record<string, number>,
    b: Record<string, number>
  ): boolean {
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of allKeys) {
      const ca = a[k] || 0;
      const cb = b[k] || 0;
      if (ca !== cb) return false;
    }
    return true;
  }

  /**
   * 計算一般中性有機分子的不飽和度 (DBE / IHD)
   * DBE = C + Si - (H + F + Cl + Br + I - B)/2 + (N + P)/2 + 1
   */
  static computeRawOrganicDBE(atomCounts: Record<string, number>): number {
    const c = (atomCounts.C || 0) + (atomCounts.Si || 0);
    const mono =
      (atomCounts.H || 0) +
      (atomCounts.F || 0) +
      (atomCounts.Cl || 0) +
      (atomCounts.Br || 0) +
      (atomCounts.I || 0);
    const tri = (atomCounts.N || 0) + (atomCounts.P || 0) + (atomCounts.B || 0);
    return c - mono / 2 + tri / 2 + 1;
  }

  /**
   * 解析並驗證化學分子式字串（支援括號、Unicode 下標、電荷標記與未知/不支援元素攔截）
   */
  static parseAndValidateFormula(
    rawInput: string
  ): CandidateHardValidationResult {
    const validationErrors: string[] = [];
    const validationWarnings: string[] = [];

    const normalizedChars = (rawInput || "")
      .trim()
      .split("")
      .map((ch) => SUBSCRIPT_MAP[ch] ?? ch)
      .join("")
      .replace(/\s+/g, "");

    if (!normalizedChars) {
      return {
        isValid: false,
        isSupported: false,
        computedFormula: "",
        declaredMatchesComputed: false,
        targetFormula: null,
        formulaMatch: "NOT_SPECIFIED",
        atomCounts: {},
        computedTotalProtons: 0,
        computedCarbonBoundProtons: 0,
        computedExchangeableProtons: 0,
        formalCharge: 0,
        dbe: null,
        chemicalSpeciesType: "INVALID_STRUCTURE",
        validationErrors: ["分子式輸入為空"],
        validationWarnings: [],
      };
    }

    // 檢查是否為鹽類/水合物點號或混合物
    if (normalizedChars.includes(".") || normalizedChars.includes("·")) {
      return {
        isValid: false,
        isSupported: false,
        computedFormula: "",
        declaredMatchesComputed: false,
        targetFormula: normalizedChars,
        formulaMatch: false,
        atomCounts: {},
        computedTotalProtons: 0,
        computedCarbonBoundProtons: 0,
        computedExchangeableProtons: 0,
        formalCharge: 0,
        dbe: null,
        chemicalSpeciesType: "METAL_OR_UNSUPPORTED",
        validationErrors: [
          `分子式「${rawInput}」包含鹽類、配位水合物或多組分混合物標記 (·/.)，超出單一中性有機分子推論支援範圍`,
        ],
        validationWarnings: [],
      };
    }

    // 提取末尾形式電荷（如 [C9H7O4]- 或 C9H7O4- 或 C5H6N+）
    let body = normalizedChars;
    let formalCharge = 0;
    const chargeMatch = body.match(/([+-]\d*|\d+[+-])$/);
    if (chargeMatch) {
      const token = chargeMatch[1];
      body = body.slice(0, body.length - token.length);
      if (token === "+") formalCharge = 1;
      else if (token === "-") formalCharge = -1;
      else if (token.startsWith("+"))
        formalCharge = parseInt(token.slice(1), 10) || 1;
      else if (token.startsWith("-"))
        formalCharge = -(parseInt(token.slice(1), 10) || 1);
      else if (token.endsWith("+"))
        formalCharge = parseInt(token.slice(0, -1), 10) || 1;
      else if (token.endsWith("-"))
        formalCharge = -(parseInt(token.slice(0, -1), 10) || 1);
    }

    if (body.startsWith("[") && body.endsWith("]")) {
      body = body.slice(1, -1);
    }

    // 遞迴括號展開器：支援如 CH3(CH2)2COOH 或 ((CH3)2CH)2O
    const stack: Record<string, number>[] = [{}];
    const openBrackets: string[] = [];
    const unsupportedEls: string[] = [];
    const unknownTokens: string[] = [];

    let idx = 0;
    while (idx < body.length) {
      const ch = body[idx];
      if (ch === "(" || ch === "[") {
        stack.push({});
        openBrackets.push(ch);
        idx++;
        continue;
      }
      if (ch === ")" || ch === "]") {
        const expectedOpen = ch === ")" ? "(" : "[";
        if (
          openBrackets.length === 0 ||
          openBrackets[openBrackets.length - 1] !== expectedOpen
        ) {
          validationErrors.push(`分子式「${rawInput}」括號不平衡`);
          break;
        }
        openBrackets.pop();
        const groupCounts = stack.pop()!;
        idx++;
        const numMatch = body.slice(idx).match(/^(\d+)/);
        let mult = 1;
        if (numMatch) {
          mult = parseInt(numMatch[1], 10);
          if (mult <= 0) {
            validationErrors.push(`分子式「${rawInput}」包含無效的 0 倍數括號`);
          }
          idx += numMatch[1].length;
        }
        const top = stack[stack.length - 1];
        for (const [el, cnt] of Object.entries(groupCounts)) {
          top[el] = (top[el] || 0) + cnt * mult;
        }
        continue;
      }

      const elemMatch = body.slice(idx).match(/^([A-Z][a-z]?)(\d*)/);
      if (!elemMatch) {
        unknownTokens.push(body.slice(idx));
        validationErrors.push(
          `分子式「${rawInput}」包含無法解析之語法或字元「${body.slice(idx)}」`
        );
        break;
      }

      const rawEl = elemMatch[1];
      const countStr = elemMatch[2];
      const count = countStr === "" ? 1 : parseInt(countStr, 10);

      if (countStr !== "" && (count <= 0 || /^0\d*/.test(countStr))) {
        validationErrors.push(
          `元素 ${rawEl} 的數量「${countStr}」不合法（必須為正整數）`
        );
      }

      const el = rawEl === "D" || rawEl === "T" ? "H" : rawEl;
      if (rawEl === "D" || rawEl === "T") {
        validationWarnings.push(`同位素標記 ${rawEl} 已併入氫原子數計算`);
      }

      if (el in SUPPORTED_ORGANIC_EXACT_MASSES) {
        const top = stack[stack.length - 1];
        top[el] = (top[el] || 0) + count;
      } else if (KNOWN_UNSUPPORTED_ELEMENTS.has(el)) {
        unsupportedEls.push(el);
        const top = stack[stack.length - 1];
        top[el] = (top[el] || 0) + count;
      } else {
        unknownTokens.push(rawEl);
        validationErrors.push(
          `分子式「${rawInput}」包含未知或無效的元素符號「${rawEl}」`
        );
      }

      idx += elemMatch[0].length;
    }

    if (openBrackets.length > 0) {
      validationErrors.push(`分子式「${rawInput}」存在未閉合之左括號`);
    }

    const atomCounts = stack[0] || {};
    const computedFormula = this.formatHillFormula(atomCounts);

    if (unsupportedEls.length > 0) {
      return {
        isValid: false,
        isSupported: false,
        computedFormula,
        declaredFormula: rawInput,
        declaredMatchesComputed: false,
        targetFormula: computedFormula || rawInput,
        formulaMatch: false,
        atomCounts,
        computedTotalProtons: atomCounts.H || 0,
        computedCarbonBoundProtons: 0,
        computedExchangeableProtons: 0,
        formalCharge,
        dbe: null,
        chemicalSpeciesType: "METAL_OR_UNSUPPORTED",
        validationErrors: [
          ...validationErrors,
          `分子式包含目前不支援一般中性有機價數驗證之金屬或無機元素 (${Array.from(new Set(unsupportedEls)).join(", ")})，系統不以固定 C/H/N/O 假設強行推論`,
        ],
        validationWarnings,
      };
    }

    if (formalCharge !== 0) {
      return {
        isValid: false,
        isSupported: false,
        computedFormula,
        declaredFormula: rawInput,
        declaredMatchesComputed: true,
        targetFormula: computedFormula,
        formulaMatch: false,
        atomCounts,
        computedTotalProtons: atomCounts.H || 0,
        computedCarbonBoundProtons: 0,
        computedExchangeableProtons: 0,
        formalCharge,
        dbe: null,
        chemicalSpeciesType: "CHARGED_SPECIES",
        validationErrors: [
          ...validationErrors,
          `分子式帶有淨形式電荷 (${formalCharge > 0 ? `+${formalCharge}` : formalCharge})，屬於帶電離子物種，不可直接套用一般中性有機分子價數與 DBE 規則`,
        ],
        validationWarnings,
      };
    }

    if ((atomCounts.C || 0) === 0 && (atomCounts.Si || 0) === 0) {
      validationErrors.push(
        `分子式「${rawInput}」不含碳 (C) 或矽 (Si) 骨架原子，非標準有機分子式`
      );
    }

    const rawDbe = this.computeRawOrganicDBE(atomCounts);
    let dbe: number | null = null;
    let chemicalSpeciesType: CandidateHardValidationResult["chemicalSpeciesType"] =
      "NEUTRAL_ORGANIC";

    if (Math.abs(rawDbe - Math.round(rawDbe)) > 0.01) {
      chemicalSpeciesType = "RADICAL_OR_IONIC";
      validationErrors.push(
        `分子式 ${computedFormula} 計算之不飽和度為半整數 (DBE = ${rawDbe.toFixed(1)})，違反中性偶電子有機分子奇偶價數規則（可能為自由基或離子碎片）`
      );
    } else if (rawDbe < 0) {
      chemicalSpeciesType = "INVALID_STRUCTURE";
      validationErrors.push(
        `分子式 ${computedFormula} 計算之不飽和度為負值 (DBE = ${rawDbe})，氫與鹵素總數超出最大飽和共價鍵上限`
      );
    } else {
      dbe = Math.round(rawDbe);
    }

    let exactMass = 0;
    let nominalMass = 0;
    for (const [el, cnt] of Object.entries(atomCounts)) {
      exactMass += (SUPPORTED_ORGANIC_EXACT_MASSES[el] || 0) * cnt;
      nominalMass += (SUPPORTED_ORGANIC_NOMINAL_MASSES[el] || 0) * cnt;
    }

    const isValid =
      validationErrors.length === 0 &&
      unknownTokens.length === 0 &&
      dbe !== null &&
      dbe >= 0;

    return {
      isValid,
      isSupported: unsupportedEls.length === 0 && formalCharge === 0,
      computedFormula,
      normalizedFormula: computedFormula,
      declaredFormula: rawInput,
      declaredMatchesComputed: isValid,
      targetFormula: isValid ? computedFormula : rawInput,
      formulaMatch: isValid ? true : false,
      atomCounts,
      computedTotalProtons: atomCounts.H || 0,
      computedCarbonBoundProtons: atomCounts.H || 0,
      computedExchangeableProtons: 0,
      formalCharge,
      dbe,
      exactMass: Number(exactMass.toFixed(4)),
      nominalMass,
      chemicalSpeciesType: isValid ? chemicalSpeciesType : "INVALID_STRUCTURE",
      validationErrors,
      validationWarnings,
    };
  }

  /**
   * 從候選結構的實際 SMILES 計算元素組成、總氫數、碳上氫數、交換性氫數、形式電荷與不飽和度，
   * 並與候選宣告分子式及使用者明確輸入的目標分子式進行硬性比對。
   */
  static validateCandidateStructure(
    smiles: string,
    declaredFormula?: string | null,
    targetFormula?: string | null,
    h1Summary?: H1NMRIntegrationSummary | null,
    nmrSolvent?: string | null
  ): CandidateHardValidationResult {
    const validationErrors: string[] = [];
    const validationWarnings: string[] = [];
    const cleanSmiles = (smiles || "").trim();

    if (!cleanSmiles) {
      return {
        isValid: false,
        isSupported: false,
        computedFormula: "",
        declaredFormula: declaredFormula || undefined,
        declaredMatchesComputed: false,
        targetFormula: targetFormula || null,
        formulaMatch: targetFormula ? false : "NOT_SPECIFIED",
        atomCounts: {},
        computedTotalProtons: 0,
        computedCarbonBoundProtons: 0,
        computedExchangeableProtons: 0,
        formalCharge: 0,
        dbe: null,
        chemicalSpeciesType: "INVALID_STRUCTURE",
        validationErrors: ["候選結構 SMILES 為空"],
        validationWarnings: [],
      };
    }

    const graphRes = StructureParserAdapter.parseSmilesGraph(cleanSmiles);
    if (!graphRes.valid || !graphRes.graph) {
      const reason = graphRes.reason || "無法解析 SMILES 分子圖";
      const isUnsupportedElem = reason.includes("不支援或未知的元素符號");
      return {
        isValid: false,
        isSupported: !isUnsupportedElem,
        computedFormula: "",
        declaredFormula: declaredFormula || undefined,
        declaredMatchesComputed: false,
        targetFormula: targetFormula || null,
        formulaMatch: targetFormula ? false : "NOT_SPECIFIED",
        atomCounts: {},
        computedTotalProtons: 0,
        computedCarbonBoundProtons: 0,
        computedExchangeableProtons: 0,
        formalCharge: 0,
        dbe: null,
        chemicalSpeciesType: isUnsupportedElem
          ? "METAL_OR_UNSUPPORTED"
          : "INVALID_STRUCTURE",
        validationErrors: [`SMILES 解析失敗：${reason}`],
        validationWarnings: [],
      };
    }

    const graph = graphRes.graph;

    // 1. 檢查是否含不支援之金屬或鹽類元素 (如 Na, K)
    const unsupportedGraphEls = Object.keys(graph.atomCounts).filter(
      (el) => !(el in SUPPORTED_ORGANIC_EXACT_MASSES)
    );
    if (unsupportedGraphEls.length > 0) {
      return {
        isValid: false,
        isSupported: false,
        computedFormula: this.formatHillFormula(graph.atomCounts),
        declaredFormula: declaredFormula || undefined,
        declaredMatchesComputed: false,
        targetFormula: targetFormula || null,
        formulaMatch: targetFormula ? false : "NOT_SPECIFIED",
        atomCounts: graph.atomCounts,
        computedTotalProtons: graph.atomCounts.H || 0,
        computedCarbonBoundProtons: 0,
        computedExchangeableProtons: 0,
        formalCharge: graph.totalFormalCharge,
        dbe: null,
        chemicalSpeciesType: "METAL_OR_UNSUPPORTED",
        validationErrors: [
          `SMILES 結構包含不支援一般中性有機驗證之金屬或無機離子 (${unsupportedGraphEls.join(", ")})`,
        ],
        validationWarnings: [],
      };
    }

    // 2. 檢查連通性（BFS 驗證是否真正單一連通圖）
    if (graph.disconnectedComponentsCount > 1 || cleanSmiles.includes(".")) {
      validationErrors.push(
        "候選結構包含不連通的離散碎片或混合物 (Disconnected components)"
      );
    } else if (graph.atoms.length > 1) {
      const visited = new Set<number>([0]);
      const queue = [0];
      while (queue.length > 0) {
        const u = queue.shift()!;
        for (const nb of graph.atoms[u].neighbors) {
          if (!visited.has(nb.toAtom)) {
            visited.add(nb.toAtom);
            queue.push(nb.toAtom);
          }
        }
      }
      if (visited.size !== graph.atoms.length) {
        validationErrors.push("分子圖拓撲非單一連通圖");
      }
    }

    // 3. 檢查形式電荷與每個原子的價數、統計碳鍵結氫與可交換活潑氫
    let computedCarbonBoundProtons = 0;
    let computedExchangeableProtons = 0;
    let hasChargedAtoms = false;

    for (const atom of graph.atoms) {
      if (atom.formalCharge !== 0) {
        hasChargedAtoms = true;
      }
      const bondSum = Math.round(
        atom.neighbors.reduce((acc, nb) => acc + nb.order, 0)
      );
      const totalValence = bondSum + atom.totalHydrogens;

      if (atom.element === "C") {
        computedCarbonBoundProtons += atom.totalHydrogens;
        if (atom.formalCharge === 0 && totalValence !== 4) {
          validationErrors.push(
            `碳原子 (#${atom.index + 1}) 總鍵數 (${totalValence}) 違反標準四價規則`
          );
        } else if (atom.formalCharge !== 0 && totalValence > 4) {
          validationErrors.push(
            `碳原子 (#${atom.index + 1}) 超出最大四價限制 (valence=${totalValence})`
          );
        }
      } else if (atom.element === "O") {
        computedExchangeableProtons += atom.totalHydrogens;
        const expectedValence = 2 + atom.formalCharge;
        if (totalValence !== expectedValence) {
          validationErrors.push(
            `氧原子 (#${atom.index + 1}) 價數 (${totalValence}) 違反規則 (預期 ${expectedValence})`
          );
        }
      } else if (atom.element === "N") {
        computedExchangeableProtons += atom.totalHydrogens;
        const allowedValences =
          atom.formalCharge === 1
            ? [4]
            : atom.formalCharge === -1
              ? [2]
              : [3, 5];
        if (!allowedValences.includes(totalValence)) {
          validationErrors.push(
            `氮原子 (#${atom.index + 1}) 價數 (${totalValence}) 異常`
          );
        }
      } else if (atom.element === "S") {
        computedExchangeableProtons += atom.totalHydrogens;
        if (![2, 4, 6].includes(totalValence - atom.formalCharge)) {
          validationErrors.push(
            `硫原子 (#${atom.index + 1}) 價數 (${totalValence}) 異常`
          );
        }
      } else if (["F", "Cl", "Br", "I"].includes(atom.element)) {
        if (totalValence !== 1 || atom.formalCharge !== 0) {
          validationErrors.push(
            `鹵素原子 (${atom.element} #${atom.index + 1}) 價數 (${totalValence}) 必須為 1`
          );
        }
      } else {
        computedCarbonBoundProtons += atom.totalHydrogens;
      }
    }

    const computedTotalProtons =
      computedCarbonBoundProtons + computedExchangeableProtons;
    const atomCounts: Record<string, number> = {
      ...graph.atomCounts,
    };
    if (computedTotalProtons > 0) {
      atomCounts.H = computedTotalProtons;
    } else {
      delete atomCounts.H;
    }

    const computedFormula = this.formatHillFormula(atomCounts);

    // 4. 檢查淨形式電荷與物種分類
    let chemicalSpeciesType: CandidateHardValidationResult["chemicalSpeciesType"] =
      hasChargedAtoms && graph.totalFormalCharge === 0
        ? "ZWITTERIONIC_NEUTRAL"
        : "NEUTRAL_ORGANIC";

    if (graph.totalFormalCharge !== 0) {
      chemicalSpeciesType = "CHARGED_SPECIES";
      validationWarnings.push('合法帶電物種；需指定離子／加合條件，不能按中性分子預設解讀質譜。');
    }

    // 5. 計算並檢驗 DBE
    const rawDbe = this.computeRawOrganicDBE(atomCounts) + graph.totalFormalCharge / 2;
    let dbe: number | null = null;
    if (Math.abs(rawDbe - Math.round(rawDbe)) > 0.01) {
      chemicalSpeciesType = "RADICAL_OR_IONIC";
      validationErrors.push(
        `候選結構計算之不飽和度為半整數 (DBE = ${rawDbe.toFixed(1)})，非閉殼層中性有機分子`
      );
    } else if (rawDbe < 0) {
      chemicalSpeciesType = "INVALID_STRUCTURE";
      validationErrors.push(`候選結構計算之不飽和度為負值 (DBE = ${rawDbe})`);
    } else {
      dbe = Math.round(rawDbe);
    }

    // 6. 檢驗候選宣告之分子式是否與實際 SMILES 計算出的分子式一致 (Requirement B1 & G5)
    let declaredMatchesComputed = true;
    if (declaredFormula && declaredFormula.trim()) {
      const parsedDeclared = this.parseAndValidateFormula(declaredFormula);
      if (
        (!parsedDeclared.isValid && graph.totalFormalCharge===0) ||
        parsedDeclared.computedFormula !== computedFormula ||
        !this.areAtomCountsEqual(parsedDeclared.atomCounts, atomCounts)
      ) {
        declaredMatchesComputed = false;
        validationErrors.push(
          `候選宣告分子式 (${declaredFormula.trim()}) 與實際 SMILES 結構計算出的分子式 (${computedFormula}) 不一致`
        );
      }
    }

    // 7. 與使用者明確輸入的目標分子式進行硬性比對 (Requirement B2, C1-C6, G1-G4)
    let normalizedTarget: string | null = null;
    let formulaMatch: boolean | "NOT_SPECIFIED" = "NOT_SPECIFIED";

    if (targetFormula && targetFormula.trim()) {
      const parsedTarget = this.parseAndValidateFormula(targetFormula);
      normalizedTarget = parsedTarget.computedFormula || targetFormula.trim();
      if ((!parsedTarget.isValid && graph.totalFormalCharge===0) || !parsedTarget.isSupported) {
        formulaMatch = false;
        validationErrors.push(
          `目標分子式 (${targetFormula.trim()}) 本身格式無效或不支援驗證：${parsedTarget.validationErrors.join("；")}`
        );
      } else if (
        computedFormula !== parsedTarget.computedFormula ||
        !this.areAtomCountsEqual(atomCounts, parsedTarget.atomCounts)
      ) {
        formulaMatch = false;
        validationErrors.push(
          `實際結構計算分子式 (${computedFormula}) 與使用者指定目標分子式 (${parsedTarget.computedFormula}) 不符`
        );
      } else {
        formulaMatch = true;
      }
    }

    let exactMass = 0;
    let nominalMass = 0;
    for (const [el, cnt] of Object.entries(atomCounts)) {
      exactMass += (SUPPORTED_ORGANIC_EXACT_MASSES[el] || 0) * cnt;
      nominalMass += (SUPPORTED_ORGANIC_NOMINAL_MASSES[el] || 0) * cnt;
    }

    const isSupported =
      chemicalSpeciesType === "NEUTRAL_ORGANIC" ||
      chemicalSpeciesType === "ZWITTERIONIC_NEUTRAL" || chemicalSpeciesType === "CHARGED_SPECIES";
    let isValid =
      isSupported &&
      validationErrors.length === 0 &&
      declaredMatchesComputed &&
      (formulaMatch === true || formulaMatch === "NOT_SPECIFIED");

    const wlCheck = ChemicalGraphValidator.validateCandidateSmiles(cleanSmiles);
    const canonicalSig =
      wlCheck.valid && wlCheck.graph
        ? ChemicalGraphValidator.computeCanonicalGraphSignature(
            wlCheck.graph,
            cleanSmiles
          )
        : cleanSmiles;

    const baseResult: CandidateHardValidationResult = {
      isValid,
      isSupported,
      computedFormula,
      normalizedFormula: computedFormula,
      declaredFormula: declaredFormula || undefined,
      declaredMatchesComputed,
      targetFormula: normalizedTarget,
      formulaMatch,
      atomCounts,
      computedTotalProtons,
      computedCarbonBoundProtons,
      computedExchangeableProtons,
      formalCharge: graph.totalFormalCharge,
      dbe,
      exactMass: Number(exactMass.toFixed(4)),
      nominalMass,
      canonicalSignature: canonicalSig || cleanSmiles,
      cleanSmiles,
      chemicalSpeciesType:
        validationErrors.length > 0 && chemicalSpeciesType === "NEUTRAL_ORGANIC"
          ? "INVALID_STRUCTURE"
          : chemicalSpeciesType,
      validationErrors,
      validationWarnings,
    };

    const protonConsistency = this.evaluateCandidateProtonConsistency(
      baseResult,
      h1Summary,
      nmrSolvent || undefined
    );
    baseResult.protonConsistency = protonConsistency;
    if (h1Summary && protonConsistency.disposition === "HARD_REJECT") {
      baseResult.isValid = false;
      baseResult.validationErrors.push(
        ...protonConsistency.inconsistencyReasons
      );
    }

    return baseResult;
  }

  /**
   * 便利方法：由簡易訊號陣列建立 ¹H NMR 積分語意摘要與正規化後之環境陣列
   */
  static analyzeH1NMRIntegrals(
    signals: Array<{
      id?: string;
      shift?: number;
      shiftPpm?: number;
      integration?: number | null;
      rawIntegralValue?: number | null;
      multiplicity?: string | null;
      assignment?: string;
      environmentLabel?: string;
    }>,
    targetFormula?: string | null,
    _solvent?: string | null
  ): {
    summary: H1NMRIntegrationSummary;
    environments: ProtonEnvironment[];
  } {
    const targetCounts = targetFormula
      ? this.parseAndValidateFormula(targetFormula).atomCounts
      : null;
    const envs: ProtonEnvironment[] = signals.map((s, idx) => {
      const shiftVal = s.shiftPpm ?? s.shift ?? 0;
      const integ = s.rawIntegralValue ?? s.integration ?? null;
      return {
        id: s.id || `env-${idx}`,
        environmentLabel: s.environmentLabel || s.assignment || "H",
        shiftPpm: shiftVal,
        expectedShiftRange: [shiftVal - 0.1, shiftVal + 0.1],
        integration: integ,
        rawIntegralValue: integ,
        multiplicity: s.multiplicity ?? "s",
        jCouplingHz: [],
        regionCategory: shiftVal >= 6.5 ? "Aromatic" : "Aliphatic",
        symmetryNote: "",
        modelType: "EMPIRICAL" as any,
        confidence: 90,
        reasoning: s.environmentLabel || s.assignment || "",
      };
    });
    const summary = this.analyzeH1NMRIntegrationSemantics(
      envs,
      false,
      false,
      targetCounts
    );
    return {
      summary,
      environments: envs,
    };
  }

  static summarizeH1NMRIntegrations(
    signals: Array<{
      shift: number;
      integration?: number | null;
      multiplicity?: string | null;
      assignment?: string;
    }>,
    targetFormula?: string | null,
    solvent?: string | null
  ): H1NMRIntegrationSummary {
    return this.analyzeH1NMRIntegrals(signals, targetFormula, solvent).summary;
  }

  static evaluateProtonCountConsistency(
    candidateSmiles: string,
    targetFormula: string | null | undefined,
    h1Summary?: H1NMRIntegrationSummary | null,
    solvent?: string | null
  ): CandidateProtonConsistencyReport {
    const hardVal = this.validateCandidateStructure(
      candidateSmiles,
      undefined,
      targetFormula
    );
    return this.evaluateCandidateProtonConsistency(
      hardVal,
      h1Summary,
      solvent || undefined
    );
  }

  /**
   * Section D1: 解析並正規化 ¹H NMR 積分資訊，嚴格區分：
   * - 原始峰積分值 (rawIntegralValue)
   * - 使用者輸入的相對積分比 (userRelativeRatio)
   * - 經正規化的積分比例 (normalizedIntegralRatio)
   * - 推算的絕對氫數 (inferredProtonCount)
   * - 交換性活潑氫與重疊/不確定訊號
   */
  static analyzeH1NMRIntegrationSemantics(
    environments: ProtonEnvironment[],
    isImageSpectrum: boolean,
    hasOverlapPeaks: boolean = false,
    targetFormulaAtomCounts?: Record<string, number> | null,
    solvent?: import("../../types/spectrum").NMRSolvent,
    absoluteIntegrationConfirmed = false
  ): H1NMRIntegrationSummary {
    const totalAnalyteSignalCount = environments.length;
    if (totalAnalyteSignalCount === 0) {
      return {
        integralDataMode: "NOT_PROVIDED",
        completenessLevel: "UNAVAILABLE",
        rawIntegralValues: [],
        rawIntegralSum: null,
        userRelativeRatios: [],
        normalizedRatios: [],
        normalizedRatioSummary: "無有效 ¹H NMR 分析物訊號",
        inferredMinimumProtonUnitSum: null,
        minimumIntegerProtonSum: 0,
        inferredTotalProtons: null,
        estimatedTotalProtons: null,
        plausibleTotalProtonMultiples: [],
        nonExchangeableProtonSum: null,
        exchangeableProtonSum: 0,
        exchangeableSignalCount: 0,
        overlapOrUncertainSignalCount: 0,
        missingIntegralSignalCount: 0,
        totalAnalyteSignalCount: 0,
        isAlreadyNormalized: false,
        canDetermineAbsoluteProtonCount: false,
        exchangeableProtonNote: "",
        symmetryAndOverlapNote: "",
        uncertaintyReasons: ["尚未提供有效 ¹H NMR 訊號"],
        perEnvironmentProtons: [],
        diagnostics: ["尚未提供有效 ¹H NMR 訊號"],
      };
    }

    const uncertaintyReasons: string[] = [];
    const rawIntegralValues: (number | null)[] = [];
    let missingIntegralSignalCount = 0;
    let overlapOrUncertainSignalCount = 0;
    let exchangeableSignalCount = 0;

    for (const env of environments) {
      const rawVal = env.rawIntegralValue ?? env.integration;
      const isValidPositive =
        rawVal !== null &&
        rawVal !== undefined &&
        Number.isFinite(rawVal) &&
        rawVal > 0;

      const isExch =
        env.isExchangeable ??
        (env.shiftPpm >= 9.0 &&
          (env.environmentLabel.includes("羧酸") ||
            env.environmentLabel.includes("酚") ||
            env.environmentLabel.includes("醇") ||
            env.environmentLabel.includes("醯胺") ||
            env.environmentLabel.includes("活潑") ||
            env.environmentLabel.includes("-OH") ||
            env.environmentLabel.includes("-NH") ||
            env.environmentLabel.includes("-COOH") ||
            /OH|NH|SH|COOH|exchangeable|broad/i.test(env.environmentLabel)));
      env.isExchangeable = isExch;
      if (isExch) exchangeableSignalCount++;

      const isUncertain =
        env.isOverlapOrUncertain ??
        (isImageSpectrum && !isValidPositive) ??
        (env.multiplicity === "unresolved" && !isValidPositive);
      env.isOverlapOrUncertain = isUncertain;
      if (isUncertain) overlapOrUncertainSignalCount++;

      if (!isValidPositive) {
        rawIntegralValues.push(null);
        env.rawIntegralValue = null;
        env.userRelativeRatio = null;
        env.normalizedIntegralRatio = null;
        env.inferredProtonCount = null;
        missingIntegralSignalCount++;
      } else {
        const cleanVal = Number(rawVal);
        rawIntegralValues.push(cleanVal);
        env.rawIntegralValue = cleanVal;
      }
    }

    if (hasOverlapPeaks) {
      overlapOrUncertainSignalCount = Math.max(1, overlapOrUncertainSignalCount);
      uncertaintyReasons.push("存在重疊峰 (OVERLAP)，個別峰積分可能包含多組自旋系統");
    }

    const validNums = rawIntegralValues.filter(
      (v): v is number => v !== null && v > 0
    );

    if (validNums.length === 0) {
      uncertaintyReasons.push("所有 ¹H NMR 訊號均未提供有效正值積分");
      return {
        integralDataMode: "NOT_PROVIDED",
        completenessLevel: "UNAVAILABLE",
        rawIntegralValues,
        rawIntegralSum: null,
        userRelativeRatios: rawIntegralValues.map(() => null),
        normalizedRatios: rawIntegralValues.map(() => null),
        normalizedRatioSummary: "未提供積分數值",
        inferredMinimumProtonUnitSum: null,
        minimumIntegerProtonSum: 0,
        inferredTotalProtons: null,
        estimatedTotalProtons: null,
        plausibleTotalProtonMultiples: [],
        nonExchangeableProtonSum: null,
        exchangeableProtonSum: 0,
        exchangeableSignalCount,
        overlapOrUncertainSignalCount,
        missingIntegralSignalCount,
        totalAnalyteSignalCount,
        isAlreadyNormalized: false,
        canDetermineAbsoluteProtonCount: false,
        exchangeableProtonNote: "",
        symmetryAndOverlapNote: "",
        uncertaintyReasons,
        perEnvironmentProtons: [],
        diagnostics: uncertaintyReasons,
      };
    }

    const rawIntegralSum = Number(
      validNums.reduce((acc, v) => acc + v, 0).toFixed(4)
    );

    // 若僅部分訊號提供積分，標記為 PARTIAL_OR_INCOMPLETE，絕不假裝能得出絕對總氫數
    if (missingIntegralSignalCount > 0) {
      uncertaintyReasons.push(
        `共有 ${missingIntegralSignalCount}/${totalAnalyteSignalCount} 組訊號缺少積分值，僅能作為局部相對訊號參考，無法決定分子絕對總氫數`
      );
      const minVal = Math.min(...validNums);
      const normalizedRatios = rawIntegralValues.map((v) =>
        v !== null ? Number((v / minVal).toFixed(2)) : null
      );
      environments.forEach((env, idx) => {
        env.userRelativeRatio = rawIntegralValues[idx];
        env.normalizedIntegralRatio = normalizedRatios[idx];
        env.inferredProtonCount = null;
      });

      const partialMinSum = Math.round(
        normalizedRatios.reduce<number>((acc, r) => acc + (r ?? 0), 0)
      );

      return {
        integralDataMode: "PARTIAL_OR_INCOMPLETE",
        completenessLevel: "PARTIAL_UNCERTAIN",
        rawIntegralValues,
        rawIntegralSum,
        userRelativeRatios: [...rawIntegralValues],
        normalizedRatios,
        normalizedRatioSummary: `部分積分 (${validNums.join(" : ")})，尚有 ${missingIntegralSignalCount} 組訊號未積分`,
        inferredMinimumProtonUnitSum: partialMinSum,
        minimumIntegerProtonSum: partialMinSum,
        inferredTotalProtons: null,
        estimatedTotalProtons: null,
        plausibleTotalProtonMultiples: [partialMinSum],
        nonExchangeableProtonSum: null,
        exchangeableProtonSum: 0,
        exchangeableSignalCount,
        overlapOrUncertainSignalCount,
        missingIntegralSignalCount,
        totalAnalyteSignalCount,
        isAlreadyNormalized: false,
        canDetermineAbsoluteProtonCount: false,
        exchangeableProtonNote: "",
        symmetryAndOverlapNote: uncertaintyReasons.join("；"),
        uncertaintyReasons,
        perEnvironmentProtons: [],
        diagnostics: uncertaintyReasons,
      };
    }

    // 全部訊號皆有正值積分：檢查是否為「已正規化整數氫數」或「相對積分比 / 原始面積」
    const allNearIntegers = validNums.every(
      (v) => Math.abs(v - Math.round(v)) <= 0.15 && Math.round(v) >= 1
    );
    const roundedInts = validNums.map((v) => Math.max(1, Math.round(v)));

    const gcdTwo = (a: number, b: number): number =>
      b === 0 ? a : gcdTwo(b, a % b);
    const overallGcd = roundedInts.reduce((acc, v) => gcdTwo(acc, v), roundedInts[0]);

    // 根據最小基準值尋找最簡整數比 (1..6 倍嘗試)
    const minRaw = Math.min(...validNums);
    const baseRatios = validNums.map((v) => v / minRaw);
    let bestMult = 1;
    for (const m of [1, 2, 3, 4, 5, 6]) {
      if (
        baseRatios.every((r) => Math.abs(r * m - Math.round(r * m)) <= 0.16)
      ) {
        bestMult = m;
        break;
      }
    }
    const reducedIntegerRatios = baseRatios.map((r) =>
      Math.max(1, Math.round(r * bestMult))
    );
    const inferredMinimumProtonUnitSum = reducedIntegerRatios.reduce(
      (a, b) => a + b,
      0
    );
    const plausibleTotalProtonMultiples = [
      inferredMinimumProtonUnitSum,
      inferredMinimumProtonUnitSum * 2,
      inferredMinimumProtonUnitSum * 3,
      inferredMinimumProtonUnitSum * 4,
    ];

    const targetH = targetFormulaAtomCounts?.H ?? null;
    const isSubMultipleOfTargetH =
      targetH !== null &&
      inferredMinimumProtonUnitSum > 0 &&
      inferredMinimumProtonUnitSum < targetH &&
      targetH % inferredMinimumProtonUnitSum === 0;

    const hasAromaticSignals = environments.some(
      (e) => e.shiftPpm >= 6.4 && e.shiftPpm <= 9.25
    );
    const aromaticIntegralSum = environments
      .filter((e) => e.shiftPpm >= 6.4 && e.shiftPpm <= 9.25)
      .reduce((s, e) => s + Math.round(e.rawIntegralValue || 0), 0);

    // 若對位/對稱芳香環 2 組訊號各標記 1 (芳香區總和僅 2H)，通常為 1:1 相對積分比（實際為 2H:2H = 4H）
    const looksLikeUnscaledSymmetricRatio =
      hasAromaticSignals &&
      aromaticIntegralSum <= 2 &&
      environments.filter((e) => e.shiftPpm >= 6.4 && e.shiftPpm <= 9.25)
        .length >= 2 &&
      (targetH === null || targetH >= Math.round(rawIntegralSum) * 2);

    const hasQuartetOrTripletWithUnit1 = environments.some(
      (e) =>
        e.shiftPpm < 5.2 &&
        (e.multiplicity === "q" || (e.multiplicity === "t" && e.shiftPpm < 2.5)) &&
        (e.rawIntegralValue || 0) < 1.8
    );

    const isRawUnnormalizedArea = rawIntegralSum > 50 && !allNearIntegers;

    const isRelativeRatioOnly =
      !absoluteIntegrationConfirmed ||
      !allNearIntegers ||
      rawIntegralSum > 80 ||
      isSubMultipleOfTargetH ||
      looksLikeUnscaledSymmetricRatio ||
      hasQuartetOrTripletWithUnit1 ||
      (overallGcd > 1 && (targetH === null || Math.round(rawIntegralSum) !== targetH));

    if (isRelativeRatioOnly || hasOverlapPeaks) {
      if (!allNearIntegers || rawIntegralSum > 80) {
        uncertaintyReasons.push(
          `輸入積分為原始面積或非整數相對比值 (總和 ${rawIntegralSum})，已正規化為最簡整數比 ${reducedIntegerRatios.join(" : ")} (最小單元總和 ${inferredMinimumProtonUnitSum}H)，不直接當成絕對分子總氫數`
        );
      } else if (looksLikeUnscaledSymmetricRatio || isSubMultipleOfTargetH) {
        uncertaintyReasons.push(
          `輸入積分 (${roundedInts.join(" : ")}) 為分子對稱約分後之相對積分比 (單元總和 ${inferredMinimumProtonUnitSum}H)，實際分子氫數可能為其整數倍 (k × ${inferredMinimumProtonUnitSum}H)`
        );
      }

      // A formula is a separate information source, not an integral calibration.
      const symmetryScale = 1;
      const scaledTotalIfTargetMatched: number | null = null;
      uncertaintyReasons.push("積分僅提供相對比例；未獨立校準前不宣稱絕對氫數，也不使用分子式循環驗證。");

      environments.forEach((env, idx) => {
        env.userRelativeRatio = rawIntegralValues[idx];
        env.normalizedIntegralRatio = reducedIntegerRatios[idx];
        const scaledH =
          scaledTotalIfTargetMatched !== null
            ? reducedIntegerRatios[idx] * symmetryScale
            : null;
        env.inferredProtonCount = scaledH;
        if (scaledH !== null) {
          env.integration = scaledH;
        }
      });

      const perEnvironmentProtons = environments.map((env, idx) => ({
        shift: env.shiftPpm,
        rawIntegral: rawIntegralValues[idx] ?? 0,
        normalizedRatio: reducedIntegerRatios[idx],
        estimatedProtons: reducedIntegerRatios[idx] * symmetryScale,
        isExchangeableCandidate: Boolean(env.isExchangeable),
      }));

      return {
        integralDataMode: hasOverlapPeaks
          ? "PARTIAL_OR_INCOMPLETE"
          : isRawUnnormalizedArea
            ? "RAW_UNNORMALIZED_AREA"
            : "RELATIVE_INTEGRAL_RATIO",
        completenessLevel: hasOverlapPeaks
          ? "PARTIAL_UNCERTAIN"
          : "RELATIVE_RATIO_ONLY",
        rawIntegralValues,
        rawIntegralSum,
        userRelativeRatios: [...rawIntegralValues],
        normalizedRatios: reducedIntegerRatios,
        normalizedRatioSummary: `${reducedIntegerRatios.join(" : ")} (最小整數比單元 = ${inferredMinimumProtonUnitSum}H)`,
        inferredMinimumProtonUnitSum,
        minimumIntegerProtonSum: inferredMinimumProtonUnitSum,
        inferredTotalProtons: scaledTotalIfTargetMatched,
        estimatedTotalProtons: scaledTotalIfTargetMatched,
        plausibleTotalProtonMultiples,
        nonExchangeableProtonSum: null,
        exchangeableProtonSum: 0,
        exchangeableSignalCount,
        overlapOrUncertainSignalCount,
        missingIntegralSignalCount: 0,
        totalAnalyteSignalCount,
        isAlreadyNormalized: false,
        canDetermineAbsoluteProtonCount: scaledTotalIfTargetMatched !== null,
        exchangeableProtonNote: "",
        symmetryAndOverlapNote: uncertaintyReasons.join("；"),
        uncertaintyReasons,
        perEnvironmentProtons,
        diagnostics: uncertaintyReasons,
      };
    }

    // 否則為完整且已正規化之絕對氫數 (NORMALIZED_ABSOLUTE_PROTON_COUNT)
    const inferredTotalProtons = roundedInts.reduce((a, b) => a + b, 0);
    let exchangeableProtonSum = 0;
    let nonExchangeableProtonSum = 0;

    environments.forEach((env, idx) => {
      const hCount = roundedInts[idx];
      env.userRelativeRatio = rawIntegralValues[idx];
      env.normalizedIntegralRatio = reducedIntegerRatios[idx];
      env.inferredProtonCount = hCount;
      env.integration = hCount;
      if (env.isExchangeable) {
        exchangeableProtonSum += hCount;
      } else {
        nonExchangeableProtonSum += hCount;
      }
    });

    if (exchangeableSignalCount > 0) {
      uncertaintyReasons.push(
        `包含 ${exchangeableSignalCount} 組可交換活潑氫訊號 (共 ${exchangeableProtonSum}H)，其積分與化學位移受溶劑與微量水分影響較大`
      );
    }

    const perEnvironmentProtons = environments.map((env, idx) => ({
      shift: env.shiftPpm,
      rawIntegral: rawIntegralValues[idx] ?? 0,
      normalizedRatio: reducedIntegerRatios[idx],
      estimatedProtons: roundedInts[idx],
      isExchangeableCandidate: Boolean(env.isExchangeable),
    }));

    return {
      integralDataMode: "NORMALIZED_ABSOLUTE_PROTON_COUNT",
      completenessLevel: "COMPLETE_RELIABLE",
      rawIntegralValues,
      rawIntegralSum,
      userRelativeRatios: [...rawIntegralValues],
      normalizedRatios: reducedIntegerRatios,
      normalizedRatioSummary: `${roundedInts.join("H : ")}H (已正規化絕對氫數總和 = ${inferredTotalProtons}H)`,
      inferredMinimumProtonUnitSum,
      minimumIntegerProtonSum: inferredMinimumProtonUnitSum,
      inferredTotalProtons,
      estimatedTotalProtons: inferredTotalProtons,
      plausibleTotalProtonMultiples,
      nonExchangeableProtonSum,
      exchangeableProtonSum,
      exchangeableSignalCount,
      overlapOrUncertainSignalCount,
      missingIntegralSignalCount: 0,
      totalAnalyteSignalCount,
      isAlreadyNormalized: true,
      canDetermineAbsoluteProtonCount: true,
      exchangeableProtonNote:
        exchangeableSignalCount > 0
          ? `偵測到 ${exchangeableSignalCount} 組可交換活潑氫訊號`
          : "",
      symmetryAndOverlapNote: uncertaintyReasons.join("；"),
      uncertaintyReasons,
      perEnvironmentProtons,
      diagnostics: uncertaintyReasons,
    };
  }

  /**
   * Section D2: 將候選結構由實際 SMILES 計算出的總氫數、碳鍵結氫數與可交換氫數，
   * 與實驗 ¹H NMR 積分語意模型進行一致性比對，決定 PASS / HARD_REJECT / SOFT_PENALTY / INCONCLUSIVE。
   */
  static evaluateCandidateProtonConsistency(
    hardValidation: CandidateHardValidationResult,
    h1Summary?: H1NMRIntegrationSummary | null,
    nmrSolvent?: string
  ): CandidateProtonConsistencyReport {
    const computedTotalProtons = hardValidation.computedTotalProtons;
    const computedCarbonBoundProtons = hardValidation.computedCarbonBoundProtons;
    const computedExchangeableProtons =
      hardValidation.computedExchangeableProtons;

    let targetFormulaHydrogens: number | null = null;
    if (hardValidation.targetFormula) {
      const parsedTarget = this.parseAndValidateFormula(
        hardValidation.targetFormula
      );
      if (parsedTarget.isValid) {
        targetFormulaHydrogens = parsedTarget.atomCounts.H || 0;
      }
    }

    // 若目標分子式之氫數與候選實際氫數不一致，直接標記為硬性錯誤
    if (
      targetFormulaHydrogens !== null &&
      computedTotalProtons !== targetFormulaHydrogens
    ) {
      const msg = `HARD_CONSTRAINT: 候選結構實際氫數 (${computedTotalProtons}H) 與目標分子式 ${hardValidation.targetFormula} 之氫數 (${targetFormulaHydrogens}H) 不符`;
      return {
        targetFormulaMatch: false,
        computedTotalProtons,
        computedCarbonBoundProtons,
        computedExchangeableProtons,
        computedTotalHydrogens: computedTotalProtons,
        computedCarbonBoundHydrogens: computedCarbonBoundProtons,
        computedExchangeableHydrogens: computedExchangeableProtons,
        targetFormulaHydrogens,
        nmrIntegralDataMode: h1Summary?.integralDataMode || "NOT_PROVIDED",
        nmrCompletenessLevel: h1Summary?.completenessLevel || "UNAVAILABLE",
        observedTotalProtons: h1Summary?.inferredTotalProtons ?? null,
        observedRelativeRatioSum:
          h1Summary?.inferredMinimumProtonUnitSum ?? null,
        comparisonResult: "CONTRADICTED",
        status: "CONTRADICTED",
        isHardFailure: true,
        penaltyPoints: 100,
        scoreAdjustment: -100,
        failureReason: msg,
        explanation: msg,
        diagnostics: [msg],
        inconsistencyReasons: [msg],
        contradictionReasons: [msg],
        supportingNotes: [],
        uncertaintyNotes: [],
        uncertaintyExplanation: msg,
        disposition: "HARD_REJECT",
      };
    }

    if (
      !h1Summary ||
      h1Summary.integralDataMode === "NOT_PROVIDED" ||
      h1Summary.integralDataMode === "MISSING_INTEGRALS" ||
      h1Summary.completenessLevel === "UNAVAILABLE"
    ) {
      const note =
        "尚未提供 ¹H NMR 積分數據，無法由 ¹H 積分判定候選結構氫數（標示為無法判定，不直接視為通過或淘汰）";
      return {
        targetFormulaMatch: hardValidation.formulaMatch,
        computedTotalProtons,
        computedCarbonBoundProtons,
        computedExchangeableProtons,
        computedTotalHydrogens: computedTotalProtons,
        computedCarbonBoundHydrogens: computedCarbonBoundProtons,
        computedExchangeableHydrogens: computedExchangeableProtons,
        targetFormulaHydrogens,
        nmrIntegralDataMode: h1Summary?.integralDataMode || "NOT_PROVIDED",
        nmrCompletenessLevel: h1Summary?.completenessLevel || "UNAVAILABLE",
        observedTotalProtons: null,
        observedRelativeRatioSum: null,
        comparisonResult: "INCONCLUSIVE",
        status: "INCONCLUSIVE",
        isHardFailure: false,
        penaltyPoints: 0,
        scoreAdjustment: 0,
        failureReason: null,
        explanation: note,
        diagnostics: [note],
        inconsistencyReasons: [],
        contradictionReasons: [],
        supportingNotes: [],
        uncertaintyNotes: [note],
        uncertaintyExplanation: note,
        disposition: "INCONCLUSIVE",
      };
    }

    const isProticDeuteratedSolvent =
      nmrSolvent === "D2O" || nmrSolvent === "CD3OD";

    // Case 1: PARTIAL_OR_INCOMPLETE (僅部分訊號有積分或有重疊峰)
    if (
      h1Summary.integralDataMode === "PARTIAL_OR_INCOMPLETE" ||
      h1Summary.completenessLevel === "PARTIAL_UNCERTAIN"
    ) {
      const partialKnownSum = h1Summary.rawIntegralValues
        .filter((v): v is number => v !== null && v > 0)
        .reduce((a, b) => a + Math.round(b), 0);

      const inconsistencyReasons: string[] = [];
      const uncertaintyNotes = [...h1Summary.uncertaintyReasons];

      const allKnownAreSmallIntegers = h1Summary.rawIntegralValues
        .filter((v): v is number => v !== null)
        .every((v) => Math.abs(v - Math.round(v)) <= 0.15 && v <= 12);

      if (
        allKnownAreSmallIntegers &&
        partialKnownSum > computedTotalProtons + 1
      ) {
        const msg = `局部已標記之 ¹H 積分總和 (${partialKnownSum}H) 超出候選結構總氫數 (${computedTotalProtons}H)`;
        inconsistencyReasons.push(msg);
        return {
          targetFormulaMatch: hardValidation.formulaMatch,
          computedTotalProtons,
          computedCarbonBoundProtons,
          computedExchangeableProtons,
          computedTotalHydrogens: computedTotalProtons,
          computedCarbonBoundHydrogens: computedCarbonBoundProtons,
          computedExchangeableHydrogens: computedExchangeableProtons,
          targetFormulaHydrogens,
          nmrIntegralDataMode: h1Summary.integralDataMode,
          nmrCompletenessLevel: h1Summary.completenessLevel,
          observedTotalProtons: null,
          observedRelativeRatioSum: h1Summary.inferredMinimumProtonUnitSum,
          comparisonResult: "CONTRADICTED",
          status: "CONTRADICTED",
          isHardFailure: false,
          penaltyPoints: 25,
          scoreAdjustment: -25,
          failureReason: msg,
          explanation: msg,
          diagnostics: [msg, ...uncertaintyNotes],
          inconsistencyReasons,
          contradictionReasons: [...inconsistencyReasons],
          supportingNotes: [],
          uncertaintyNotes,
          uncertaintyExplanation: uncertaintyNotes.join("；"),
          disposition: "SOFT_PENALTY",
        };
      }

      const note = `¹H NMR 積分為局部或不確定證據，候選結構總氫數為 ${computedTotalProtons}H (碳上氫 ${computedCarbonBoundProtons}H + 可交換質子 ${computedExchangeableProtons}H)，暫標示為「無法判定」`;
      uncertaintyNotes.push(note);

      return {
        targetFormulaMatch: hardValidation.formulaMatch,
        computedTotalProtons,
        computedCarbonBoundProtons,
        computedExchangeableProtons,
        computedTotalHydrogens: computedTotalProtons,
        computedCarbonBoundHydrogens: computedCarbonBoundProtons,
        computedExchangeableHydrogens: computedExchangeableProtons,
        targetFormulaHydrogens,
        nmrIntegralDataMode: h1Summary.integralDataMode,
        nmrCompletenessLevel: h1Summary.completenessLevel,
        observedTotalProtons: null,
        observedRelativeRatioSum: h1Summary.inferredMinimumProtonUnitSum,
        comparisonResult: "INCONCLUSIVE",
        status: "INCONCLUSIVE",
        isHardFailure: false,
        penaltyPoints: 0,
        scoreAdjustment: 0,
        failureReason: null,
        explanation: note,
        diagnostics: uncertaintyNotes,
        inconsistencyReasons: [],
        contradictionReasons: [],
        supportingNotes: [],
        uncertaintyNotes,
        uncertaintyExplanation: uncertaintyNotes.join("；"),
        disposition: "INCONCLUSIVE",
      };
    }

    // Case 2: RELATIVE_INTEGRAL_RATIO or RAW_UNNORMALIZED_AREA (相對積分比，不應被誤當成絕對總氫數)
    if (
      h1Summary.integralDataMode === "RELATIVE_INTEGRAL_RATIO" ||
      h1Summary.integralDataMode === "RAW_UNNORMALIZED_AREA" ||
      h1Summary.completenessLevel === "RELATIVE_RATIO_ONLY"
    ) {
      const unitSum = h1Summary.inferredMinimumProtonUnitSum || 1;
      const matchesTotalMultiple =
        computedTotalProtons >= unitSum &&
        computedTotalProtons % unitSum === 0;
      const matchesCarbonBoundMultiple =
        computedExchangeableProtons > 0 &&
        computedCarbonBoundProtons >= unitSum &&
        computedCarbonBoundProtons % unitSum === 0;

      if (matchesTotalMultiple || matchesCarbonBoundMultiple) {
        const scaleFactor = matchesTotalMultiple
          ? computedTotalProtons / unitSum
          : computedCarbonBoundProtons / unitSum;
        const note = `實驗 ¹H NMR 提供相對積分比 (${h1Summary.normalizedRatioSummary})，乘以對稱倍數 k=${scaleFactor} 後與候選結構氫數 (${
          matchesTotalMultiple
            ? `總氫數 ${computedTotalProtons}H`
            : `非交換碳上氫數 ${computedCarbonBoundProtons}H，另有 ${computedExchangeableProtons}H 可交換質子`
        }) 完全相容`;
        return {
          targetFormulaMatch: hardValidation.formulaMatch,
          computedTotalProtons,
          computedCarbonBoundProtons,
          computedExchangeableProtons,
          computedTotalHydrogens: computedTotalProtons,
          computedCarbonBoundHydrogens: computedCarbonBoundProtons,
          computedExchangeableHydrogens: computedExchangeableProtons,
          targetFormulaHydrogens,
          nmrIntegralDataMode: h1Summary.integralDataMode,
          nmrCompletenessLevel: h1Summary.completenessLevel,
          observedTotalProtons: h1Summary.inferredTotalProtons,
          observedRelativeRatioSum: unitSum,
          comparisonResult: "RELATIVE_RATIO_COMPATIBLE",
          status:
            !matchesTotalMultiple && matchesCarbonBoundMultiple
              ? "CONSISTENT_WITH_EXCHANGEABLE_OR_OVERLAP"
              : "CONSISTENT",
          isHardFailure: false,
          penaltyPoints: 0,
          scoreAdjustment: 10,
          failureReason: null,
          explanation: note,
          diagnostics: [note],
          inconsistencyReasons: [],
          contradictionReasons: [],
          supportingNotes: [note],
          uncertaintyNotes: [note],
          uncertaintyExplanation: note,
          disposition: "PASS",
        };
      }

      // 若候選含有可交換氫且 unitSum 介於碳上氫與總氫之間
      if (
        computedExchangeableProtons > 0 &&
        unitSum >= computedCarbonBoundProtons &&
        unitSum <= computedTotalProtons
      ) {
        const note = `候選結構含 ${computedExchangeableProtons} 個可交換質子 (-OH/-NH/-COOH)，觀測積分單元 (${unitSum}H) 介於非交換氫 (${computedCarbonBoundProtons}H) 與總氫數 (${computedTotalProtons}H) 之間`;
        return {
          targetFormulaMatch: hardValidation.formulaMatch,
          computedTotalProtons,
          computedCarbonBoundProtons,
          computedExchangeableProtons,
          computedTotalHydrogens: computedTotalProtons,
          computedCarbonBoundHydrogens: computedCarbonBoundProtons,
          computedExchangeableHydrogens: computedExchangeableProtons,
          targetFormulaHydrogens,
          nmrIntegralDataMode: h1Summary.integralDataMode,
          nmrCompletenessLevel: h1Summary.completenessLevel,
          observedTotalProtons: null,
          observedRelativeRatioSum: unitSum,
          comparisonResult: "MATCHED_WITH_EXCHANGEABLE_NOTE",
          status: "CONSISTENT_WITH_EXCHANGEABLE_OR_OVERLAP",
          isHardFailure: false,
          penaltyPoints: 0,
          scoreAdjustment: 8,
          failureReason: null,
          explanation: note,
          diagnostics: [note],
          inconsistencyReasons: [],
          contradictionReasons: [],
          supportingNotes: [note],
          uncertaintyNotes: [note],
          uncertaintyExplanation: note,
          disposition: "PASS",
        };
      }

      const msg = `實驗 ¹H NMR 最簡相對積分比總和 (${unitSum}n) 無法以整數倍對應候選結構總氫數 (${computedTotalProtons}H) 或非交換碳上氫數 (${computedCarbonBoundProtons}H)`;
      return {
        targetFormulaMatch: hardValidation.formulaMatch,
        computedTotalProtons,
        computedCarbonBoundProtons,
        computedExchangeableProtons,
        computedTotalHydrogens: computedTotalProtons,
        computedCarbonBoundHydrogens: computedCarbonBoundProtons,
        computedExchangeableHydrogens: computedExchangeableProtons,
        targetFormulaHydrogens,
        nmrIntegralDataMode: h1Summary.integralDataMode,
        nmrCompletenessLevel: h1Summary.completenessLevel,
        observedTotalProtons: null,
        observedRelativeRatioSum: unitSum,
        comparisonResult: "CONTRADICTED",
        status: "CONTRADICTED",
        isHardFailure: false,
        penaltyPoints: 30,
        scoreAdjustment: -30,
        failureReason: msg,
        explanation: msg,
        diagnostics: [msg, ...h1Summary.uncertaintyReasons],
        inconsistencyReasons: [msg],
        contradictionReasons: [msg],
        supportingNotes: [],
        uncertaintyNotes: [...h1Summary.uncertaintyReasons],
        uncertaintyExplanation: msg,
        disposition: "SOFT_PENALTY",
      };
    }

    // Case 3: NORMALIZED_ABSOLUTE_PROTON_COUNT (完整且可靠的絕對氫數)
    const obsTotalH = h1Summary.inferredTotalProtons!;
    const obsNonExchH = h1Summary.nonExchangeableProtonSum ?? obsTotalH;

    // 3a: 觀測總氫數與候選結構實際總氫數完全吻合
    if (obsTotalH === computedTotalProtons) {
      const note = `實驗 ¹H NMR 總積分 (${obsTotalH}H) 與結構總氫數 (${computedTotalProtons}H) 完全吻合`;
      return {
        targetFormulaMatch: hardValidation.formulaMatch,
        computedTotalProtons,
        computedCarbonBoundProtons,
        computedExchangeableProtons,
        computedTotalHydrogens: computedTotalProtons,
        computedCarbonBoundHydrogens: computedCarbonBoundProtons,
        computedExchangeableHydrogens: computedExchangeableProtons,
        targetFormulaHydrogens,
        nmrIntegralDataMode: h1Summary.integralDataMode,
        nmrCompletenessLevel: h1Summary.completenessLevel,
        observedTotalProtons: obsTotalH,
        observedRelativeRatioSum: h1Summary.inferredMinimumProtonUnitSum,
        comparisonResult:
          computedExchangeableProtons > 0
            ? "MATCHED_WITH_EXCHANGEABLE_NOTE"
            : "MATCHED",
        status: "CONSISTENT",
        isHardFailure: false,
        penaltyPoints: 0,
        scoreAdjustment: 12,
        failureReason: null,
        explanation: note,
        diagnostics: [note],
        inconsistencyReasons: [],
        contradictionReasons: [],
        supportingNotes: [note],
        uncertaintyNotes:
          computedExchangeableProtons > 0
            ? [
                `實驗 ¹H NMR 總積分 (${obsTotalH}H) 與結構總氫數 (${computedTotalProtons}H，含 ${computedExchangeableProtons}H 可交換質子) 完全吻合`,
              ]
            : [],
        uncertaintyExplanation: note,
        disposition: "PASS",
      };
    }

    // 3b: 觀測總氫數少於結構總氫數，但差值正好可由結構上的可交換活潑氫 (-OH/-COOH/-NH) 因氘交換或寬化未檢出所解釋
    if (
      computedExchangeableProtons > 0 &&
      obsTotalH >= computedCarbonBoundProtons &&
      obsTotalH < computedTotalProtons
    ) {
      const missingExch = computedTotalProtons - obsTotalH;
      const note = `實驗 ¹H NMR 觀測到 ${obsTotalH}H，候選結構總氫數為 ${computedTotalProtons}H（含 ${computedCarbonBoundProtons}H 碳上非交換氫與 ${computedExchangeableProtons}H 可交換質子）；未觀測到之 ${missingExch}H 屬於可交換質子 (${
        isProticDeuteratedSolvent
          ? `於質子性氘代溶劑 ${nmrSolvent} 中發生氘交換消失`
          : "可能因快速化學交換或極度寬化而未積分"
      })，保留此合理不確定性`;
      return {
        targetFormulaMatch: hardValidation.formulaMatch,
        computedTotalProtons,
        computedCarbonBoundProtons,
        computedExchangeableProtons,
        computedTotalHydrogens: computedTotalProtons,
        computedCarbonBoundHydrogens: computedCarbonBoundProtons,
        computedExchangeableHydrogens: computedExchangeableProtons,
        targetFormulaHydrogens,
        nmrIntegralDataMode: h1Summary.integralDataMode,
        nmrCompletenessLevel: h1Summary.completenessLevel,
        observedTotalProtons: obsTotalH,
        observedRelativeRatioSum: h1Summary.inferredMinimumProtonUnitSum,
        comparisonResult: "MATCHED_WITH_EXCHANGEABLE_NOTE",
        status: "CONSISTENT_WITH_EXCHANGEABLE_OR_OVERLAP",
        isHardFailure: false,
        penaltyPoints: 0,
        scoreAdjustment: 8,
        failureReason: null,
        explanation: note,
        diagnostics: [note],
        inconsistencyReasons: [],
        contradictionReasons: [],
        supportingNotes: [note],
        uncertaintyNotes: [note],
        uncertaintyExplanation: note,
        disposition: "PASS",
      };
    }

    // 3c: 明確且無法由交換性氫解釋的氫數矛盾 → 硬性拒絕 (HARD_REJECT)
    const inconsistencyReasons: string[] = [];
    if (obsNonExchH > computedCarbonBoundProtons && obsTotalH > computedTotalProtons) {
      inconsistencyReasons.push(
        `HARD_CONSTRAINT: 實驗 ¹H NMR 可靠完整積分觀測到 ${obsTotalH}H (非交換碳上氫 ${obsNonExchH}H)，超出候選結構實際總氫數 (${computedTotalProtons}H，碳上氫 ${computedCarbonBoundProtons}H)`
      );
    } else if (obsTotalH < computedCarbonBoundProtons) {
      inconsistencyReasons.push(
        `HARD_CONSTRAINT: 實驗 ¹H NMR 可靠完整積分僅 ${obsTotalH}H，但候選結構至少具有 ${computedCarbonBoundProtons} 個不可交換之碳鍵結氫原子 (總氫數 ${computedTotalProtons}H)，矛盾無法由活潑氫交換解釋`
      );
    } else {
      inconsistencyReasons.push(
        `HARD_CONSTRAINT: 實驗 ¹H NMR 完整正規化氫數 (${obsTotalH}H) 與候選結構計算總氫數 (${computedTotalProtons}H) 不符`
      );
    }

    return {
      targetFormulaMatch: hardValidation.formulaMatch,
      computedTotalProtons,
      computedCarbonBoundProtons,
      computedExchangeableProtons,
      computedTotalHydrogens: computedTotalProtons,
      computedCarbonBoundHydrogens: computedCarbonBoundProtons,
      computedExchangeableHydrogens: computedExchangeableProtons,
      targetFormulaHydrogens,
      nmrIntegralDataMode: h1Summary.integralDataMode,
      nmrCompletenessLevel: h1Summary.completenessLevel,
      observedTotalProtons: obsTotalH,
      observedRelativeRatioSum: h1Summary.inferredMinimumProtonUnitSum,
      comparisonResult: "CONTRADICTED",
      status: "CONTRADICTED",
      isHardFailure: true,
      penaltyPoints: 85,
      scoreAdjustment: -85,
      failureReason: inconsistencyReasons[0],
      explanation: inconsistencyReasons[0],
      diagnostics: inconsistencyReasons,
      inconsistencyReasons,
      contradictionReasons: [...inconsistencyReasons],
      supportingNotes: [],
      uncertaintyNotes: [...h1Summary.uncertaintyReasons],
      uncertaintyExplanation: inconsistencyReasons[0],
      disposition: "HARD_REJECT",
    };
  }
}
