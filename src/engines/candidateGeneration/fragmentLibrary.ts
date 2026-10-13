import { StructuralConstraints } from "../../types/spectrum";

// ============================================================================
// V5 Combinatorial Fragment & Linker Library
// ============================================================================

export interface AtomBudget {
  C: number;
  H: number;
  O: number;
  N: number;
  Br: number;
  Cl: number;
  F: number;
  I: number;
  S: number;
  Si: number;
}

export interface MonovalentFragment {
  id: string;
  labelZh: string;
  iupacPrefixOrSuffix: string;
  prefixSmiles: string;
  suffixSmiles: string;
  atoms: Partial<AtomBudget>;
  dbe: number;
  functionalGroupFamilies: string[];
  motifTags: string[];
}

export interface DivalentLinker {
  id: string;
  labelZh: string;
  iupacClass: string;
  joinSmiles: (
    leftR: MonovalentAlkylOrAryl,
    rightR: MonovalentAlkylOrAryl
  ) => string;
  atoms: Partial<AtomBudget>;
  dbe: number;
  functionalGroupFamilies: string[];
  motifTags: string[];
}

export interface MonovalentAlkylOrAryl {
  id: string;
  nameZh: string;
  iupacGroup: string;
  leftSmiles: string;
  rightSmiles: string;
  atoms: Partial<AtomBudget>;
  dbe: number;
  isAromatic: boolean;
  isBranched: boolean;
  motifTags: string[];
}

export const MONOVALENT_FRAGMENTS: MonovalentFragment[] = [
  // Carbonyl & Acyl Monovalent Groups (DBE = 1)
  {
    id: "frag-cho",
    labelZh: "醛基 (-CHO)",
    iupacPrefixOrSuffix: "carbaldehyde / formyl",
    prefixSmiles: "O=C",
    suffixSmiles: "C=O",
    atoms: { C: 1, H: 1, O: 1 },
    dbe: 1,
    functionalGroupFamilies: ["Carbonyl", "Aldehyde"],
    motifTags: ["aldehyde", "cho", "carbonyl"],
  },
  {
    id: "frag-cooh",
    labelZh: "羧酸基 (-COOH)",
    iupacPrefixOrSuffix: "carboxylic acid / carboxy",
    prefixSmiles: "OC(=O)",
    suffixSmiles: "C(=O)O",
    atoms: { C: 1, H: 1, O: 2 },
    dbe: 1,
    functionalGroupFamilies: ["Carbonyl", "Carboxylic acid", "Alcohol"],
    motifTags: ["carboxylic_acid", "cooh", "carbonyl"],
  },
  {
    id: "frag-conh2",
    labelZh: "一級醯胺基 (-CONH₂)",
    iupacPrefixOrSuffix: "carboxamide / carbamoyl",
    prefixSmiles: "NC(=O)",
    suffixSmiles: "C(=O)N",
    atoms: { C: 1, H: 2, N: 1, O: 1 },
    dbe: 1,
    functionalGroupFamilies: ["Carbonyl", "Amide", "Amine"],
    motifTags: ["amide", "conh2", "carbonyl"],
  },
  {
    id: "frag-acetyl",
    labelZh: "乙醯基 (-C(=O)CH₃)",
    iupacPrefixOrSuffix: "acetyl / ethanone",
    prefixSmiles: "CC(=O)",
    suffixSmiles: "C(=O)C",
    atoms: { C: 2, H: 3, O: 1 },
    dbe: 1,
    functionalGroupFamilies: ["Carbonyl", "Ketone"],
    motifTags: ["ketone", "acetyl", "coch3", "carbonyl"],
  },
  {
    id: "frag-propionyl",
    labelZh: "丙醯基 (-C(=O)CH₂CH₃)",
    iupacPrefixOrSuffix: "propanoyl / propan-1-one",
    prefixSmiles: "CCC(=O)",
    suffixSmiles: "C(=O)CC",
    atoms: { C: 3, H: 5, O: 1 },
    dbe: 1,
    functionalGroupFamilies: ["Carbonyl", "Ketone"],
    motifTags: ["ketone", "propionyl", "carbonyl", "ethyl"],
  },
  {
    id: "frag-isobutyryl",
    labelZh: "異丁醯基 (-C(=O)CH(CH₃)₂)",
    iupacPrefixOrSuffix: "2-methylpropanoyl",
    prefixSmiles: "CC(C)C(=O)",
    suffixSmiles: "C(=O)C(C)C",
    atoms: { C: 4, H: 7, O: 1 },
    dbe: 1,
    functionalGroupFamilies: ["Carbonyl", "Ketone"],
    motifTags: ["ketone", "isopropyl", "carbonyl"],
  },
  {
    id: "frag-cooch3",
    labelZh: "甲酯基 (-COOCH₃)",
    iupacPrefixOrSuffix: "methyl ester / methoxycarbonyl",
    prefixSmiles: "COC(=O)",
    suffixSmiles: "C(=O)OC",
    atoms: { C: 2, H: 3, O: 2 },
    dbe: 1,
    functionalGroupFamilies: ["Carbonyl", "Ester", "Ether"],
    motifTags: ["ester", "cooch3", "och3", "carbonyl"],
  },
  {
    id: "frag-ococh3",
    labelZh: "乙醯氧基 (-OC(=O)CH₃)",
    iupacPrefixOrSuffix: "acetate / acetoxy",
    prefixSmiles: "CC(=O)O",
    suffixSmiles: "OC(=O)C",
    atoms: { C: 2, H: 3, O: 2 },
    dbe: 1,
    functionalGroupFamilies: ["Carbonyl", "Ester", "Ether"],
    motifTags: ["ester", "acetoxy", "coch3", "carbonyl"],
  },
  {
    id: "frag-cooc2h5",
    labelZh: "乙酯基 (-COOCH₂CH₃)",
    iupacPrefixOrSuffix: "ethyl ester / ethoxycarbonyl",
    prefixSmiles: "CCOC(=O)",
    suffixSmiles: "C(=O)OCC",
    atoms: { C: 3, H: 5, O: 2 },
    dbe: 1,
    functionalGroupFamilies: ["Carbonyl", "Ester", "Ether"],
    motifTags: ["ester", "cooc2h5", "oc2h5", "ethyl", "carbonyl"],
  },
  {
    id: "frag-ch2ococh3",
    labelZh: "乙醯氧甲基 (-CH₂OC(=O)CH₃)",
    iupacPrefixOrSuffix: "methyl acetate",
    prefixSmiles: "CC(=O)OC",
    suffixSmiles: "COC(=O)C",
    atoms: { C: 3, H: 5, O: 2 },
    dbe: 1,
    functionalGroupFamilies: ["Carbonyl", "Ester", "Ether"],
    motifTags: ["ester", "benzyl_ester", "carbonyl"],
  },
  {
    id: "frag-ch2cooh",
    labelZh: "羧甲基 (-CH₂COOH)",
    iupacPrefixOrSuffix: "acetic acid / carboxymethyl",
    prefixSmiles: "OC(=O)C",
    suffixSmiles: "CC(=O)O",
    atoms: { C: 2, H: 3, O: 2 },
    dbe: 1,
    functionalGroupFamilies: ["Carbonyl", "Carboxylic acid"],
    motifTags: ["carboxylic_acid", "ch2cooh", "carbonyl"],
  },
  {
    id: "frag-ch2cho",
    labelZh: "甲醯甲基 (-CH₂CHO)",
    iupacPrefixOrSuffix: "acetaldehyde / 2-oxoethyl",
    prefixSmiles: "O=CC",
    suffixSmiles: "CC=O",
    atoms: { C: 2, H: 3, O: 1 },
    dbe: 1,
    functionalGroupFamilies: ["Carbonyl", "Aldehyde"],
    motifTags: ["aldehyde", "ch2cho", "carbonyl"],
  },
  {
    id: "frag-chme-cooh",
    labelZh: "1-羧乙基 (-CH(CH₃)COOH)",
    iupacPrefixOrSuffix: "propanoic acid",
    prefixSmiles: "OC(=O)C(C)",
    suffixSmiles: "C(C)C(=O)O",
    atoms: { C: 3, H: 5, O: 2 },
    dbe: 1,
    functionalGroupFamilies: ["Carbonyl", "Carboxylic acid"],
    motifTags: ["carboxylic_acid", "propanoic", "carbonyl"],
  },
  {
    id: "frag-nhcho",
    labelZh: "甲醯胺基 (-NHCHO)",
    iupacPrefixOrSuffix: "formamide",
    prefixSmiles: "O=CN",
    suffixSmiles: "NC=O",
    atoms: { C: 1, H: 2, N: 1, O: 1 },
    dbe: 1,
    functionalGroupFamilies: ["Carbonyl", "Amide", "Aldehyde"],
    motifTags: ["amide", "formamide", "carbonyl"],
  },
  {
    id: "frag-nhcoch3",
    labelZh: "乙醯胺基 (-NHCOCH₃)",
    iupacPrefixOrSuffix: "acetamide / acetamido",
    prefixSmiles: "CC(=O)N",
    suffixSmiles: "NC(=O)C",
    atoms: { C: 2, H: 4, N: 1, O: 1 },
    dbe: 1,
    functionalGroupFamilies: ["Carbonyl", "Amide"],
    motifTags: ["amide", "acetamido", "carbonyl"],
  },
  // Unsaturated Non-Carbonyl Groups (DBE = 1 or 2)
  {
    id: "frag-cn",
    labelZh: "腈基 (-C≡N)",
    iupacPrefixOrSuffix: "carbonitrile / cyano",
    prefixSmiles: "N#C",
    suffixSmiles: "C#N",
    atoms: { C: 1, H: 0, N: 1 },
    dbe: 2,
    functionalGroupFamilies: ["Nitrile"],
    motifTags: ["nitrile", "cyano"],
  },
  {
    id: "frag-vinyl",
    labelZh: "乙烯基 (-CH=CH₂)",
    iupacPrefixOrSuffix: "ethenyl / vinyl",
    prefixSmiles: "C=C",
    suffixSmiles: "C=C",
    atoms: { C: 2, H: 3 },
    dbe: 1,
    functionalGroupFamilies: ["Alkene"],
    motifTags: ["alkene", "vinyl"],
  },
  {
    id: "frag-ethynyl",
    labelZh: "乙炔基 (-C≡CH)",
    iupacPrefixOrSuffix: "ethynyl",
    prefixSmiles: "C#C",
    suffixSmiles: "C#C",
    atoms: { C: 2, H: 1 },
    dbe: 2,
    functionalGroupFamilies: ["Alkyne"],
    motifTags: ["alkyne", "ethynyl"],
  },
  {
    id: "frag-no2",
    labelZh: "硝基 (-NO₂)",
    iupacPrefixOrSuffix: "nitro",
    prefixSmiles: "O=[N+]([O-])",
    suffixSmiles: "[N+](=O)[O-]",
    atoms: { N: 1, O: 2 },
    dbe: 1,
    functionalGroupFamilies: ["Nitro"],
    motifTags: ["nitro", "no2"],
  },
  {
    id: "frag-propenyl",
    labelZh: "丙烯基 (-CH=CH-CH₃)",
    iupacPrefixOrSuffix: "prop-1-en-1-yl",
    prefixSmiles: "CC=C",
    suffixSmiles: "C=CC",
    atoms: { C: 3, H: 5 },
    dbe: 1,
    functionalGroupFamilies: ["Alkene"],
    motifTags: ["alkene", "propenyl"],
  },
  {
    id: "frag-propynyl",
    labelZh: "丙炔基 (-C≡C-CH₃)",
    iupacPrefixOrSuffix: "prop-1-yn-1-yl",
    prefixSmiles: "CC#C",
    suffixSmiles: "C#CC",
    atoms: { C: 3, H: 3 },
    dbe: 2,
    functionalGroupFamilies: ["Alkyne"],
    motifTags: ["alkyne", "propynyl"],
  },
  // Saturated Heteroatom Substituents (DBE = 0)
  {
    id: "frag-oh",
    labelZh: "羥基 (-OH)",
    iupacPrefixOrSuffix: "hydroxy / phenol",
    prefixSmiles: "O",
    suffixSmiles: "O",
    atoms: { O: 1, H: 1 },
    dbe: 0,
    functionalGroupFamilies: ["Alcohol", "Phenol"],
    motifTags: ["hydroxyl", "oh", "phenol", "alcohol"],
  },
  {
    id: "frag-och3",
    labelZh: "甲氧基 (-OCH₃)",
    iupacPrefixOrSuffix: "methoxy",
    prefixSmiles: "CO",
    suffixSmiles: "OC",
    atoms: { C: 1, H: 3, O: 1 },
    dbe: 0,
    functionalGroupFamilies: ["Ether"],
    motifTags: ["ether", "methoxy", "och3"],
  },
  {
    id: "frag-oc2h5",
    labelZh: "乙氧基 (-OCH₂CH₃)",
    iupacPrefixOrSuffix: "ethoxy",
    prefixSmiles: "CCO",
    suffixSmiles: "OCC",
    atoms: { C: 2, H: 5, O: 1 },
    dbe: 0,
    functionalGroupFamilies: ["Ether"],
    motifTags: ["ether", "ethoxy", "oc2h5", "ethyl"],
  },
  {
    id: "frag-ch2oh",
    labelZh: "羥甲基 (-CH₂OH)",
    iupacPrefixOrSuffix: "hydroxymethyl / methanol",
    prefixSmiles: "OC",
    suffixSmiles: "CO",
    atoms: { C: 1, H: 3, O: 1 },
    dbe: 0,
    functionalGroupFamilies: ["Alcohol"],
    motifTags: ["alcohol", "hydroxymethyl", "ch2oh"],
  },
  {
    id: "frag-ch2ch2oh",
    labelZh: "2-羥乙基 (-CH₂CH₂OH)",
    iupacPrefixOrSuffix: "2-hydroxyethyl",
    prefixSmiles: "OCC",
    suffixSmiles: "CCO",
    atoms: { C: 2, H: 5, O: 1 },
    dbe: 0,
    functionalGroupFamilies: ["Alcohol"],
    motifTags: ["alcohol", "hydroxyethyl"],
  },
  {
    id: "frag-nh2",
    labelZh: "胺基 (-NH₂)",
    iupacPrefixOrSuffix: "amino",
    prefixSmiles: "N",
    suffixSmiles: "N",
    atoms: { N: 1, H: 2 },
    dbe: 0,
    functionalGroupFamilies: ["Amine"],
    motifTags: ["amine", "nh2", "primary_amine"],
  },
  {
    id: "frag-nhch3",
    labelZh: "甲胺基 (-NHCH₃)",
    iupacPrefixOrSuffix: "methylamino",
    prefixSmiles: "CN",
    suffixSmiles: "NC",
    atoms: { C: 1, H: 4, N: 1 },
    dbe: 0,
    functionalGroupFamilies: ["Amine"],
    motifTags: ["amine", "methylamino", "secondary_amine"],
  },
  {
    id: "frag-nme2",
    labelZh: "二甲胺基 (-N(CH₃)₂)",
    iupacPrefixOrSuffix: "dimethylamino",
    prefixSmiles: "CN(C)",
    suffixSmiles: "N(C)C",
    atoms: { C: 2, H: 6, N: 1 },
    dbe: 0,
    functionalGroupFamilies: ["Amine"],
    motifTags: ["amine", "dimethylamino", "tertiary_amine"],
  },
  {
    id: "frag-ch2nh2",
    labelZh: "胺甲基 (-CH₂NH₂)",
    iupacPrefixOrSuffix: "aminomethyl",
    prefixSmiles: "NC",
    suffixSmiles: "CN",
    atoms: { C: 1, H: 4, N: 1 },
    dbe: 0,
    functionalGroupFamilies: ["Amine"],
    motifTags: ["amine", "aminomethyl"],
  },
  // Halogens & Haloalkyls (DBE = 0)
  {
    id: "frag-br",
    labelZh: "溴基 (-Br)",
    iupacPrefixOrSuffix: "bromo",
    prefixSmiles: "Br",
    suffixSmiles: "Br",
    atoms: { Br: 1 },
    dbe: 0,
    functionalGroupFamilies: ["Halogen", "C-Br"],
    motifTags: ["bromine", "br", "halogen"],
  },
  {
    id: "frag-cl",
    labelZh: "氯基 (-Cl)",
    iupacPrefixOrSuffix: "chloro",
    prefixSmiles: "Cl",
    suffixSmiles: "Cl",
    atoms: { Cl: 1 },
    dbe: 0,
    functionalGroupFamilies: ["Halogen", "C-Cl"],
    motifTags: ["chlorine", "cl", "halogen"],
  },
  {
    id: "frag-f",
    labelZh: "氟基 (-F)",
    iupacPrefixOrSuffix: "fluoro",
    prefixSmiles: "F",
    suffixSmiles: "F",
    atoms: { F: 1 },
    dbe: 0,
    functionalGroupFamilies: ["Halogen", "C-F"],
    motifTags: ["fluorine", "f", "halogen"],
  },
  {
    id: "frag-i",
    labelZh: "碘基 (-I)",
    iupacPrefixOrSuffix: "iodo",
    prefixSmiles: "I",
    suffixSmiles: "I",
    atoms: { I: 1 },
    dbe: 0,
    functionalGroupFamilies: ["Halogen", "C-I"],
    motifTags: ["iodine", "i", "halogen"],
  },
  {
    id: "frag-ch2br",
    labelZh: "溴甲基 (-CH₂Br)",
    iupacPrefixOrSuffix: "bromomethyl",
    prefixSmiles: "BrC",
    suffixSmiles: "CBr",
    atoms: { C: 1, H: 2, Br: 1 },
    dbe: 0,
    functionalGroupFamilies: ["Halogen", "C-Br"],
    motifTags: ["bromine", "bromomethyl", "halogen"],
  },
  {
    id: "frag-ch2cl",
    labelZh: "氯甲基 (-CH₂Cl)",
    iupacPrefixOrSuffix: "chloromethyl",
    prefixSmiles: "ClC",
    suffixSmiles: "CCl",
    atoms: { C: 1, H: 2, Cl: 1 },
    dbe: 0,
    functionalGroupFamilies: ["Halogen", "C-Cl"],
    motifTags: ["chlorine", "chloromethyl", "halogen"],
  },
  // Alkyl Substituents (DBE = 0)
  {
    id: "frag-me",
    labelZh: "甲基 (-CH₃)",
    iupacPrefixOrSuffix: "methyl",
    prefixSmiles: "C",
    suffixSmiles: "C",
    atoms: { C: 1, H: 3 },
    dbe: 0,
    functionalGroupFamilies: ["C-H", "Aliphatic"],
    motifTags: ["methyl", "ch3", "alkyl"],
  },
  {
    id: "frag-et",
    labelZh: "乙基 (-CH₂CH₃)",
    iupacPrefixOrSuffix: "ethyl",
    prefixSmiles: "CC",
    suffixSmiles: "CC",
    atoms: { C: 2, H: 5 },
    dbe: 0,
    functionalGroupFamilies: ["C-H", "Aliphatic"],
    motifTags: ["ethyl", "c2h5", "alkyl"],
  },
  {
    id: "frag-npr",
    labelZh: "正丙基 (-CH₂CH₂CH₃)",
    iupacPrefixOrSuffix: "propyl",
    prefixSmiles: "CCC",
    suffixSmiles: "CCC",
    atoms: { C: 3, H: 7 },
    dbe: 0,
    functionalGroupFamilies: ["C-H", "Aliphatic"],
    motifTags: ["propyl", "alkyl"],
  },
  {
    id: "frag-ipr",
    labelZh: "異丙基 (-CH(CH₃)₂)",
    iupacPrefixOrSuffix: "propan-2-yl / isopropyl",
    prefixSmiles: "CC(C)",
    suffixSmiles: "C(C)C",
    atoms: { C: 3, H: 7 },
    dbe: 0,
    functionalGroupFamilies: ["C-H", "Aliphatic"],
    motifTags: ["isopropyl", "branched_alkyl", "alkyl"],
  },
  {
    id: "frag-nbu",
    labelZh: "正丁基 (-CH₂CH₂CH₂CH₃)",
    iupacPrefixOrSuffix: "butyl",
    prefixSmiles: "CCCC",
    suffixSmiles: "CCCC",
    atoms: { C: 4, H: 9 },
    dbe: 0,
    functionalGroupFamilies: ["C-H", "Aliphatic"],
    motifTags: ["butyl", "alkyl"],
  },
  {
    id: "frag-ibu",
    labelZh: "異丁基 (-CH₂CH(CH₃)₂)",
    iupacPrefixOrSuffix: "2-methylpropyl / isobutyl",
    prefixSmiles: "CC(C)C",
    suffixSmiles: "CC(C)C",
    atoms: { C: 4, H: 9 },
    dbe: 0,
    functionalGroupFamilies: ["C-H", "Aliphatic"],
    motifTags: ["isobutyl", "branched_alkyl", "alkyl"],
  },
  {
    id: "frag-tbu",
    labelZh: "三級丁基 (-C(CH₃)₃)",
    iupacPrefixOrSuffix: "tert-butyl",
    prefixSmiles: "CC(C)(C)",
    suffixSmiles: "C(C)(C)C",
    atoms: { C: 4, H: 9 },
    dbe: 0,
    functionalGroupFamilies: ["C-H", "Aliphatic"],
    motifTags: ["tert_butyl", "branched_alkyl", "alkyl"],
  },
];

export const MONOVALENT_R_GROUPS: MonovalentAlkylOrAryl[] = [
  {
    id: "r-me",
    nameZh: "甲基 (CH₃-)",
    iupacGroup: "methyl",
    leftSmiles: "C",
    rightSmiles: "C",
    atoms: { C: 1, H: 3 },
    dbe: 0,
    isAromatic: false,
    isBranched: false,
    motifTags: ["methyl", "ch3"],
  },
  {
    id: "r-et",
    nameZh: "乙基 (CH₃CH₂-)",
    iupacGroup: "ethyl",
    leftSmiles: "CC",
    rightSmiles: "CC",
    atoms: { C: 2, H: 5 },
    dbe: 0,
    isAromatic: false,
    isBranched: false,
    motifTags: ["ethyl", "c2h5"],
  },
  {
    id: "r-npr",
    nameZh: "正丙基 (CH₃CH₂CH₂-)",
    iupacGroup: "propyl",
    leftSmiles: "CCC",
    rightSmiles: "CCC",
    atoms: { C: 3, H: 7 },
    dbe: 0,
    isAromatic: false,
    isBranched: false,
    motifTags: ["propyl", "n_propyl"],
  },
  {
    id: "r-ipr",
    nameZh: "異丙基 ((CH₃)₂CH-)",
    iupacGroup: "isopropyl",
    leftSmiles: "CC(C)",
    rightSmiles: "C(C)C",
    atoms: { C: 3, H: 7 },
    dbe: 0,
    isAromatic: false,
    isBranched: true,
    motifTags: ["isopropyl", "branched"],
  },
  {
    id: "r-nbu",
    nameZh: "正丁基 (CH₃(CH₂)₃-)",
    iupacGroup: "butyl",
    leftSmiles: "CCCC",
    rightSmiles: "CCCC",
    atoms: { C: 4, H: 9 },
    dbe: 0,
    isAromatic: false,
    isBranched: false,
    motifTags: ["butyl", "n_butyl"],
  },
  {
    id: "r-ibu",
    nameZh: "異丁基 ((CH₃)₂CHCH₂-)",
    iupacGroup: "isobutyl",
    leftSmiles: "CC(C)C",
    rightSmiles: "CC(C)C",
    atoms: { C: 4, H: 9 },
    dbe: 0,
    isAromatic: false,
    isBranched: true,
    motifTags: ["isobutyl", "branched"],
  },
  {
    id: "r-sbu",
    nameZh: "二級丁基 (CH₃CH₂CH(CH₃)-)",
    iupacGroup: "sec-butyl",
    leftSmiles: "CCC(C)",
    rightSmiles: "C(C)CC",
    atoms: { C: 4, H: 9 },
    dbe: 0,
    isAromatic: false,
    isBranched: true,
    motifTags: ["sec_butyl", "branched"],
  },
  {
    id: "r-tbu",
    nameZh: "三級丁基 ((CH₃)₃C-)",
    iupacGroup: "tert-butyl",
    leftSmiles: "CC(C)(C)",
    rightSmiles: "C(C)(C)C",
    atoms: { C: 4, H: 9 },
    dbe: 0,
    isAromatic: false,
    isBranched: true,
    motifTags: ["tert_butyl", "branched"],
  },
  {
    id: "r-npe",
    nameZh: "正戊基 (CH₃(CH₂)₄-)",
    iupacGroup: "pentyl",
    leftSmiles: "CCCCC",
    rightSmiles: "CCCCC",
    atoms: { C: 5, H: 11 },
    dbe: 0,
    isAromatic: false,
    isBranched: false,
    motifTags: ["pentyl"],
  },
  {
    id: "r-ipe",
    nameZh: "異戊基 ((CH₃)₂CHCH₂CH₂-)",
    iupacGroup: "3-methylbutyl",
    leftSmiles: "CC(C)CC",
    rightSmiles: "CCC(C)C",
    atoms: { C: 5, H: 11 },
    dbe: 0,
    isAromatic: false,
    isBranched: true,
    motifTags: ["isopentyl", "branched"],
  },
  {
    id: "r-nhex",
    nameZh: "正己基 (CH₃(CH₂)₅-)",
    iupacGroup: "hexyl",
    leftSmiles: "CCCCCC",
    rightSmiles: "CCCCCC",
    atoms: { C: 6, H: 13 },
    dbe: 0,
    isAromatic: false,
    isBranched: false,
    motifTags: ["hexyl"],
  },
  {
    id: "r-vinyl",
    nameZh: "乙烯基 (CH₂=CH-)",
    iupacGroup: "ethenyl",
    leftSmiles: "C=C",
    rightSmiles: "C=C",
    atoms: { C: 2, H: 3 },
    dbe: 1,
    isAromatic: false,
    isBranched: false,
    motifTags: ["vinyl", "alkene"],
  },
  {
    id: "r-allyl",
    nameZh: "丙烯基 (CH₂=CHCH₂-)",
    iupacGroup: "prop-2-en-1-yl",
    leftSmiles: "C=CC",
    rightSmiles: "CC=C",
    atoms: { C: 3, H: 5 },
    dbe: 1,
    isAromatic: false,
    isBranched: false,
    motifTags: ["allyl", "alkene"],
  },
  {
    id: "r-butadienyl",
    nameZh: "1,3-丁二烯基 (CH₂=CH-CH=CH-)",
    iupacGroup: "buta-1,3-dien-1-yl",
    leftSmiles: "C=CC=C",
    rightSmiles: "C=CC=C",
    atoms: { C: 4, H: 5 },
    dbe: 2,
    isAromatic: false,
    isBranched: false,
    motifTags: ["butadiene", "alkene", "conjugated_diene"],
  },
  {
    id: "r-but-3-ynyl",
    nameZh: "3-丁炔基 (HC≡C-CH₂CH₂-)",
    iupacGroup: "but-3-yn-1-yl",
    leftSmiles: "C#CCC",
    rightSmiles: "CCC#C",
    atoms: { C: 4, H: 5 },
    dbe: 2,
    isAromatic: false,
    isBranched: false,
    motifTags: ["alkyne", "terminal_alkyne"],
  },
  {
    id: "r-but-1-ynyl",
    nameZh: "1-丁炔基 (CH₃CH₂-C≡C-)",
    iupacGroup: "but-1-yn-1-yl",
    leftSmiles: "CCC#C",
    rightSmiles: "C#CCC",
    atoms: { C: 4, H: 5 },
    dbe: 2,
    isAromatic: false,
    isBranched: false,
    motifTags: ["alkyne", "internal_alkyne"],
  },
  {
    id: "r-ph",
    nameZh: "苯基 (C₆H₅-)",
    iupacGroup: "phenyl",
    leftSmiles: "c1ccccc1",
    rightSmiles: "c1ccccc1",
    atoms: { C: 6, H: 5 },
    dbe: 4,
    isAromatic: true,
    isBranched: false,
    motifTags: ["phenyl", "aromatic", "monosubstituted"],
  },
  {
    id: "r-bn",
    nameZh: "苄基 (C₆H₅CH₂-)",
    iupacGroup: "benzyl",
    leftSmiles: "c1ccccc1C",
    rightSmiles: "Cc1ccccc1",
    atoms: { C: 7, H: 7 },
    dbe: 4,
    isAromatic: true,
    isBranched: false,
    motifTags: ["benzyl", "aromatic", "monosubstituted"],
  },
];

export const DIVALENT_LINKERS: DivalentLinker[] = [
  {
    id: "linker-ketone",
    labelZh: "酮基連接子 (-C(=O)-)",
    iupacClass: "ketone",
    joinSmiles: (r1, r2) => `${r1.leftSmiles}C(=O)${r2.rightSmiles}`,
    atoms: { C: 1, O: 1 },
    dbe: 1,
    functionalGroupFamilies: ["Carbonyl", "Ketone"],
    motifTags: ["ketone", "carbonyl"],
  },
  {
    id: "linker-ester",
    labelZh: "酯基連接子 (-C(=O)O-)",
    iupacClass: "ester",
    joinSmiles: (r1, r2) => `${r2.leftSmiles}OC(=O)${r1.rightSmiles}`,
    atoms: { C: 1, O: 2 },
    dbe: 1,
    functionalGroupFamilies: ["Carbonyl", "Ester", "Ether"],
    motifTags: ["ester", "carbonyl"],
  },
  {
    id: "linker-ether",
    labelZh: "醚基連接子 (-O-)",
    iupacClass: "ether",
    joinSmiles: (r1, r2) => `${r1.leftSmiles}O${r2.rightSmiles}`,
    atoms: { O: 1 },
    dbe: 0,
    functionalGroupFamilies: ["Ether"],
    motifTags: ["ether"],
  },
  {
    id: "linker-amide",
    labelZh: "二級醯胺連接子 (-C(=O)NH-)",
    iupacClass: "amide",
    joinSmiles: (r1, r2) => `${r1.leftSmiles}C(=O)N${r2.rightSmiles}`,
    atoms: { C: 1, H: 1, N: 1, O: 1 },
    dbe: 1,
    functionalGroupFamilies: ["Carbonyl", "Amide", "Amine"],
    motifTags: ["amide", "carbonyl"],
  },
  {
    id: "linker-sec-amine",
    labelZh: "二級胺連接子 (-NH-)",
    iupacClass: "secondary amine",
    joinSmiles: (r1, r2) => `${r1.leftSmiles}N${r2.rightSmiles}`,
    atoms: { H: 1, N: 1 },
    dbe: 0,
    functionalGroupFamilies: ["Amine"],
    motifTags: ["amine", "secondary_amine"],
  },
];

// ============================================================================
// V7 Constraint-Driven Fragment Selector Library (Retained & Merged)
// ============================================================================

export interface ChemicalFragmentDefinition {
  id: string;
  name: string;
  formulaContribution: Record<string, number>;
  openValences: number;
  unsaturationContribution: number;
  smilesMotif: string;
  category:
    | "AROMATIC_CORE"
    | "CARBONYL_DERIVATIVE"
    | "HETEROATOM_GROUP"
    | "ALKYL_CHAIN";
  expectedIRRange?: [number, number];
  expectedC13Range?: [number, number];
  expectedH1Range?: [number, number];
  expectedMSFragments?: number[];
}

export const CHEMICAL_FRAGMENT_LIBRARY: ChemicalFragmentDefinition[] = [
  {
    id: "frag-phenyl-mono",
    name: "單取代苯環 (Monosubstituted Phenyl C6H5-)",
    formulaContribution: { C: 6, H: 5 },
    openValences: 1,
    unsaturationContribution: 4,
    smilesMotif: "c1ccccc1",
    category: "AROMATIC_CORE",
    expectedIRRange: [1480, 1610],
    expectedC13Range: [125, 140],
    expectedH1Range: [7.1, 8.1],
    expectedMSFragments: [77, 51],
  },
  {
    id: "frag-phenylene-ortho",
    name: "鄰二取代苯環 (1,2-Phenylene -C6H4-)",
    formulaContribution: { C: 6, H: 4 },
    openValences: 2,
    unsaturationContribution: 4,
    smilesMotif: "c1ccccc1",
    category: "AROMATIC_CORE",
    expectedIRRange: [735, 770],
    expectedC13Range: [120, 155],
    expectedH1Range: [6.8, 8.1],
    expectedMSFragments: [92, 120],
  },
  {
    id: "frag-phenylene-para",
    name: "對二取代苯環 (1,4-Phenylene -C6H4-)",
    formulaContribution: { C: 6, H: 4 },
    openValences: 2,
    unsaturationContribution: 4,
    smilesMotif: "c1ccc(*)cc1",
    category: "AROMATIC_CORE",
    expectedIRRange: [800, 860],
    expectedC13Range: [115, 158],
    expectedH1Range: [6.6, 8.0],
    expectedMSFragments: [108, 109, 121],
  },
  {
    id: "frag-carboxyl",
    name: "羧基 (-COOH)",
    formulaContribution: { C: 1, H: 1, O: 2 },
    openValences: 1,
    unsaturationContribution: 1,
    smilesMotif: "C(=O)O",
    category: "CARBONYL_DERIVATIVE",
    expectedIRRange: [1680, 1725],
    expectedC13Range: [168, 180],
    expectedH1Range: [10.5, 13.0],
    expectedMSFragments: [45, 44],
  },
  {
    id: "frag-ester-link",
    name: "酯基 (-COO-)",
    formulaContribution: { C: 1, O: 2 },
    openValences: 2,
    unsaturationContribution: 1,
    smilesMotif: "C(=O)O",
    category: "CARBONYL_DERIVATIVE",
    expectedIRRange: [1715, 1765],
    expectedC13Range: [165, 175],
  },
  {
    id: "frag-acetoxy",
    name: "乙醯氧基 (-OCOCH3)",
    formulaContribution: { C: 2, H: 3, O: 2 },
    openValences: 1,
    unsaturationContribution: 1,
    smilesMotif: "OC(=O)C",
    category: "CARBONYL_DERIVATIVE",
    expectedIRRange: [1735, 1770],
    expectedC13Range: [168, 172],
    expectedH1Range: [2.0, 2.38],
    expectedMSFragments: [43],
  },
  {
    id: "frag-acetamido",
    name: "乙醯胺基 (-NHCOCH3)",
    formulaContribution: { C: 2, H: 4, N: 1, O: 1 },
    openValences: 1,
    unsaturationContribution: 1,
    smilesMotif: "NC(=O)C",
    category: "CARBONYL_DERIVATIVE",
    expectedIRRange: [1645, 1690],
    expectedC13Range: [167, 172],
    expectedH1Range: [1.95, 2.2],
    expectedMSFragments: [43],
  },
  {
    id: "frag-acetyl",
    name: "乙醯基 (-COCH3)",
    formulaContribution: { C: 2, H: 3, O: 1 },
    openValences: 1,
    unsaturationContribution: 1,
    smilesMotif: "C(=O)C",
    category: "CARBONYL_DERIVATIVE",
    expectedIRRange: [1680, 1720],
    expectedC13Range: [195, 208],
    expectedH1Range: [2.1, 2.65],
    expectedMSFragments: [43],
  },
  {
    id: "frag-formyl",
    name: "醛基 (-CHO)",
    formulaContribution: { C: 1, H: 1, O: 1 },
    openValences: 1,
    unsaturationContribution: 1,
    smilesMotif: "C=O",
    category: "CARBONYL_DERIVATIVE",
    expectedIRRange: [1685, 1740],
    expectedC13Range: [188, 205],
    expectedH1Range: [9.4, 10.2],
    expectedMSFragments: [29],
  },
  {
    id: "frag-hydroxyl",
    name: "羥基 / 酚羥基 (-OH)",
    formulaContribution: { H: 1, O: 1 },
    openValences: 1,
    unsaturationContribution: 0,
    smilesMotif: "O",
    category: "HETEROATOM_GROUP",
    expectedIRRange: [3200, 3600],
    expectedH1Range: [3.5, 10.2],
  },
  {
    id: "frag-methoxy",
    name: "甲氧基 (-OCH3)",
    formulaContribution: { C: 1, H: 3, O: 1 },
    openValences: 1,
    unsaturationContribution: 0,
    smilesMotif: "OC",
    category: "HETEROATOM_GROUP",
    expectedC13Range: [50, 62],
    expectedH1Range: [3.65, 4.0],
    expectedMSFragments: [31],
  },
  {
    id: "frag-ethoxy",
    name: "乙氧基 (-OCH2CH3)",
    formulaContribution: { C: 2, H: 5, O: 1 },
    openValences: 1,
    unsaturationContribution: 0,
    smilesMotif: "OCC",
    category: "HETEROATOM_GROUP",
    expectedC13Range: [13, 63],
    expectedH1Range: [1.15, 4.45],
    expectedMSFragments: [45, 29],
  },
  {
    id: "frag-ethyl",
    name: "乙基 (-CH2CH3)",
    formulaContribution: { C: 2, H: 5 },
    openValences: 1,
    unsaturationContribution: 0,
    smilesMotif: "CC",
    category: "ALKYL_CHAIN",
    expectedC13Range: [10, 32],
    expectedH1Range: [0.9, 2.8],
    expectedMSFragments: [29],
  },
  {
    id: "frag-methyl",
    name: "甲基 (-CH3)",
    formulaContribution: { C: 1, H: 3 },
    openValences: 1,
    unsaturationContribution: 0,
    smilesMotif: "C",
    category: "ALKYL_CHAIN",
    expectedC13Range: [12, 30],
    expectedH1Range: [0.8, 2.6],
    expectedMSFragments: [15],
  },
];

export class FragmentLibrary {
  static selectCompatibleFragments(
    constraints: StructuralConstraints
  ): ChemicalFragmentDefinition[] {
    const selected: ChemicalFragmentDefinition[] = [];
    const fgText = [
      ...(constraints.functionalGroups || []),
      ...(constraints.requiredFunctionalGroups || []),
    ]
      .filter(
        (g) =>
          g.status === "REQUIRED" ||
          g.status === "SUPPORTED" ||
          g.status === "PROBABLE"
      )
      .map((g) => `${g.groupName || g.label} ${g.notes || ""}`.toLowerCase())
      .join(" ");

    const subText = [
      ...(constraints.substructures || []),
      ...(constraints.requiredSubstructures || []).map((s) => ({
        fragmentType: s.motifLabel,
        motif: s.motifLabel,
        description: s.supportingObservation,
      })),
    ]
      .map((s) => `${s.fragmentType || s.motif} ${s.description}`.toLowerCase())
      .join(" ");

    if (
      fgText.includes("aromatic") ||
      fgText.includes("phenyl") ||
      fgText.includes("芳環") ||
      fgText.includes("芳香") ||
      subText.includes("aromatic") ||
      subText.includes("苯") ||
      constraints.aromaticity?.status === "PRESENT"
    ) {
      if (
        constraints.aromaticSubstitutionPattern === "PARA_DISUBSTITUTED" ||
        constraints.aromaticity?.substitutionPatternHint === "1,4-para"
      ) {
        selected.push(CHEMICAL_FRAGMENT_LIBRARY[2]);
      } else if (
        constraints.aromaticSubstitutionPattern === "ORTHO_DISUBSTITUTED" ||
        constraints.aromaticity?.substitutionPatternHint === "1,2-ortho"
      ) {
        selected.push(CHEMICAL_FRAGMENT_LIBRARY[1]);
      } else {
        selected.push(
          CHEMICAL_FRAGMENT_LIBRARY[0],
          CHEMICAL_FRAGMENT_LIBRARY[1]
        );
      }
    }

    if (fgText.includes("carboxylic") || fgText.includes("羧酸")) {
      selected.push(CHEMICAL_FRAGMENT_LIBRARY[3]);
    }
    if (
      fgText.includes("ester") ||
      fgText.includes("酯") ||
      fgText.includes("acet")
    ) {
      selected.push(CHEMICAL_FRAGMENT_LIBRARY[4], CHEMICAL_FRAGMENT_LIBRARY[5]);
    }
    if (
      fgText.includes("amide") ||
      fgText.includes("醯胺") ||
      constraints.nitrogenRuleParity === "ODD"
    ) {
      selected.push(CHEMICAL_FRAGMENT_LIBRARY[6]);
    }
    if (
      fgText.includes("ketone") ||
      fgText.includes("acetyl") ||
      fgText.includes("酮")
    ) {
      selected.push(CHEMICAL_FRAGMENT_LIBRARY[7]);
    }
    if (fgText.includes("aldehyde") || fgText.includes("醛")) {
      selected.push(CHEMICAL_FRAGMENT_LIBRARY[8]);
    }
    if (
      fgText.includes("hydroxyl") ||
      fgText.includes("phenol") ||
      fgText.includes("oh") ||
      fgText.includes("醇")
    ) {
      selected.push(CHEMICAL_FRAGMENT_LIBRARY[9]);
    }
    if (
      subText.includes("ethyl") ||
      subText.includes("乙基") ||
      subText.includes("och2ch3")
    ) {
      selected.push(
        CHEMICAL_FRAGMENT_LIBRARY[11],
        CHEMICAL_FRAGMENT_LIBRARY[12]
      );
    }

    return selected;
  }
}
