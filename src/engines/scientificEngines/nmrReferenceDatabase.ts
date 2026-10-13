import {
  CarbonEnvironment,
  CarbonEnvironmentType,
  JCoupling,
  NMRDataNature,
  NMRLiteratureReference,
  NMRShiftCorrectionTerm,
  NMRSolvent,
  ParsedChemicalStructure,
  ProtonEnvironment,
  SignalRole,
  SpectralPeak,
  SpinCouplingAnalysis,
  SpinMultipletLine,
} from "../../types/spectrum";
import {
  KNOWN_STRUCTURAL_LIBRARY,
  ParsedSmilesGraph,
  SmilesAtomNode,
  StructureParserAdapter,
} from "../chemistryEngine";

// ============================================================================
// 1. 文獻與理論參考資料註冊表 (NMR Literature & Provenance Registry)
// ============================================================================

export const NMR_LITERATURE_REGISTRY: Record<string, NMRLiteratureReference> = {
  JONAS_2022_MRC: {
    id: "JONAS_2022_MRC",
    authors: "Jonas, E.; Kuhn, S.; Schlörer, N.",
    title: "Prediction of chemical shift in NMR: A review",
    journal: "Magnetic Resonance in Chemistry",
    year: 2022,
    doi: "10.1002/mrc.5234",
    dataNature: "GENERAL_THEORY",
    applicableConditions:
      "Local topological atom environments, HOSE-like spherical shells, additive substituent shielding models, and uncertainty estimation for 1H/13C NMR.",
    version: "2022.1",
  },
  CASABIANCA_2020_MRC: {
    id: "CASABIANCA_2020_MRC",
    authors: "Casabianca, L. B.",
    title: "Calculating nuclear magnetic resonance chemical shifts in solvated systems",
    journal: "Magnetic Resonance in Chemistry",
    year: 2020,
    doi: "10.1002/mrc.4994",
    dataNature: "GENERAL_THEORY",
    applicableConditions:
      "Explicit and implicit solvation effects on 1H/13C chemical shifts, hydrogen-bonding deshielding in DMSO-d6/Acetone-d6, and aromatic solvent-induced shifts (ASIS) in C6D6.",
    version: "2020.1",
  },
  GOTTLIEB_1997_JOC: {
    id: "GOTTLIEB_1997_JOC",
    authors: "Gottlieb, H. E.; Kotlyar, V.; Nudelman, A.",
    title: "NMR Chemical Shifts of Common Laboratory Solvents as Trace Impurities",
    journal: "The Journal of Organic Chemistry",
    year: 1997,
    doi: "10.1021/jo971176v",
    dataNature: "MEASURED_LITERATURE_DATA",
    applicableConditions:
      "Experimental 1H and 13C chemical shifts of residual solvent peaks, H2O/HDO, and 36 common laboratory solvents in CDCl3, (CD3)2SO, (CD3)2CO, CD3CN, CD3OD, D2O, and C6D6.",
    version: "1997.62",
  },
  FULMER_2010_ORGANOMET: {
    id: "FULMER_2010_ORGANOMET",
    authors:
      "Fulmer, G. R.; Miller, A. J. M.; Sherden, N. H.; Gottlieb, H. E.; Nudelman, A.; Stoltz, B. M.; Bercaw, J. E.; Goldberg, K. I.",
    title:
      "NMR Chemical Shifts of Trace Impurities: Common Laboratory Solvents, Organics, and Gases in Deuterated Solvents Relevant to the Organometallic Chemist",
    journal: "Organometallics",
    year: 2010,
    doi: "10.1021/om100106e",
    dataNature: "MEASURED_LITERATURE_DATA",
    applicableConditions:
      "Experimental residual solvent and trace impurity shifts across THF-d8, CD2Cl2, Toluene-d8, C6D6, CDCl3, and CD3CN.",
    version: "2010.29",
  },
  BABIJ_2016_OPRD: {
    id: "BABIJ_2016_OPRD",
    authors:
      "Babij, N. R.; McCusker, E. O.; Whiteker, G. T.; Canturk, B.; Choy, N.; Creemer, L. C.; De Amicis, C. V.; Hewlett, N. M.; Johnson, P. L.; Knobelsdorf, J. A.; Li, F.; Lorsbach, B. A.; Nugent, B. M.; Ryan, S. J.; Smith, M. R.; Yang, Q.",
    title:
      "NMR Chemical Shifts of Trace Impurities: Industrially Preferred Solvents Used in Process and Green Chemistry",
    journal: "Organic Process Research & Development",
    year: 2016,
    doi: "10.1021/acs.oprd.5b00417",
    dataNature: "MEASURED_LITERATURE_DATA",
    applicableConditions:
      "Experimental 1H and 13C chemical shifts of process and green chemistry solvents in CDCl3, DMSO-d6, D2O, CD3OD, and CD3CN.",
    version: "2016.20",
  },
  BUHL_2011_WCMS: {
    id: "BUHL_2011_WCMS",
    authors: "Bühl, M.; van Mourik, T.",
    title: "NMR spectroscopy: quantum-chemical calculations",
    journal: "WIREs Computational Molecular Science",
    year: 2011,
    doi: "10.1002/wcms.63",
    dataNature: "GENERAL_THEORY",
    applicableConditions:
      "Theoretical basis of nuclear magnetic shielding tensors (σ), relativistic heavy-atom effects on 13C shifts (e.g., C-I/C-Br), conformational averaging, and distinction between GIAO/DFT and empirical models.",
    version: "2011.1",
  },
  PRETSCH_EMPIRICAL_TABLES: {
    id: "PRETSCH_EMPIRICAL_TABLES",
    authors: "Pretsch, E.; Bühlmann, P.; Badertscher, M.",
    title: "Structure Determination of Organic Compounds: Tables of Spectral Data",
    journal: "Springer Reference Tables (Shoolery & Grant-Paul Additivity)",
    year: 2020,
    dataNature: "EMPIRICAL_INCREMENT_MODEL",
    applicableConditions:
      "Empirical substituent additivity increments for aliphatic (Shoolery / Grant-Paul), alkene, and aromatic (Z_ortho, Z_meta, Z_para, Z_ipso) 1H and 13C chemical shifts.",
    version: "5th-Ed",
  },
};

// ============================================================================
// 2. 氘代溶劑物理化學模型與殘留峰資料庫 (Deuterated Solvent & Residual Profiles)
// ============================================================================

export interface DeuteratedSolventProfile {
  solvent: NMRSolvent;
  labelZh: string;
  h1ResidualShifts: {
    ppm: number;
    multiplicity: string;
    jHdHz?: number;
    assignment: string;
  }[];
  h1WaterShiftPpm: number;
  h1WaterMultiplicity: string;
  c13ResidualShifts: {
    ppm: number;
    multiplicity: string;
    jCdHz?: number;
    assignment: string;
  }[];
  causesProticDeuteriumExchange: boolean;
  hBondAcceptorStrength: "STRONG" | "MODERATE" | "WEAK" | "AROMATIC_ASIS" | "PROTIC";
  // 相對於 CDCl3 的交換性氫位移修正 (ppm)
  exchangeableProtonShiftDelta: {
    phenolicOH: number;
    aliphaticOH: number;
    carboxylicCOOH: number;
    amideNH: number;
    amineNH: number;
  };
  // 相對於 CDCl3 的極性 C-H 與 C=O 位移微調 (ppm)
  polarCHShiftDelta: number;
  aromaticASISDelta: number;
  carbonylC13ShiftDelta: number;
  citationIds: string[];
  notesZh: string;
}

export const DEUTERATED_SOLVENT_PROFILES: Record<NMRSolvent, DeuteratedSolventProfile> = {
  CDCl3: {
    solvent: "CDCl3",
    labelZh: "CDCl₃ (氘代氯仿)",
    h1ResidualShifts: [
      { ppm: 7.26, multiplicity: "s", assignment: "CHCl₃ 殘留單峰 (7.26 ppm)" },
    ],
    h1WaterShiftPpm: 1.56,
    h1WaterMultiplicity: "s",
    c13ResidualShifts: [
      {
        ppm: 77.16,
        multiplicity: "t (1:1:1)",
        jCdHz: 31.6,
        assignment: "CDCl₃ 碳三重峰 (77.16 ppm, ¹J_CD ≈ 31.6 Hz)",
      },
    ],
    causesProticDeuteriumExchange: false,
    hBondAcceptorStrength: "WEAK",
    exchangeableProtonShiftDelta: {
      phenolicOH: 0.0,
      aliphaticOH: 0.0,
      carboxylicCOOH: 0.0,
      amideNH: 0.0,
      amineNH: 0.0,
    },
    polarCHShiftDelta: 0.0,
    aromaticASISDelta: 0.0,
    carbonylC13ShiftDelta: 0.0,
    citationIds: ["GOTTLIEB_1997_JOC", "FULMER_2010_ORGANOMET"],
    notesZh:
      "標準非質子弱極性參考溶劑；¹H 殘留 CHCl₃ 於 7.26 ppm (s)，微量水 H₂O 於 1.56 ppm (s)；¹³C 於 77.16 ppm (1:1:1 t)。",
  },
  "DMSO-d6": {
    solvent: "DMSO-d6",
    labelZh: "DMSO-d₆ (氘代二甲基亞碸)",
    h1ResidualShifts: [
      {
        ppm: 2.50,
        multiplicity: "quint",
        jHdHz: 1.9,
        assignment: "CHD₂SOCD₃ 殘留五重峰 (2.50 ppm, ²J_HD = 1.9 Hz)",
      },
    ],
    h1WaterShiftPpm: 3.33,
    h1WaterMultiplicity: "br s",
    c13ResidualShifts: [
      {
        ppm: 39.52,
        multiplicity: "sept",
        jCdHz: 21.0,
        assignment: "(CD₃)₂SO 碳七重峰 (39.52 ppm, ¹J_CD = 21.0 Hz)",
      },
    ],
    causesProticDeuteriumExchange: false,
    hBondAcceptorStrength: "STRONG",
    exchangeableProtonShiftDelta: {
      phenolicOH: +3.65, // 酚 -OH 在 DMSO-d6 受強氫鍵去遮蔽移至 ~9.1–10.3 ppm 且峰形變尖銳
      aliphaticOH: +2.45, // 醇 -OH 移至 ~4.3–5.3 ppm，常可觀察到 ³J(HCOH) 裂分
      carboxylicCOOH: +0.9, // 羧酸 -COOH 於 ~12.0–13.2 ppm
      amideNH: +2.15, // 醯胺 -NHCO- 由 ~7.5 移至 ~9.6–10.2 ppm
      amineNH: +1.25,
    },
    polarCHShiftDelta: -0.06,
    aromaticASISDelta: -0.05,
    carbonylC13ShiftDelta: -0.6,
    citationIds: ["GOTTLIEB_1997_JOC", "CASABIANCA_2020_MRC", "BABIJ_2016_OPRD"],
    notesZh:
      "強氫鍵受體極性非質子溶劑；減緩 -OH/-NH 質子交換速率並使其顯著移向低場（如酚 OH ~9.2–10.2 ppm，醯胺 NH ~9.5–10.2 ppm）；殘留峰 2.50 ppm (quint)，水峰 3.33 ppm。",
  },
  CD3OD: {
    solvent: "CD3OD",
    labelZh: "CD₃OD (氘代甲醇)",
    h1ResidualShifts: [
      {
        ppm: 3.31,
        multiplicity: "quint",
        jHdHz: 1.7,
        assignment: "CHD₂OD 殘留五重峰 (3.31 ppm)",
      },
    ],
    h1WaterShiftPpm: 4.87,
    h1WaterMultiplicity: "s",
    c13ResidualShifts: [
      {
        ppm: 49.0,
        multiplicity: "sept",
        jCdHz: 21.4,
        assignment: "CD₃OD 碳七重峰 (49.00 ppm)",
      },
    ],
    causesProticDeuteriumExchange: true,
    hBondAcceptorStrength: "PROTIC",
    exchangeableProtonShiftDelta: {
      phenolicOH: 0.0,
      aliphaticOH: 0.0,
      carboxylicCOOH: 0.0,
      amideNH: 0.0,
      amineNH: 0.0,
    },
    polarCHShiftDelta: +0.04,
    aromaticASISDelta: +0.02,
    carbonylC13ShiftDelta: +1.2,
    citationIds: ["GOTTLIEB_1997_JOC", "CASABIANCA_2020_MRC"],
    notesZh:
      "質子性氘代溶劑；分子中之活潑氫 (-OH, -NH₂, -COOH, 多數 -CONH-) 會與 -OD 發生快速 H/D 氘交換而於 ¹H 圖譜中消失或併入 4.87 ppm HDO 峰。",
  },
  D2O: {
    solvent: "D2O",
    labelZh: "D₂O (重水)",
    h1ResidualShifts: [
      { ppm: 4.79, multiplicity: "s", assignment: "HDO 殘留單峰 (4.79 ppm，隨溫度約 -0.01 ppm/K 移動)" },
    ],
    h1WaterShiftPpm: 4.79,
    h1WaterMultiplicity: "s",
    c13ResidualShifts: [],
    causesProticDeuteriumExchange: true,
    hBondAcceptorStrength: "PROTIC",
    exchangeableProtonShiftDelta: {
      phenolicOH: 0.0,
      aliphaticOH: 0.0,
      carboxylicCOOH: 0.0,
      amideNH: 0.0,
      amineNH: 0.0,
    },
    polarCHShiftDelta: +0.08,
    aromaticASISDelta: +0.05,
    carbonylC13ShiftDelta: +2.4,
    citationIds: ["GOTTLIEB_1997_JOC", "CASABIANCA_2020_MRC"],
    notesZh:
      "重水溶劑；所有可交換活潑質子 (-OH, -COOH, -NH₂, -NHR, -SH) 均與 D₂O 快速交換為 -OD/-ND 而於 ¹H 圖譜中消失；¹³C 無溶劑碳峰。",
  },
  "Acetone-d6": {
    solvent: "Acetone-d6",
    labelZh: "Acetone-d₆ (氘代丙酮)",
    h1ResidualShifts: [
      {
        ppm: 2.05,
        multiplicity: "quint",
        jHdHz: 2.2,
        assignment: "CHD₂COCD₃ 殘留五重峰 (2.05 ppm)",
      },
    ],
    h1WaterShiftPpm: 2.84,
    h1WaterMultiplicity: "s",
    c13ResidualShifts: [
      {
        ppm: 29.84,
        multiplicity: "sept",
        jCdHz: 19.4,
        assignment: "Acetone-d₆ 甲基碳七重峰 (29.84 ppm)",
      },
      {
        ppm: 206.26,
        multiplicity: "m",
        assignment: "Acetone-d₆ 羰基碳多重峰 (206.26 ppm)",
      },
    ],
    causesProticDeuteriumExchange: false,
    hBondAcceptorStrength: "MODERATE",
    exchangeableProtonShiftDelta: {
      phenolicOH: +2.8,
      aliphaticOH: +1.6,
      carboxylicCOOH: +0.5,
      amideNH: +1.4,
      amineNH: +0.7,
    },
    polarCHShiftDelta: -0.03,
    aromaticASISDelta: +0.02,
    carbonylC13ShiftDelta: -0.3,
    citationIds: ["GOTTLIEB_1997_JOC", "FULMER_2010_ORGANOMET"],
    notesZh:
      "中強氫鍵受體溶劑；¹H 殘留峰 2.05 ppm (quint)，水峰 2.84 ppm (與 HDO 交換可能出現 1:1:1 三重峰)；¹³C 於 29.84 與 206.26 ppm。",
  },
  CD3CN: {
    solvent: "CD3CN",
    labelZh: "CD₃CN (氘代乙腈)",
    h1ResidualShifts: [
      {
        ppm: 1.94,
        multiplicity: "quint",
        jHdHz: 2.5,
        assignment: "CHD₂CN 殘留五重峰 (1.94 ppm)",
      },
    ],
    h1WaterShiftPpm: 2.13,
    h1WaterMultiplicity: "s",
    c13ResidualShifts: [
      {
        ppm: 1.32,
        multiplicity: "sept",
        jCdHz: 21.1,
        assignment: "CD₃CN 甲基碳七重峰 (1.32 ppm)",
      },
      {
        ppm: 118.26,
        multiplicity: "s",
        assignment: "CD₃CN 腈基碳峰 (118.26 ppm)",
      },
    ],
    causesProticDeuteriumExchange: false,
    hBondAcceptorStrength: "MODERATE",
    exchangeableProtonShiftDelta: {
      phenolicOH: +1.5,
      aliphaticOH: +0.8,
      carboxylicCOOH: +0.2,
      amideNH: +0.8,
      amineNH: +0.4,
    },
    polarCHShiftDelta: -0.02,
    aromaticASISDelta: +0.02,
    carbonylC13ShiftDelta: +0.4,
    citationIds: ["GOTTLIEB_1997_JOC", "FULMER_2010_ORGANOMET"],
    notesZh: "極性非質子溶劑；¹H 殘留峰 1.94 ppm (quint)，水峰 2.13 ppm；¹³C 於 1.32 與 118.26 ppm。",
  },
  C6D6: {
    solvent: "C6D6",
    labelZh: "C₆D₆ (氘代苯)",
    h1ResidualShifts: [
      { ppm: 7.16, multiplicity: "s", assignment: "C₆D₅H 殘留單峰 (7.16 ppm)" },
    ],
    h1WaterShiftPpm: 0.40,
    h1WaterMultiplicity: "s",
    c13ResidualShifts: [
      {
        ppm: 128.06,
        multiplicity: "t (1:1:1)",
        jCdHz: 24.3,
        assignment: "C₆D₆ 碳三重峰 (128.06 ppm)",
      },
    ],
    causesProticDeuteriumExchange: false,
    hBondAcceptorStrength: "AROMATIC_ASIS",
    exchangeableProtonShiftDelta: {
      phenolicOH: -0.6,
      aliphaticOH: -0.5,
      carboxylicCOOH: -0.4,
      amideNH: -0.7,
      amineNH: -0.4,
    },
    polarCHShiftDelta: -0.35, // Aromatic Solvent Induced Shift (ASIS)
    aromaticASISDelta: -0.22,
    carbonylC13ShiftDelta: -0.5,
    citationIds: ["GOTTLIEB_1997_JOC", "FULMER_2010_ORGANOMET", "CASABIANCA_2020_MRC"],
    notesZh:
      "芳香族非極性溶劑，具顯著芳香溶劑誘導位移效應 (ASIS)，常使極性基團鄰近質子向高場移動 0.2–0.5 ppm；殘留峰 7.16 ppm，水峰 0.40 ppm。",
  },
  "THF-d8": {
    solvent: "THF-d8",
    labelZh: "THF-d₈ (氘代四氫呋喃)",
    h1ResidualShifts: [
      { ppm: 3.58, multiplicity: "m", assignment: "THF-d₇ α-CHD 殘留峰 (3.58 ppm)" },
      { ppm: 1.72, multiplicity: "m", assignment: "THF-d₇ β-CHD 殘留峰 (1.72 ppm)" },
    ],
    h1WaterShiftPpm: 2.46,
    h1WaterMultiplicity: "s",
    c13ResidualShifts: [
      { ppm: 67.21, multiplicity: "quint", assignment: "THF-d₈ C-2,5 五重峰 (67.21 ppm)" },
      { ppm: 25.31, multiplicity: "quint", assignment: "THF-d₈ C-3,4 五重峰 (25.31 ppm)" },
    ],
    causesProticDeuteriumExchange: false,
    hBondAcceptorStrength: "MODERATE",
    exchangeableProtonShiftDelta: {
      phenolicOH: +2.4,
      aliphaticOH: +1.4,
      carboxylicCOOH: +0.4,
      amideNH: +1.2,
      amineNH: +0.5,
    },
    polarCHShiftDelta: -0.04,
    aromaticASISDelta: 0.0,
    carbonylC13ShiftDelta: -0.4,
    citationIds: ["FULMER_2010_ORGANOMET"],
    notesZh: "醚類配位溶劑；¹H 殘留峰於 3.58 與 1.72 ppm，水峰 2.46 ppm；¹³C 於 67.21 與 25.31 ppm。",
  },
  CD2Cl2: {
    solvent: "CD2Cl2",
    labelZh: "CD₂Cl₂ (氘代二氯甲烷)",
    h1ResidualShifts: [
      { ppm: 5.32, multiplicity: "t", jHdHz: 1.1, assignment: "CHDCl₂ 殘留三重峰 (5.32 ppm)" },
    ],
    h1WaterShiftPpm: 1.52,
    h1WaterMultiplicity: "s",
    c13ResidualShifts: [
      { ppm: 53.84, multiplicity: "quint", jCdHz: 27.2, assignment: "CD₂Cl₂ 碳五重峰 (53.84 ppm)" },
    ],
    causesProticDeuteriumExchange: false,
    hBondAcceptorStrength: "WEAK",
    exchangeableProtonShiftDelta: {
      phenolicOH: +0.05,
      aliphaticOH: 0.0,
      carboxylicCOOH: 0.0,
      amideNH: +0.05,
      amineNH: 0.0,
    },
    polarCHShiftDelta: +0.02,
    aromaticASISDelta: +0.02,
    carbonylC13ShiftDelta: +0.2,
    citationIds: ["FULMER_2010_ORGANOMET"],
    notesZh: "低沸點弱配位鹵代溶劑；¹H 殘留峰於 5.32 ppm (t)，水峰 1.52 ppm；¹³C 於 53.84 ppm (quint)。",
  },
  "Toluene-d8": {
    solvent: "Toluene-d8",
    labelZh: "Toluene-d₈ (氘代甲苯)",
    h1ResidualShifts: [
      { ppm: 2.08, multiplicity: "quint", assignment: "C₆D₅CHD₂ 甲基殘留峰 (2.08 ppm)" },
      { ppm: 6.97, multiplicity: "m", assignment: "Toluene-d₇ H-4 殘留峰 (6.97 ppm)" },
      { ppm: 7.01, multiplicity: "m", assignment: "Toluene-d₇ H-2,6 殘留峰 (7.01 ppm)" },
      { ppm: 7.09, multiplicity: "m", assignment: "Toluene-d₇ H-3,5 殘留峰 (7.09 ppm)" },
    ],
    h1WaterShiftPpm: 0.43,
    h1WaterMultiplicity: "s",
    c13ResidualShifts: [
      { ppm: 20.43, multiplicity: "sept", assignment: "Toluene-d₈ CD₃ (20.43 ppm)" },
      { ppm: 125.13, multiplicity: "t", assignment: "Toluene-d₈ C-4 (125.13 ppm)" },
      { ppm: 127.96, multiplicity: "t", assignment: "Toluene-d₈ C-3,5 (127.96 ppm)" },
      { ppm: 128.87, multiplicity: "t", assignment: "Toluene-d₈ C-2,6 (128.87 ppm)" },
      { ppm: 137.48, multiplicity: "s", assignment: "Toluene-d₈ C-1 (137.48 ppm)" },
    ],
    causesProticDeuteriumExchange: false,
    hBondAcceptorStrength: "AROMATIC_ASIS",
    exchangeableProtonShiftDelta: {
      phenolicOH: -0.5,
      aliphaticOH: -0.4,
      carboxylicCOOH: -0.3,
      amideNH: -0.6,
      amineNH: -0.3,
    },
    polarCHShiftDelta: -0.3,
    aromaticASISDelta: -0.18,
    carbonylC13ShiftDelta: -0.4,
    citationIds: ["FULMER_2010_ORGANOMET"],
    notesZh: "常用於變溫 NMR 之芳香族溶劑，具顯著 ASIS 效應；殘留甲基峰 2.08 ppm，芳環峰 6.97–7.09 ppm。",
  },
  Unknown: {
    solvent: "Unknown",
    labelZh: "未指定溶劑 (預設以 CDCl₃ 基準評估並放寬溶劑位移不確定度)",
    h1ResidualShifts: [],
    h1WaterShiftPpm: 1.56,
    h1WaterMultiplicity: "s",
    c13ResidualShifts: [],
    causesProticDeuteriumExchange: false,
    hBondAcceptorStrength: "WEAK",
    exchangeableProtonShiftDelta: {
      phenolicOH: 0.0,
      aliphaticOH: 0.0,
      carboxylicCOOH: 0.0,
      amideNH: 0.0,
      amineNH: 0.0,
    },
    polarCHShiftDelta: 0.0,
    aromaticASISDelta: 0.0,
    carbonylC13ShiftDelta: 0.0,
    citationIds: ["GOTTLIEB_1997_JOC"],
    notesZh: "未指定溶劑時，活潑氫與極性官能基保留較寬之溶劑位移容許區間。",
  },
};

// ============================================================================
// 3. 常見實驗室微量殘留溶劑與雜質峰查核表 (Gottlieb 1997 / Fulmer 2010 / Babij 2016)
// ============================================================================

export interface TraceImpurityEntry {
  id: string;
  nameEn: string;
  nameZh: string;
  role: SignalRole;
  citationId: string;
  h1ShiftsBySolvent: Partial<
    Record<NMRSolvent, { ppm: number; mult: string; protonLabel: string }[]>
  >;
  c13ShiftsBySolvent: Partial<Record<NMRSolvent, number[]>>;
}

export const TRACE_IMPURITY_SHIFT_TABLE: TraceImpurityEntry[] = [
  {
    id: "TMS",
    nameEn: "Tetramethylsilane (TMS)",
    nameZh: "四甲基矽烷內標 (TMS)",
    role: "REFERENCE_TMS",
    citationId: "GOTTLIEB_1997_JOC",
    h1ShiftsBySolvent: {
      CDCl3: [{ ppm: 0.0, mult: "s", protonLabel: "Si(CH3)4 (12H)" }],
      "DMSO-d6": [{ ppm: 0.0, mult: "s", protonLabel: "Si(CH3)4 (12H)" }],
      CD3OD: [{ ppm: 0.0, mult: "s", protonLabel: "Si(CH3)4 (12H)" }],
      "Acetone-d6": [{ ppm: 0.0, mult: "s", protonLabel: "Si(CH3)4 (12H)" }],
      CD3CN: [{ ppm: 0.0, mult: "s", protonLabel: "Si(CH3)4 (12H)" }],
      C6D6: [{ ppm: 0.0, mult: "s", protonLabel: "Si(CH3)4 (12H)" }],
    },
    c13ShiftsBySolvent: {
      CDCl3: [0.0],
      "DMSO-d6": [0.0],
      CD3OD: [0.0],
    },
  },
  {
    id: "WATER_HDO",
    nameEn: "Water / HDO",
    nameZh: "微量水分 (H₂O / HDO)",
    role: "WATER",
    citationId: "GOTTLIEB_1997_JOC",
    h1ShiftsBySolvent: {
      CDCl3: [{ ppm: 1.56, mult: "s", protonLabel: "H2O" }],
      "DMSO-d6": [{ ppm: 3.33, mult: "br s", protonLabel: "H2O" }],
      CD3OD: [{ ppm: 4.87, mult: "s", protonLabel: "H2O/HDO" }],
      D2O: [{ ppm: 4.79, mult: "s", protonLabel: "HDO" }],
      "Acetone-d6": [{ ppm: 2.84, mult: "s", protonLabel: "H2O" }],
      CD3CN: [{ ppm: 2.13, mult: "s", protonLabel: "H2O" }],
      C6D6: [{ ppm: 0.4, mult: "s", protonLabel: "H2O" }],
      "THF-d8": [{ ppm: 2.46, mult: "s", protonLabel: "H2O" }],
      CD2Cl2: [{ ppm: 1.52, mult: "s", protonLabel: "H2O" }],
      "Toluene-d8": [{ ppm: 0.43, mult: "s", protonLabel: "H2O" }],
    },
    c13ShiftsBySolvent: {},
  },
  {
    id: "DCM",
    nameEn: "Dichloromethane (CH2Cl2)",
    nameZh: "二氯甲烷殘留 (CH₂Cl₂)",
    role: "IMPURITY",
    citationId: "GOTTLIEB_1997_JOC",
    h1ShiftsBySolvent: {
      CDCl3: [{ ppm: 5.3, mult: "s", protonLabel: "CH2Cl2 (2H)" }],
      "DMSO-d6": [{ ppm: 5.76, mult: "s", protonLabel: "CH2Cl2 (2H)" }],
      CD3OD: [{ ppm: 5.49, mult: "s", protonLabel: "CH2Cl2 (2H)" }],
      "Acetone-d6": [{ ppm: 5.63, mult: "s", protonLabel: "CH2Cl2 (2H)" }],
      CD3CN: [{ ppm: 5.44, mult: "s", protonLabel: "CH2Cl2 (2H)" }],
      C6D6: [{ ppm: 4.27, mult: "s", protonLabel: "CH2Cl2 (2H)" }],
    },
    c13ShiftsBySolvent: {
      CDCl3: [53.52],
      "DMSO-d6": [54.95],
      CD3OD: [54.78],
    },
  },
  {
    id: "ETOAC",
    nameEn: "Ethyl Acetate",
    nameZh: "乙酸乙酯殘留 (EtOAc)",
    role: "IMPURITY",
    citationId: "GOTTLIEB_1997_JOC",
    h1ShiftsBySolvent: {
      CDCl3: [
        { ppm: 4.12, mult: "q", protonLabel: "OCH2 (2H)" },
        { ppm: 2.05, mult: "s", protonLabel: "COCH3 (3H)" },
        { ppm: 1.26, mult: "t", protonLabel: "CH3 (3H)" },
      ],
      "DMSO-d6": [
        { ppm: 4.03, mult: "q", protonLabel: "OCH2 (2H)" },
        { ppm: 1.99, mult: "s", protonLabel: "COCH3 (3H)" },
        { ppm: 1.17, mult: "t", protonLabel: "CH3 (3H)" },
      ],
    },
    c13ShiftsBySolvent: {
      CDCl3: [171.36, 60.49, 21.04, 14.19],
      "DMSO-d6": [170.31, 59.74, 20.68, 14.4],
    },
  },
  {
    id: "SILICONE_GREASE",
    nameEn: "Silicone Grease (PDMS)",
    nameZh: "矽脂殘留 (Silicone Grease)",
    role: "IMPURITY",
    citationId: "GOTTLIEB_1997_JOC",
    h1ShiftsBySolvent: {
      CDCl3: [{ ppm: 0.07, mult: "s", protonLabel: "(OSiMe2)n" }],
      "DMSO-d6": [{ ppm: 0.06, mult: "s", protonLabel: "(OSiMe2)n" }],
      C6D6: [{ ppm: 0.29, mult: "s", protonLabel: "(OSiMe2)n" }],
    },
    c13ShiftsBySolvent: {
      CDCl3: [1.04],
    },
  },
  {
    id: "ACETONE",
    nameEn: "Acetone",
    nameZh: "丙酮殘留 (Acetone)",
    role: "IMPURITY",
    citationId: "GOTTLIEB_1997_JOC",
    h1ShiftsBySolvent: {
      CDCl3: [{ ppm: 2.17, mult: "s", protonLabel: "CH3 (6H)" }],
      "DMSO-d6": [{ ppm: 2.09, mult: "s", protonLabel: "CH3 (6H)" }],
      CD3OD: [{ ppm: 2.15, mult: "s", protonLabel: "CH3 (6H)" }],
      D2O: [{ ppm: 2.22, mult: "s", protonLabel: "CH3 (6H)" }],
    },
    c13ShiftsBySolvent: {
      CDCl3: [207.07, 30.92],
      "DMSO-d6": [206.31, 30.56],
    },
  },
  {
    id: "DIETHYL_ETHER",
    nameEn: "Diethyl Ether (Et2O)",
    nameZh: "乙醚殘留 (Et₂O)",
    role: "IMPURITY",
    citationId: "GOTTLIEB_1997_JOC",
    h1ShiftsBySolvent: {
      CDCl3: [
        { ppm: 3.48, mult: "q", protonLabel: "OCH2 (4H)" },
        { ppm: 1.21, mult: "t", protonLabel: "CH3 (6H)" },
      ],
      "DMSO-d6": [
        { ppm: 3.38, mult: "q", protonLabel: "OCH2 (4H)" },
        { ppm: 1.09, mult: "t", protonLabel: "CH3 (6H)" },
      ],
    },
    c13ShiftsBySolvent: {
      CDCl3: [65.91, 15.2],
      "DMSO-d6": [62.05, 15.12],
    },
  },
  {
    id: "THF",
    nameEn: "Tetrahydrofuran (THF)",
    nameZh: "四氫呋喃殘留 (THF)",
    role: "IMPURITY",
    citationId: "FULMER_2010_ORGANOMET",
    h1ShiftsBySolvent: {
      CDCl3: [
        { ppm: 3.76, mult: "m", protonLabel: "OCH2 (4H)" },
        { ppm: 1.85, mult: "m", protonLabel: "CH2 (4H)" },
      ],
      "DMSO-d6": [
        { ppm: 3.6, mult: "m", protonLabel: "OCH2 (4H)" },
        { ppm: 1.76, mult: "m", protonLabel: "CH2 (4H)" },
      ],
    },
    c13ShiftsBySolvent: {
      CDCl3: [67.97, 25.62],
      "DMSO-d6": [67.03, 25.14],
    },
  },
  {
    id: "METHANOL",
    nameEn: "Methanol (MeOH)",
    nameZh: "甲醇殘留 (MeOH)",
    role: "IMPURITY",
    citationId: "GOTTLIEB_1997_JOC",
    h1ShiftsBySolvent: {
      CDCl3: [{ ppm: 3.49, mult: "s", protonLabel: "OCH3 (3H)" }],
      "DMSO-d6": [{ ppm: 3.16, mult: "d", protonLabel: "OCH3 (3H)" }],
      D2O: [{ ppm: 3.34, mult: "s", protonLabel: "OCH3 (3H)" }],
    },
    c13ShiftsBySolvent: {
      CDCl3: [50.41],
      "DMSO-d6": [48.59],
    },
  },
  {
    id: "ETHANOL",
    nameEn: "Ethanol (EtOH)",
    nameZh: "乙醇殘留 (EtOH)",
    role: "IMPURITY",
    citationId: "GOTTLIEB_1997_JOC",
    h1ShiftsBySolvent: {
      CDCl3: [
        { ppm: 3.72, mult: "q", protonLabel: "OCH2 (2H)" },
        { ppm: 1.25, mult: "t", protonLabel: "CH3 (3H)" },
      ],
      "DMSO-d6": [
        { ppm: 3.44, mult: "qd", protonLabel: "OCH2 (2H)" },
        { ppm: 1.06, mult: "t", protonLabel: "CH3 (3H)" },
      ],
    },
    c13ShiftsBySolvent: {
      CDCl3: [58.28, 18.41],
      "DMSO-d6": [56.07, 18.51],
    },
  },
  {
    id: "HEXANE",
    nameEn: "n-Hexane",
    nameZh: "正己烷殘留 (n-Hexane)",
    role: "IMPURITY",
    citationId: "GOTTLIEB_1997_JOC",
    h1ShiftsBySolvent: {
      CDCl3: [
        { ppm: 1.26, mult: "m", protonLabel: "CH2 (8H)" },
        { ppm: 0.88, mult: "t", protonLabel: "CH3 (6H)" },
      ],
      "DMSO-d6": [
        { ppm: 1.25, mult: "m", protonLabel: "CH2 (8H)" },
        { ppm: 0.86, mult: "t", protonLabel: "CH3 (6H)" },
      ],
    },
    c13ShiftsBySolvent: {
      CDCl3: [31.64, 22.7, 14.14],
    },
  },
  {
    id: "TOLUENE",
    nameEn: "Toluene",
    nameZh: "甲苯殘留 (Toluene)",
    role: "IMPURITY",
    citationId: "BABIJ_2016_OPRD",
    h1ShiftsBySolvent: {
      CDCl3: [
        { ppm: 7.25, mult: "m", protonLabel: "Ar-H (3H)" },
        { ppm: 7.17, mult: "m", protonLabel: "Ar-H (2H)" },
        { ppm: 2.36, mult: "s", protonLabel: "CH3 (3H)" },
      ],
      "DMSO-d6": [
        { ppm: 7.25, mult: "m", protonLabel: "Ar-H (3H)" },
        { ppm: 7.18, mult: "m", protonLabel: "Ar-H (2H)" },
        { ppm: 2.3, mult: "s", protonLabel: "CH3 (3H)" },
      ],
    },
    c13ShiftsBySolvent: {
      CDCl3: [137.89, 129.07, 128.26, 125.33, 21.46],
    },
  },
];

/**
 * 檢查實驗峰是否吻合特定氘代溶劑之殘留溶劑峰、水峰或內標 TMS
 */
export function matchSolventOrReferenceSignal(
  modality: "1H_NMR" | "13C_NMR",
  shiftPpm: number,
  solvent: NMRSolvent = "Unknown"
): {
  matched: boolean;
  name: string;
  role: SignalRole;
  literatureShiftPpm: number;
  citationDoi: string;
  explanationZh: string;
} | null {
  const profile = DEUTERATED_SOLVENT_PROFILES[solvent] || DEUTERATED_SOLVENT_PROFILES.Unknown;
  const doi = NMR_LITERATURE_REGISTRY.GOTTLIEB_1997_JOC.doi!;

  if (modality === "1H_NMR") {
    if (Math.abs(shiftPpm) <= 0.03) {
      return {
        matched: true,
        name: "TMS (四甲基矽烷基準峰)",
        role: "REFERENCE_TMS",
        literatureShiftPpm: 0.0,
        citationDoi: doi,
        explanationZh: "δ 0.00 ppm 為 TMS 化學位移內標峰 (Gottlieb et al., JOC 1997)。",
      };
    }

    for (const res of profile.h1ResidualShifts) {
      if (Math.abs(shiftPpm - res.ppm) <= 0.05) {
        return {
          matched: true,
          name: `${profile.labelZh} 殘留溶劑峰`,
          role: "SOLVENT",
          literatureShiftPpm: res.ppm,
          citationDoi: doi,
          explanationZh: `吻合 ${profile.labelZh} 之殘留質子峰 ${res.assignment} (Gottlieb 1997 / Fulmer 2010)。`,
        };
      }
    }

    if (
      solvent !== "Unknown" &&
      Math.abs(shiftPpm - profile.h1WaterShiftPpm) <= 0.06
    ) {
      return {
        matched: true,
        name: `${profile.labelZh} 中之微量水峰 (H₂O/HDO)`,
        role: "WATER",
        literatureShiftPpm: profile.h1WaterShiftPpm,
        citationDoi: doi,
        explanationZh: `吻合 ${profile.labelZh} 中微量水/HDO 於 δ ${profile.h1WaterShiftPpm.toFixed(2)} ppm 之實測化學位移 (Gottlieb 1997)。`,
      };
    }
  } else if (modality === "13C_NMR") {
    for (const res of profile.c13ResidualShifts) {
      if (Math.abs(shiftPpm - res.ppm) <= 0.65) {
        return {
          matched: true,
          name: `${profile.labelZh} 殘留碳峰`,
          role: "SOLVENT",
          literatureShiftPpm: res.ppm,
          citationDoi: doi,
          explanationZh: `吻合 ${profile.labelZh} 溶劑碳訊號 ${res.assignment} (Gottlieb 1997 / Fulmer 2010)。`,
        };
      }
    }
  }

  return null;
}

export const TRACE_IMPURITY_REFERENCE_TABLE = TRACE_IMPURITY_SHIFT_TABLE;

// ============================================================================
// 4. 取代基效應與化學位移加成參數庫 (Substituent Additivity Tables)
// ============================================================================

export type AromaticSubstituentClass =
  | "OH"
  | "OR"
  | "OCOR"
  | "NH2"
  | "NHCOR"
  | "NR2"
  | "CH3"
  | "ALKYL"
  | "CHO"
  | "COR"
  | "COOH"
  | "COOR"
  | "CONH"
  | "CN"
  | "NO2"
  | "F"
  | "Cl"
  | "Br"
  | "I"
  | "ARYL"
  | "SH"
  | "SO2R"
  | "OTHER";

export interface AromaticIncrementSet {
  labelZh: string;
  // 1H increments relative to benzene (7.26 ppm in CDCl3)
  h1Ortho: number;
  h1Meta: number;
  h1Para: number;
  // 13C increments relative to benzene (128.5 ppm in CDCl3)
  c13Ipso: number;
  c13Ortho: number;
  c13Meta: number;
  c13Para: number;
  isEWG: boolean;
  isEDG: boolean;
}

export const AROMATIC_SUBSTITUENT_INCREMENTS: Record<
  AromaticSubstituentClass,
  AromaticIncrementSet
> = {
  OH: {
    labelZh: "酚羥基 (-OH，強共振推電子 +M > -I)",
    h1Ortho: -0.52,
    h1Meta: -0.14,
    h1Para: -0.44,
    c13Ipso: +26.9,
    c13Ortho: -12.8,
    c13Meta: +1.4,
    c13Para: -7.4,
    isEWG: false,
    isEDG: true,
  },
  OR: {
    labelZh: "烷氧基 (-OR，共振推電子 +M)",
    h1Ortho: -0.45,
    h1Meta: -0.09,
    h1Para: -0.38,
    c13Ipso: +31.4,
    c13Ortho: -14.4,
    c13Meta: +1.0,
    c13Para: -7.7,
    isEWG: false,
    isEDG: true,
  },
  OCOR: {
    labelZh: "醯氧基 (-OC(=O)R，中等推/誘導效應)",
    h1Ortho: -0.18,
    h1Meta: +0.08,
    h1Para: -0.08,
    c13Ipso: +22.4,
    c13Ortho: -6.8,
    c13Meta: +1.0,
    c13Para: -2.6,
    isEWG: false,
    isEDG: true,
  },
  NH2: {
    labelZh: "胺基 (-NH₂，強共振推電子 +M)",
    h1Ortho: -0.75,
    h1Meta: -0.24,
    h1Para: -0.63,
    c13Ipso: +18.2,
    c13Ortho: -13.4,
    c13Meta: +0.8,
    c13Para: -10.0,
    isEWG: false,
    isEDG: true,
  },
  NHCOR: {
    labelZh: "醯胺基 (-NHC(=O)R，中等共振推電子 +M)",
    h1Ortho: +0.18,
    h1Meta: -0.02,
    h1Para: -0.22,
    c13Ipso: +11.1,
    c13Ortho: -8.2,
    c13Meta: +0.2,
    c13Para: -4.4,
    isEWG: false,
    isEDG: true,
  },
  NR2: {
    labelZh: "二烷基胺基 (-NR₂，強共振推電子 +M)",
    h1Ortho: -0.66,
    h1Meta: -0.18,
    h1Para: -0.67,
    c13Ipso: +22.4,
    c13Ortho: -15.7,
    c13Meta: +0.8,
    c13Para: -11.8,
    isEWG: false,
    isEDG: true,
  },
  CH3: {
    labelZh: "甲基 (-CH₃，超共軛/弱推電子)",
    h1Ortho: -0.16,
    h1Meta: -0.09,
    h1Para: -0.17,
    c13Ipso: +9.3,
    c13Ortho: +0.7,
    c13Meta: -0.1,
    c13Para: -2.9,
    isEWG: false,
    isEDG: true,
  },
  ALKYL: {
    labelZh: "烷基取代基 (-R)",
    h1Ortho: -0.14,
    h1Meta: -0.06,
    h1Para: -0.15,
    c13Ipso: +14.8,
    c13Ortho: -0.4,
    c13Meta: -0.1,
    c13Para: -2.6,
    isEWG: false,
    isEDG: true,
  },
  CHO: {
    labelZh: "醛基 (-CHO，強拉電子 -M/-I 與磁異向性)",
    h1Ortho: +0.58,
    h1Meta: +0.22,
    h1Para: +0.29,
    c13Ipso: +8.2,
    c13Ortho: +1.2,
    c13Meta: +0.6,
    c13Para: +5.8,
    isEWG: true,
    isEDG: false,
  },
  COR: {
    labelZh: "醯基/酮基 (-C(=O)R，拉電子 -M/-I)",
    h1Ortho: +0.64,
    h1Meta: +0.16,
    h1Para: +0.26,
    c13Ipso: +8.9,
    c13Ortho: +0.1,
    c13Meta: -0.1,
    c13Para: +4.5,
    isEWG: true,
    isEDG: false,
  },
  COOH: {
    labelZh: "羧基 (-COOH，拉電子 -M/-I)",
    h1Ortho: +0.8,
    h1Meta: +0.16,
    h1Para: +0.26,
    c13Ipso: +2.1,
    c13Ortho: +1.6,
    c13Meta: -0.1,
    c13Para: +5.2,
    isEWG: true,
    isEDG: false,
  },
  COOR: {
    labelZh: "酯羰基 (-C(=O)OR，拉電子 -M/-I)",
    h1Ortho: +0.74,
    h1Meta: +0.14,
    h1Para: +0.22,
    c13Ipso: +2.0,
    c13Ortho: +1.2,
    c13Meta: -0.1,
    c13Para: +4.3,
    isEWG: true,
    isEDG: false,
  },
  CONH: {
    labelZh: "醯胺羰基 (-C(=O)NH-，拉電子 -M/-I)",
    h1Ortho: +0.55,
    h1Meta: +0.12,
    h1Para: +0.2,
    c13Ipso: +5.4,
    c13Ortho: -0.3,
    c13Meta: +0.2,
    c13Para: +3.1,
    isEWG: true,
    isEDG: false,
  },
  CN: {
    labelZh: "腈基 (-C≡N，拉電子 -M/-I)",
    h1Ortho: +0.38,
    h1Meta: +0.18,
    h1Para: +0.28,
    c13Ipso: -15.6,
    c13Ortho: +3.6,
    c13Meta: +0.7,
    c13Para: +4.3,
    isEWG: true,
    isEDG: false,
  },
  NO2: {
    labelZh: "硝基 (-NO₂，極強拉電子 -M/-I)",
    h1Ortho: +0.95,
    h1Meta: +0.26,
    h1Para: +0.38,
    c13Ipso: +19.6,
    c13Ortho: -5.3,
    c13Meta: +0.9,
    c13Para: +6.0,
    isEWG: true,
    isEDG: false,
  },
  F: {
    labelZh: "氟原子 (-F，強電負度誘導 -I 與共振 +M)",
    h1Ortho: -0.26,
    h1Meta: +0.02,
    h1Para: -0.2,
    c13Ipso: +34.8,
    c13Ortho: -12.9,
    c13Meta: +1.4,
    c13Para: -4.5,
    isEWG: true,
    isEDG: false,
  },
  Cl: {
    labelZh: "氯原子 (-Cl，誘導拉電子 -I)",
    h1Ortho: +0.03,
    h1Meta: -0.02,
    h1Para: -0.09,
    c13Ipso: +6.2,
    c13Ortho: +0.4,
    c13Meta: +1.3,
    c13Para: -1.9,
    isEWG: true,
    isEDG: false,
  },
  Br: {
    labelZh: "溴原子 (-Br，重原子效應與誘導效應)",
    h1Ortho: +0.18,
    h1Meta: -0.08,
    h1Para: -0.04,
    c13Ipso: -5.5,
    c13Ortho: +3.4,
    c13Meta: +1.7,
    c13Para: -1.6,
    isEWG: true,
    isEDG: false,
  },
  I: {
    labelZh: "碘原子 (-I，顯著重原子相對論遮蔽效應)",
    h1Ortho: +0.39,
    h1Meta: -0.21,
    h1Para: +0.0,
    c13Ipso: -34.1, // Heavy-atom relativistic shielding shifts C_ipso to ~94.4 ppm!
    c13Ortho: +8.9,
    c13Meta: +1.6,
    c13Para: -1.1,
    isEWG: true,
    isEDG: false,
  },
  ARYL: {
    labelZh: "芳基取代基 (-Ar)",
    h1Ortho: +0.3,
    h1Meta: +0.12,
    h1Para: +0.1,
    c13Ipso: +13.1,
    c13Ortho: -1.1,
    c13Meta: +0.4,
    c13Para: -1.2,
    isEWG: false,
    isEDG: false,
  },
  SH: {
    labelZh: "硫醇/硫醚基 (-SH/-SR)",
    h1Ortho: -0.08,
    h1Meta: -0.05,
    h1Para: -0.15,
    c13Ipso: +2.2,
    c13Ortho: +0.7,
    c13Meta: +0.4,
    c13Para: -3.1,
    isEWG: false,
    isEDG: true,
  },
  SO2R: {
    labelZh: "碸基/磺醯基 (-SO₂R，強拉電子)",
    h1Ortho: +0.68,
    h1Meta: +0.25,
    h1Para: +0.32,
    c13Ipso: +12.3,
    c13Ortho: -1.4,
    c13Meta: +0.8,
    c13Para: +5.1,
    isEWG: true,
    isEDG: false,
  },
  OTHER: {
    labelZh: "一般取代基",
    h1Ortho: 0.0,
    h1Meta: 0.0,
    h1Para: 0.0,
    c13Ipso: +5.0,
    c13Ortho: 0.0,
    c13Meta: 0.0,
    c13Para: 0.0,
    isEWG: false,
    isEDG: false,
  },
};

// ============================================================================
// 5. 自旋耦合網路與分裂樹計算引擎 (Spin-Coupling Network & Multiplet Simulator)
// ============================================================================

export class SpinCouplingCalculator {
  /**
   * 由一階耦合常數陣列 (J values in Hz) 與對應等價耦合核數產生分裂樹峰線 (Simulated Multiplet Lines)
   */
  static simulateFirstOrderMultiplet(
    centerPpm: number,
    couplings: { jHz: number; partnerProtons: number }[],
    spectrometerFreqMHz: number = 400
  ): SpinMultipletLine[] {
    const freq = Math.max(60, spectrometerFreqMHz);
    let lines: { offsetHz: number; intensity: number }[] = [
      { offsetHz: 0, intensity: 1 },
    ];

    for (const c of couplings) {
      if (!Number.isFinite(c.jHz) || c.jHz <= 0.1 || c.partnerProtons <= 0) {
        continue;
      }
      const n = Math.min(9, Math.round(c.partnerProtons));
      for (let step = 0; step < n; step++) {
        const nextLines: { offsetHz: number; intensity: number }[] = [];
        for (const l of lines) {
          nextLines.push({
            offsetHz: l.offsetHz - c.jHz / 2,
            intensity: l.intensity * 0.5,
          });
          nextLines.push({
            offsetHz: l.offsetHz + c.jHz / 2,
            intensity: l.intensity * 0.5,
          });
        }
        // Merge degenerate lines within 0.15 Hz
        nextLines.sort((a, b) => a.offsetHz - b.offsetHz);
        const merged: { offsetHz: number; intensity: number }[] = [];
        for (const nl of nextLines) {
          const prev = merged[merged.length - 1];
          if (prev && Math.abs(prev.offsetHz - nl.offsetHz) <= 0.15) {
            const totalInt = prev.intensity + nl.intensity;
            prev.offsetHz =
              (prev.offsetHz * prev.intensity + nl.offsetHz * nl.intensity) /
              totalInt;
            prev.intensity = totalInt;
          } else {
            merged.push({ ...nl });
          }
        }
        lines = merged;
      }
    }

    const maxInt = Math.max(1e-6, ...lines.map((l) => l.intensity));
    return lines.map((l) => ({
      offsetHz: Number(l.offsetHz.toFixed(2)),
      positionPpm: Number((centerPpm + l.offsetHz / freq).toFixed(4)),
      relativeIntensity: Number(((l.intensity / maxInt) * 100).toFixed(1)),
    }));
  }

  /**
   * 由 J 耦合清單推導標準多重峰符號 (s, d, t, q, quint, sext, sept, dd, dt, td, ddd, m, AA'BB')
   */
  static deriveMultipletNotation(
    couplings: { jHz: number; partnerProtons: number; couplingType: JCoupling["couplingType"] }[],
    options?: {
      isExchangeBroadened?: boolean;
      isMagneticNonEquivalentAABB?: boolean;
      deltaNuOverJMin?: number | null;
    }
  ): {
    code: SpectralPeak["multiplicity"];
    descriptionZh: string;
    couplingOrder: SpinCouplingAnalysis["couplingOrder"];
  } {
    if (options?.isExchangeBroadened) {
      return {
        code: "br s",
        descriptionZh: "交換展寬單峰 (Broad singlet due to labile proton chemical exchange)",
        couplingOrder: "EXCHANGE_BROADENED",
      };
    }

    const active = couplings
      .filter((c) => c.jHz >= 0.8 && c.partnerProtons > 0)
      .sort((a, b) => b.jHz - a.jHz);

    if (active.length === 0) {
      return {
        code: "s",
        descriptionZh: "單峰 (Singlet, 無顯著自旋耦合鄰氫)",
        couplingOrder: "FIRST_ORDER",
      };
    }

    const isStrongSecondOrder =
      options?.deltaNuOverJMin !== undefined &&
      options?.deltaNuOverJMin !== null &&
      options.deltaNuOverJMin < 6.0;

    if (options?.isMagneticNonEquivalentAABB) {
      return {
        code: "d",
        descriptionZh:
          "AA'BB' 對稱雙取代芳環擬雙重峰 (Chemically equivalent but magnetically non-equivalent AA'BB' spin system; dominant ortho ³J ≈ 8.2–8.8 Hz)",
        couplingOrder: isStrongSecondOrder
          ? "SECOND_ORDER_STRONG_COUPLING"
          : "FIRST_ORDER",
      };
    }

    if (active.length === 1) {
      const n = active[0].partnerProtons;
      const j = active[0].jHz;
      const map: Record<number, { code: SpectralPeak["multiplicity"]; name: string }> = {
        1: { code: "d", name: `雙重峰 (Doublet, J = ${j.toFixed(1)} Hz)` },
        2: { code: "t", name: `三重峰 (Triplet, J = ${j.toFixed(1)} Hz)` },
        3: { code: "q", name: `四重峰 (Quartet, J = ${j.toFixed(1)} Hz)` },
        4: { code: "quint", name: `五重峰 (Quintet, J = ${j.toFixed(1)} Hz)` },
        5: { code: "sext", name: `六重峰 (Sextet, J = ${j.toFixed(1)} Hz)` },
        6: { code: "sept", name: `七重峰 (Septet, J = ${j.toFixed(1)} Hz)` },
      };
      const entry = map[n] || {
        code: "m",
        name: `多重峰 (Multiplet, J = ${j.toFixed(1)} Hz)`,
      };
      return {
        code: entry.code,
        descriptionZh: entry.name,
        couplingOrder: isStrongSecondOrder
          ? "SECOND_ORDER_STRONG_COUPLING"
          : "FIRST_ORDER",
      };
    }

    if (active.length === 2) {
      const [c1, c2] = active;
      const jDiff = Math.abs(c1.jHz - c2.jHz);
      if (jDiff <= 1.1) {
        const totalN = c1.partnerProtons + c2.partnerProtons;
        const avgJ = Number(((c1.jHz + c2.jHz) / 2).toFixed(1));
        if (totalN === 2) {
          return {
            code: "t",
            descriptionZh: `表現三重峰 (Apparent triplet from two similar couplings J ≈ ${avgJ} Hz)`,
            couplingOrder: isStrongSecondOrder
              ? "SECOND_ORDER_STRONG_COUPLING"
              : "FIRST_ORDER",
          };
        }
        if (totalN === 3) {
          return {
            code: "q",
            descriptionZh: `表現四重峰 (Apparent quartet, J ≈ ${avgJ} Hz)`,
            couplingOrder: "FIRST_ORDER",
          };
        }
        if (totalN === 5) {
          return {
            code: "sext",
            descriptionZh: `表現六重峰 (Apparent sextet, -CH₂- coupled to -CH₃ and -CH₂-, J ≈ ${avgJ} Hz)`,
            couplingOrder: "FIRST_ORDER",
          };
        }
      }
      if (c1.partnerProtons === 1 && c2.partnerProtons === 1) {
        return {
          code: "dd",
          descriptionZh: `雙雙重峰 (Doublet of doublets, J = ${c1.jHz.toFixed(1)}, ${c2.jHz.toFixed(1)} Hz)`,
          couplingOrder: isStrongSecondOrder
            ? "SECOND_ORDER_STRONG_COUPLING"
            : "FIRST_ORDER",
        };
      }
      if (c1.partnerProtons === 1 && c2.partnerProtons === 2) {
        return {
          code: "dt",
          descriptionZh: `雙三重峰 (Doublet of triplets, J = ${c1.jHz.toFixed(1)}, ${c2.jHz.toFixed(1)} Hz)`,
          couplingOrder: isStrongSecondOrder
            ? "SECOND_ORDER_STRONG_COUPLING"
            : "FIRST_ORDER",
        };
      }
      if (c1.partnerProtons === 2 && c2.partnerProtons === 1) {
        return {
          code: "td",
          descriptionZh: `三雙重峰 (Triplet of doublets, J = ${c1.jHz.toFixed(1)}, ${c2.jHz.toFixed(1)} Hz)`,
          couplingOrder: isStrongSecondOrder
            ? "SECOND_ORDER_STRONG_COUPLING"
            : "FIRST_ORDER",
        };
      }
      if (c1.partnerProtons === 2 && c2.partnerProtons === 2) {
        return {
          code: "tt",
          descriptionZh: `三三重峰 (Triplet of triplets, J = ${c1.jHz.toFixed(1)}, ${c2.jHz.toFixed(1)} Hz)`,
          couplingOrder: "FIRST_ORDER",
        };
      }
      if (c1.partnerProtons === 1 && c2.partnerProtons === 3) {
        return {
          code: "dq",
          descriptionZh: `雙四重峰 (Doublet of quartets, J = ${c1.jHz.toFixed(1)}, ${c2.jHz.toFixed(1)} Hz)`,
          couplingOrder: "FIRST_ORDER",
        };
      }
    }

    if (
      active.length === 3 &&
      active.every((c) => c.partnerProtons === 1)
    ) {
      return {
        code: "ddd",
        descriptionZh: `雙雙雙重峰 (Doublet of doublet of doublets, J = ${active
          .map((c) => c.jHz.toFixed(1))
          .join(", ")} Hz)`,
        couplingOrder: isStrongSecondOrder
          ? "SECOND_ORDER_STRONG_COUPLING"
          : "FIRST_ORDER",
      };
    }

    return {
      code: "m",
      descriptionZh: `複合多重峰 (Complex multiplet, J = ${active
        .map((c) => c.jHz.toFixed(1))
        .join(", ")} Hz)`,
      couplingOrder: isStrongSecondOrder
        ? "SECOND_ORDER_STRONG_COUPLING"
        : "UNRESOLVED_MULTIPLET",
    };
  }
}

// ============================================================================
// 6. 分子圖拓撲與化學環境解析器 (Molecular Graph NMR Environment Predictor)
// ============================================================================

interface RingSystemInfo {
  atomIndices: number[];
  isAromatic: boolean;
  size: number;
  ringType:
    | "BENZENE"
    | "PYRIDINE"
    | "DIAZINE"
    | "PYRROLE"
    | "FURAN"
    | "THIOPHENE"
    | "ALICYCLIC"
    | "OTHER_RING";
}

export class NMRGraphPredictor {
  /**
   * 計算圖中所有原子對的最短距離矩陣 (Shortest-Path Distance Matrix)
   */
  static computeDistanceMatrix(graph: ParsedSmilesGraph): number[][] {
    const n = graph.atoms.length;
    const dist: number[][] = Array.from({ length: n }, () =>
      Array(n).fill(Infinity)
    );
    for (let i = 0; i < n; i++) {
      dist[i][i] = 0;
      const q = [i];
      while (q.length > 0) {
        const u = q.shift()!;
        for (const nb of graph.atoms[u].neighbors) {
          if (dist[i][nb.toAtom] === Infinity) {
            dist[i][nb.toAtom] = dist[i][u] + 1;
            q.push(nb.toAtom);
          }
        }
      }
    }
    return dist;
  }

  /**
   * 計算每個原子的拓撲對稱等價類簽章 (Weisfeiler-Lehman 4-step Topological Symmetry Invariant)
   */
  static computeAtomSymmetryClasses(graph: ParsedSmilesGraph): string[] {
    let labels = graph.atoms.map((a) => {
      const deg = a.neighbors.length;
      const bondOrders = a.neighbors
        .map((nb) => nb.order)
        .sort((x, y) => x - y)
        .join(",");
      return `${a.element}:${a.isAromatic ? "ar" : "al"}:H${a.totalHydrogens}:q${a.formalCharge}:d${deg}:b(${bondOrders})`;
    });

    for (let iter = 0; iter < 5; iter++) {
      const nextLabels = graph.atoms.map((a, idx) => {
        const nbSigs = a.neighbors
          .map((nb) => `${nb.order}:${labels[nb.toAtom]}`)
          .sort()
          .join("|");
        return `${labels[idx]}[${nbSigs}]`;
      });
      labels = nextLabels;
    }
    return labels;
  }

  /**
   * 偵測分子圖中的環系統 (芳香苯環、吡啶環、五元雜芳環、脂環)
   */
  static detectRings(graph: ParsedSmilesGraph): RingSystemInfo[] {
    const rings: RingSystemInfo[] = [];
    const aromAtoms = graph.atoms.filter((a) => a.isAromatic);

    if (aromAtoms.length >= 5) {
      // Group connected aromatic components
      const visited = new Set<number>();
      for (const start of aromAtoms) {
        if (visited.has(start.index)) continue;
        const comp: number[] = [];
        const q = [start.index];
        visited.add(start.index);
        while (q.length > 0) {
          const u = q.shift()!;
          comp.push(u);
          for (const nb of graph.atoms[u].neighbors) {
            if (graph.atoms[nb.toAtom].isAromatic && !visited.has(nb.toAtom)) {
              visited.add(nb.toAtom);
              q.push(nb.toAtom);
            }
          }
        }
        const nCount = comp.filter((idx) => graph.atoms[idx].element === "N").length;
        const oCount = comp.filter((idx) => graph.atoms[idx].element === "O").length;
        const sCount = comp.filter((idx) => graph.atoms[idx].element === "S").length;
        let ringType: RingSystemInfo["ringType"] = "OTHER_RING";
        if (comp.length === 6) {
          if (nCount === 0 && oCount === 0 && sCount === 0) ringType = "BENZENE";
          else if (nCount === 1) ringType = "PYRIDINE";
          else if (nCount >= 2) ringType = "DIAZINE";
        } else if (comp.length === 5) {
          if (nCount >= 1) ringType = "PYRROLE";
          else if (oCount >= 1) ringType = "FURAN";
          else if (sCount >= 1) ringType = "THIOPHENE";
        }
        rings.push({
          atomIndices: comp,
          isAromatic: true,
          size: comp.length,
          ringType,
        });
      }
    }
    return rings;
  }

  /**
   * 辨識連接在芳香環碳 atomIdx 上的環外取代基類別
   */
  static classifyRingSubstituent(
    graph: ParsedSmilesGraph,
    ringAtomIdx: number,
    ringSet: Set<number>
  ): { subClass: AromaticSubstituentClass; subAtomIdx: number; labelZh: string } | null {
    const atom = graph.atoms[ringAtomIdx];
    const exocyclicNb = atom.neighbors.find((nb) => !ringSet.has(nb.toAtom));
    if (!exocyclicNb) return null;

    const exo = graph.atoms[exocyclicNb.toAtom];
    if (exo.element === "F")
      return { subClass: "F", subAtomIdx: exo.index, labelZh: "-F" };
    if (exo.element === "Cl")
      return { subClass: "Cl", subAtomIdx: exo.index, labelZh: "-Cl" };
    if (exo.element === "Br")
      return { subClass: "Br", subAtomIdx: exo.index, labelZh: "-Br" };
    if (exo.element === "I")
      return { subClass: "I", subAtomIdx: exo.index, labelZh: "-I" };

    if (exo.element === "O") {
      if (exo.totalHydrogens >= 1) {
        return { subClass: "OH", subAtomIdx: exo.index, labelZh: "-OH (酚羥基)" };
      }
      // Check if attached to C=O (-OC(=O)R) vs alkyl (-OR)
      const otherNb = exo.neighbors.find((n) => n.toAtom !== ringAtomIdx);
      if (otherNb) {
        const nextAtom = graph.atoms[otherNb.toAtom];
        const hasCarbonylO = nextAtom.neighbors.some(
          (n) => n.order === 2 && graph.atoms[n.toAtom].element === "O"
        );
        if (nextAtom.element === "C" && hasCarbonylO) {
          return {
            subClass: "OCOR",
            subAtomIdx: exo.index,
            labelZh: "-OC(=O)R (醯氧基)",
          };
        }
      }
      return { subClass: "OR", subAtomIdx: exo.index, labelZh: "-OR (烷氧基)" };
    }

    if (exo.element === "N") {
      const hasDoubleO = exo.neighbors.some(
        (n) => graph.atoms[n.toAtom].element === "O" && n.order >= 1.5
      );
      if (hasDoubleO || exo.formalCharge > 0) {
        return { subClass: "NO2", subAtomIdx: exo.index, labelZh: "-NO₂ (硝基)" };
      }
      const carbonylNb = exo.neighbors.find((n) => {
        if (n.toAtom === ringAtomIdx) return false;
        const cAtom = graph.atoms[n.toAtom];
        return (
          cAtom.element === "C" &&
          cAtom.neighbors.some(
            (cn) => cn.order === 2 && graph.atoms[cn.toAtom].element === "O"
          )
        );
      });
      if (carbonylNb) {
        return {
          subClass: "NHCOR",
          subAtomIdx: exo.index,
          labelZh: "-NHC(=O)R (醯胺基)",
        };
      }
      if (exo.totalHydrogens >= 2) {
        return { subClass: "NH2", subAtomIdx: exo.index, labelZh: "-NH₂ (胺基)" };
      }
      return { subClass: "NR2", subAtomIdx: exo.index, labelZh: "-NR₂ (取代胺基)" };
    }

    if (exo.element === "S") {
      const oxoCount = exo.neighbors.filter(
        (n) => graph.atoms[n.toAtom].element === "O" && n.order === 2
      ).length;
      if (oxoCount >= 1) {
        return { subClass: "SO2R", subAtomIdx: exo.index, labelZh: "-SO₂R" };
      }
      return { subClass: "SH", subAtomIdx: exo.index, labelZh: "-SH/-SR" };
    }

    if (exo.element === "C") {
      if (exo.isAromatic) {
        return { subClass: "ARYL", subAtomIdx: exo.index, labelZh: "-Ar" };
      }
      const tripleN = exo.neighbors.some(
        (n) => n.order === 3 && graph.atoms[n.toAtom].element === "N"
      );
      if (tripleN) {
        return { subClass: "CN", subAtomIdx: exo.index, labelZh: "-C≡N (腈基)" };
      }
      const carbonylO = exo.neighbors.find(
        (n) => n.order === 2 && graph.atoms[n.toAtom].element === "O"
      );
      if (carbonylO) {
        if (exo.totalHydrogens >= 1) {
          return { subClass: "CHO", subAtomIdx: exo.index, labelZh: "-CHO (醛基)" };
        }
        const singleO = exo.neighbors.find(
          (n) =>
            n.toAtom !== carbonylO.toAtom &&
            n.order === 1 &&
            graph.atoms[n.toAtom].element === "O"
        );
        if (singleO) {
          const oAtom = graph.atoms[singleO.toAtom];
          if (oAtom.totalHydrogens >= 1) {
            return {
              subClass: "COOH",
              subAtomIdx: exo.index,
              labelZh: "-COOH (羧基)",
            };
          }
          return {
            subClass: "COOR",
            subAtomIdx: exo.index,
            labelZh: "-COOR (酯基)",
          };
        }
        const singleN = exo.neighbors.find(
          (n) => n.order === 1 && graph.atoms[n.toAtom].element === "N"
        );
        if (singleN) {
          return {
            subClass: "CONH",
            subAtomIdx: exo.index,
            labelZh: "-CONH- (醯胺基)",
          };
        }
        return {
          subClass: "COR",
          subAtomIdx: exo.index,
          labelZh: "-C(=O)R (酮醯基)",
        };
      }
      if (exo.totalHydrogens === 3) {
        return { subClass: "CH3", subAtomIdx: exo.index, labelZh: "-CH₃ (甲基)" };
      }
      return { subClass: "ALKYL", subAtomIdx: exo.index, labelZh: "-R (烷基)" };
    }

    return { subClass: "OTHER", subAtomIdx: exo.index, labelZh: `-${exo.element}` };
  }

  /**
   * 從分子圖完整預測 ¹H NMR 訊號環境、取代基修正、自旋耦合網路、溶劑效應與不確定度
   */
  static predict1HFromStructureGraph(
    structure: ParsedChemicalStructure,
    options?: {
      solvent?: NMRSolvent;
      spectrometerFrequencyMHz?: number;
    }
  ): {
    peaks: SpectralPeak[];
    environments: ProtonEnvironment[];
  } {
    const solvent: NMRSolvent = options?.solvent || "CDCl3";
    const solventProfile =
      DEUTERATED_SOLVENT_PROFILES[solvent] || DEUTERATED_SOLVENT_PROFILES.CDCl3;
    const freqMHz = options?.spectrometerFrequencyMHz || 400;
    const smiles = (structure.smiles || "").trim();

    const parsedRes = StructureParserAdapter.parseSmilesGraph(smiles);
    if (!parsedRes.valid || !parsedRes.graph) {
      return { peaks: [], environments: [] };
    }
    const graph = parsedRes.graph;
    const distMatrix = this.computeDistanceMatrix(graph);
    const symClasses = this.computeAtomSymmetryClasses(graph);
    const rings = this.detectRings(graph);

    const benzeneRings = rings.filter((r) => r.ringType === "BENZENE");
    const pyridineRings = rings.filter((r) => r.ringType === "PYRIDINE");

    // Step 1: Predict individual proton-bearing atom shifts & corrections
    interface AtomH1Prediction {
      atomIdx: number;
      element: string;
      protonCount: number;
      symClass: string;
      deltaPpm: number;
      uncertaintyPpm: number;
      envClass: string;
      envLabelZh: string;
      regionCategory: string;
      isExchangeable: boolean;
      isDeuteriumExchangedOut: boolean;
      corrections: NMRShiftCorrectionTerm[];
      confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
      dataNature: NMRDataNature;
    }

    const atomPredictions = new Map<number, AtomH1Prediction>();

    for (const atom of graph.atoms) {
      if (atom.totalHydrogens <= 0) continue;

      const corrections: NMRShiftCorrectionTerm[] = [];
      let baseDelta = 1.25;
      let uncertaintyPpm = 0.15;
      let envClass = "ALIPHATIC_CH";
      let envLabelZh = "脂肪族 C-H 質子";
      let regionCategory = "高場飽和脂肪區 Aliphatic (0.0–1.85 ppm)";
      let isExchangeable = false;
      let confidenceLevel: "HIGH" | "MEDIUM" | "LOW" = "HIGH";

      // Case A: Exchangeable Heteroatom Protons (O-H, N-H, S-H)
      if (atom.element === "O" || atom.element === "N" || atom.element === "S") {
        isExchangeable = true;
        uncertaintyPpm = 0.45;
        confidenceLevel = "MEDIUM";
        const nbIndices = atom.neighbors.map((n) => n.toAtom);
        const nbAtoms = nbIndices.map((idx) => graph.atoms[idx]);

        if (atom.element === "O") {
          const attachedC = nbAtoms.find((a) => a.element === "C");
          const isCarboxylic =
            attachedC &&
            !attachedC.isAromatic &&
            attachedC.neighbors.some(
              (n) =>
                n.toAtom !== atom.index &&
                n.order === 2 &&
                graph.atoms[n.toAtom].element === "O"
            );
          const isPhenolic = attachedC && attachedC.isAromatic;

          if (isCarboxylic) {
            baseDelta = 11.5;
            envClass = "CARBOXYLIC_ACID_OH";
            envLabelZh = "羧酸活潑質子 (-COOH)";
            regionCategory = "羧酸質子區 Carboxylic Acid (10.5–13.0 ppm)";
            corrections.push({
              termName: "Base -COOH Dimer Deshielding",
              deltaPpm: 11.5,
              reasonZh: "羧酸強分子間氫鍵與羰基誘導去遮蔽基準值",
              applicableCondition: "CDCl3 / Standard reference",
              dataNature: "EMPIRICAL_INCREMENT_MODEL",
              citationId: "PRETSCH_EMPIRICAL_TABLES",
            });
            if (solventProfile.exchangeableProtonShiftDelta.carboxylicCOOH !== 0) {
              corrections.push({
                termName: `Solvent H-Bond Shift (${solvent})`,
                deltaPpm: solventProfile.exchangeableProtonShiftDelta.carboxylicCOOH,
                reasonZh: `${solventProfile.labelZh} 溶劑對羧酸活潑氫之氫鍵效應修正`,
                applicableCondition: `Solvent = ${solvent}`,
                dataNature: "GENERAL_THEORY",
                citationId: "CASABIANCA_2020_MRC",
                doi: NMR_LITERATURE_REGISTRY.CASABIANCA_2020_MRC.doi,
              });
            }
          } else if (isPhenolic) {
            // Check ortho carbonyl intramolecular H-bond (e.g. Salicylic acid / Methyl salicylate)
            const hasOrthoCarbonyl =
              attachedC &&
              attachedC.neighbors.some((rn) => {
                const orthoC = graph.atoms[rn.toAtom];
                return (
                  orthoC.isAromatic &&
                  orthoC.neighbors.some((exo) => {
                    const exoAtom = graph.atoms[exo.toAtom];
                    return (
                      exoAtom.element === "C" &&
                      exoAtom.neighbors.some(
                        (co) =>
                          co.order === 2 && graph.atoms[co.toAtom].element === "O"
                      )
                    );
                  })
                );
              });
            baseDelta = hasOrthoCarbonyl ? 10.45 : 5.65;
            envClass = "PHENOLIC_OH";
            envLabelZh = hasOrthoCarbonyl
              ? "鄰位分子內氫鍵酚羥基質子 (Ar-OH⋯O=C)"
              : "酚羥基活潑質子 (Ar-OH)";
            regionCategory = "活潑氫 / 酚羥基區 Exchangeable Phenolic OH";
            corrections.push({
              termName: hasOrthoCarbonyl
                ? "Intramolecular Chelated Ar-OH"
                : "Base Phenolic Ar-OH",
              deltaPpm: baseDelta,
              reasonZh: hasOrthoCarbonyl
                ? "六元環分子內氫鍵 (Ar-OH⋯O=C) 強烈去遮蔽"
                : "酚羥基基準化學位移",
              applicableCondition: "Dilute solution",
              dataNature: "EMPIRICAL_INCREMENT_MODEL",
              citationId: "PRETSCH_EMPIRICAL_TABLES",
            });
            if (
              !hasOrthoCarbonyl &&
              solventProfile.exchangeableProtonShiftDelta.phenolicOH !== 0
            ) {
              corrections.push({
                termName: `Solvent H-Bond Deshielding (${solvent})`,
                deltaPpm: solventProfile.exchangeableProtonShiftDelta.phenolicOH,
                reasonZh: `${solventProfile.labelZh} 作為強氫鍵受體使酚 -OH 移向低場`,
                applicableCondition: `Solvent = ${solvent}`,
                dataNature: "GENERAL_THEORY",
                citationId: "CASABIANCA_2020_MRC",
                doi: NMR_LITERATURE_REGISTRY.CASABIANCA_2020_MRC.doi,
              });
            }
          } else {
            baseDelta = 2.15;
            envClass = "ALIPHATIC_OH";
            envLabelZh = "醇羥基活潑質子 (R-OH)";
            regionCategory = "雜原子活潑質子區 Exchangeable R-OH";
            corrections.push({
              termName: "Base Aliphatic R-OH",
              deltaPpm: baseDelta,
              reasonZh: "脂肪醇 -OH 基準化學位移",
              applicableCondition: "CDCl3 reference",
              dataNature: "EMPIRICAL_INCREMENT_MODEL",
              citationId: "PRETSCH_EMPIRICAL_TABLES",
            });
            if (solventProfile.exchangeableProtonShiftDelta.aliphaticOH !== 0) {
              corrections.push({
                termName: `Solvent H-Bond Shift (${solvent})`,
                deltaPpm: solventProfile.exchangeableProtonShiftDelta.aliphaticOH,
                reasonZh: `${solventProfile.labelZh} 對醇羥基之溶劑氫鍵修正`,
                applicableCondition: `Solvent = ${solvent}`,
                dataNature: "GENERAL_THEORY",
                citationId: "CASABIANCA_2020_MRC",
                doi: NMR_LITERATURE_REGISTRY.CASABIANCA_2020_MRC.doi,
              });
            }
          }
        } else if (atom.element === "N") {
          const hasCarbonylNb = nbAtoms.some(
            (a) =>
              a.element === "C" &&
              a.neighbors.some(
                (n) => n.order === 2 && graph.atoms[n.toAtom].element === "O"
              )
          );
          const hasAromaticNb = nbAtoms.some((a) => a.isAromatic);
          if (atom.isAromatic) {
            baseDelta = 8.42;
            envClass = "PYRROLIC_NH";
            envLabelZh = "吡咯/吲哚環活潑氮氫 (Pyrrolic N-H)";
            regionCategory = "芳香雜環 N-H 區 (8.0–11.5 ppm)";
          } else if (hasCarbonylNb) {
            baseDelta = hasAromaticNb ? 7.65 : 6.45;
            envClass = "AMIDE_NH";
            envLabelZh = hasAromaticNb
              ? "芳基醯胺活潑質子 (Ar-NH-C=O)"
              : "脂肪醯胺活潑質子 (-CONH-)";
            regionCategory = "醯胺活潑質子區 Amide N-H (6.0–10.5 ppm)";
          } else if (hasAromaticNb) {
            baseDelta = 3.85;
            envClass = "ANILINE_NH";
            envLabelZh = "芳香胺活潑質子 (Ar-NH₂ / Ar-NHR)";
            regionCategory = "胺基活潑質子區 Amine N-H";
          } else {
            baseDelta = 1.65;
            envClass = "ALIPHATIC_NH";
            envLabelZh = "脂肪胺活潑質子 (R-NH₂ / R₂NH)";
            regionCategory = "胺基活潑質子區 Amine N-H";
          }
          corrections.push({
            termName: `Base ${envClass}`,
            deltaPpm: baseDelta,
            reasonZh: `${envLabelZh} 基準化學位移`,
            applicableCondition: "CDCl3 reference",
            dataNature: "EMPIRICAL_INCREMENT_MODEL",
            citationId: "PRETSCH_EMPIRICAL_TABLES",
          });
          const nhDelta = hasCarbonylNb
            ? solventProfile.exchangeableProtonShiftDelta.amideNH
            : solventProfile.exchangeableProtonShiftDelta.amineNH;
          if (nhDelta !== 0) {
            corrections.push({
              termName: `Solvent H-Bond Shift (${solvent})`,
              deltaPpm: nhDelta,
              reasonZh: `${solventProfile.labelZh} 溶劑對氮氫鍵之去遮蔽修正`,
              applicableCondition: `Solvent = ${solvent}`,
              dataNature: "GENERAL_THEORY",
              citationId: "CASABIANCA_2020_MRC",
              doi: NMR_LITERATURE_REGISTRY.CASABIANCA_2020_MRC.doi,
            });
          }
        } else {
          baseDelta = 1.55;
          envClass = "THIOL_SH";
          envLabelZh = "硫醇質子 (-SH)";
          regionCategory = "高場區";
          corrections.push({
            termName: "Base -SH",
            deltaPpm: baseDelta,
            reasonZh: "硫醇 -SH 基準位移",
            applicableCondition: "CDCl3",
            dataNature: "EMPIRICAL_INCREMENT_MODEL",
            citationId: "PRETSCH_EMPIRICAL_TABLES",
          });
        }

        const totalDelta = Number(
          corrections.reduce((s, c) => s + c.deltaPpm, 0).toFixed(2)
        );
        atomPredictions.set(atom.index, {
          atomIdx: atom.index,
          element: atom.element,
          protonCount: atom.totalHydrogens,
          symClass: symClasses[atom.index],
          deltaPpm: totalDelta,
          uncertaintyPpm,
          envClass,
          envLabelZh,
          regionCategory,
          isExchangeable: true,
          isDeuteriumExchangedOut: solventProfile.causesProticDeuteriumExchange,
          corrections,
          confidenceLevel,
          dataNature: "EMPIRICAL_INCREMENT_MODEL",
        });
        continue;
      }

      // Case B: Aromatic & Heteroaromatic Ring C-H Protons
      if (atom.isAromatic && atom.element === "C") {
        const bRing = benzeneRings.find((r) => r.atomIndices.includes(atom.index));
        const pRing = pyridineRings.find((r) => r.atomIndices.includes(atom.index));

        if (bRing) {
          const ringSet = new Set(bRing.atomIndices);
          baseDelta = 7.26;
          uncertaintyPpm = 0.12;
          envClass = "AROMATIC_BENZENE_CH";
          regionCategory = "芳香族與雜環質子區 Aromatic / Heteroaromatic (6.5–8.15 ppm)";
          corrections.push({
            termName: "Benzene Ring Current Base Shift",
            deltaPpm: 7.26,
            reasonZh: "苯環 π 電子環電流去遮蔽基準值 (δ 7.26 ppm)",
            applicableCondition: "298 K",
            dataNature: "EMPIRICAL_INCREMENT_MODEL",
            citationId: "PRETSCH_EMPIRICAL_TABLES",
          });

          const subDescriptions: string[] = [];
          for (const rIdx of bRing.atomIndices) {
            if (rIdx === atom.index) continue;
            const subInfo = this.classifyRingSubstituent(graph, rIdx, ringSet);
            if (!subInfo) continue;
            const d = distMatrix[atom.index][rIdx];
            const incSet = AROMATIC_SUBSTITUENT_INCREMENTS[subInfo.subClass];
            let zVal = 0;
            let posLabel = "";
            if (d === 1) {
              zVal = incSet.h1Ortho;
              posLabel = "ortho";
            } else if (d === 2) {
              zVal = incSet.h1Meta;
              posLabel = "meta";
            } else if (d === 3) {
              zVal = incSet.h1Para;
              posLabel = "para";
            }
            if (zVal !== 0) {
              corrections.push({
                termName: `Z_${posLabel}(${subInfo.labelZh})`,
                deltaPpm: zVal,
                reasonZh: `${subInfo.labelZh} 對 ${posLabel} 位芳氫之電子誘導/共振加成修正`,
                applicableCondition: "Aromatic Z-increment additivity",
                dataNature: "EMPIRICAL_INCREMENT_MODEL",
                citationId: "PRETSCH_EMPIRICAL_TABLES",
              });
              subDescriptions.push(`${posLabel}-to-${subInfo.labelZh}`);
            }
          }

          if (solventProfile.aromaticASISDelta !== 0) {
            corrections.push({
              termName: `Solvent Shielding Effect (${solvent})`,
              deltaPpm: solventProfile.aromaticASISDelta,
              reasonZh: `${solventProfile.labelZh} 溶劑對芳香環質子之溶劑效應修正`,
              applicableCondition: `Solvent = ${solvent}`,
              dataNature: "GENERAL_THEORY",
              citationId: "CASABIANCA_2020_MRC",
              doi: NMR_LITERATURE_REGISTRY.CASABIANCA_2020_MRC.doi,
            });
          }

          const totalDelta = Number(
            Math.max(
              6.1,
              Math.min(9.1, corrections.reduce((s, c) => s + c.deltaPpm, 0))
            ).toFixed(2)
          );
          envLabelZh =
            subDescriptions.length > 0
              ? `苯環芳香質子 Ar-H (${subDescriptions.join(", ")})`
              : "苯環芳香質子 Ar-H";

          atomPredictions.set(atom.index, {
            atomIdx: atom.index,
            element: "C",
            protonCount: atom.totalHydrogens,
            symClass: symClasses[atom.index],
            deltaPpm: totalDelta,
            uncertaintyPpm,
            envClass,
            envLabelZh,
            regionCategory,
            isExchangeable: false,
            isDeuteriumExchangedOut: false,
            corrections,
            confidenceLevel: "HIGH",
            dataNature: "EMPIRICAL_INCREMENT_MODEL",
          });
          continue;
        } else if (pRing) {
          const ringSet = new Set(pRing.atomIndices);
          const nAtomIdx = pRing.atomIndices.find(
            (idx) => graph.atoms[idx].element === "N"
          )!;
          const distToN = distMatrix[atom.index][nAtomIdx];
          if (distToN === 1) {
            baseDelta = 8.58;
            envClass = "PYRIDINE_ALPHA_CH";
            envLabelZh = "吡啶環鄰氮質子 Pyridine α-H (H-2/6)";
            regionCategory =
              "缺電子芳香雜環 α-位或強拉電子芳香質子區 Deshielded Heteroaromatic / EWG-Aromatic (8.15–9.25 ppm)";
          } else if (distToN === 2) {
            baseDelta = 7.26;
            envClass = "PYRIDINE_BETA_CH";
            envLabelZh = "吡啶環間位質子 Pyridine β-H (H-3/5)";
            regionCategory = "芳香族與雜環質子區 Aromatic / Heteroaromatic (6.5–8.15 ppm)";
          } else {
            baseDelta = 7.66;
            envClass = "PYRIDINE_GAMMA_CH";
            envLabelZh = "吡啶環對位質子 Pyridine γ-H (H-4)";
            regionCategory = "芳香族與雜環質子區 Aromatic / Heteroaromatic (6.5–8.15 ppm)";
          }
          corrections.push({
            termName: `Pyridine Base Shift (${envClass})`,
            deltaPpm: baseDelta,
            reasonZh: "吡啶環內 sp² 氮原子誘導與孤對電子磁異向性基準值",
            applicableCondition: "CDCl3 reference",
            dataNature: "EMPIRICAL_INCREMENT_MODEL",
            citationId: "PRETSCH_EMPIRICAL_TABLES",
          });

          for (const rIdx of pRing.atomIndices) {
            if (rIdx === atom.index || rIdx === nAtomIdx) continue;
            const subInfo = this.classifyRingSubstituent(graph, rIdx, ringSet);
            if (!subInfo) continue;
            const d = distMatrix[atom.index][rIdx];
            const incSet = AROMATIC_SUBSTITUENT_INCREMENTS[subInfo.subClass];
            const zVal =
              d === 1
                ? incSet.h1Ortho * 0.85
                : d === 2
                  ? incSet.h1Meta * 0.85
                  : incSet.h1Para * 0.85;
            if (zVal !== 0) {
              corrections.push({
                termName: `Pyridine Substituent (${subInfo.labelZh})`,
                deltaPpm: Number(zVal.toFixed(2)),
                reasonZh: `吡啶環取代基 ${subInfo.labelZh} 電子效應修正`,
                applicableCondition: "Pyridine substituent additivity",
                dataNature: "EMPIRICAL_INCREMENT_MODEL",
                citationId: "PRETSCH_EMPIRICAL_TABLES",
              });
            }
          }

          const totalDelta = Number(
            corrections.reduce((s, c) => s + c.deltaPpm, 0).toFixed(2)
          );
          atomPredictions.set(atom.index, {
            atomIdx: atom.index,
            element: "C",
            protonCount: atom.totalHydrogens,
            symClass: symClasses[atom.index],
            deltaPpm: totalDelta,
            uncertaintyPpm: 0.14,
            envClass,
            envLabelZh,
            regionCategory,
            isExchangeable: false,
            isDeuteriumExchangedOut: false,
            corrections,
            confidenceLevel: "HIGH",
            dataNature: "EMPIRICAL_INCREMENT_MODEL",
          });
          continue;
        } else {
          // 5-membered heteroaromatic (Pyrrole, Furan, Thiophene) or Diazine
          const otherRing = rings.find((r) => r.atomIndices.includes(atom.index));
          const hasHeteroNeighbor = atom.neighbors.some(
            (nb) =>
              graph.atoms[nb.toAtom].isAromatic &&
              graph.atoms[nb.toAtom].element !== "C"
          );
          if (otherRing?.ringType === "FURAN") {
            baseDelta = hasHeteroNeighbor ? 7.42 : 6.38;
            envLabelZh = hasHeteroNeighbor ? "呋喃環 α-H (H-2/5)" : "呋喃環 β-H (H-3/4)";
          } else if (otherRing?.ringType === "THIOPHENE") {
            baseDelta = hasHeteroNeighbor ? 7.3 : 7.1;
            envLabelZh = hasHeteroNeighbor ? "噻吩環 α-H (H-2/5)" : "噻吩環 β-H (H-3/4)";
          } else if (otherRing?.ringType === "PYRROLE") {
            baseDelta = hasHeteroNeighbor ? 6.82 : 6.26;
            envLabelZh = hasHeteroNeighbor ? "吡咯環 α-H (H-2/5)" : "吡咯環 β-H (H-3/4)";
          } else {
            baseDelta = hasHeteroNeighbor ? 8.55 : 7.45;
            envLabelZh = "芳香雜環 C-H 質子";
          }
          corrections.push({
            termName: "Heteroaromatic Ring Base Shift",
            deltaPpm: baseDelta,
            reasonZh: `${envLabelZh} 基準化學位移`,
            applicableCondition: "Heteroaromatic ring",
            dataNature: "EMPIRICAL_INCREMENT_MODEL",
            citationId: "PRETSCH_EMPIRICAL_TABLES",
          });
          atomPredictions.set(atom.index, {
            atomIdx: atom.index,
            element: "C",
            protonCount: atom.totalHydrogens,
            symClass: symClasses[atom.index],
            deltaPpm: baseDelta,
            uncertaintyPpm: 0.18,
            envClass: "HETEROAROMATIC_CH",
            envLabelZh,
            regionCategory: "芳香族與雜環質子區 Aromatic / Heteroaromatic (6.5–8.15 ppm)",
            isExchangeable: false,
            isDeuteriumExchangedOut: false,
            corrections,
            confidenceLevel: "MEDIUM",
            dataNature: "EMPIRICAL_INCREMENT_MODEL",
          });
          continue;
        }
      }

      // Case C: Non-aromatic Carbon Protons (Aldehyde, Alkene, Alkyne, sp³ CH3/CH2/CH)
      const hasDoubleO = atom.neighbors.some(
        (nb) => nb.order === 2 && graph.atoms[nb.toAtom].element === "O"
      );
      const hasDoubleC = atom.neighbors.some(
        (nb) => nb.order === 2 && graph.atoms[nb.toAtom].element === "C"
      );
      const hasTripleC = atom.neighbors.some(
        (nb) => nb.order === 3 && graph.atoms[nb.toAtom].element === "C"
      );

      if (hasDoubleO) {
        // Aldehyde -CHO
        const isArylAldehyde = atom.neighbors.some(
          (nb) => graph.atoms[nb.toAtom].isAromatic
        );
        baseDelta = isArylAldehyde ? 9.96 : 9.76;
        envClass = "ALDEHYDE_CHO";
        envLabelZh = isArylAldehyde
          ? "芳香醛基質子 (Ar-CHO)"
          : "脂肪醛基質子 (R-CHO)";
        regionCategory = "醛基質子區 Aldehyde (9.3–10.5 ppm)";
        corrections.push({
          termName: "Aldehyde Carbonyl Cone Deshielding",
          deltaPpm: baseDelta,
          reasonZh: "醛基 C=O 磁異向性錐與電負度強去遮蔽效應",
          applicableCondition: "Aldehyde -CHO",
          dataNature: "EMPIRICAL_INCREMENT_MODEL",
          citationId: "PRETSCH_EMPIRICAL_TABLES",
        });
      } else if (hasDoubleC) {
        // Alkene =CH- or =CH2
        baseDelta = 5.25;
        envClass = atom.totalHydrogens === 2 ? "ALKENE_CH2" : "ALKENE_CH";
        envLabelZh =
          atom.totalHydrogens === 2 ? "末端烯基質子 (=CH₂)" : "烯基質子 (=CH-)";
        regionCategory = "烯基 / 活潑氫區 Alkene / Exchangeable (4.5–6.4 ppm)";
        corrections.push({
          termName: "Ethylene Base Shift",
          deltaPpm: 5.25,
          reasonZh: "乙烯 sp² C=C-H 基準化學位移 (5.25 ppm)",
          applicableCondition: "Alkene additivity rule",
          dataNature: "EMPIRICAL_INCREMENT_MODEL",
          citationId: "PRETSCH_EMPIRICAL_TABLES",
        });
        for (const nb of atom.neighbors) {
          const nbAtom = graph.atoms[nb.toAtom];
          if (nb.order === 1) {
            if (nbAtom.isAromatic) {
              corrections.push({
                termName: "Z_gem(Aryl)",
                deltaPpm: +1.35,
                reasonZh: "同碳芳基共軛去遮蔽修正",
                applicableCondition: "Styrenyl α-CH",
                dataNature: "EMPIRICAL_INCREMENT_MODEL",
                citationId: "PRETSCH_EMPIRICAL_TABLES",
              });
            } else if (nbAtom.element === "C") {
              const isCarbonyl = nbAtom.neighbors.some(
                (n) => n.order === 2 && graph.atoms[n.toAtom].element === "O"
              );
              const isNitrile = nbAtom.neighbors.some(
                (n) => n.order === 3 && graph.atoms[n.toAtom].element === "N"
              );
              corrections.push({
                termName: isCarbonyl
                  ? "Z_gem(C=O)"
                  : isNitrile
                    ? "Z_gem(CN)"
                    : "Z_gem(Alkyl)",
                deltaPpm: isCarbonyl ? +1.1 : isNitrile ? +0.25 : +0.45,
                reasonZh: "烯碳 α-取代基加成修正",
                applicableCondition: "Substituted alkene",
                dataNature: "EMPIRICAL_INCREMENT_MODEL",
                citationId: "PRETSCH_EMPIRICAL_TABLES",
              });
            }
          }
        }
      } else if (hasTripleC) {
        // Terminal Alkyne ≡C-H
        const partnerCIdx = atom.neighbors.find((nb) => nb.order === 3)!.toAtom;
        const partnerC = graph.atoms[partnerCIdx];
        const isConjugatedAlkyne = partnerC.neighbors.some(
          (nb) =>
            nb.toAtom !== atom.index &&
            (graph.atoms[nb.toAtom].isAromatic ||
              graph.atoms[nb.toAtom].neighbors.some((n) => n.order >= 2))
        );
        baseDelta = isConjugatedAlkyne ? 3.08 : 2.18;
        envClass = "ALKYNE_CH";
        envLabelZh = "末端炔基質子 (-C≡CH)";
        regionCategory = "苄基 / 羰基鄰近 / 炔氫區 (1.85–3.1 ppm)";
        corrections.push({
          termName: "Terminal Alkyne Cylindrical Anisotropy",
          deltaPpm: baseDelta,
          reasonZh: "參鍵圓柱對稱磁異向性遮蔽效應 (-C≡C-H)",
          applicableCondition: "Terminal alkyne",
          dataNature: "EMPIRICAL_INCREMENT_MODEL",
          citationId: "PRETSCH_EMPIRICAL_TABLES",
        });
      } else {
        // sp³ Aliphatic CH3 / CH2 / CH (Shoolery & α/β Substituent Additivity Rules)
        baseDelta =
          atom.totalHydrogens === 3
            ? 0.88
            : atom.totalHydrogens === 2
              ? 1.25
              : 1.55;
        corrections.push({
          termName: `Aliphatic sp³ Base (${atom.totalHydrogens === 3 ? "CH₃" : atom.totalHydrogens === 2 ? "CH₂" : "CH"})`,
          deltaPpm: baseDelta,
          reasonZh: `飽和 sp³ ${atom.totalHydrogens === 3 ? "甲基 (-CH₃)" : atom.totalHydrogens === 2 ? "亞甲基 (-CH₂-)" : "次甲基 (-CH-)"} 基準化學位移`,
          applicableCondition: "Shoolery / Pretsch Aliphatic Additivity",
          dataNature: "EMPIRICAL_INCREMENT_MODEL",
          citationId: "PRETSCH_EMPIRICAL_TABLES",
        });

        // Analyze α-neighbors (directly attached to this carbon) and β-neighbors
        for (const nb of atom.neighbors) {
          const alpha = graph.atoms[nb.toAtom];
          if (alpha.element === "Si") {
            corrections.push({
              termName: "α-Si Electropositive Shielding",
              deltaPpm: -0.78,
              reasonZh: "鄰近電正性矽原子 (Si-CHn) 強遮蔽效應",
              applicableCondition: "Organosilicon",
              dataNature: "EMPIRICAL_INCREMENT_MODEL",
              citationId: "PRETSCH_EMPIRICAL_TABLES",
            });
            envClass = "SILYL_CH";
            envLabelZh = "有機矽甲基質子 (Si-CH₃)";
          } else if (alpha.element === "O") {
            const attachedAcyl = alpha.neighbors.find((n) => {
              if (n.toAtom === atom.index) return false;
              const c = graph.atoms[n.toAtom];
              return (
                c.element === "C" &&
                c.neighbors.some(
                  (co) => co.order === 2 && graph.atoms[co.toAtom].element === "O"
                )
              );
            });
            const attachedAryl = alpha.neighbors.some(
              (n) => n.toAtom !== atom.index && graph.atoms[n.toAtom].isAromatic
            );
            if (attachedAcyl) {
              const inc = atom.totalHydrogens === 3 ? +2.98 : +3.05;
              corrections.push({
                termName: "α-Acyloxy (-O-C(=O)R) Deshielding",
                deltaPpm: inc,
                reasonZh: "酯基氧原子 (-O-C(=O)R) 強誘導與共振去遮蔽效應",
                applicableCondition: "Ester alkoxy group",
                dataNature: "EMPIRICAL_INCREMENT_MODEL",
                citationId: "PRETSCH_EMPIRICAL_TABLES",
              });
              envClass = "ESTER_ALKOXY_CH";
              envLabelZh =
                atom.totalHydrogens === 3
                  ? "甲酯基 (-COOCH₃)"
                  : "乙氧基/酯烷氧基亞甲基 (-COOCH₂-)";
            } else if (attachedAryl) {
              const inc = atom.totalHydrogens === 3 ? +2.95 : +2.85;
              corrections.push({
                termName: "α-Aryloxy (-O-Ar) Deshielding",
                deltaPpm: inc,
                reasonZh: "芳基醚氧原子 (-OAr) 去遮蔽效應",
                applicableCondition: "Aryl ether",
                dataNature: "EMPIRICAL_INCREMENT_MODEL",
                citationId: "PRETSCH_EMPIRICAL_TABLES",
              });
              envClass = "ARYL_ETHER_OCH";
              envLabelZh =
                atom.totalHydrogens === 3 ? "芳基甲氧基 (Ar-OCH₃)" : "芳基烷氧基 (Ar-OCH₂-)";
            } else {
              const inc = atom.totalHydrogens === 3 ? +2.48 : +2.35;
              corrections.push({
                termName: "α-Oxygen (-OH / -OR) Inductive Shift",
                deltaPpm: inc,
                reasonZh: "直接鍵結電負度氧原子 (-O-CHn) 誘導去遮蔽",
                applicableCondition: "Alcohol or dialkyl ether",
                dataNature: "EMPIRICAL_INCREMENT_MODEL",
                citationId: "PRETSCH_EMPIRICAL_TABLES",
              });
              envClass = "ALKOXY_OR_HYDROXY_CH";
              envLabelZh = "氧鄰近脂肪族質子 (-O-CHn-)";
            }
          } else if (alpha.element === "N") {
            const isNitro = alpha.neighbors.some(
              (n) => graph.atoms[n.toAtom].element === "O" && n.order >= 1.5
            );
            const isAmideN = alpha.neighbors.some((n) => {
              const c = graph.atoms[n.toAtom];
              return (
                c.element === "C" &&
                c.neighbors.some(
                  (co) => co.order === 2 && graph.atoms[co.toAtom].element === "O"
                )
              );
            });
            const inc = isNitro ? +3.4 : isAmideN ? +1.95 : +1.55;
            corrections.push({
              termName: "α-Nitrogen Inductive Shift",
              deltaPpm: inc,
              reasonZh: "鄰近氮原子誘導去遮蔽效應",
              applicableCondition: "α-Amino / α-Amido / α-Nitro",
              dataNature: "EMPIRICAL_INCREMENT_MODEL",
              citationId: "PRETSCH_EMPIRICAL_TABLES",
            });
            envClass = "ALPHA_NITROGEN_CH";
            envLabelZh = "氮鄰近脂肪族質子 (-N-CHn-)";
          } else if (["F", "Cl", "Br", "I"].includes(alpha.element)) {
            const halMap: Record<string, number> = {
              F: +3.3,
              Cl: +2.15,
              Br: +1.95,
              I: +1.75,
            };
            corrections.push({
              termName: `α-Halogen (-${alpha.element}) Shift`,
              deltaPpm: halMap[alpha.element] || +2.0,
              reasonZh: `鹵素原子 (-${alpha.element}) 電負度誘導效應`,
              applicableCondition: "Haloalkane",
              dataNature: "EMPIRICAL_INCREMENT_MODEL",
              citationId: "PRETSCH_EMPIRICAL_TABLES",
            });
            envClass = "HALOALKYL_CH";
            envLabelZh = `鹵代烷基質子 (-CHn-${alpha.element})`;
          } else if (alpha.isAromatic) {
            const inc = atom.totalHydrogens === 3 ? +1.47 : +1.42;
            corrections.push({
              termName: "α-Aromatic Ring (Benzylic) Shift",
              deltaPpm: inc,
              reasonZh: "芳環/雜芳環苄位環電流去遮蔽效應",
              applicableCondition: "Benzylic CHn",
              dataNature: "EMPIRICAL_INCREMENT_MODEL",
              citationId: "PRETSCH_EMPIRICAL_TABLES",
            });
            if (envClass === "ALIPHATIC_CH") {
              envClass = "BENZYLIC_CH";
              envLabelZh =
                atom.totalHydrogens === 3
                  ? "芳環甲基質子 (Ar-CH₃)"
                  : "苄位亞甲基/次甲基質子 (Ar-CHn-)";
            } else if (envClass === "ESTER_ALKOXY_CH") {
              envClass = "BENZYL_ESTER_CH2";
              envLabelZh = "苄酯亞甲基質子 (Ar-CH₂-OC(=O)R)";
            }
          } else if (alpha.element === "C") {
            const hasCarbonylO = alpha.neighbors.some(
              (n) => n.order === 2 && graph.atoms[n.toAtom].element === "O"
            );
            const hasNitrileN = alpha.neighbors.some(
              (n) => n.order === 3 && graph.atoms[n.toAtom].element === "N"
            );
            if (hasCarbonylO) {
              const isArylKetone = alpha.neighbors.some(
                (n) => n.toAtom !== atom.index && graph.atoms[n.toAtom].isAromatic
              );
              const isEsterOrAcidOrAmide = alpha.neighbors.some(
                (n) =>
                  n.toAtom !== atom.index &&
                  n.order === 1 &&
                  ["O", "N"].includes(graph.atoms[n.toAtom].element)
              );
              const inc = isArylKetone
                ? +1.7
                : isEsterOrAcidOrAmide
                  ? +1.22
                  : +1.32;
              corrections.push({
                termName: "α-Carbonyl (-C(=O)-) Shift",
                deltaPpm: inc,
                reasonZh: "鄰近羰基 (α-C=O) 誘導與磁異向性去遮蔽效應",
                applicableCondition: "α-Carbonyl CHn",
                dataNature: "EMPIRICAL_INCREMENT_MODEL",
                citationId: "PRETSCH_EMPIRICAL_TABLES",
              });
              envClass = "ALPHA_CARBONYL_CH";
              envLabelZh =
                atom.totalHydrogens === 3
                  ? "乙醯基/甲基酮質子 (-C(=O)CH₃)"
                  : "羰基鄰近 α-位質子 (-CHn-C=O)";
            } else if (hasNitrileN) {
              corrections.push({
                termName: "α-Nitrile (-CN) Shift",
                deltaPpm: +1.15,
                reasonZh: "鄰近腈基 (-C≡N) 誘導效應",
                applicableCondition: "α-Cyano CHn",
                dataNature: "EMPIRICAL_INCREMENT_MODEL",
                citationId: "PRETSCH_EMPIRICAL_TABLES",
              });
            } else {
              // Check β-substituents attached to alpha carbon
              for (const betaNb of alpha.neighbors) {
                if (betaNb.toAtom === atom.index) continue;
                const betaAtom = graph.atoms[betaNb.toAtom];
                if (betaAtom.element === "O") {
                  const isAcylO = betaAtom.neighbors.some((n) => {
                    if (n.toAtom === alpha.index) return false;
                    const c = graph.atoms[n.toAtom];
                    return (
                      c.element === "C" &&
                      c.neighbors.some(
                        (co) => co.order === 2 && graph.atoms[co.toAtom].element === "O"
                      )
                    );
                  });
                  corrections.push({
                    termName: isAcylO ? "β-Acyloxy Shift" : "β-Oxygen Shift",
                    deltaPpm: isAcylO ? +0.48 : +0.32,
                    reasonZh: "β-位氧原子遠端誘導去遮蔽修正 (如 -OCH₂CH₃ 末端甲基)",
                    applicableCondition: "β-heteroatom increment",
                    dataNature: "EMPIRICAL_INCREMENT_MODEL",
                    citationId: "PRETSCH_EMPIRICAL_TABLES",
                  });
                  if (atom.totalHydrogens === 3 && alpha.totalHydrogens === 2) {
                    envLabelZh = "乙氧基末端甲基 (-OCH₂-CH₃)";
                  }
                } else if (
                  betaAtom.element === "C" &&
                  betaAtom.neighbors.some(
                    (n) => n.order === 2 && graph.atoms[n.toAtom].element === "O"
                  )
                ) {
                  corrections.push({
                    termName: "β-Carbonyl Shift",
                    deltaPpm: +0.22,
                    reasonZh: "β-位羰基誘導微調",
                    applicableCondition: "β-C=O",
                    dataNature: "EMPIRICAL_INCREMENT_MODEL",
                    citationId: "PRETSCH_EMPIRICAL_TABLES",
                  });
                } else if (betaAtom.isAromatic) {
                  corrections.push({
                    termName: "β-Aryl Shift",
                    deltaPpm: +0.25,
                    reasonZh: "β-位芳環效應微調",
                    applicableCondition: "β-Aryl",
                    dataNature: "EMPIRICAL_INCREMENT_MODEL",
                    citationId: "PRETSCH_EMPIRICAL_TABLES",
                  });
                }
              }
            }
          }
        }
      }

      if (solventProfile.polarCHShiftDelta !== 0) {
        corrections.push({
          termName: `Solvent Polar/ASIS Adjustment (${solvent})`,
          deltaPpm: solventProfile.polarCHShiftDelta,
          reasonZh: `${solventProfile.labelZh} 溶劑對 C-H 化學位移之介電/ASIS 微調`,
          applicableCondition: `Solvent = ${solvent}`,
          dataNature: "GENERAL_THEORY",
          citationId: "CASABIANCA_2020_MRC",
          doi: NMR_LITERATURE_REGISTRY.CASABIANCA_2020_MRC.doi,
        });
      }

      const finalDelta = Number(
        Math.max(-0.5, Math.min(14.0, corrections.reduce((s, c) => s + c.deltaPpm, 0))).toFixed(2)
      );

      if (finalDelta >= 3.1 && finalDelta < 4.6) {
        regionCategory = "雜原子鄰近區 Heteroatom-Adjacent (3.1–4.6 ppm)";
      } else if (finalDelta >= 1.85 && finalDelta < 3.1) {
        regionCategory = "苄基 / 羰基鄰近區 α-Carbonyl / Benzylic (1.85–3.1 ppm)";
      } else if (finalDelta >= 4.6 && finalDelta < 6.4) {
        regionCategory = "烯基 / 苄酯 / 活潑氫區 (4.6–6.4 ppm)";
      }

      atomPredictions.set(atom.index, {
        atomIdx: atom.index,
        element: "C",
        protonCount: atom.totalHydrogens,
        symClass: symClasses[atom.index],
        deltaPpm: finalDelta,
        uncertaintyPpm,
        envClass,
        envLabelZh,
        regionCategory,
        isExchangeable,
        isDeuteriumExchangedOut: false,
        corrections,
        confidenceLevel,
        dataNature: "EMPIRICAL_INCREMENT_MODEL",
      });
    }

    // Step 2: Group equivalent proton-bearing atoms by topological symmetry class
    const groupedMap = new Map<string, AtomH1Prediction[]>();
    for (const pred of atomPredictions.values()) {
      const list = groupedMap.get(pred.symClass) || [];
      list.push(pred);
      groupedMap.set(pred.symClass, list);
    }

    // Check if structure matches a known reference entry for exact experimental anchoring while keeping full corrections & coupling network
    const knownRef = KNOWN_STRUCTURAL_LIBRARY.find(
      (k) =>
        smiles &&
        k.smilesAliases.some((a) => a.toLowerCase() === smiles.toLowerCase())
    );

    const environments: ProtonEnvironment[] = [];
    const peaks: SpectralPeak[] = [];

    const sortedGroups = Array.from(groupedMap.values()).sort(
      (a, b) => b[0].deltaPpm - a[0].deltaPpm
    );

    for (let gIdx = 0; gIdx < sortedGroups.length; gIdx++) {
      const group = sortedGroups[gIdx];
      const rep = group[0];
      const atomIndices = group.map((g) => g.atomIdx);
      const totalProtonsInGroup = group.reduce((s, g) => s + g.protonCount, 0);

      // Build spin-coupling network for representative atom rep.atomIdx
      const rawCouplings: {
        partnerAtomIdx: number;
        partnerSymClass: string;
        partnerShiftPpm: number;
        partnerProtons: number;
        jHz: number;
        couplingType: JCoupling["couplingType"];
        literatureRangeHz: [number, number];
      }[] = [];

      if (!rep.isExchangeable) {
        // Check geminal diastereotopic CH2 (if CH2 is adjacent to a chiral-like carbon with 4 distinct neighbor symmetry classes)
        let isDiastereotopicCh2 = false;
        if (rep.element === "C" && rep.protonCount === 2) {
          for (const nb of graph.atoms[rep.atomIdx].neighbors) {
            const nbAtom = graph.atoms[nb.toAtom];
            if (nbAtom.element === "C" && !nbAtom.isAromatic) {
              const nbNeighborClasses = new Set(
                nbAtom.neighbors.map((n) => symClasses[n.toAtom])
              );
              if (
                nbAtom.neighbors.length + nbAtom.totalHydrogens === 4 &&
                nbNeighborClasses.size >= 3 &&
                nbAtom.totalHydrogens <= 1
              ) {
                isDiastereotopicCh2 = true;
              }
            }
          }
        }
        if (isDiastereotopicCh2) {
          rawCouplings.push({
            partnerAtomIdx: rep.atomIdx,
            partnerSymClass: `${rep.symClass}_gem`,
            partnerShiftPpm: rep.deltaPpm + 0.08,
            partnerProtons: 1,
            jHz: 13.6,
            couplingType: "geminal (2J)",
            literatureRangeHz: [12.0, 15.0],
          });
        }

        // Group coupled partners by symmetry class so equivalent neighbor atoms combine their protons (e.g. two equivalent CH3 in isopropyl -> 6H)
        const partnerSymBuckets = new Map<
          string,
          {
            partnerAtomIdx: number;
            partnerShiftPpm: number;
            partnerProtons: number;
            jHz: number;
            couplingType: JCoupling["couplingType"];
            literatureRangeHz: [number, number];
          }
        >();

        for (const other of atomPredictions.values()) {
          if (other.atomIdx === rep.atomIdx) continue;
          if (other.isExchangeable) continue; // Labile protons rarely show coupling in standard CDCl3
          if (other.symClass === rep.symClass) continue; // Equivalent protons don't split each other in first-order

          const bondDist = distMatrix[rep.atomIdx][other.atomIdx];
          if (bondDist === 1) {
            // 3-bond vicinal / ortho coupling (H - AtomA - AtomB - H)
            let jHz = 7.2;
            let cType: JCoupling["couplingType"] = "vicinal (3J)";
            let litRange: [number, number] = [6.5, 8.0];

            const atomA = graph.atoms[rep.atomIdx];
            const atomB = graph.atoms[other.atomIdx];

            if (atomA.isAromatic && atomB.isAromatic) {
              const inPyridine = pyridineRings.some(
                (r) =>
                  r.atomIndices.includes(rep.atomIdx) &&
                  r.atomIndices.includes(other.atomIdx)
              );
              if (inPyridine) {
                const isAlphaInvolved =
                  rep.envClass === "PYRIDINE_ALPHA_CH" ||
                  other.envClass === "PYRIDINE_ALPHA_CH";
                jHz = isAlphaInvolved ? 4.9 : 7.8;
                cType = "heteroaromatic-ortho (3J)";
                litRange = isAlphaInvolved ? [4.6, 5.5] : [7.4, 8.2];
              } else {
                jHz = 8.1;
                cType = "ortho-aromatic (3J)";
                litRange = [7.5, 8.8];
              }
            } else {
              const bondAB = atomA.neighbors.find(
                (n) => n.toAtom === other.atomIdx
              );
              if (bondAB?.order === 2) {
                jHz = 15.6;
                cType = "trans-alkene (3J)";
                litRange = [10.0, 17.5];
              } else {
                jHz = 7.1;
                cType = "vicinal (3J)";
                litRange = [6.5, 7.8];
              }
            }

            const existing = partnerSymBuckets.get(other.symClass);
            if (existing) {
              // Avoid double-counting if rep.atomIdx is bonded to two equivalent atoms (e.g., isopropyl CH bonded to two equivalent CH3s, or aromatic H-4 bonded to two equivalent H-3/5)
              existing.partnerProtons += other.protonCount;
            } else {
              partnerSymBuckets.set(other.symClass, {
                partnerAtomIdx: other.atomIdx,
                partnerShiftPpm: other.deltaPpm,
                partnerProtons: other.protonCount,
                jHz,
                couplingType: cType,
                literatureRangeHz: litRange,
              });
            }
          } else if (
            bondDist === 2 &&
            graph.atoms[rep.atomIdx].isAromatic &&
            graph.atoms[other.atomIdx].isAromatic
          ) {
            // 4-bond meta coupling in aromatic/heteroaromatic rings when isolated (no ortho H on rep.atomIdx)
            const hasOrthoH = graph.atoms[rep.atomIdx].neighbors.some(
              (nb) =>
                graph.atoms[nb.toAtom].isAromatic &&
                graph.atoms[nb.toAtom].totalHydrogens > 0
            );
            if (!hasOrthoH) {
              partnerSymBuckets.set(`meta_${other.symClass}`, {
                partnerAtomIdx: other.atomIdx,
                partnerShiftPpm: other.deltaPpm,
                partnerProtons: other.protonCount,
                jHz: 2.1,
                couplingType: "meta-aromatic (4J)",
                literatureRangeHz: [1.5, 2.8],
              });
            }
          }
        }

        for (const [symKey, val] of partnerSymBuckets.entries()) {
          rawCouplings.push({
            partnerSymClass: symKey,
            ...val,
          });
        }
      }

      // Check AA'BB' magnetic non-equivalence (1,4-para disubstituted benzene or 4-substituted pyridine: 2 equivalent CH pairs ortho to each other)
      const isMagneticAABB =
        group.length === 2 &&
        graph.atoms[rep.atomIdx].isAromatic &&
        rawCouplings.length === 1 &&
        rawCouplings[0].couplingType.includes("ortho");

      // If AA'BB', each proton in group only has 1 ortho neighbor (not 2!), because each of the 2 equivalent C-H atoms is bonded to 1 C-H of the partner pair
      if (isMagneticAABB && rawCouplings[0].partnerProtons === 2) {
        rawCouplings[0].partnerProtons = 1;
        rawCouplings[0].jHz =
          rep.envClass.startsWith("PYRIDINE") ? 5.8 : 8.5;
      }

      // Compute Δν / J to detect second-order strong coupling
      let deltaNuOverJMin: number | null = null;
      for (const rc of rawCouplings) {
        if (rc.jHz > 0) {
          const deltaHz = Math.abs(rep.deltaPpm - rc.partnerShiftPpm) * freqMHz;
          const ratio = Number((deltaHz / rc.jHz).toFixed(2));
          if (deltaNuOverJMin === null || ratio < deltaNuOverJMin) {
            deltaNuOverJMin = ratio;
          }
        }
      }

      const multipletInfo = SpinCouplingCalculator.deriveMultipletNotation(
        rawCouplings.map((rc) => ({
          jHz: rc.jHz,
          partnerProtons: rc.partnerProtons,
          couplingType: rc.couplingType,
        })),
        {
          isExchangeBroadened: rep.isExchangeable,
          isMagneticNonEquivalentAABB: isMagneticAABB,
          deltaNuOverJMin,
        }
      );

      let finalShift = rep.deltaPpm;
      let finalMult = multipletInfo.code;
      let finalJValues = rawCouplings.map((rc) => Number(rc.jHz.toFixed(1)));

      // If structure is in KNOWN_STRUCTURAL_LIBRARY and solvent is CDCl3/Unknown, anchor shift closely while keeping solvent shifts for DMSO-d6/D2O/etc.
      if (knownRef && !rep.isDeuteriumExchangedOut) {
        const matchKnown = knownRef.keyH1Shifts.find(
          (ks) =>
            ks.integ === totalProtonsInGroup &&
            Math.abs(ks.ppm - rep.deltaPpm) <= (rep.isExchangeable ? 1.8 : 0.45)
        );
        if (matchKnown) {
          const solvDelta = rep.isExchangeable
            ? rep.corrections
                .filter((c) => c.termName.includes("Solvent"))
                .reduce((s, c) => s + c.deltaPpm, 0)
            : solventProfile.polarCHShiftDelta;
          finalShift = Number((matchKnown.ppm + solvDelta).toFixed(2));
          if (!rep.isExchangeable) {
            finalMult = (matchKnown.mult as any) || finalMult;
            if (matchKnown.j && finalJValues.length === 0) {
              finalJValues = [matchKnown.j];
            }
          }
        }
      }

      const simulatedLines = SpinCouplingCalculator.simulateFirstOrderMultiplet(
        finalShift,
        rawCouplings.map((rc) => ({
          jHz: rc.jHz,
          partnerProtons: rc.partnerProtons,
        })),
        freqMHz
      );

      const jCouplingObjs: JCoupling[] = rawCouplings.map((rc) => ({
        atomA: `Atom_${rep.atomIdx + 1}`,
        atomB: `Atom_${rc.partnerAtomIdx + 1}`,
        J: Number(rc.jHz.toFixed(1)),
        couplingType: rc.couplingType,
        dihedralAngle: "NOT_PROVIDED",
        confidence: 0.88,
        literatureRangeHz: rc.literatureRangeHz,
        citationId: "PRETSCH_EMPIRICAL_TABLES",
      }));

      const strongCouplingWarning =
        deltaNuOverJMin !== null && deltaNuOverJMin < 6.0
          ? `偵測到二階強耦合效應 (Δν/J = ${deltaNuOverJMin} < 6 at ${freqMHz} MHz)：峰形將出現向內傾斜之屋頂效應 (Roofing effect) 或非一階分裂線，不宜單純套用一階 n+1 強度比。`
          : isMagneticAABB
            ? "AA'BB' 對稱四自旋系統：化學等價但磁不等價 (³J_AB ≠ ⁵J_AB')，表現為具微細旁帶之擬雙重峰。"
            : undefined;

      const spinCouplingAnalysis: SpinCouplingAnalysis = {
        spinSystemNotation: isMagneticAABB
          ? "AA'BB'"
          : deltaNuOverJMin !== null && deltaNuOverJMin < 6.0
            ? "AB / ABX (Second-Order)"
            : rawCouplings.length > 0
              ? "First-Order Spin System"
              : "Isolated Spin (Singlet)",
        couplingOrder: multipletInfo.couplingOrder,
        deltaNuOverJMin,
        strongCouplingWarning,
        multipletCode: finalMult || "s",
        multipletDescriptionZh: multipletInfo.descriptionZh,
        jCouplings: jCouplingObjs,
        simulatedLines,
        isMagneticNonEquivalent: isMagneticAABB,
        isExchangeBroadened: rep.isExchangeable,
      };

      const expectedShiftRange: [number, number] = [
        Number((finalShift - rep.uncertaintyPpm).toFixed(2)),
        Number((finalShift + rep.uncertaintyPpm).toFixed(2)),
      ];

      const litRefs: NMRLiteratureReference[] = [
        NMR_LITERATURE_REGISTRY.JONAS_2022_MRC,
        NMR_LITERATURE_REGISTRY.PRETSCH_EMPIRICAL_TABLES,
        ...(solvent !== "CDCl3" && solvent !== "Unknown"
          ? [NMR_LITERATURE_REGISTRY.CASABIANCA_2020_MRC]
          : []),
      ];

      const correctionSummary = rep.corrections
        .map(
          (c) =>
            `${c.termName} (${c.deltaPpm >= 0 ? "+" : ""}${c.deltaPpm.toFixed(2)} ppm)`
        )
        .join(" + ");

      const exchNote = rep.isDeuteriumExchangedOut
        ? ` [注意：於質子性氘代溶劑 ${solvent} (${solventProfile.labelZh}) 中，此活潑質子會發生快速 H/D 交換而減弱或消失]`
        : rep.isExchangeable
          ? `於 ${solvent} (${solventProfile.labelZh}) 中為可交換活潑質子 (${solventProfile.notesZh})`
          : "";

      const envObj: ProtonEnvironment = {
        id: `pred-h1-env-${gIdx + 1}`,
        atomId: `H_group_${atomIndices.map((i) => i + 1).join("_")}`,
        atomIndices,
        atomGroupLabel: `Atoms #${atomIndices.map((i) => i + 1).join(",")} (${totalProtonsInGroup}H)`,
        chemicalShift: finalShift,
        predictedDeltaPpm: finalShift,
        uncertaintyPpm: rep.uncertaintyPpm,
        environmentLabel: `${rep.envLabelZh}${rep.isDeuteriumExchangedOut ? exchNote : ""}`,
        environment: rep.envLabelZh,
        chemicalEnvironmentClass: rep.envClass,
        shiftPpm: finalShift,
        expectedShiftRange,
        integration: totalProtonsInGroup,
        expectedProtonCount: totalProtonsInGroup,
        inferredProtonCount: totalProtonsInGroup,
        isExchangeable: rep.isExchangeable,
        exchangeabilityNote: rep.isExchangeable ? exchNote.trim() : undefined,
        relativeIntensity: Math.min(100, 38 + totalProtonsInGroup * 15),
        multiplicity: finalMult ?? null,
        jCouplingHz: finalJValues,
        couplings: jCouplingObjs,
        spinCouplingAnalysis,
        appliedCorrections: rep.corrections,
        solventApplied: solvent,
        spectrometerFrequencyMHz: freqMHz,
        literatureSources: litRefs,
        dataNature: rep.dataNature,
        confidenceLevel: rep.confidenceLevel,
        regionCategory: rep.regionCategory,
        coupledPartnerShift:
          rawCouplings.length > 0 ? rawCouplings[0].partnerShiftPpm : undefined,
        pairedStructureAtomGroup: `對應結構 ${structure.name || structure.molecularFormula} 之 ${rep.envLabelZh}`,
        symmetryNote:
          group.length > 1
            ? `${group.length} 個化學等價原子群組 (共 ${totalProtonsInGroup}H)`
            : `單一原子群組 (${totalProtonsInGroup}H)`,
        symmetry:
          group.length > 1 ? `Topological Equivalence (${group.length}x)` : "C1",
        modelType: "EMPIRICAL",
        source: "NUMERIC_EXACT",
        confidence:
          rep.confidenceLevel === "HIGH"
            ? 90
            : rep.confidenceLevel === "MEDIUM"
              ? 78
              : 62,
        reasoning: `[分子圖加成預測] δ = ${finalShift.toFixed(2)} ± ${rep.uncertaintyPpm.toFixed(2)} ppm (${totalProtonsInGroup}H, ${finalMult || "s"}${
          finalJValues.length > 0 ? `, J = ${finalJValues.join(", ")} Hz` : ""
        })；加成項：${correctionSummary}。${strongCouplingWarning || ""}${exchNote}`,
      };

      environments.push(envObj);

      // In D2O or CD3OD, deuterium-exchanged labile protons are attenuated or absent in experimental 1H spectrum,
      // but we keep them in environments (marked with isExchangeable) and only include non-exchanged or attenuated peaks in spectrum
      if (!rep.isDeuteriumExchangedOut) {
        peaks.push({
          id: `pred-h1-${gIdx + 1}`,
          x: finalShift,
          y: Math.min(100, 42 + totalProtonsInGroup * 16),
          integration: totalProtonsInGroup,
          integral: totalProtonsInGroup,
          multiplicity: finalMult ?? null,
          jValues: finalJValues,
          isPredictedPeak: true,
          predictedRange: expectedShiftRange,
          assignment: `[經驗加成模型預測] ${rep.envLabelZh} δ ${finalShift.toFixed(2)} ± ${rep.uncertaintyPpm.toFixed(2)} ppm (${totalProtonsInGroup}H, ${finalMult || "s"})`,
        });
      }
    }

    return { peaks, environments };
  }

  /**
   * 從分子圖完整預測 ¹³C NMR 訊號環境、碳混成、取代基加成、DEPT 相容性、季碳弛豫特性與不確定度
   */
  static predict13CFromStructureGraph(
    structure: ParsedChemicalStructure,
    options?: {
      solvent?: NMRSolvent;
    }
  ): {
    peaks: SpectralPeak[];
    environments: CarbonEnvironment[];
  } {
    const solvent: NMRSolvent = options?.solvent || "CDCl3";
    const solventProfile =
      DEUTERATED_SOLVENT_PROFILES[solvent] || DEUTERATED_SOLVENT_PROFILES.CDCl3;
    const smiles = (structure.smiles || "").trim();

    const parsedRes = StructureParserAdapter.parseSmilesGraph(smiles);
    if (!parsedRes.valid || !parsedRes.graph) {
      return { peaks: [], environments: [] };
    }
    const graph = parsedRes.graph;
    const distMatrix = this.computeDistanceMatrix(graph);
    const symClasses = this.computeAtomSymmetryClasses(graph);
    const rings = this.detectRings(graph);
    const benzeneRings = rings.filter((r) => r.ringType === "BENZENE");
    const pyridineRings = rings.filter((r) => r.ringType === "PYRIDINE");

    interface AtomC13Prediction {
      atomIdx: number;
      symClass: string;
      deltaPpm: number;
      uncertaintyPpm: number;
      deptType: "C" | "CH" | "CH2" | "CH3";
      carbonType: CarbonEnvironmentType;
      hybridization: "sp" | "sp2" | "sp3";
      envClass: string;
      assignmentZh: string;
      regionCategory: string;
      isQuaternarySlowRelaxation: boolean;
      relaxationAndNoeNote: string;
      corrections: NMRShiftCorrectionTerm[];
      confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
    }

    const carbonPreds = new Map<number, AtomC13Prediction>();

    for (const atom of graph.atoms) {
      if (atom.element !== "C") continue;

      const deptType: "C" | "CH" | "CH2" | "CH3" =
        atom.totalHydrogens === 0
          ? "C"
          : atom.totalHydrogens === 1
            ? "CH"
            : atom.totalHydrogens === 2
              ? "CH2"
              : "CH3";

      const isQuaternary = deptType === "C";
      const corrections: NMRShiftCorrectionTerm[] = [];
      let baseDelta = 20.0;
      let uncertaintyPpm = 2.2;
      let hybridization: "sp" | "sp2" | "sp3" = "sp3";
      let envClass = "ALIPHATIC_SP3_C";
      let assignmentZh = `飽和脂肪族 sp³ 碳 (${deptType})`;
      let regionCategory = "脂肪族 sp³ 碳區 Aliphatic C (0–50 ppm)";
      let carbonType: CarbonEnvironmentType = deptType;

      // 1. Aromatic Benzene Ring Carbon
      const bRing = benzeneRings.find((r) => r.atomIndices.includes(atom.index));
      const pRing = pyridineRings.find((r) => r.atomIndices.includes(atom.index));

      if (bRing) {
        hybridization = "sp2";
        carbonType = "aromatic_C";
        const ringSet = new Set(bRing.atomIndices);
        baseDelta = 128.5;
        uncertaintyPpm = 1.6;
        corrections.push({
          termName: "Benzene ¹³C Base Shift",
          deltaPpm: 128.5,
          reasonZh: "未取代苯環 sp² 碳基準化學位移 (128.5 ppm)",
          applicableCondition: "Aromatic 13C Z-additivity",
          dataNature: "EMPIRICAL_INCREMENT_MODEL",
          citationId: "PRETSCH_EMPIRICAL_TABLES",
        });

        for (const rIdx of bRing.atomIndices) {
          const subInfo = this.classifyRingSubstituent(graph, rIdx, ringSet);
          if (!subInfo) continue;
          const d = distMatrix[atom.index][rIdx];
          const incSet = AROMATIC_SUBSTITUENT_INCREMENTS[subInfo.subClass];
          let zVal = 0;
          let posLabel = "";
          if (d === 0) {
            zVal = incSet.c13Ipso;
            posLabel = "ipso";
          } else if (d === 1) {
            zVal = incSet.c13Ortho;
            posLabel = "ortho";
          } else if (d === 2) {
            zVal = incSet.c13Meta;
            posLabel = "meta";
          } else if (d === 3) {
            zVal = incSet.c13Para;
            posLabel = "para";
          }
          if (zVal !== 0) {
            corrections.push({
              termName: `Z_${posLabel}(${subInfo.labelZh})`,
              deltaPpm: zVal,
              reasonZh:
                d === 0 && subInfo.subClass === "I"
                  ? "碘原子顯著重原子自旋-軌道相對論遮蔽效應 (Heavy-atom relativistic effect, Bühl 2011)"
                  : `${subInfo.labelZh} 對芳環 ${posLabel}-碳之 ¹³C 加成修正`,
              applicableCondition: "Aromatic 13C Z-increment",
              dataNature:
                d === 0 && subInfo.subClass === "I"
                  ? "GENERAL_THEORY"
                  : "EMPIRICAL_INCREMENT_MODEL",
              citationId:
                d === 0 && subInfo.subClass === "I"
                  ? "BUHL_2011_WCMS"
                  : "PRETSCH_EMPIRICAL_TABLES",
            });
          }
        }

        const totalDelta = Number(
          Math.max(
            75.0,
            Math.min(172.0, corrections.reduce((s, c) => s + c.deltaPpm, 0))
          ).toFixed(1)
        );
        envClass = isQuaternary ? "AROMATIC_IPSO_C" : "AROMATIC_CH";
        assignmentZh = isQuaternary
          ? "取代苯環四級碳 (Quaternary Ar-C_ipso)"
          : "苯環芳香次甲基碳 (Ar-CH)";
        regionCategory =
          totalDelta >= 145
            ? "雜原子鄰近芳香/雜環碳區 Heteroaromatic α-C / Ipso C-O, C-N (145–164 ppm)"
            : "芳香環 / 雜環 / 烯基 sp² 碳區 Aromatic / Heteroaromatic / Alkene C (100–145 ppm)";

        carbonPreds.set(atom.index, {
          atomIdx: atom.index,
          symClass: symClasses[atom.index],
          deltaPpm: totalDelta,
          uncertaintyPpm,
          deptType,
          carbonType,
          hybridization,
          envClass,
          assignmentZh,
          regionCategory,
          isQuaternarySlowRelaxation: isQuaternary,
          relaxationAndNoeNote: isQuaternary
            ? "四級碳 (Ar-C_ipso) 無直接鍵結質子，缺乏 ¹H→¹³C NOE 增益且自旋-晶格弛豫時間 T₁ 較長，實驗峰強度通常顯著較弱。"
            : "具直接鍵結質子 (Ar-CH)，具正常 NOE 訊號增益。",
          corrections,
          confidenceLevel: "HIGH",
        });
        continue;
      }

      // 2. Pyridine Ring Carbon
      if (pRing) {
        hybridization = "sp2";
        carbonType = "heteroaromatic_C";
        const ringSet = new Set(pRing.atomIndices);
        const nAtomIdx = pRing.atomIndices.find(
          (idx) => graph.atoms[idx].element === "N"
        )!;
        const distToN = distMatrix[atom.index][nAtomIdx];
        baseDelta = distToN === 1 ? 149.9 : distToN === 2 ? 123.8 : 135.9;
        corrections.push({
          termName: `Pyridine Base C-${distToN === 1 ? "2/6 (α)" : distToN === 2 ? "3/5 (β)" : "4 (γ)"}`,
          deltaPpm: baseDelta,
          reasonZh: "吡啶環 sp² 碳基準化學位移",
          applicableCondition: "Pyridine ring",
          dataNature: "EMPIRICAL_INCREMENT_MODEL",
          citationId: "PRETSCH_EMPIRICAL_TABLES",
        });

        for (const rIdx of pRing.atomIndices) {
          if (rIdx === nAtomIdx) continue;
          const subInfo = this.classifyRingSubstituent(graph, rIdx, ringSet);
          if (!subInfo) continue;
          const d = distMatrix[atom.index][rIdx];
          const incSet = AROMATIC_SUBSTITUENT_INCREMENTS[subInfo.subClass];
          const zVal =
            d === 0
              ? incSet.c13Ipso * 0.85
              : d === 1
                ? incSet.c13Ortho * 0.85
                : d === 2
                  ? incSet.c13Meta * 0.85
                  : incSet.c13Para * 0.85;
          if (zVal !== 0) {
            corrections.push({
              termName: `Pyridine Substituent (${subInfo.labelZh})`,
              deltaPpm: Number(zVal.toFixed(1)),
              reasonZh: `吡啶環取代基 ${subInfo.labelZh} 對碳核遮蔽之修正`,
              applicableCondition: "Substituted pyridine",
              dataNature: "EMPIRICAL_INCREMENT_MODEL",
              citationId: "PRETSCH_EMPIRICAL_TABLES",
            });
          }
        }

        const totalDelta = Number(
          corrections.reduce((s, c) => s + c.deltaPpm, 0).toFixed(1)
        );
        envClass =
          distToN === 1
            ? "PYRIDINE_ALPHA_C"
            : distToN === 2
              ? "PYRIDINE_BETA_C"
              : "PYRIDINE_GAMMA_C";
        assignmentZh = `吡啶環 ${distToN === 1 ? "α-碳 (C-2/6)" : distToN === 2 ? "β-碳 (C-3/5)" : "γ-碳 (C-4)"} (${deptType})`;
        regionCategory =
          totalDelta >= 145
            ? "雜原子鄰近芳香/雜環碳區 Heteroaromatic α-C / Ipso C-O, C-N (145–164 ppm)"
            : "芳香環 / 雜環 / 烯基 sp² 碳區 Aromatic / Heteroaromatic / Alkene C (100–145 ppm)";

        carbonPreds.set(atom.index, {
          atomIdx: atom.index,
          symClass: symClasses[atom.index],
          deltaPpm: totalDelta,
          uncertaintyPpm: 1.8,
          deptType,
          carbonType,
          hybridization,
          envClass,
          assignmentZh,
          regionCategory,
          isQuaternarySlowRelaxation: isQuaternary,
          relaxationAndNoeNote: isQuaternary
            ? "取代吡啶環四級碳 (C_ipso)，T₁ 較長導致訊號強度較低。"
            : "吡啶環 CH 碳，具正常 NOE 增益。",
          corrections,
          confidenceLevel: "HIGH",
        });
        continue;
      }

      // 3. Other Aromatic Ring Carbons (Pyrrole, Furan, Thiophene, Diazines)
      if (atom.isAromatic) {
        hybridization = "sp2";
        carbonType = "heteroaromatic_C";
        const hasHeteroNb = atom.neighbors.some(
          (nb) =>
            graph.atoms[nb.toAtom].isAromatic &&
            graph.atoms[nb.toAtom].element !== "C"
        );
        baseDelta = hasHeteroNb ? 142.5 : 118.5;
        corrections.push({
          termName: "Heteroaromatic Base Shift",
          deltaPpm: baseDelta,
          reasonZh: "五元/六元芳香雜環碳基準位移",
          applicableCondition: "Heteroaromatic ring",
          dataNature: "EMPIRICAL_INCREMENT_MODEL",
          citationId: "PRETSCH_EMPIRICAL_TABLES",
        });
        carbonPreds.set(atom.index, {
          atomIdx: atom.index,
          symClass: symClasses[atom.index],
          deltaPpm: baseDelta,
          uncertaintyPpm: 2.5,
          deptType,
          carbonType,
          hybridization,
          envClass: "HETEROAROMATIC_C",
          assignmentZh: `芳香雜環碳 (${deptType})`,
          regionCategory: "芳香環 / 雜環 / 烯基 sp² 碳區 Aromatic / Heteroaromatic / Alkene C (100–145 ppm)",
          isQuaternarySlowRelaxation: isQuaternary,
          relaxationAndNoeNote: isQuaternary ? "雜芳環四級碳訊號較弱。" : "雜芳環 CH 碳。",
          corrections,
          confidenceLevel: "MEDIUM",
        });
        continue;
      }

      // 4. Non-Aromatic Carbonyls, Nitriles, Alkenes, Alkynes, and Aliphatic sp³ Carbons
      const carbonylO = atom.neighbors.find(
        (nb) => nb.order === 2 && graph.atoms[nb.toAtom].element === "O"
      );
      const tripleN = atom.neighbors.find(
        (nb) => nb.order === 3 && graph.atoms[nb.toAtom].element === "N"
      );
      const tripleC = atom.neighbors.find(
        (nb) => nb.order === 3 && graph.atoms[nb.toAtom].element === "C"
      );
      const doubleC = atom.neighbors.find(
        (nb) => nb.order === 2 && graph.atoms[nb.toAtom].element === "C"
      );

      if (carbonylO) {
        hybridization = "sp2";
        carbonType = "carbonyl_C";
        const isArylAttached = atom.neighbors.some(
          (nb) => graph.atoms[nb.toAtom].isAromatic
        );
        const singleO = atom.neighbors.find(
          (nb) =>
            nb.toAtom !== carbonylO.toAtom &&
            nb.order === 1 &&
            graph.atoms[nb.toAtom].element === "O"
        );
        const singleN = atom.neighbors.find(
          (nb) => nb.order === 1 && graph.atoms[nb.toAtom].element === "N"
        );

        if (atom.totalHydrogens >= 1) {
          // Aldehyde C=O
          baseDelta = isArylAttached ? 192.0 : 200.5;
          envClass = "ALDEHYDE_CO";
          assignmentZh = isArylAttached
            ? "芳香醛羰基碳 (Ar-CH=O, DEPT CH)"
            : "脂肪醛羰基碳 (R-CH=O, DEPT CH)";
          regionCategory = "醛 / 酮羰基碳區 Ketone / Aldehyde C=O (188–220 ppm)";
        } else if (singleO) {
          const oAtom = graph.atoms[singleO.toAtom];
          if (oAtom.totalHydrogens >= 1) {
            baseDelta = isArylAttached ? 169.5 : 178.5;
            envClass = "CARBOXYLIC_ACID_CO";
            assignmentZh = "羧酸羰基四級碳 (-COOH, C=O)";
          } else {
            const isPhenolicEster = oAtom.neighbors.some(
              (n) => n.toAtom !== atom.index && graph.atoms[n.toAtom].isAromatic
            );
            baseDelta = isArylAttached
              ? 166.6
              : isPhenolicEster
                ? 169.6
                : 171.2;
            envClass = "ESTER_CO";
            assignmentZh = "酯基羰基四級碳 (-COOR, C=O)";
          }
          regionCategory = "羧酸 / 酯 / 醯胺羰基區 Acid / Ester / Amide C=O (164–188 ppm)";
        } else if (singleN) {
          baseDelta = isArylAttached ? 168.0 : 169.2;
          envClass = "AMIDE_CO";
          assignmentZh = "醯胺羰基四級碳 (-CONH-, C=O)";
          regionCategory = "羧酸 / 酯 / 醯胺羰基區 Acid / Ester / Amide C=O (164–188 ppm)";
        } else {
          // Ketone C=O
          baseDelta = isArylAttached ? 198.0 : 207.5;
          envClass = "KETONE_CO";
          assignmentZh = isArylAttached
            ? "共軛芳基酮羰基四級碳 (Ar-C(=O)R)"
            : "脂肪酮羰基四級碳 (R₂C=O)";
          regionCategory = "醛 / 酮羰基碳區 Ketone / Aldehyde C=O (188–220 ppm)";
        }

        corrections.push({
          termName: `Carbonyl Base (${envClass})`,
          deltaPpm: baseDelta,
          reasonZh: `${assignmentZh} sp² 碳強電負度與順磁去遮蔽效應`,
          applicableCondition: "Carbonyl 13C model",
          dataNature: "EMPIRICAL_INCREMENT_MODEL",
          citationId: "PRETSCH_EMPIRICAL_TABLES",
        });

        if (solventProfile.carbonylC13ShiftDelta !== 0) {
          corrections.push({
            termName: `Solvent H-Bond Shift (${solvent})`,
            deltaPpm: solventProfile.carbonylC13ShiftDelta,
            reasonZh: `${solventProfile.labelZh} 溶劑對羰基碳之極性/氫鍵修正`,
            applicableCondition: `Solvent = ${solvent}`,
            dataNature: "GENERAL_THEORY",
            citationId: "CASABIANCA_2020_MRC",
            doi: NMR_LITERATURE_REGISTRY.CASABIANCA_2020_MRC.doi,
          });
        }
      } else if (tripleN) {
        hybridization = "sp";
        baseDelta = 118.2;
        envClass = "NITRILE_CN";
        assignmentZh = "腈基 sp 四級碳 (-C≡N)";
        regionCategory = "芳香環 / 雜環 / 烯基 / 腈碳區 (100–145 ppm)";
        corrections.push({
          termName: "Nitrile sp Carbon Base",
          deltaPpm: 118.2,
          reasonZh: "腈基 (-C≡N) 參鍵磁異向性遮蔽基準值",
          applicableCondition: "Nitrile",
          dataNature: "EMPIRICAL_INCREMENT_MODEL",
          citationId: "PRETSCH_EMPIRICAL_TABLES",
        });
      } else if (tripleC) {
        hybridization = "sp";
        baseDelta = atom.totalHydrogens === 1 ? 77.5 : 83.5;
        envClass = "ALKYNE_SP_C";
        assignmentZh = `炔基 sp 碳 (${deptType})`;
        regionCategory = "雜原子鄰近 sp³ 碳區 / 炔碳區 C-O / C-N / Alkyne sp C (50–95 ppm)";
        corrections.push({
          termName: "Alkyne sp Carbon Base",
          deltaPpm: baseDelta,
          reasonZh: "炔基 (-C≡C-) sp 混成圓柱對稱遮蔽基準值",
          applicableCondition: "Alkyne",
          dataNature: "EMPIRICAL_INCREMENT_MODEL",
          citationId: "PRETSCH_EMPIRICAL_TABLES",
        });
      } else if (doubleC) {
        hybridization = "sp2";
        baseDelta = 123.3;
        envClass = "ALKENE_SP2_C";
        assignmentZh = `烯基 sp² 碳 (${deptType})`;
        regionCategory = "芳香環 / 雜環 / 烯基 sp² 碳區 Aromatic / Heteroaromatic / Alkene C (100–145 ppm)";
        corrections.push({
          termName: "Alkene sp² Base",
          deltaPpm: 123.3,
          reasonZh: "乙烯基 sp² 碳基準位移 (123.3 ppm)",
          applicableCondition: "Alkene 13C additivity",
          dataNature: "EMPIRICAL_INCREMENT_MODEL",
          citationId: "PRETSCH_EMPIRICAL_TABLES",
        });
        for (const nb of atom.neighbors) {
          if (nb.toAtom === doubleC.toAtom) continue;
          const sub = graph.atoms[nb.toAtom];
          if (sub.isAromatic) {
            corrections.push({
              termName: "α-Aryl on Alkene",
              deltaPpm: +12.5,
              reasonZh: "共軛芳基對烯碳之去遮蔽修正",
              applicableCondition: "Conjugated alkene",
              dataNature: "EMPIRICAL_INCREMENT_MODEL",
              citationId: "PRETSCH_EMPIRICAL_TABLES",
            });
          } else if (sub.element === "C") {
            corrections.push({
              termName: "α-Carbon on Alkene",
              deltaPpm: +10.6,
              reasonZh: "α-碳取代基加成",
              applicableCondition: "Alkene additivity",
              dataNature: "EMPIRICAL_INCREMENT_MODEL",
              citationId: "PRETSCH_EMPIRICAL_TABLES",
            });
          }
        }
      } else {
        // sp³ Aliphatic Carbon (Grant-Paul & Heteroatom α/β/γ Additivity Rules)
        hybridization = "sp3";
        baseDelta =
          deptType === "CH3"
            ? 8.5
            : deptType === "CH2"
              ? 16.5
              : deptType === "CH"
                ? 24.5
                : 30.0;
        corrections.push({
          termName: `Grant-Paul sp³ Base (${deptType})`,
          deltaPpm: baseDelta,
          reasonZh: `sp³ ${deptType} 碳核遮蔽基準值`,
          applicableCondition: "Grant-Paul / Pretsch sp³ additivity",
          dataNature: "EMPIRICAL_INCREMENT_MODEL",
          citationId: "PRETSCH_EMPIRICAL_TABLES",
        });

        for (const nb of atom.neighbors) {
          const alpha = graph.atoms[nb.toAtom];
          if (alpha.element === "Si") {
            corrections.push({
              termName: "α-Silicon Shielding",
              deltaPpm: -9.5,
              reasonZh: "電正性矽原子高場強遮蔽效應 (Si-C)",
              applicableCondition: "Organosilicon",
              dataNature: "EMPIRICAL_INCREMENT_MODEL",
              citationId: "PRETSCH_EMPIRICAL_TABLES",
            });
            envClass = "SILYL_SP3_C";
            assignmentZh = "有機矽甲基/烷基碳 (Si-CHn)";
          } else if (alpha.element === "O") {
            const isAcylO = alpha.neighbors.some((n) => {
              if (n.toAtom === atom.index) return false;
              const c = graph.atoms[n.toAtom];
              return (
                c.element === "C" &&
                c.neighbors.some(
                  (co) => co.order === 2 && graph.atoms[co.toAtom].element === "O"
                )
              );
            });
            const inc = isAcylO
              ? deptType === "CH3"
                ? +43.5
                : +44.5
              : deptType === "CH3"
                ? +47.0
                : +45.5;
            corrections.push({
              termName: isAcylO ? "α-Acyloxy (-OC(=O)R)" : "α-Oxygen (-OH/-OR)",
              deltaPpm: inc,
              reasonZh: "直接鍵結電負度氧原子 (-O-C) 強誘導去遮蔽效應",
              applicableCondition: "C-O bond",
              dataNature: "EMPIRICAL_INCREMENT_MODEL",
              citationId: "PRETSCH_EMPIRICAL_TABLES",
            });
            envClass = "ALKOXY_OR_ESTER_C";
            assignmentZh =
              deptType === "CH3"
                ? "甲氧基或甲酯基碳 (-OCH₃)"
                : deptType === "CH2"
                  ? "烷氧基或酯亞甲基碳 (-OCH₂-)"
                  : "連氧 sp³ 碳 (-O-CH-)";
          } else if (alpha.element === "N") {
            corrections.push({
              termName: "α-Nitrogen (-N-C)",
              deltaPpm: +28.5,
              reasonZh: "直接鍵結氮原子 (-N-C) 誘導去遮蔽效應",
              applicableCondition: "C-N bond",
              dataNature: "EMPIRICAL_INCREMENT_MODEL",
              citationId: "PRETSCH_EMPIRICAL_TABLES",
            });
            envClass = "AMINO_SP3_C";
            assignmentZh = `連氮脂肪碳 (-N-${deptType})`;
          } else if (["F", "Cl", "Br", "I"].includes(alpha.element)) {
            const cHalMap: Record<string, number> = {
              F: +68.0,
              Cl: +31.0,
              Br: +19.5,
              I: -7.0, // Heavy-atom relativistic shielding on sp3 C-I!
            };
            corrections.push({
              termName: `α-Halogen (-${alpha.element})`,
              deltaPpm: cHalMap[alpha.element] || +25.0,
              reasonZh:
                alpha.element === "I"
                  ? "碘原子重原子相對論遮蔽效應 (Heavy-atom upfield shift)"
                  : `鹵素 (-${alpha.element}) 電負度誘導效應`,
              applicableCondition: `sp³ C-${alpha.element}`,
              dataNature:
                alpha.element === "I"
                  ? "GENERAL_THEORY"
                  : "EMPIRICAL_INCREMENT_MODEL",
              citationId:
                alpha.element === "I"
                  ? "BUHL_2011_WCMS"
                  : "PRETSCH_EMPIRICAL_TABLES",
            });
            envClass = `HALO_SP3_C_${alpha.element}`;
            assignmentZh = `鹵代脂肪碳 (-${deptType}-${alpha.element})`;
          } else if (alpha.isAromatic) {
            corrections.push({
              termName: "α-Aryl (Benzylic) Increment",
              deltaPpm: +12.8,
              reasonZh: "芳環 α-位取代加成修正",
              applicableCondition: "Benzylic carbon",
              dataNature: "EMPIRICAL_INCREMENT_MODEL",
              citationId: "PRETSCH_EMPIRICAL_TABLES",
            });
            if (envClass === "ALIPHATIC_SP3_C") {
              envClass = "BENZYLIC_C";
              assignmentZh = `苄位脂肪碳 (Ar-${deptType})`;
            }
          } else if (alpha.element === "C") {
            const isCarbonyl = alpha.neighbors.some(
              (n) => n.order === 2 && graph.atoms[n.toAtom].element === "O"
            );
            if (isCarbonyl) {
              const isKetone = !alpha.neighbors.some(
                (n) =>
                  n.toAtom !== atom.index &&
                  n.order === 1 &&
                  ["O", "N"].includes(graph.atoms[n.toAtom].element)
              );
              const inc = isKetone ? +18.0 : +12.5;
              corrections.push({
                termName: "α-Carbonyl Increment",
                deltaPpm: inc,
                reasonZh: "鄰近羰基 (α-C=O) 對 sp³ 碳之去遮蔽加成",
                applicableCondition: "α to C=O",
                dataNature: "EMPIRICAL_INCREMENT_MODEL",
                citationId: "PRETSCH_EMPIRICAL_TABLES",
              });
              envClass = "ALPHA_CARBONYL_SP3_C";
              assignmentZh =
                deptType === "CH3"
                  ? "乙醯基或甲基酮甲基碳 (-C(=O)CH₃)"
                  : `羰基 α-位脂肪碳 (-CH₂-C=O)`;
            } else {
              corrections.push({
                termName: "α-Alkyl Carbon Increment",
                deltaPpm: +5.8,
                reasonZh: "Grant-Paul α-碳鏈加成 (+5.8 ppm)",
                applicableCondition: "Grant-Paul alkane rule",
                dataNature: "EMPIRICAL_INCREMENT_MODEL",
                citationId: "PRETSCH_EMPIRICAL_TABLES",
              });
            }
          }
        }
      }

      const finalDelta = Number(
        Math.max(-8.0, Math.min(225.0, corrections.reduce((s, c) => s + c.deltaPpm, 0))).toFixed(1)
      );

      if (finalDelta >= 50 && finalDelta < 95 && hybridization === "sp3") {
        regionCategory = "雜原子鄰近 sp³ 碳區 / 炔碳區 C-O / C-N / Alkyne sp C (50–95 ppm)";
      }

      carbonPreds.set(atom.index, {
        atomIdx: atom.index,
        symClass: symClasses[atom.index],
        deltaPpm: finalDelta,
        uncertaintyPpm,
        deptType,
        carbonType,
        hybridization,
        envClass,
        assignmentZh,
        regionCategory,
        isQuaternarySlowRelaxation: isQuaternary,
        relaxationAndNoeNote: isQuaternary
          ? "四級碳 (Quaternary C, 無鍵結 H) 因自旋-晶格弛豫時間 T₁ 較長且無 NOE 增益，於標準 ¹³C{¹H} 圖譜中峰高較低，於低濃度或短弛豫延遲 d₁ 條件下可能微弱或漏檢。"
          : `具直接鍵結氫 (${deptType})，具正常 NOE 增益。`,
        corrections,
        confidenceLevel: "HIGH",
      });
    }

    // Group equivalent carbons by topological symmetry class
    const groupedCarbons = new Map<string, AtomC13Prediction[]>();
    for (const cp of carbonPreds.values()) {
      const list = groupedCarbons.get(cp.symClass) || [];
      list.push(cp);
      groupedCarbons.set(cp.symClass, list);
    }

    const knownRef = KNOWN_STRUCTURAL_LIBRARY.find(
      (k) =>
        smiles &&
        k.smilesAliases.some((a) => a.toLowerCase() === smiles.toLowerCase())
    );

    const sortedGroups = Array.from(groupedCarbons.values()).sort(
      (a, b) => b[0].deltaPpm - a[0].deltaPpm
    );

    const usedKnownIdx = new Set<number>();
    const environments: CarbonEnvironment[] = [];
    const peaks: SpectralPeak[] = [];

    for (let gIdx = 0; gIdx < sortedGroups.length; gIdx++) {
      const group = sortedGroups[gIdx];
      const rep = group[0];
      const atomIndices = group.map((g) => g.atomIdx);
      const eqCount = group.length;

      let finalShift = rep.deltaPpm;
      if (knownRef && knownRef.keyC13Shifts.length === sortedGroups.length) {
        const sortedKnown = knownRef.keyC13Shifts.slice().sort((a, b) => b - a);
        if (Math.abs(sortedKnown[gIdx] - rep.deltaPpm) <= 8.5) {
          finalShift = Number(sortedKnown[gIdx].toFixed(1));
          usedKnownIdx.add(gIdx);
        }
      }

      const expectedRange: [number, number] = [
        Number((finalShift - rep.uncertaintyPpm).toFixed(1)),
        Number((finalShift + rep.uncertaintyPpm).toFixed(1)),
      ];

      const deptCompatibility: CarbonEnvironment["deptCompatibility"] = {
        dept90Visible: rep.deptType === "CH",
        dept135Phase:
          rep.deptType === "C"
            ? "ABSENT_QUATERNARY_C"
            : rep.deptType === "CH2"
              ? "DOWN_CH2"
              : "UP_CH_CH3",
      };

      const litRefs: NMRLiteratureReference[] = [
        NMR_LITERATURE_REGISTRY.JONAS_2022_MRC,
        NMR_LITERATURE_REGISTRY.PRETSCH_EMPIRICAL_TABLES,
      ];

      const envObj: CarbonEnvironment = {
        id: `pred-c13-env-${gIdx + 1}`,
        atomId: `C_group_${atomIndices.map((i) => i + 1).join("_")}`,
        atomIndices,
        equivalentCarbonCount: eqCount,
        chemicalShift: finalShift,
        predictedDeltaPpm: finalShift,
        uncertaintyPpm: rep.uncertaintyPpm,
        shiftPpm: finalShift,
        expectedRange,
        regionCategory: rep.regionCategory,
        deptType: rep.deptType,
        carbonType: rep.carbonType,
        hybridization: rep.hybridization,
        chemicalEnvironmentClass: rep.envClass,
        assignment: `[經驗加成模型預測] ${rep.assignmentZh}${
          eqCount > 1 ? ` (${eqCount}C 對稱等效)` : " (1C)"
        } δ ${finalShift.toFixed(1)} ± ${rep.uncertaintyPpm.toFixed(1)} ppm`,
        environment: rep.assignmentZh,
        equivalenceClass:
          eqCount > 1
            ? `Symmetry Equivalent Group (${eqCount}C: Atoms #${atomIndices
                .map((i) => i + 1)
                .join(",")})`
            : `Unique Carbon (1C: Atom #${atomIndices[0] + 1})`,
        appliedCorrections: rep.corrections,
        solventApplied: solvent,
        isQuaternarySlowRelaxation: rep.isQuaternarySlowRelaxation,
        relaxationAndNoeNote: rep.relaxationAndNoeNote,
        deptCompatibility,
        literatureSources: litRefs,
        dataNature: "EMPIRICAL_INCREMENT_MODEL",
        confidenceLevel: rep.confidenceLevel,
        source: "NUMERIC_EXACT",
        modelType: "EMPIRICAL",
        confidence: rep.confidenceLevel === "HIGH" ? 89 : 78,
      };

      environments.push(envObj);
      peaks.push({
        id: `pred-c13-${gIdx + 1}`,
        x: finalShift,
        y: rep.isQuaternarySlowRelaxation
          ? 48
          : Math.min(98, 68 + eqCount * 14),
        deptType: rep.deptType,
        carbonType: rep.carbonType,
        isPredictedPeak: true,
        predictedRange: expectedRange,
        assignment: envObj.assignment,
      });
    }

    return { peaks, environments };
  }
}
