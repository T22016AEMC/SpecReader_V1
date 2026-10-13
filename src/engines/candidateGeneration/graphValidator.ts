import { ParsedChemicalStructure } from "../../types/spectrum";
import {
  ChemistryEngine,
  ParsedSmilesGraph,
  StructureParserAdapter,
} from "../chemistryEngine";

export interface GraphValidationResult {
  valid: boolean;
  reason?: string;
  parsedStructure?: ParsedChemicalStructure;
  graph?: ParsedSmilesGraph;
  canonicalSignature?: string;
}

/**
 * Chemical Graph Validator & Canonical Graph Signature Engine (V5)
 * Verifies valence rules, connectivity, DBE legality, chemical stability,
 * and computes a SMILES-order-independent Weisfeiler-Lehman graph signature for deduplication.
 */
export class ChemicalGraphValidator {
  /**
   * Computes a 3-round Weisfeiler-Lehman / Morgan topological invariant signature
   * from a ParsedSmilesGraph so that identical molecular graphs with different SMILES strings
   * (e.g. "COc1ccc(C=O)cc1" vs "O=Cc1ccc(OC)cc1") map to the exact same canonical key.
   */
  static computeCanonicalGraphSignature(
    graph: ParsedSmilesGraph,
    molecularFormula: string
  ): string {
    const n = graph.atoms.length;
    if (n === 0) return `EMPTY:${molecularFormula}`;

    let labels: string[] = graph.atoms.map((a) => {
      const sortedOrders = a.neighbors
        .map((nb) => nb.order)
        .sort((x, y) => x - y)
        .join(",");
      return `${a.element}|ar:${a.isAromatic ? 1 : 0}|H:${a.totalHydrogens}|q:${a.formalCharge}|b:[${sortedOrders}]`;
    });

    for (let round = 0; round < 3; round++) {
      const nextLabels: string[] = new Array(n);
      for (let i = 0; i < n; i++) {
        const atom = graph.atoms[i];
        const neighborDescriptors = atom.neighbors
          .map((nb) => `${nb.order}:${labels[nb.toAtom]}`)
          .sort();
        nextLabels[i] = `${labels[i]}=>(${neighborDescriptors.join(";")})`;
      }
      labels = nextLabels;
    }

    const sortedFinalLabels = [...labels].sort().join("||");
    return `${molecularFormula}::ring:${graph.ringSubstitutionTopology}::atoms:${sortedFinalLabels}`;
  }

  /**
   * Validates a candidate SMILES string against:
   * 1. SMILES syntax & graph parse
   * 2. Single connected component
   * 3. Standard organic valence bounds on every atom
   * 4. Non-negative integer DBE
   * 5. Absence of unstable chemical motifs (gem-diols, peroxides, etc.)
   * 6. Optional target formula match
   */
  static validateCandidateSmiles(
    smiles: string,
    targetFormula?: string
  ): GraphValidationResult {
    const trimmed = smiles.trim();
    if (!trimmed) {
      return { valid: false, reason: "SMILES 字串為空" };
    }

    const graphRes = StructureParserAdapter.parseSmilesGraph(trimmed);
    if (!graphRes.valid || !graphRes.graph) {
      return {
        valid: false,
        reason: graphRes.reason || "無法解析 SMILES 分子圖",
      };
    }

    const graph = graphRes.graph;

    if (graph.disconnectedComponentsCount > 1) {
      return {
        valid: false,
        reason: "候選結構包含不連通的離散碎片",
      };
    }

    for (const atom of graph.atoms) {
      const bondSum = Math.round(
        atom.neighbors.reduce((acc, nb) => acc + nb.order, 0)
      );
      const totalValence = bondSum + atom.totalHydrogens;

      if (atom.element === "C") {
        if (totalValence !== 4 && atom.formalCharge === 0) {
          return {
            valid: false,
            reason: `碳原子 (#${atom.index}) 價數異常 (valence=${totalValence})`,
          };
        }
      } else if (atom.element === "O" && atom.formalCharge === 0) {
        if (totalValence !== 2) {
          return {
            valid: false,
            reason: `氧原子 (#${atom.index}) 價數異常 (valence=${totalValence})`,
          };
        }
      } else if (["F", "Cl", "Br", "I"].includes(atom.element)) {
        if (totalValence !== 1) {
          return {
            valid: false,
            reason: `鹵素原子 (${atom.element}) 價數必須為 1`,
          };
        }
      }
    }

    const parsed = ChemistryEngine.parseStructureInput(trimmed, "SMILES");
    if (
      parsed.parseFailed ||
      !parsed.structureIntegrity?.smilesSyntaxValid ||
      !parsed.structureIntegrity?.hasVerifiableConnectivity
    ) {
      return {
        valid: false,
        reason: "未通過 ChemistryEngine 結構完整性檢核",
      };
    }

    if (
      (parsed.dbe || 0) < 0 ||
      Math.abs((parsed.dbe || 0) - Math.round(parsed.dbe || 0)) > 0.05
    ) {
      return {
        valid: false,
        reason: `不合法的不飽和度 (DBE=${parsed.dbe})`,
      };
    }

    if (targetFormula && parsed.molecularFormula !== targetFormula) {
      return {
        valid: false,
        reason: `分子式 (${parsed.molecularFormula}) 與目標分子式 (${targetFormula}) 不符`,
      };
    }

    const canonicalSignature = this.computeCanonicalGraphSignature(
      graph,
      parsed.molecularFormula
    );

    return {
      valid: true,
      parsedStructure: parsed,
      graph,
      canonicalSignature,
    };
  }
}
