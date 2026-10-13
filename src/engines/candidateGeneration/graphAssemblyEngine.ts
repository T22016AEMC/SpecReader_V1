import { StructuralConstraints } from "../../types/spectrum";
import { ChemicalHardConstraintValidator } from "../scientificEngines/chemicalHardConstraintValidator";
import { ChemicalFragmentDefinition } from "./fragmentLibrary";
import { CandidateMolecularFormula } from "./formulaGenerator";

export interface AssembledCandidateGraph {
  id: string;
  name: string;
  iupacName: string;
  molecularFormula: string;
  smiles: string;
  unsaturationIndex: number;
  nominalMass: number;
  exactMass: number;
  assembledFragments: string[];
  structuralClass: string;
  keyStructuralFeatures: string[];
  assemblyNotes: string;
}

const KNOWN_SCAFFOLD_DATABASE: AssembledCandidateGraph[] = [
  {
    id: "cand-aspirin",
    name: "乙醯水楊酸 (Aspirin / Acetylsalicylic Acid)",
    iupacName: "2-Acetoxybenzoic acid",
    molecularFormula: "C9H8O4",
    smiles: "CC(=O)Oc1ccccc1C(=O)O",
    unsaturationIndex: 6,
    nominalMass: 180,
    exactMass: 180.0423,
    assembledFragments: [
      "鄰二取代苯環 (1,2-Phenylene)",
      "羧基 (-COOH)",
      "乙醯氧基 (-OCOCH3)",
    ],
    structuralClass: "芳香羧酸與酚乙酸酯雙官能基分子",
    keyStructuralFeatures: [
      "鄰二取代苯環 (4 個非對稱芳香 CH + 2 個季碳)",
      "共軛芳香羧酸 (-COOH, C=O ~1688 cm⁻¹, δC ~170.2 ppm, δH ~11.2 ppm)",
      "酚乙酸酯基 (-OCOCH3, C=O ~1754 cm⁻¹, δC ~169.7 ppm, 甲基單峰 δH 2.31 ppm)",
      "EI-MS 典型連續脫去乙烯酮 (Δ42 → m/z 138) 與乙酸 (Δ60 → m/z 120 基峰)",
    ],
    assemblyNotes:
      "由 1,2-二取代苯環核心同時連接 -COOH 與 -OCOCH3 閉合所有開放價鍵，完全滿足 C9H8O4 (IHD=6)。",
  },
  {
    id: "cand-methyl-salicylate",
    name: "水楊酸甲酯 (Methyl Salicylate, 結構異構物對照)",
    iupacName: "Methyl 2-hydroxybenzoate",
    molecularFormula: "C8H8O3",
    smiles: "COC(=O)c1ccccc1O",
    unsaturationIndex: 5,
    nominalMass: 152,
    exactMass: 152.0473,
    assembledFragments: [
      "鄰二取代苯環 (1,2-Phenylene)",
      "甲酯基 (-COOCH3)",
      "酚羥基 (-OH)",
    ],
    structuralClass: "鄰羥基苯甲酸酯 (Salicylate Ester)",
    keyStructuralFeatures: [
      "鄰二取代苯環 (4H)",
      "分子內氫鍵螯合酯羰基 (~1680 cm⁻¹)",
      "甲氧基單峰 (-OCH3, δH ~3.95 ppm, 3H) 而非乙醯甲基 (~2.3 ppm)",
    ],
    assemblyNotes:
      "鄰二取代水楊酸骨架衍生物，常作為乙醯水楊酸之局部結構比對候選。",
  },
  {
    id: "cand-4-acetoxybenzoic",
    name: "對乙醯氧基苯甲酸 (4-Acetoxybenzoic Acid, 位置異構物)",
    iupacName: "4-Acetoxybenzoic acid",
    molecularFormula: "C9H8O4",
    smiles: "CC(=O)Oc1ccc(C(=O)O)cc1",
    unsaturationIndex: 6,
    nominalMass: 180,
    exactMass: 180.0423,
    assembledFragments: [
      "對二取代苯環 (1,4-Phenylene)",
      "羧基 (-COOH)",
      "乙醯氧基 (-OCOCH3)",
    ],
    structuralClass: "對位取代芳香羧酸乙酸酯 (位置異構物)",
    keyStructuralFeatures: [
      "與 Aspirin 具相同分子式 C9H8O4 (MW 180, IHD=6)",
      "對位取代具 C2v 局部對稱，¹H NMR 芳環區應呈 AA'BB' 雙二重峰 (2H+2H)，¹³C 僅有 7 組碳環境",
      "缺乏鄰位效應 (Ortho effect)，MS 裂解較難直接協同脫去乙酸 (Δ60)",
    ],
    assemblyNotes:
      "同分異構物候選 (C9H8O4)，用於檢驗鄰位 vs 對位取代對 ¹³C 碳環境數與 ¹H 偶合裂分之區別。",
  },
  {
    id: "cand-paracetamol",
    name: "對乙醯胺基酚 (Paracetamol / Acetaminophen)",
    iupacName: "N-(4-Hydroxyphenyl)acetamide",
    molecularFormula: "C8H9NO2",
    smiles: "CC(=O)Nc1ccc(O)cc1",
    unsaturationIndex: 5,
    nominalMass: 151,
    exactMass: 151.0633,
    assembledFragments: [
      "對二取代苯環 (1,4-Phenylene)",
      "乙醯胺基 (-NHCOCH3)",
      "酚羥基 (-OH)",
    ],
    structuralClass: "對位取代芳香醯胺與酚類分子",
    keyStructuralFeatures: [
      "對二取代苯環 (AA'BB' 對稱雙組 2H 二重峰 δH 6.68 & 7.34 ppm)",
      "乙醯胺基 (-NHCOCH3, Amide I 1654 cm⁻¹, Amide II 1564 cm⁻¹, δH 1.98 ppm 甲基 3H)",
      "酚羥基 (-OH, δH ~9.15 ppm) 與醯胺 NH (δH ~9.65 ppm)",
      "奇數分子量 MW=151 (符合氮規則含 1 個 N)，MS 脫去乙烯酮 (Δ42) 生成 m/z 109 基峰",
    ],
    assemblyNotes:
      "由對位二取代苯環連接 -NHCOCH3 與 -OH 組裝而成，符合奇數 MW=151 與 AA'BB' 對稱芳環約束。",
  },
  {
    id: "cand-2-acetamidophenol",
    name: "鄰乙醯胺基酚 (2-Acetamidophenol, 位置異構物)",
    iupacName: "N-(2-Hydroxyphenyl)acetamide",
    molecularFormula: "C8H9NO2",
    smiles: "CC(=O)Nc1ccccc1O",
    unsaturationIndex: 5,
    nominalMass: 151,
    exactMass: 151.0633,
    assembledFragments: [
      "鄰二取代苯環 (1,2-Phenylene)",
      "乙醯胺基 (-NHCOCH3)",
      "酚羥基 (-OH)",
    ],
    structuralClass: "鄰位取代芳香醯胺 (位置異構物)",
    keyStructuralFeatures: [
      "分子式同為 C8H9NO2 (MW 151, IHD=5)",
      "鄰位取代破壞對稱性，¹³C NMR 應呈現 8 組獨立碳訊號，而非對位之 6 組碳訊號",
    ],
    assemblyNotes:
      "Paracetamol 之鄰位異構物候選，用於交叉驗證芳環對稱性與碳環境數。",
  },
  {
    id: "cand-ethyl-benzoate",
    name: "苯甲酸乙酯 (Ethyl Benzoate)",
    iupacName: "Ethyl benzoate",
    molecularFormula: "C9H10O2",
    smiles: "CCOC(=O)c1ccccc1",
    unsaturationIndex: 5,
    nominalMass: 150,
    exactMass: 150.0681,
    assembledFragments: [
      "單取代苯環 (Phenyl C6H5-)",
      "酯基 (-COO-)",
      "乙基 (-CH2CH3)",
    ],
    structuralClass: "共軛芳香羧酸乙酯",
    keyStructuralFeatures: [
      "單取代苯環 (5H: 鄰位 2H ~8.05 ppm、對位 1H ~7.55 ppm、間位 2H ~7.44 ppm)",
      "共軛芳酯羰基 (IR C=O ~1720 cm⁻¹, ¹³C δ 166.6 ppm)",
      "典型乙氧基 (-OCH2CH3) 自旋系統：δH 4.37 ppm 四重峰 (2H) 與 δH 1.39 ppm 三重峰 (3H)",
      "EI-MS 基峰 m/z 105 [C6H5CO]+ (M - ·OC2H5, Δ45) 及苯基離子 m/z 77",
    ],
    assemblyNotes:
      "由單取代苯甲醯基與乙氧基組裝成 C9H10O2，完美解釋 δH 4.37 (q) 與 m/z 105 基峰。",
  },
  {
    id: "cand-benzyl-acetate",
    name: "乙酸苄酯 (Benzyl Acetate, 酯基方向異構物)",
    iupacName: "Benzyl acetate",
    molecularFormula: "C9H10O2",
    smiles: "CC(=O)OCc1ccccc1",
    unsaturationIndex: 5,
    nominalMass: 150,
    exactMass: 150.0681,
    assembledFragments: [
      "單取代苯環 (Phenyl C6H5-)",
      "亞甲基 (-CH2-)",
      "乙醯氧基 (-OCOCH3)",
    ],
    structuralClass: "脂肪族乙酸酯 / 苄基酯 (位置異構物)",
    keyStructuralFeatures: [
      "分子式同為 C9H10O2 (MW 150, IHD=5)",
      "¹H NMR 應為苄基 -OCH2- 單峰 (~5.1 ppm, 2H) 與乙醯甲基單峰 (~2.1 ppm, 3H)，無乙基 q+t 偶合",
      "MS 以 m/z 91 䓬陽離子與 m/z 43 為主，缺乏強 m/z 105 [C6H5CO]+ 基峰",
    ],
    assemblyNotes:
      "與苯甲酸乙酯具相同分子式 C9H10O2 之異構物，用於檢驗 -COOCH2CH3 與 -CH2OCOCH3 之光譜差異。",
  },
  {
    id: "cand-acetophenone",
    name: "苯乙酮 (Acetophenone)",
    iupacName: "1-Phenylethan-1-one",
    molecularFormula: "C8H8O",
    smiles: "CC(=O)c1ccccc1",
    unsaturationIndex: 5,
    nominalMass: 120,
    exactMass: 120.0575,
    assembledFragments: [
      "單取代苯環 (Phenyl C6H5-)",
      "乙醯基 (-COCH3)",
    ],
    structuralClass: "芳香族甲基酮 (Aryl Methyl Ketone)",
    keyStructuralFeatures: [
      "單取代苯環 (5H, ¹³C 4 組芳香碳環境)",
      "共軛芳酮羰基 (IR C=O ~1685 cm⁻¹, ¹³C δ 198.1 ppm 高於酯類)",
      "乙醯基甲基單峰 (δH 2.60 ppm, 3H, s)",
      "EI-MS 分子離子 m/z 120，脫甲基 (Δ15) 得 m/z 105 [C6H5CO]+ 基峰，再脫 CO 得 m/z 77",
    ],
    assemblyNotes:
      "由苯基 (C6H5-) 與乙醯基 (-COCH3) 直接鍵結成 C8H8O (IHD=5)。",
  },
  {
    id: "cand-phenylacetaldehyde",
    name: "苯乙醛 (Phenylacetaldehyde, 醛酮異構物)",
    iupacName: "2-Phenylacetaldehyde",
    molecularFormula: "C8H8O",
    smiles: "O=CCc1ccccc1",
    unsaturationIndex: 5,
    nominalMass: 120,
    exactMass: 120.0575,
    assembledFragments: [
      "單取代苯環 (Phenyl C6H5-)",
      "亞甲基 (-CH2-)",
      "醛基 (-CHO)",
    ],
    structuralClass: "芳香族脂肪醛 (異構物)",
    keyStructuralFeatures: [
      "分子式同為 C8H8O (MW 120, IHD=5)",
      "應在 δH 9.7 ppm 出現醛基質子峰，且 MS 以 m/z 91 [C7H7]+ 為基峰而非 m/z 105",
    ],
    assemblyNotes:
      "與苯乙酮同為 C8H8O 之醛類異構物，用於檢驗酮基 vs 醛基特徵。",
  },
  {
    id: "cand-ethyl-acetate",
    name: "乙酸乙酯 (Ethyl Acetate)",
    iupacName: "Ethyl acetate",
    molecularFormula: "C4H8O2",
    smiles: "CCOC(=O)C",
    unsaturationIndex: 1,
    nominalMass: 88,
    exactMass: 88.0524,
    assembledFragments: [
      "乙醯基 (CH3CO-)",
      "乙氧基 (-OCH2CH3)",
    ],
    structuralClass: "飽和脂肪族羧酸酯",
    keyStructuralFeatures: [
      "飽和脂肪酯羰基 (IR C=O ~1742 cm⁻¹, ¹³C δ 171.2 ppm)",
      "無芳香環訊號 (IHD = 1)",
      "¹H NMR 呈現乙氧基四重峰 δ 4.12 ppm (2H, q)、乙醯甲基單峰 δ 2.05 ppm (3H, s)、乙基甲基三重峰 δ 1.26 ppm (3H, t)",
      "EI-MS 分子離子 m/z 88，基峰 m/z 43 [CH3CO]+",
    ],
    assemblyNotes:
      "由乙醯基與乙氧基組裝成飽和酯 C4H8O2 (IHD=1)。",
  },
  {
    id: "cand-butyric-acid",
    name: "丁酸 (Butyric Acid, 酸/酯官能基異構物)",
    iupacName: "Butanoic acid",
    molecularFormula: "C4H8O2",
    smiles: "CCCC(=O)O",
    unsaturationIndex: 1,
    nominalMass: 88,
    exactMass: 88.0524,
    assembledFragments: [
      "丙基 (CH3CH2CH2-)",
      "羧基 (-COOH)",
    ],
    structuralClass: "飽和脂肪族羧酸 (官能基異構物)",
    keyStructuralFeatures: [
      "分子式同為 C4H8O2 (MW 88, IHD=1)",
      "應具備寬強羧酸 O-H 伸縮帶 (2500–3300 cm⁻¹) 與 δH ~11.5 ppm 羧酸質子，且無 δH 4.1 ppm -OCH2- 峰",
    ],
    assemblyNotes:
      "與乙酸乙酯同為 C4H8O2 之羧酸異構物，用於檢驗酯類 vs 羧酸之紅外與核磁差異。",
  },
];

export class GraphAssemblyEngine {
  /**
   * 依據推導出的分子式與片段庫，組裝並挑選最合理的結構候選與同分異構物對照
   */
  static assembleCandidates(
    constraints: StructuralConstraints,
    formulas: CandidateMolecularFormula[],
    fragments: ChemicalFragmentDefinition[]
  ): AssembledCandidateGraph[] {
    // 若使用者提供了無效或不支援的分子式，禁止從模板庫產生任何假候選
    if (
      constraints.userSuppliedFormulaValidation &&
      (!constraints.userSuppliedFormulaValidation.isValid ||
        !constraints.userSuppliedFormulaValidation.isSupported)
    ) {
      return [];
    }

    const lockedTargetFormula =
      constraints.userSuppliedFormula?.isValid &&
      constraints.userSuppliedFormula.normalizedFormula
        ? constraints.userSuppliedFormula.normalizedFormula
        : constraints.molecularFormula?.lockedFormula || null;

    // 若使用者明確指定了目標分子式，模板庫必須嚴格通過實際 SMILES 分子式比對，絕不可因名目質量相近 (±2 Da) 或官能基相似而繞過分子式硬限制！
    if (lockedTargetFormula) {
      return KNOWN_SCAFFOLD_DATABASE.filter((item) => {
        const hardCheck =
          ChemicalHardConstraintValidator.validateCandidateStructure(
            item.smiles,
            item.molecularFormula,
            lockedTargetFormula
          );
        return hardCheck.isValid && hardCheck.formulaMatch === true;
      });
    }

    const hasActiveSources =
      (constraints.contributingSources &&
        constraints.contributingSources.length > 0) ||
      formulas.length > 0 ||
      fragments.length > 0 ||
      (constraints.estimatedMolecularWeight !== null &&
        constraints.estimatedMolecularWeight !== undefined) ||
      (constraints.functionalGroups && constraints.functionalGroups.length > 0);

    if (!hasActiveSources) {
      return [];
    }

    const formulaSet = new Set(formulas.map((f) => f.formula));
    const mw = constraints.estimatedMolecularWeight;

    // 1. 未鎖定唯一分子式時，挑選符合推估分子式或標稱分子量之支架（仍須通過基本結構與宣告分子式驗證）
    const matchedScaffolds = KNOWN_SCAFFOLD_DATABASE.filter((item) => {
      const hardCheck =
        ChemicalHardConstraintValidator.validateCandidateStructure(
          item.smiles,
          item.molecularFormula,
          null
        );
      if (!hardCheck.isValid) return false;
      return (
        formulaSet.has(hardCheck.computedFormula) ||
        (mw !== undefined &&
          mw !== null &&
          Math.abs(item.nominalMass - mw) <= 2)
      );
    });

    if (matchedScaffolds.length > 0) {
      return matchedScaffolds;
    }

    // 2. 若未提供 MS 分子量（例如僅上傳單一 IR、1H NMR、13C NMR、MS/MS 或 ToF-SIMS），依據官能基、碎片與氫/碳數匹配
    const fgText = [
      ...(constraints.functionalGroups || [])
        .filter((g) => g.status === "REQUIRED" || g.status === "SUPPORTED")
        .map((g) => `${g.groupName || g.label} ${g.notes || ""}`),
      ...(constraints.requiredSubstructures || []).map(
        (s) =>
          typeof s === "string"
            ? s
            : `${s.motifLabel} ${s.supportingObservation}`
      ),
      ...(constraints.substructures || []).map(
        (s) => `${s.motif} ${s.fragmentType || ""} ${s.description}`
      ),
      ...fragments.map((f) => `${f.name} ${f.smilesMotif}`),
    ]
      .join(" ")
      .toLowerCase();

    if (
      !fgText &&
      !constraints.estimatedProtonCount &&
      !constraints.estimatedCarbonEnvironmentCount &&
      formulas.length === 0
    ) {
      return [];
    }

    const scored = KNOWN_SCAFFOLD_DATABASE.map((item) => {
      let matchCount = 0;
      const featText = `${item.name} ${item.structuralClass} ${item.keyStructuralFeatures.join(" ")}`.toLowerCase();

      if (
        (fgText.includes("aromatic") || fgText.includes("phenyl")) &&
        item.unsaturationIndex >= 4
      ) {
        matchCount += 3;
      }
      if (
        !fgText.includes("aromatic") &&
        !fgText.includes("phenyl") &&
        item.unsaturationIndex <= 2
      ) {
        matchCount += 2;
      }
      if (fgText.includes("carboxylic") && featText.includes("羧酸")) {
        matchCount += 3;
      }
      if (fgText.includes("ester") && featText.includes("酯")) {
        matchCount += 3;
      }
      if (fgText.includes("amide") && featText.includes("醯胺")) {
        matchCount += 4;
      }
      if (fgText.includes("ketone") && featText.includes("酮")) {
        matchCount += 3;
      }
      if (
        constraints.estimatedProtonCount &&
        item.molecularFormula.includes(`H${constraints.estimatedProtonCount}`)
      ) {
        matchCount += 3;
      }
      if (
        constraints.estimatedCarbonEnvironmentCount &&
        item.molecularFormula.startsWith(
          `C${constraints.estimatedCarbonEnvironmentCount}`
        )
      ) {
        matchCount += 2;
      }
      return { item, matchCount };
    });

    return scored
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, 4)
      .map((s) => s.item);
  }
}
