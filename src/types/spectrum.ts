export type SpectrumModality = "IR" | "1H_NMR" | "13C_NMR" | "MS";

export type ExtendedSpectrumModality =
  | "IR"
  | "1H_NMR"
  | "13C_NMR"
  | "MS"
  | "MS/MS"
  | "ToF-SIMS";

export type MSType = "EI-MS" | "LC-MS" | "MS/MS" | "ToF-SIMS";

export type IonizationMode =
  | "EI"
  | "ESI+"
  | "ESI-"
  | "APCI"
  | "SIMS / ToF-SIMS"
  | "ToF-SIMS+"
  | "ToF-SIMS-"
  | "Other"
  | "Auto / Unknown";

export type ModelType =
  | "THEORETICAL"
  | "EMPIRICAL"
  | "REFERENCE"
  | "LITERATURE"
  | "SIMULATED"
  | "AI_INFERENCE"
  | "EXPERIMENTAL";

export type EvidenceTag =
  | "[Experimental]"
  | "[Reference]"
  | "[Theoretical]"
  | "[Empirical]"
  | "[Literature]"
  | "[AI]"
  | "[Simulated]";

export type EvidenceSourceType =
  | "Theoretical Calculation"
  | "Empirical Chemical Rule"
  | "Literature Reference"
  | "Spectral Database"
  | "AI Prediction"
  | "Experimental Measurement"
  | "Simulated Reference";

export type CertaintyCategory =
  | "Experimental"
  | "Literature"
  | "Calculated"
  | "Estimated"
  | "AI Inference"
  | "Simulated";

export type OverallEvidenceLevel =
  | "High"
  | "Medium"
  | "Low"
  | "Insufficient Evidence";

export interface EvidenceItem {
  id: string;
  tag: EvidenceTag;
  modelType: ModelType;
  sourceType: EvidenceSourceType;
  certaintyCategory: CertaintyCategory;
  source: string;
  reference: string;
  doiOrUrl?: string;
  relevantInformation: string;
  reasoning?: string;
  confidence: number; // 0 - 95
}

export interface TheoreticalModelMetadata {
  adapterId: string;
  modelName: string;
  modelType: ModelType;
  theoreticalBasis: string;
  inputRequirements: string[];
  outputDescription: string;
  computationalStatus: "AVAILABLE" | "UNAVAILABLE_FALLBACK_ACTIVE";
  activeExecutionMode:
    | "經驗式預測 (Internal Empirical Model)"
    | "模擬參考資料 (Simulated Reference)"
    | "量子化學計算 (Quantum/DFT)";
  limitations: string[];
}

export interface DataPoint {
  x: number;
  y: number;
  baselineY?: number;
}

export type SignalProvenance =
  | "AI_DETECTED"
  | "USER_DEFINED"
  | "USER_EDITED"
  | "USER_MODIFIED"
  | "REFERENCE"
  | "REFERENCE_SUGGESTED"
  | "IMPORTED_NUMERIC";

export type PeakProvenance = SignalProvenance;

export type SignalRole =
  | "ANALYTE"
  | "SOLVENT"
  | "IMPURITY"
  | "WATER"
  | "MOISTURE"
  | "REFERENCE_TMS"
  | "INTERNAL_STANDARD"
  | "SATELLITE"
  | "ARTIFACT"
  | "NOISE"
  | "OVERLAP"
  | "UNKNOWN";

export type PeakClassificationTag =
  | "REAL"
  | "COMPOUND"
  | "NOISE"
  | "SOLVENT"
  | "IMPURITY"
  | "UNKNOWN"
  | "OVERLAP";

export type IRBandIntensityLevel =
  | "strong"
  | "medium"
  | "weak"
  | "variable"
  | "STRONG"
  | "MEDIUM"
  | "WEAK";

export type IRBandShapeCategory =
  | "sharp"
  | "broad"
  | "very_broad"
  | "medium"
  | "shoulder"
  | "multiplet"
  | "SHARP"
  | "BROAD"
  | "MEDIUM_WIDTH"
  | "SHOULDER"
  | "OVERLAPPED"
  | "UNRESOLVED";

export type IRVibrationType =
  | "stretching"
  | "bending"
  | "in_plane_bending"
  | "out_of_plane_bending"
  | "overtone"
  | "combination"
  | "fermi_resonance"
  | "STRETCHING"
  | "BENDING"
  | "ROCKING"
  | "SCISSORING"
  | "WAGGING"
  | "TWISTING"
  | "RING_VIBRATION"
  | "UNKNOWN";

export type IRPeakType =
  | "STRONG"
  | "MEDIUM"
  | "WEAK"
  | "SHOULDER"
  | "OVERLAPPED"
  | "POSSIBLE_NOISE";

export type CarbonEnvironmentType =
  | "CH3"
  | "CH2"
  | "CH"
  | "C"
  | "quaternary_C"
  | "carbonyl_C"
  | "aromatic_C"
  | "heteroaromatic_C"
  | "CARBONYL_REGION"
  | "AROMATIC_OR_ALKENE_REGION"
  | "POSSIBLE_CH_OR_CH2_OR_C"
  | "Unknown";

export type NMRSolvent =
  | "CDCl3"
  | "DMSO-d6"
  | "CD3OD"
  | "D2O"
  | "Acetone-d6"
  | "CD3CN"
  | "C6D6"
  | "THF-d8"
  | "CD2Cl2"
  | "Toluene-d8"
  | "Unknown";

export type NMRDataNature =
  | "MEASURED_LITERATURE_DATA"
  | "GENERAL_THEORY"
  | "EMPIRICAL_INCREMENT_MODEL"
  | "PROGRAM_APPROXIMATION";

export type InferenceLevel =
  | "LEVEL_1_DIRECT_OBSERVATION"
  | "LEVEL_2_LOCAL_CHEMICAL_ENVIRONMENT"
  | "LEVEL_3_FUNCTIONAL_GROUP_HYPOTHESIS"
  | "LEVEL_4_MOLECULAR_SCAFFOLD_HYPOTHESIS";

export interface CompetingHypothesisRecord {
  hypothesis: string;
  level: InferenceLevel;
  plausibility: "HIGH" | "MODERATE" | "LOW";
  supportingConditions: string[];
  contradictingConditions: string[];
  requiredOrthogonalVerification: string;
}

export interface NMRLiteratureReference {
  id: string;
  authors: string;
  title: string;
  journal: string;
  year: number;
  doi?: string;
  dataNature: NMRDataNature;
  applicableConditions: string;
  version: string;
}

export interface NMRShiftCorrectionTerm {
  termName: string;
  deltaPpm: number;
  reasonZh: string;
  applicableCondition: string;
  dataNature: NMRDataNature;
  citationId: string;
  doi?: string;
}

export interface SpinMultipletLine {
  offsetHz: number;
  positionPpm: number;
  relativeIntensity: number;
}

export interface SpinCouplingAnalysis {
  spinSystemNotation: string;
  couplingOrder:
    | "FIRST_ORDER"
    | "SECOND_ORDER_STRONG_COUPLING"
    | "UNRESOLVED_MULTIPLET"
    | "EXCHANGE_BROADENED";
  deltaNuOverJMin?: number | null;
  strongCouplingWarning?: string;
  multipletCode: string;
  multipletDescriptionZh: string;
  jCouplings: JCoupling[];
  simulatedLines: SpinMultipletLine[];
  isMagneticNonEquivalent?: boolean;
  isDiastereotopicCh2?: boolean;
  isExchangeBroadened?: boolean;
}

export type SignalDetectionSource =
  | "AUTO"
  | "AUTO_IMAGE_DETECTION"
  | "MANUAL"
  | "USER_MARKED"
  | "ESTIMATED_FROM_IMAGE";

export type CalibrationQualityGrade = "GOOD" | "ACCEPTABLE" | "POOR";

export interface SignalInterpretationCandidate {
  assignment: string;
  functionalGroupOrEnvironment: string;
  confidence: number; // 0.0 - 1.0
  provenance:
    | "THEORETICAL"
    | "EMPIRICAL"
    | "REFERENCE_BASED"
    | "CHEMICAL_RULE_BASED";
  reasoning: string;
}

export interface Signal {
  id: string;
  modality: SpectrumModality | "MS/MS" | "ToF-SIMS";
  position: number;
  xUnit: string;
  intensity: number | "STRONG" | "MEDIUM" | "WEAK";
  relativeIntensity?: number;
  normalizedIntensity: number;
  width: number;
  fwhm: number;
  area: number;
  prominence: number;
  localBaseline: number;
  signalToNoise: number;
  localContrast?: number;
  shape:
    | "sharp"
    | "broad"
    | "very_broad"
    | "medium"
    | "shoulder"
    | "multiplet"
    | "SHARP"
    | "BROAD"
    | "MEDIUM_WIDTH"
    | "SHOULDER"
    | "OVERLAPPED"
    | "UNRESOLVED";
  irIntensity?: "STRONG" | "MEDIUM" | "WEAK" | IRBandIntensityLevel;
  irShape?: IRBandShapeCategory;
  irVibrationType?: IRVibrationType;
  vibrationType?: IRVibrationType;
  peakType?: IRPeakType;
  signalQuality?: "HIGH" | "MEDIUM" | "LOW" | "GOOD" | "MODERATE";
  confidence: number; // 0.0 - 1.0

  detectionSource: SignalDetectionSource;

  interpretation: string;
  interpretationCandidates: SignalInterpretationCandidate[];
  structuralEvidence: string[];

  userOverride?: boolean;
  verified: boolean;
  role?: SignalRole;
  classificationTag?: PeakClassificationTag;
}

export interface SpectralPeak {
  asymmetry?: number;
  relativeArea?: number;
  jCouplingHz?: number;
  roleReason?: string;
  id: string;
  x: number; // cm-1 for IR, ppm for NMR, m/z for MS
  y: number; // intensity (0-100 normalized)
  relativeIntensity?: number;
  normalizedIntensity?: number;
  prominence?: number;
  width?: number;
  fwhm?: number;
  area?: number;
  localBaseline?: number;
  signalToNoise?: number;
  localContrast?: number;
  peakType?: IRPeakType;
  signalQuality?: "HIGH" | "MEDIUM" | "LOW" | "GOOD" | "MODERATE";
  confidence?: number;
  detectionSource?: SignalDetectionSource;
  source?: "IMAGE" | "NUMERIC" | "AUTO" | "MANUAL";
  interpretation?: string;
  interpretationCandidates?: SignalInterpretationCandidate[];
  structuralEvidence?: string[];
  userOverride?: boolean;
  verified?: boolean;
  shape?:
    | "sharp"
    | "broad"
    | "very_broad"
    | "medium"
    | "shoulder"
    | "multiplet"
    | "SHARP"
    | "BROAD"
    | "MEDIUM_WIDTH"
    | "SHOULDER"
    | "OVERLAPPED"
    | "UNRESOLVED";
  bandShape?: IRBandShapeCategory;
  irIntensity?: IRBandIntensityLevel;
  vibrationType?: IRVibrationType;
  isBroad?: boolean;
  // NMR specific — strictly nullable if not provided!
  integration?: number | null;
  integral?: number;
  multiplicity?:
    | "s"
    | "d"
    | "t"
    | "q"
    | "dd"
    | "dt"
    | "dq"
    | "td"
    | "tt"
    | "ddd"
    | "AA'BB'"
    | "m"
    | "br"
    | "br s"
    | "sept"
    | "sext"
    | "quint"
    | "multiplet"
    | "unresolved"
    | null;
  jValues?: number[]; // Empty array = unknown J
  deptType?: "C" | "C_quat" | "CH" | "CH2" | "CH3" | "Unknown";
  carbonType?: CarbonEnvironmentType;
  // MS specific
  isBasePeak?: boolean;
  isMolecularIonCandidate?: boolean;
  isPrecursorIon?: boolean;
  isotopeAnnotation?: string;
  // Explicit separation between Experimental Observation vs Theoretical Prediction
  isPredictedPeak?: boolean;
  predictedRange?: [number, number];
  // General annotation, Provenance & Signal Role
  assignment?: string;
  manualPeak?: boolean;
  manualEdited?: boolean;
  userModified?: boolean;
  pixelX?: number;
  pixelY?: number;
  isCalibrated?: boolean;
  signalDirection?: "PEAK_TOP" | "ABSORPTION_VALLEY" | "SHOULDER" | "ION_BAR";
  provenance?: SignalProvenance;
  role?: SignalRole;
  signalRole?: SignalRole;
  classificationTag?: PeakClassificationTag;
  userClassification?: PeakClassificationTag;
  isSolventVerified?: boolean;
  solventName?: string;
}

export interface DataValidationIssue {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  recommendation: string;
  field?: string;
}

export interface DataValidationResult {
  isValid: boolean;
  qualityScore: number; // 0-100
  dataQuality?: ExperimentalDataQuality;
  fileFormat?: string;
  pointCount?: number;
  peakCount?: number;
  xRange?: [number, number];
  yRange?: [number, number];
  missingValuesCount?: number;
  duplicateXCount?: number;
  xAxisOrdered?: boolean;
  baselineDriftDetected?: boolean;
  insufficientResolution?: boolean;
  digitizationFailed?: boolean;
  issues: DataValidationIssue[];
}

export interface ToFSIMSParameters {
  polarity: "Positive" | "Negative";
  primaryIon: "Bi3+" | "Bi+" | "Cs+" | "C60+" | "Ar_n+" | "Ga+";
  primaryIonEnergyKeV: number; // e.g., 10, 25, 40 keV
  massRange: [number, number];
  ionDoseRegime: "Static (< 10^12 ions/cm²)" | "Dynamic (> 10^13 ions/cm²)";
  surfaceMatrixNote: string;
  substrateMaterial:
    | "Si(100) 晶圓"
    | "Au 金膜基底"
    | "Ag 銀基底 (Ag+ Adduct)"
    | "ITO 玻璃"
    | "高分子薄膜";
}

export interface MSParameters {
  msType: MSType;
  ionization: IonizationMode;
  massToleranceDa?: number;
  massTolerancePpm?: number;
  isHighResolution?: boolean;
  chargeState?: number;
  adductType?: "Auto" | "[M]+•" | "[M+H]+" | "[M+Na]+" | "[M+NH4]+" | "[M-H]-";
  precursorMz?: number;
  collisionEnergyEv?: number;
  tofSims?: ToFSIMSParameters;
}

export type SpectrumSourceType =
  | "IMAGE_EXPERIMENTAL"
  | "NUMERIC_EXPERIMENTAL"
  | "IMAGE_DIGITIZED"
  | "REFERENCE"
  | "AI_INFERENCE"
  | "SIMULATION"
  | "PREDICTED_SPECTRUM";

export type ExperimentalDataQuality = "HIGH" | "MEDIUM" | "LOW";

export type EvidenceQuality =
  | "EXACT_NUMERIC"
  | "CALIBRATED_IMAGE"
  | "APPROXIMATE_IMAGE"
  | "VISUAL_PATTERN_ONLY"
  | "REFERENCE_MATCH"
  | "MODEL_INFERENCE";

export type DataReliabilityLevel =
  | "HIGHEST"
  | "HIGH"
  | "HIGH_FOR_VISUAL_REFERENCE"
  | "MEDIUM"
  | "LOW"
  | "LOWER_MODEL_DEPENDENT"
  | "REFERENCE_ONLY";

export interface VisualPatternObservation {
  patternKey:
    | "BROAD_OH_BAND"
    | "STRONG_CARBONYL_BAND"
    | "AROMATIC_RING_BANDS"
    | "C_O_STRETCH_BAND"
    | "ALDEHYDE_CHO_BAND"
    | "NITRILE_TRIPLE_BOND_BAND"
    | "PARA_OOP_BAND"
    | "ALDEHYDE_DOWNFIELD_PROTON"
    | "AROMATIC_MULTIPLET_PATTERN"
    | "PARA_AA_BB_DOUBLET_PAIR"
    | "METHOXY_OR_ALKOXY_SINGLET"
    | "CARBONYL_DOWNFIELD_CARBON"
    | "AROMATIC_CARBON_CLUSTER"
    | "HALOGEN_ISOTOPE_CLUSTER"
    | "MOLECULAR_ION_CLUSTER"
    | "NEUTRAL_LOSS_28_CO"
    | "TROPYLIUM_91_OR_PHENYL_77"
    | "SILOXANE_73_147_CLUSTER";
  descriptionZh: string;
  approximatePosition?: number;
  unit?: string;
  confidence: number; // 0.0 - 1.0
}

export interface CrossSourceValidationRecord {
  modality: SpectrumModality | "MS/MS" | "ToF-SIMS";
  imageFileName: string;
  numericFileName: string;
  status: "CORROBORATED" | "DATA_CONFLICT";
  matchedSignals: {
    imagePosition: number;
    numericPosition: number;
    difference: number;
    unit: string;
    summaryZh: string;
  }[];
  conflictingSignals: {
    imagePosition?: number;
    numericPosition?: number;
    difference?: number;
    unit: string;
    conflictReasonZh: string;
  }[];
  summaryMessageZh: string;
}

export type SpectrumSignalType =
  | "PEAK"
  | "BAND"
  | "SHOULDER"
  | "MULTIPLET"
  | "ISOTOPE"
  | "FRAGMENT"
  | "PRODUCT_ION"
  | "UNKNOWN";

export interface SpectrumSignalAnnotation {
  id: string;
  x: number;
  y?: number;
  unit?: string;
  label?: string;
  signalType: SpectrumSignalType;
  confidence: number;
  source: "ALGORITHM" | "AI" | "USER";
  verifiedByUser: boolean;
  userModified?: boolean;
  provenance?: SignalProvenance;
  role?: SignalRole;
  signalRole?: SignalRole;
  irIntensity?: IRBandIntensityLevel;
  bandShape?: IRBandShapeCategory;
  vibrationType?: IRVibrationType;
  isBroad?: boolean;
  deptType?: "C" | "C_quat" | "CH" | "CH2" | "CH3" | "Unknown";
  carbonType?: CarbonEnvironmentType;
}

export interface ImageSignalAnnotation {
  id: string;
  pixelX: number;
  pixelY: number;
  physicalX?: number;
  physicalY?: number;
  calibratedPosition?: number;
  approximatePosition?: number;
  intensity?: number;
  unit?: string;
  label?: string;
  assignment?: string;
  signalType: SpectrumSignalType;
  confidence?: number;
  source: "AI" | "USER" | "ALGORITHM";
  detectionSource?: SignalDetectionSource;
  manualPeak?: boolean;
  verifiedByUser: boolean;
  userModified?: boolean;
  provenance?: SignalProvenance;
  role?: SignalRole;
  signalRole?: SignalRole;
  userClassification?: PeakClassificationTag;
  isSolventVerified?: boolean;
  solventName?: string;
  multiplicity?: SpectralPeak["multiplicity"];
  integration?: number | null;
  jValues?: number[];
  irIntensity?: IRBandIntensityLevel;
  bandShape?: IRBandShapeCategory;
  vibrationType?: IRVibrationType;
  isBroad?: boolean;
  isCalibrated?: boolean;
  signalDirection?: "PEAK_TOP" | "ABSORPTION_VALLEY" | "SHOULDER" | "ION_BAR";
  deptType?: "C" | "C_quat" | "CH" | "CH2" | "CH3" | "Unknown";
  carbonType?: CarbonEnvironmentType;
}

export interface ImageCalibrationPoint {
  pixelX: number;
  physicalX: number;
  status?:
    | "VALID"
    | "OUTLIER"
    | "PENDING"
    | "INVALID"
    | "SET"
    | "VALIDATED"
    | "HIGH_RESIDUAL";
  residual?: number;
}

export interface ImageSpectrumCalibration {
  plotLeftPx: number;
  plotRightPx: number;
  plotTopPx: number;
  plotBottomPx: number;
  xAxisStart: number;
  xAxisEnd: number;
  physicalXLeft?: number;
  physicalXRight?: number;
  physicalYBottom?: number;
  physicalYTop?: number;
  xAxisDirection: "ASCENDING" | "DESCENDING";
  confidence: number;
  source:
    | "AI_DETECTED"
    | "USER_CALIBRATED"
    | "USER_CORRECTED"
    | "USER_3PT_CALIBRATED"
    | "DEFAULT_FALLBACK"
    | "PLOT_BOUNDARY_UNCERTAIN";
  calibrationMode?: "TWO_POINT" | "THREE_POINT" | string;
  qualityGrade?: CalibrationQualityGrade | "HIGH" | "MEDIUM" | "LOW" | string;
  maxResidual?: number;
  residualSummary?: string;
  plotBoundaryStatus?:
    | "DETECTED"
    | "USER_ADJUSTED"
    | "PLOT_BOUNDARY_UNCERTAIN";
  referencePointA?: { pixelX: number; physicalX: number };
  referencePointB?: { pixelX: number; physicalX: number };
  referencePoint1?: ImageCalibrationPoint;
  referencePoint2?: ImageCalibrationPoint;
  referencePoint3?: ImageCalibrationPoint;
  calibrationPoints?: ImageCalibrationPoint[];
  slope?: number;
  intercept?: number;
  rSquared?: number;
  residuals?:
    | [number, number, number]
    | {
        point1: number;
        point2: number;
        point3: number;
      };
  rmse?: number;
  calibrationQuality?: CalibrationQualityGrade;
  calibrationWarning?: string;
}

export interface EmptyWorkspaceState {
  sampleName: string;
  molecularFormula: string;
  smiles: string;
  InChI: string;
  structure: ParsedChemicalStructure | null;
  spectra: ExperimentalSpectrumData[];
  experimentalSpectra: Partial<
    Record<SpectrumModality, ExperimentalSpectrumData>
  >;
  predictedSpectra: ExperimentalSpectrumData[];
  candidates: CandidateStructure[];
  evidence: ChemicalFeatureEvidence[];
  constraints: StructuralConstraints[];
  reports: SpecReaderProject[];
  imageCalibration: ImageSpectrumCalibration | null;
  imageAnnotations: ImageSignalAnnotation[];
  manualSignalAnnotations: SpectrumSignalAnnotation[];
  analysisResult: MultiSpectrumAnalysisReport | null;
}

export function createEmptyWorkspaceState(): EmptyWorkspaceState {
  return {
    sampleName: "",
    molecularFormula: "",
    smiles: "",
    InChI: "",
    structure: null,
    spectra: [],
    experimentalSpectra: {},
    predictedSpectra: [],
    candidates: [],
    evidence: [],
    constraints: [],
    reports: [],
    imageCalibration: null,
    imageAnnotations: [],
    manualSignalAnnotations: [],
    analysisResult: null,
  };
}

export interface NumericColumnDetectionResult {
  availableColumns: string[];
  xColumnIndex: number | null;
  yColumnIndex: number | null;
  xColumnName?: string;
  yColumnName?: string;
  detectedXUnit?: string;
  detectedYUnit?: string;
  columnSelectionRequired: boolean;
  confidence: number;
  reason: string;
  rawTableRows?: (string | number | null)[][];
}

export interface ProcessedSpectrumData {
  derivedFromFileName: string;
  label: "Processed / Normalized Derived Dataset (Original Experimental X/Y Preserved)";
  smoothedPoints: DataPoint[];
  baselineCorrectedPoints: DataPoint[];
  normalizedPoints: DataPoint[];
}

export interface DigitizedSpectrumData {
  derivedFromFileName: string;
  label: "AI / Digitized Approximation";
  sourceType: "IMAGE_DIGITIZED";
  reliabilityLevel: "MEDIUM";
  approximatedPoints: DataPoint[];
  approximatedPeaks: SpectralPeak[];
  calibrationUsed?: ImageSpectrumCalibration;
}

export interface ExperimentalSpectrumData {
  predictionNotes?: string[];
  irIntensityScale?: import('../engines/scientificEngines/irSignalProcessing').IRIntensityScale;
  irManualSettings?: import('../engines/scientificEngines/irManualBaseline').IRManualSettings;
  irPixelCurve?: DataPoint[];
  irMirroredPoints?: DataPoint[];
  irCorrectedPoints?: DataPoint[];
  irDataQuality?: number;
  irProcessingApplied?: boolean;
  irProcessingWarnings?: string[];
  c13ExperimentMode?: "BROADBAND_DECOUPLED" | "1D_PROTON_DECOUPLED" | "DEPT_90" | "DEPT_135" | "APT" | "UNKNOWN";
  sourceType?: SpectrumSourceType;
  dataQuality?: ExperimentalDataQuality;
  evidenceQuality?: EvidenceQuality;
  dataReliabilityLevel?: DataReliabilityLevel;
  modality: SpectrumModality;
  originalModality?: ExtendedSpectrumModality;
  canonicalModality?:
    | "IR"
    | "H1_NMR"
    | "C13_NMR"
    | "MS"
    | "MSMS"
    | "TOF_SIMS";
  irYAxisSemantics?: "TRANSMITTANCE_PERCENT" | "ABSORBANCE" | "UNKNOWN";
  fileName: string;
  originalFileName?: string;
  sourceFormat:
    | "EXCEL"
    | "CSV"
    | "TXT"
    | "JCAMP-DX"
    | "PNG"
    | "JPG"
    | "JPEG"
    | "WEBP"
    | "IMAGE"
    | "IMAGE_DIGITIZED"
    | "MANUAL"
    | "PRESET"
    | "SIMULATED";
  dataOrigin?:
    | "EXPERIMENTAL_UPLOAD"
    | "DEMO_REFERENCE_PRESET"
    | "EMPIRICAL_SIMULATION";
  modelType?: ModelType;
  isSimulated?: boolean;
  sourceId?: string;
  dataVersion?: number;
  // Raw Numeric Experimental Data (Never smoothed or overwritten!)
  x?: number[];
  y?: number[];
  xUnit: string;
  yUnit: string;
  xLabel?: string;
  yLabel?: string;
  xDirection?: "ASCENDING" | "DESCENDING";
  dataIntegrity?: {
    pointCount: number;
    invalidPointCount: number;
    missingPointCount: number;
    duplicateXCount: number;
  };
  columnDetection?: NumericColumnDetectionResult;
  processedData?: ProcessedSpectrumData;
  signalAnnotations?: SpectrumSignalAnnotation[];
  // Explicit separation of raw data, calibrated data, auto-suggested, user-modified, and confirmed signals
  rawExperimentalSnapshot?: {
    fileName?: string;
    rawX?: number[];
    rawY?: number[];
    rawPoints?: DataPoint[];
    rawImageUrl?: string;
    originalImageUrl?: string;
    imageDimensions?: { width: number; height: number };
    rawInitialPeaks?: SpectralPeak[];
    capturedAt?: string;
  };
  calibratedDataSnapshot?: {
    version?: number;
    calibratedPoints?: DataPoint[];
    calibratedPeaks?: SpectralPeak[];
    calibrationApplied?:
      | ImageSpectrumCalibration
      | ExperimentalSpectrumData["numericCalibration"];
    calibrationSource?: string;
    calibratedAtVersion?: number;
    calibratedAt?: string;
  };
  autoSuggestedPeaks?: SpectralPeak[];
  userEditedPeaks?: SpectralPeak[];
  deletedPeakIds?: string[];
  confirmedPeaks?: SpectralPeak[];
  // Standard points, peaks & unified characterized signals
  points: DataPoint[];
  peaks: SpectralPeak[];
  signals?: Signal[];
  validation: DataValidationResult;
  msParams?: MSParameters;
  // Image Experimental Data (Original image preserved + Annotation Overlay + Visual Pattern Analysis)
  digitizedFromImage?: boolean;
  digitizationMethod?: "Gemini Vision" | "Canvas" | "Manual";
  digitizationFailed?: boolean;
  calibrationFailed?: boolean;
  digitizationErrorMessage?: string;
  digitizedMetadata?: DigitizedImageMetadata;
  visualPatterns?: VisualPatternObservation[];
  imagePreviewUrl?: string;
  originalImageUrl?: string;
  imageDimensions?: { width: number; height: number };
  imageCalibration?: ImageSpectrumCalibration;
  imageAnnotations?: ImageSignalAnnotation[];
  imageSignalAnnotations?: ImageSignalAnnotation[];
  autoDetectedAnnotations?: ImageSignalAnnotation[];
  digitizedApproximation?: DigitizedSpectrumData;
  // Formally Equivalent Coexistence of IMAGE_EXPERIMENTAL + NUMERIC_EXPERIMENTAL for the same modality
  peerExperimentalSpectrum?: ExperimentalSpectrumData;
  companionImageReference?: ExperimentalSpectrumData;
  crossSourceValidation?: CrossSourceValidationRecord;
  // NMR Solvent, Measurement Conditions & Numeric Shift Calibration
  nmrSolvent?: NMRSolvent;
  spectrometerFrequencyMHz?: number;
  temperatureK?: number;
  temperatureC?: number;
  concentrationNote?: string;
  nmrExperimentType?:
    | "1D_1H"
    | "1D_13C_DECOUPLED"
    | "DEPT_135"
    | "DEPT_90";
  numericCalibration?: {
    shiftOffset: number;
    referencePeakOriginalX?: number;
    referencePeakTargetX?: number;
    unit: string;
    appliedAt: string;
  };
}

export interface IRFunctionalGroupFinding {
  id: string;
  functionalGroup: string;
  groupName?: string;
  groupFamily?: string;
  family: string;
  observedPeak: number;
  observedPeaks?: number[];
  observedIntensities?: number[];
  observedWidthAndShape: string;
  bandShape?: string;
  vibrationMode?: string;
  expectedRange: string;
  region: "官能基區 (4000–1500 cm⁻¹)" | "指紋區 (1500–400 cm⁻¹)" | string;
  assignment: string;
  companionPeaksObserved: string[];
  matchLevel: "Strong" | "Moderate" | "Weak" | "Absent / Excluded";
  status?: "PRESENT" | "POSSIBLE" | "UNCERTAIN" | "ABSENT" | "INSUFFICIENT_DATA";
  chemicalInterpretation?: string;
  modelType: ModelType;
  confidence: number;
  reasoning: string;
  evidence: EvidenceItem;
  evidenceIds?: string[];
  inferenceLevel?: InferenceLevel;
  alternativeExplanations?: string[];
  competingHypotheses?: CompetingHypothesisRecord[];
  electronicAndHBondEffects?: string[];
}

export interface JCoupling {
  atomA: string;
  atomB: string;
  J: number; // Hz
  couplingType:
    | "geminal (2J)"
    | "vicinal (3J)"
    | "ortho-aromatic (3J)"
    | "meta-aromatic (4J)"
    | "para-aromatic (5J)"
    | "cis-alkene (3J)"
    | "trans-alkene (3J)"
    | "geminal-alkene (2J)"
    | "heteroaromatic-ortho (3J)"
    | "heteroaromatic-meta (4J)"
    | "allylic/benzylic (4J)"
    | "long-range (4J/5J)"
    | "unassigned";
  dihedralAngle?: number | "NOT_PROVIDED";
  confidence: number;
  literatureRangeHz?: [number, number];
  citationId?: string;
}

export interface KarplusModel {
  readonly modelName: string;
  readonly status: "INTERFACE_RESERVED" | "EMPIRICAL_ACTIVE";
  estimateVicinalJFromDihedral(dihedralAngleDeg?: number): {
    estimatedJHz: number | null;
    dihedralAngle: number | "NOT_PROVIDED";
    note: string;
  };
}

export interface ProtonEnvironment {
  id: string;
  atomId?: string;
  atomIndices?: number[];
  atomGroupLabel?: string;
  chemicalShift?: number;
  predictedDeltaPpm?: number;
  uncertaintyPpm?: number;
  environmentLabel: string;
  environment?: string;
  chemicalEnvironmentClass?: string;
  shiftPpm: number;
  expectedShiftRange: [number, number];
  integration: number | null; // null = 積分：未知
  expectedProtonCount?: number;
  rawIntegralValue?: number | null;
  userRelativeRatio?: number | null;
  normalizedIntegralRatio?: number | null;
  inferredProtonCount?: number | null;
  isExchangeable?: boolean;
  isOverlapOrUncertain?: boolean;
  relativeIntensity?: number;
  multiplicity: string | null; // null = 峰型：未知
  jCouplingHz: number[]; // empty = J：未知
  couplings?: JCoupling[];
  spinCouplingAnalysis?: SpinCouplingAnalysis;
  appliedCorrections?: NMRShiftCorrectionTerm[];
  solventApplied?: NMRSolvent;
  spectrometerFrequencyMHz?: number;
  literatureSources?: NMRLiteratureReference[];
  dataNature?: NMRDataNature;
  confidenceLevel?: "HIGH" | "MEDIUM" | "LOW";
  identifiedImpurityOrSolvent?: {
    name: string;
    role: SignalRole;
    literatureShiftPpm: number;
    citationDoi: string;
    explanationZh: string;
  };
  regionCategory: string;
  coupledPartnerShift?: number;
  pairedStructureAtomGroup?: string;
  symmetryNote: string;
  symmetry?: string;
  source?: "IMAGE" | "NUMERIC" | "IMAGE_ESTIMATED" | "NUMERIC_EXACT";
  detectionSource?: SignalDetectionSource;
  modelType: ModelType;
  confidence: number;
  reasoning: string;
  inferenceLevel?: InferenceLevel;
  alternativeExplanations?: string[];
  competingHypotheses?: CompetingHypothesisRecord[];
  exchangeabilityNote?: string;
}

export type H1NMRIntegrationSemanticsReport = H1NMRIntegrationSummary;

export interface H1NMRIntegrationSummary {
  integralDataMode:
    | "NORMALIZED_ABSOLUTE_PROTON_COUNT"
    | "RELATIVE_INTEGRAL_RATIO"
    | "RAW_UNNORMALIZED_AREA"
    | "PARTIAL_OR_INCOMPLETE"
    | "MISSING_INTEGRALS"
    | "NOT_PROVIDED";
  completenessLevel:
    | "COMPLETE_RELIABLE"
    | "RELATIVE_RATIO_ONLY"
    | "PARTIAL_UNCERTAIN"
    | "UNAVAILABLE";
  rawIntegralValues: (number | null)[];
  rawIntegralSum: number | null;
  userRelativeRatios: (number | null)[];
  normalizedRatios: (number | null)[];
  normalizedRatioSummary: string;
  inferredMinimumProtonUnitSum: number | null;
  minimumIntegerProtonSum: number | null;
  inferredTotalProtons: number | null;
  estimatedTotalProtons: number | null;
  plausibleTotalProtonMultiples: number[];
  nonExchangeableProtonSum: number | null;
  exchangeableProtonSum: number;
  exchangeableSignalCount: number;
  overlapOrUncertainSignalCount: number;
  missingIntegralSignalCount: number;
  totalAnalyteSignalCount: number;
  isAlreadyNormalized: boolean;
  canDetermineAbsoluteProtonCount: boolean;
  exchangeableProtonNote?: string;
  symmetryAndOverlapNote?: string;
  uncertaintyReasons: string[];
  perEnvironmentProtons?: Array<{
    shift: number;
    rawIntegral: number;
    normalizedRatio: number;
    estimatedProtons: number;
    isExchangeableCandidate: boolean;
  }>;
  diagnostics?: string[];
}

export interface CandidateHardValidationResult {
  isValid: boolean;
  isSupported: boolean;
  computedFormula: string;
  normalizedFormula?: string;
  declaredFormula?: string;
  declaredMatchesComputed: boolean;
  targetFormula: string | null;
  formulaMatch: boolean | "NOT_SPECIFIED";
  atomCounts: Record<string, number>;
  computedTotalProtons: number;
  computedCarbonBoundProtons: number;
  computedExchangeableProtons: number;
  formalCharge: number;
  dbe: number | null;
  exactMass?: number;
  nominalMass?: number;
  canonicalSignature?: string;
  cleanSmiles?: string;
  chemicalSpeciesType:
    | "NEUTRAL_ORGANIC"
    | "ZWITTERIONIC_NEUTRAL"
    | "CHARGED_SPECIES"
    | "RADICAL_OR_IONIC"
    | "METAL_OR_UNSUPPORTED"
    | "INVALID_STRUCTURE";
  validationErrors: string[];
  validationWarnings: string[];
  protonConsistency?: CandidateProtonConsistencyReport;
}

export interface CandidateProtonConsistencyReport {
  targetFormulaMatch: boolean | "NOT_SPECIFIED";
  computedTotalProtons: number;
  computedCarbonBoundProtons: number;
  computedExchangeableProtons: number;
  computedTotalHydrogens: number;
  computedCarbonBoundHydrogens: number;
  computedExchangeableHydrogens: number;
  targetFormulaHydrogens: number | null;
  nmrIntegralDataMode: H1NMRIntegrationSummary["integralDataMode"];
  nmrCompletenessLevel: H1NMRIntegrationSummary["completenessLevel"];
  observedTotalProtons: number | null;
  observedRelativeRatioSum: number | null;
  experimentalRawIntegralSum?: number | null;
  experimentalNormalizedRatio?: string;
  estimatedTotalProtons?: number | null;
  comparisonResult:
    | "MATCHED"
    | "MATCHED_WITH_EXCHANGEABLE_NOTE"
    | "RELATIVE_RATIO_COMPATIBLE"
    | "CONTRADICTED"
    | "INCONCLUSIVE";
  status:
    | "CONSISTENT"
    | "CONSISTENT_WITH_EXCHANGEABLE_OR_OVERLAP"
    | "CONTRADICTED"
    | "INCONCLUSIVE";
  isHardFailure: boolean;
  penaltyPoints?: number;
  scoreAdjustment?: number;
  failureReason?: string | null;
  explanation?: string;
  diagnostics?: string[];
  inconsistencyReasons: string[];
  contradictionReasons: string[];
  supportingNotes: string[];
  uncertaintyNotes: string[];
  uncertaintyExplanation?: string;
  disposition: "PASS" | "HARD_REJECT" | "SOFT_PENALTY" | "INCONCLUSIVE";
}


export type CandidateDispositionCategory =
  | "HARD_CONSTRAINT_REJECTED"
  | "PASSED_HARD_BUT_LOW_SPECTRAL_SUPPORT"
  | "PASSED_HARD_WITH_MULTI_MODAL_SUPPORT"
  | "INCONCLUSIVE_INSUFFICIENT_EVIDENCE";

export interface CarbonEnvironment {
  id: string;
  atomId?: string;
  atomIndices?: number[];
  equivalentCarbonCount?: number;
  chemicalShift?: number;
  predictedDeltaPpm?: number;
  uncertaintyPpm?: number;
  shiftPpm: number;
  expectedRange: [number, number];
  regionCategory: string;
  deptType: "C" | "CH" | "CH2" | "CH3" | "Unknown";
  carbonType?: CarbonEnvironmentType;
  hybridization?: "sp" | "sp2" | "sp3" | "unknown";
  chemicalEnvironmentClass?: string;
  assignment: string;
  environment?: string;
  equivalenceClass?: string;
  appliedCorrections?: NMRShiftCorrectionTerm[];
  solventApplied?: NMRSolvent;
  isQuaternarySlowRelaxation?: boolean;
  relaxationAndNoeNote?: string;
  deptCompatibility?: {
    dept90Visible: boolean;
    dept135Phase: "UP_CH_CH3" | "DOWN_CH2" | "ABSENT_QUATERNARY_C";
  };
  literatureSources?: NMRLiteratureReference[];
  dataNature?: NMRDataNature;
  confidenceLevel?: "HIGH" | "MEDIUM" | "LOW";
  identifiedImpurityOrSolvent?: {
    name: string;
    role: SignalRole;
    literatureShiftPpm: number;
    citationDoi: string;
    explanationZh: string;
  };
  source?: "IMAGE" | "NUMERIC" | "IMAGE_ESTIMATED" | "NUMERIC_EXACT";
  detectionSource?: SignalDetectionSource;
  modelType: ModelType;
  confidence: number;
  inferenceLevel?: InferenceLevel;
  alternativeExplanations?: string[];
  competingHypotheses?: CompetingHypothesisRecord[];
}

export interface Carbon13SummaryAnalysis {
  uniqueCarbonCount: number;
  observedSignalCount: number;
  expectedTheoreticalEnvironments: number | null;
  environments: CarbonEnvironment[];
  symmetryAndOverlapNote: string;
  limitationsNote: string;
  quaternaryRelaxationNote?: string;
  solventExcludedCount?: number;
}

export interface CandidateNMRConsistencyAnalysis {
  protonCountConsistent?: boolean;
  ExchangeableProtonExplanation?: string | null;
  c13SignalCountConsistent?: boolean;
  chemicalShiftConsistencyScore?: number;
  multiplicityConsistencyScore?: number;
  consistencyNotes?: string[];
  penalties?: string[];
  overallStatus?:
    | "CONSISTENT"
    | "COMPATIBLE_WITH_MINOR_DEVIATIONS"
    | "STRUCTURAL_CONTRADICTION";
  overallScore?: number;
  experimentalToCandidateSignalMappings: {
    experimentalShiftPpm: number;
    candidateAtomGroup: string;
    candidatePredictedShiftPpm: number;
    shiftDifferencePpm: number;
    isWithinUncertainty: boolean;
    multiplicityCompatible: boolean;
    integrationCompatible: boolean;
    noteZh: string;
  }[];
  candidateExpectedSignalCoverage?: number;
  protonIntegrationConsistency: {
    status: string;
    computedTotalH: number;
    computedCarbonAttachedH: number;
    computedExchangeableH: number;
    observedIntegratedH: number | null;
    explanationZh: string;
  };
  splittingAndJCouplingConsistency?: {
    isConsistent: boolean;
    matchedSpinSystems: string[];
    conflictingSpinSystems: string[];
    summaryZh: string;
  };
  carbonSymmetryAndCountConsistency: {
    expectedUniqueCarbons: number;
    observedRealCarbons: number;
    quaternaryCarbonsCount: number;
    isConsistent: boolean;
    explanationZh: string;
  };
  missingExpectedSignals: {
    modality: "1H_NMR" | "13C_NMR";
    predictedShiftPpm: number;
    expectedGroupLabel: string;
    canBeExplainedByExchangeOrOverlapOrRelaxation: boolean;
    explanationZh: string;
    isHardConflict: boolean;
  }[];
  extraExperimentalSignals: {
    modality: "1H_NMR" | "13C_NMR";
    observedShiftPpm: number;
    likelyOrigin:
      | "RESIDUAL_SOLVENT"
      | "WATER_HDO"
      | "TRACE_IMPURITY"
      | "UNEXPLAINED_SIGNAL";
    explanationZh: string;
  }[];
  minorDeviations?: string[];
  structuralContradictions: string[];
  smiles?: string;
  solventUsed?: NMRSolvent;
  spectrometerFrequencyMHz?: number;
  predictedH1Environments?: ProtonEnvironment[];
  predictedC13Environments?: CarbonEnvironment[];
  h1ShiftCompatibilityScore?: number | null;
  h1IntegralCompatibilityScore?: number | null;
  h1CouplingCompatibilityScore?: number | null;
  h1OverallScore?: number | null;
  c13CountAndSymmetryScore?: number | null;
  c13ShiftAndRegionScore?: number | null;
  c13DeptAndQuaternaryScore?: number | null;
  c13OverallScore?: number | null;
  solventAndExchangeableNote?: string;
  quaternaryCarbonAssessment?: string;
  matchedSignalPairsH1?: {
    predictedShift: number;
    observedShift: number;
    deltaPpm: number;
    predictedProtons: number;
    observedIntegral: number | null;
    predictedMultiplicity: string;
    observedMultiplicity: string | null;
    assignment: string;
    status: "MATCHED" | "SHIFTED_TOLERABLE" | "MISMATCH";
  }[];
  matchedSignalPairsC13?: {
    predictedShift: number;
    observedShift: number | null;
    deltaPpm: number | null;
    predictedDept: string;
    observedDept: string;
    isQuaternary: boolean;
    assignment: string;
    status:
      | "MATCHED"
      | "SHIFTED_TOLERABLE"
      | "MISSING_QUATERNARY_TOLERATED"
      | "MISSING_CONFLICT";
  }[];
  supportingReasons?: string[];
  contradictingReasons?: string[];
  uncertaintyReasons?: string[];
}

export interface MolecularFormulaCandidate {
  formula: string;
  neutralExactMass: number;
  theoreticalIonMz: number;
  observedIonMz: number;
  adductLabel: string;
  massErrorDa: number;
  massErrorPpm: number;
  dbe: number;
  nitrogenRuleValid: boolean;
  isotopeCompatibility: "High" | "Moderate" | "Low" | "Not evaluated";
  halogenSignatureMatch: string;
  score: number;
  notes: string;
}

export type MSFragmentationMechanismCategory =
  | "α-cleavage"
  | "Benzylic cleavage"
  | "McLafferty"
  | "Charge-directed fragmentation"
  | "Retro-Diels-Alder"
  | "Radical / Homolytic cleavage"
  | "Surface Fragmentation";

export interface MSFragmentAnalysis {
  mz: number;
  relativeIntensity: number;
  ionType:
    | "分子離子 [M]+•"
    | "質子化分子離子 [M+H]+"
    | "去質子化離子 [M-H]-"
    | "加合離子 Adduct"
    | "基峰 Base Peak"
    | "同位素峰 Isotope Peak"
    | "裂解碎片離子 Fragment Ion"
    | "前驅離子 Precursor Ion"
    | "ToF-SIMS 特徵二次離子";
  formulaSuggestion: string;
  exactMass?: number;
  chargeState?: number;
  mechanismCategory?: MSFragmentationMechanismCategory;
  neutralLossFromParent?: number;
  neutralLossIdentity?: string;
  cleavagePathway: string;
  structuralCompatibility: "High" | "Moderate" | "Low";
  modelType: ModelType;
  confidence: number;
}

export interface MSComprehensiveAnalysis {
  msType: MSType;
  ionization: IonizationMode;
  modelType: ModelType;
  molecularIonCandidateMz: number | null;
  precursorIonMz: number | null;
  basePeakMz: number;
  estimatedNominalMw: number | null;
  exactMassEstimate: number | null;
  isNominalMassOnly: boolean;
  nominalMassWarning?: string;
  chargeState?: number;
  adductLabel?: string;
  ionizationPhysicsSummary?: {
    modeLabel: "EI / GC-MS" | "ESI+" | "ESI-" | "APCI" | "ToF-SIMS";
    electronParity:
      | "Odd-Electron Radical Ion (OE+•)"
      | "Even-Electron Quasi-Molecular Ion (EE+ / EE-)"
      | "Surface Secondary Ion Cluster";
    typicalSpecies: string[];
    fragmentationRegime: string;
  };
  candidateFormulas: MolecularFormulaCandidate[];
  isotopePatternSummary: {
    hasChlorineSignature: boolean;
    hasBromineSignature: boolean;
    hasSulfurOrSiliconSignature: boolean;
    estimatedCarbonCountFromMPlus1: number | null;
    description: string;
  };
  fragments: MSFragmentAnalysis[];
  msmsPathways: {
    precursorMz: number;
    productMz: number;
    neutralLossDa: number;
    neutralLossFormula: string;
    mechanismCategory?: MSFragmentationMechanismCategory;
    cleavageMechanism: string;
    candidateCompatibility: string;
    likelihood: "高可能性候選路徑" | "中度可能性候選路徑" | "次要裂解路徑";
  }[];
  tofSimsAnalysis?: {
    polarity: "Positive" | "Negative";
    primaryIon: string;
    primaryIonEnergyKeV: number;
    ionDoseRegime: string;
    substrateMaterial: string;
    surfaceMatrixNote?: string;
    expectedIonFamilies: string[];
    surfaceFragmentationSummary?: string;
    conditionEffectSummary: string;
    conditionWarning: string;
  };
  evidence: EvidenceItem[];
}

export interface StructureIntegrityReport {
  smilesSyntaxValid: boolean;
  hasMolecularFormula: boolean;
  exactMassValid: boolean;
  molecularWeightValid: boolean;
  dbeValid: boolean;
  formalCharge: number;
  elementCompositionValid: boolean;
  isFormulaOnly: boolean;
  hasVerifiableConnectivity: boolean;
  pubchemVerified: boolean;
  isInternalKnownCompound: boolean;
  disconnectedComponentsCount: number;
  ringClosureCount: number;
  aromaticAtomCount: number;
  ringSubstitutionTopology:
    | "1,4-para"
    | "1,2-ortho"
    | "1,3-meta"
    | "monosubstituted"
    | "polysubstituted"
    | "non-aromatic"
    | "unknown"
    | "PARA_DISUBSTITUTED"
    | "MONO_SUBSTITUTED";
  statusSummaryZh: string;
  integritySummaryZh?: string;
}

export interface ParsedChemicalStructure {
  name: string;
  smiles: string; // Empty string if only Molecular Formula or unverified InChI is provided!
  rawInput?: string;
  inchi?: string;
  molecularFormula: string;
  molecularWeight: number;
  nominalMass?: number;
  exactMass: number;
  dbe: number;
  unsaturationIndex?: number;
  isValid?: boolean;
  validationErrors?: string[];
  formalCharge?: number;
  atomCounts: Record<string, number>;
  detectedFunctionalGroups: string[];
  symmetryFactor: string;
  uniqueProtonEnvironmentsCount: number | null;
  uniqueCarbonEnvironmentsCount: number | null;
  isFormulaOnly?: boolean;
  hasVerifiableConnectivity?: boolean;
  formulaIsomerWarning?: string;
  parseFailed?: boolean;
  parseErrorMessage?: string;
  parserAdapterStatus?: string;
  integrity?: StructureIntegrityReport;
  structureIntegrity?: StructureIntegrityReport;
  pubchemCid?: number;
  pubchemUrl?: string;
  pubchemStatus?: "SUCCESS" | "NOT_FOUND" | "API_ERROR" | "NOT_QUERIED";
  pubchemMessage?: string;
  iupacName?: string;
  sourceMethod:
    | "SMILES"
    | "InChI"
    | "Molecular Formula"
    | "Structure Sketch"
    | "Structure Image";
}

export type CandidateOriginCategory =
  | "[Generated Candidate]"
  | "[Known Library Candidate]"
  | "[AI Candidate]"
  | "[Reference Match]";

export interface CandidateValidationReport {
  structureParserValid: boolean;
  formulaMatch: boolean;
  exactMassMatch: boolean;
  dbeMatch: boolean;
  functionalGroupCompatibility: number | "Not Available";
  irCompatibility: number | "Not Available";
  h1NmrCompatibility: number | "Not Available";
  c13NmrCompatibility: number | "Not Available";
  msCompatibility: number | "Not Available";
  msmsCompatibility: number | "Not Available";
  structuralValidityScore: number;
  contradictionCount: number;
  validationSummaryZh: string;
}

export interface TieredConfidenceMetrics {
  functionalGroupConfidence: number; // 0 - 100
  formulaConfidence: number; // 0 - 100
  substructureConfidence: number; // 0 - 100
  connectivityConfidence: number; // 0 - 100
  structureConfidence: number; // 0 - 100
}

export interface ModalityEvaluationDetail {
  modality?: SpectrumModality;
  isProvided?: boolean;
  available?: boolean;
  score: number;
  maxScore?: number;
  status:
    | "SUPPORTED"
    | "PARTIAL"
    | "CONTRADICTED"
    | "NOT_PROVIDED"
    | "CONSISTENT"
    | "COMPATIBLE"
    | "PARTIAL_CONFLICT"
    | "MAJOR_CONFLICT";
  matchedFeatures: string[];
  missingExpectedFeatures?: string[];
  contradictions?: string[];
  conflictingFeatures?: string[];
  summary?: string;
  evidenceIds?: string[];
}

export interface CandidateScoreBreakdown {
  totalScore: number;
  formulaScore?: number;
  dbeScore?: number;
  h1ShiftScore?: number;
  h1IntegrationScore?: number;
  h1MultiplicityScore?: number;
  h1SymmetryScore?: number;
  c13CountScore?: number;
  c13RegionScore?: number;
  irFunctionalGroupScore?: number;
  irExclusionPenalty?: number;
  heteroaromaticBonus?: number;
  unsaturationScore?: number;
  functionalGroupScore?: number;
  irMatchScore?: number | null;
  nmr1HMatchScore?: number | null;
  nmr13CMatchScore?: number | null;
  msMatchScore?: number | null;
  crossSpectrumBonus?: number;
  consistencyBonus?: number;
  contradictionPenalty?: number;
  conflictPenalty?: number;
  modalityDetails?: Partial<Record<SpectrumModality, ModalityEvaluationDetail>>;
}

export interface CandidateConstraintSatisfaction {
  hardConstraintPassed: boolean;
  satisfiedConstraints: string[];
  violatedConstraints: string[];
  rejectionReasons: string[];
}

export interface CandidateStructure {
  scientificScoreLedger?: import('../engines/scientificEngines/evidenceLedger').CandidateScoreLedger;
  scoreMeaning?: 'UNCALIBRATED_COMPATIBILITY';
  nmrConsistencyAnalysis?: CandidateNMRConsistencyAnalysis;
  rank: number;
  id: string;
  name: string;
  iupacName: string;
  smiles: string;
  molecularFormula: string;
  molecularWeight?: number;
  exactMass?: number;
  dbe?: number;
  unsaturationIndex?: number;
  structuralClass?: string;
  keyStructuralFeatures?: string[];
  functionalGroups?: string[];
  structuralMotifs?: string[];
  scaffoldType?: string;
  sourceConstraints?: string[];
  confidence?: number; // 0 - 95
  tieredConfidence?: TieredConfidenceMetrics;
  overallScore?: number; // 0 - 99
  finalScore?: number;
  evidenceLevel?: OverallEvidenceLevel;
  modelType?: ModelType;
  certaintyLabel?: CertaintyCategory;
  candidateOrigin?: CandidateOriginCategory;
  generationMethodLabel?: string;
  sourceProvenance?: string;
  candidateStructure?: ParsedChemicalStructure;
  graphValidationResult?: {
    isValid: boolean;
    isConnected: boolean;
    isRingClosureBalanced: boolean;
    allValencesValid: boolean;
    computedFormula: string;
    computedDBE: number;
    ringCount: number;
    heavyAtomCount: number;
    errors: string[];
  };
  constraintSatisfaction?: CandidateConstraintSatisfaction;
  hardConstraintPassed?: boolean;
  evidenceSupport?: string[];
  irScore?: number | null;
  h1NmrScore?: number | null;
  c13NmrScore?: number | null;
  msScore?: number | null;
  spectrumConsistencyScore?: number;
  contradictionPenalty?: number;
  crossSpectrumScore?: number;
  rejectionReasons?: string[];
  violatedConstraints?: string[];
  validationReport?: CandidateValidationReport;
  modalityScores?: {
    formulaAndMass?: number | "Not Available";
    functionalGroup?: number | "Not Available";
    ir?: number | "Not Available";
    h1Nmr?: number | "Not Available";
    c13Nmr?: number | "Not Available";
    ms?: number | "Not Available";
    msms?: number | "Not Available";
    tofSims?: number | "Not Available";
    structuralValidity?: number;
  };
  supportingEvidence?: (string | EvidenceReference)[];
  contradictingEvidence?: string[];
  missingEvidence?: string[];
  supportingReasons: string[];
  contradictingReasons: string[];
  missingExpectedFeatures?: string[];
  missingDataNotes?: string[];
  verificationSteps?: string[];
  unknownEvidence?: string[];
  evidenceProvenanceByModality?: Partial<
    Record<"IR" | "H1_NMR" | "C13_NMR" | "MS" | "MSMS" | "TOF_SIMS", string[]>
  >;
  recommendedExperiments?: string[];
  pubchemCid?: number;
  pubchemUrl?: string;
  nameZh?: string;
  formulaCompatibleOnly?: boolean;
  isFormulaCompatibleOnly?: boolean;
  confirmedByNmr?: boolean;
  confirmationStatusLabel?: string;
  computedFormula?: string;
  targetFormula?: string | null;
  formulaMatch?: boolean | "NOT_SPECIFIED";
  hardValidation?: CandidateHardValidationResult;
  protonConsistencyReport?: CandidateProtonConsistencyReport;
  nmrScientificConsistency?: CandidateNMRConsistencyAnalysis;
  dispositionCategory?: CandidateDispositionCategory;
  scoreBreakdown: CandidateScoreBreakdown;
}

export type CandidateResult = CandidateStructure;

export interface ExpectedStructureVerificationResult {
  structure: ParsedChemicalStructure;
  irCompatibility: number | null;
  h1NmrCompatibility: number | null;
  c13NmrCompatibility: number | null;
  msCompatibility: number | null;
  msmsCompatibility: number | null;
  tofSimsCompatibility: number | null;
  overallCompatibility: number;
  verdict: string;
  supportingEvidence: string[];
  conflictingEvidence: string[];
  unknownOrMissingEvidence: string[];
  matchedFeatures: {
    modality: SpectrumModality;
    feature: string;
    detail: string;
  }[];
  unmatchedFeatures: {
    modality: SpectrumModality;
    feature: string;
    detail: string;
  }[];
  missingPeaks: {
    modality: SpectrumModality;
    expectedPosition: string;
    assignment: string;
  }[];
  unexpectedPeaks: {
    modality: SpectrumModality;
    observedPosition: string;
    likelyCause: string;
  }[];
  potentialExperimentalProblems: string[];
}

export interface PredictedSpectrumBundle {
  structure: ParsedChemicalStructure;
  modelMetadataList: TheoreticalModelMetadata[];
  computationalStatus: string;
  backendNotice: string;
  ir: ExperimentalSpectrumData;
  h1Nmr: ExperimentalSpectrumData;
  c13Nmr: ExperimentalSpectrumData;
  ms: ExperimentalSpectrumData;
  msms?: ExperimentalSpectrumData;
  tofSims?: ExperimentalSpectrumData;
  irPredictions: IRFunctionalGroupFinding[];
  irExpectedBands?: IRFunctionalGroupFinding[];
  h1Predictions: ProtonEnvironment[];
  h1ExpectedEnvironments?: ProtonEnvironment[];
  c13Predictions: CarbonEnvironment[];
  c13ExpectedEnvironments?: CarbonEnvironment[];
  msPredictions: MSComprehensiveAnalysis;
  msExpectedFragments?: MSFragmentAnalysis[];
  evidenceList: EvidenceItem[];
}

export interface SpectralComparisonMetrics {
  modality: SpectrumModality;
  comparisonTitle: string;
  matchedPeakCount: number;
  totalPredictedPeaks: number;
  peakAgreementPercent: number;
  meanPositionError: number;
  weightedResidual: number;
  positionUnit: string;
  relativeIntensityDiffPercent: number;
  cosineSimilarity: number;
  alignmentApplied: string;
}

export interface EvidenceConfidenceBreakdown {
  dataQualityScore: number;
  modelConfidenceScore: number;
  crossSpectrumAgreementScore: number;
  referenceMatchScore: number;
  structuralConsistencyScore: number;
  functionalGroupConfidence?: number;
  formulaConfidence?: number;
  substructureConfidence?: number;
  connectivityConfidence?: number;
  structureConfidence?: number;
  tieredConfidence?: TieredConfidenceMetrics;
  overallEvidenceLevel: OverallEvidenceLevel;
  overallEvidenceLabelZh: string;
  canUniquelyConfirmStructure: boolean;
  summaryExplanation: string;
  confidenceSemantics?: {
    experimentalMatchVsModelPrediction: string;
    formulaConstraintVsStructureConstraint: string;
    spectralConsistencyVsReferenceData: string;
  };
}

export type StructuralConstraintsSource =
  | "IR"
  | "1H_NMR"
  | "13C_NMR"
  | "H1_NMR"
  | "C13_NMR"
  | "MS"
  | "HRMS"
  | "MSMS"
  | "MS/MS"
  | "TOF_SIMS"
  | "ToF-SIMS"
  | "USER"
  | "FORMULA_ONLY"
  | "MULTI_MODAL"
  | "CROSS_VALIDATION";

export interface EvidenceReference {
  id?: string;
  modality: StructuralConstraintsSource;
  canonicalModality?:
    | "IR"
    | "H1_NMR"
    | "C13_NMR"
    | "MS"
    | "MSMS"
    | "TOF_SIMS"
    | "FORMULA"
    | "CHEMICAL_NOTES";
  observation?: string;
  description?: string;
  interpretation?: string;
  constraintSummary?: string;
  modelType?: ModelType;
  confidence: number; // 0 - 100
  sourcePeakId?: string;
  signalPosition?: number;
  unit?: string;
  ruleReference?: string;
}

export interface MolecularFormulaConstraint {
  candidates: MolecularFormulaCandidate[];
  lockedFormula?: string;
  exactMass?: number | null;
  nominalMass?: number | null;
  minCarbonCount?: number;
  maxCarbonCount?: number;
  confidence: number; // 0 - 100
}

export interface MassConstraint {
  nominalMw?: number | null;
  exactMass?: number | null;
  observedIonMz?: number | null;
  adductLabel?: string;
  toleranceDa?: number;
  isHighResolution: boolean;
  confidence: number; // 0 - 100
}

export interface DBEConstraint {
  exactValues?: number[];
  exactDbeCandidates?: number[];
  minDbe?: number;
  maxDbe?: number;
  allowsAromaticRing: boolean;
  allowsCarbonylOrUnsaturation: boolean;
  confidence: number; // 0 - 100
}

export interface FunctionalGroupConstraint {
  groupFamily: string;
  groupName?: string;
  label: string;
  status:
    | "REQUIRED"
    | "PROBABLE"
    | "CANDIDATE"
    | "EXCLUDED"
    | "POSSIBLE"
    | "SUPPORTED"
    | "CONFLICTING"
    | "FORBIDDEN";
  observedSignal?: string;
  expectedRange?: string;
  sourceModality: StructuralConstraintsSource;
  sourceModalities?: SpectrumModality[];
  confidence: number; // 0 - 100
  reasoning?: string;
  notes?: string;
  evidenceIds?: string[];
}

export interface StructuralMotifConstraint {
  motifId: string;
  motifLabel: string;
  motif?: string;
  description?: string;
  smilesFragmentHint?: string;
  status: "REQUIRED" | "PROBABLE" | "EXCLUDED";
  sourceModality: StructuralConstraintsSource;
  source?: string;
  supportingObservation: string;
  confidence: number; // 0 - 100
  evidenceIds?: string[];
}

export interface AromaticityConstraint {
  status: "PRESENT" | "ABSENT" | "POSSIBLE" | "UNKNOWN";
  substitutionPatternHint?:
    | "1,4-para"
    | "1,2-ortho"
    | "1,3-meta"
    | "monosubstituted"
    | "disubstituted-general"
    | "polysubstituted"
    | "unknown";
  supportingSignals: string[];
  confidence: number; // 0 - 100
}

export interface CarbonylConstraint {
  status: "PRESENT" | "ABSENT" | "POSSIBLE" | "UNKNOWN";
  allowedSubtypes: (
    | "Aldehyde"
    | "Ketone"
    | "Ester"
    | "Carboxylic acid"
    | "Amide"
  )[];
  excludedSubtypes?: (
    | "Aldehyde"
    | "Ketone"
    | "Ester"
    | "Carboxylic acid"
    | "Amide"
  )[];
  supportingSignals: string[];
  confidence: number; // 0 - 100
}

export interface HeteroAtomConstraint {
  supportingSignals?: string[];
  element: "O" | "N" | "S" | "P" | "F" | "Cl" | "Br" | "I" | "Si";
  status: "REQUIRED" | "PROBABLE" | "POSSIBLE" | "EXCLUDED";
  minCount?: number;
  maxCount?: number;
  supportingObservation: string;
  confidence: number; // 0 - 100
}

export interface ProtonEnvironmentConstraint {
  isExchangeable?: boolean;
  shiftPpm: number;
  expectedRange: [number, number];
  integration: number | null;
  relativeIntensity?: number;
  multiplicity: string | null;
  jCouplingHz: number[];
  environmentLabel: string;
  source?: string;
  confidence: number; // 0 - 100
}

export interface CarbonEnvironmentConstraint {
  shiftPpm: number;
  expectedRange: [number, number];
  deptType: "C" | "CH" | "CH2" | "CH3" | "Unknown";
  carbonType?: CarbonEnvironmentType;
  regionCategory: string;
  assignment: string;
  source?: string;
  confidence: number; // 0 - 100
}

export interface ConnectivityConstraint {
  fromMotif: string;
  toMotif: string;
  relationship: "DIRECT_BOND" | "SPIN_COUPLED" | "ALPHA_CLEAVAGE_ADJACENT";
  supportingObservation: string;
  confidence: number; // 0 - 100
}

export interface IsotopeConstraint {
  hasBromine: boolean;
  hasChlorine: boolean;
  hasSiliconOrSulfur: boolean;
  estimatedCarbonCountFromMPlus1?: number | null;
  description: string;
  confidence: number; // 0 - 100
}

export interface FragmentationConstraint {
  ionMz?: number;
  neutralLossDa?: number;
  formulaOrLossIdentity: string;
  mechanismNote: string;
  sourceModality: "MS" | "MSMS" | "TOF_SIMS";
  confidence: number; // 0 - 100
}

export interface StructuralScaffoldCandidate {
  scaffoldId: string;
  nameZh: string;
  nameEn: string;
  category:
    | "aromatic_ring"
    | "heteroaromatic_ring"
    | "carbonyl_compound"
    | "nitrile_alkyne"
    | "bicyclic_ring"
    | "aliphatic_unsaturated"
    | "saturated_acyclic_or_alicyclic"
    | "AROMATIC"
    | "HETEROAROMATIC"
    | "BICYCLIC"
    | "ACYCLIC_UNSATURATED"
    | "ALICYCLIC";
  smilesTemplate?: string;
  dbeRequired: number;
  plausibilityScore: number; // 0 - 100
  rationaleZh: string;
  matchedEvidenceIds: string[];
}

export interface HeteroaromaticConstraint {
  status: "PRESENT" | "POSSIBLE" | "ABSENT" | "UNKNOWN";
  ringTypes?: (
    | "pyridine"
    | "pyrimidine"
    | "pyrazine"
    | "pyridazine"
    | "pyrrole"
    | "indole"
    | "quinoline"
    | "isoquinoline"
    | "furan"
    | "thiophene"
    | "PYRIDINE"
    | "PYRIMIDINE"
    | "PYRAZINE"
    | "PYRIDAZINE"
    | "PYRROLE"
    | "INDOLE"
    | "QUINOLINE"
    | "ISOQUINOLINE"
    | "FURAN"
    | "THIOPHENE"
  )[];
  preferredRingTypes?: (
    | "pyridine"
    | "pyrimidine"
    | "pyrazine"
    | "pyridazine"
    | "pyrrole"
    | "indole"
    | "quinoline"
    | "isoquinoline"
    | "furan"
    | "thiophene"
    | "PYRIDINE"
    | "PYRIMIDINE"
    | "PYRAZINE"
    | "PYRIDAZINE"
    | "PYRROLE"
    | "INDOLE"
    | "QUINOLINE"
    | "ISOQUINOLINE"
    | "FURAN"
    | "THIOPHENE"
  )[];
  alphaToNitrogenProtonCount?: number;
  symmetryType?: string;
  symmetryHint?: string;
  supportingSignals: string[];
  confidence: number; // 0 - 100
}

export interface NMRSubstructureConstraint {
  motif: string;
  fragmentType?: string;
  description: string;
  sourceModality: "1H_NMR" | "13C_NMR";
  chemicalShiftPpm: number;
  multiplicity?: string;
  integral?: number;
  jCouplingHz?: number[];
  confidence: number;
  evidenceIds: string[];
}

export interface StructuralConstraints {
  molecularFormula?: MolecularFormulaConstraint;
  userSuppliedFormula?: {
    rawInput: string;
    normalizedFormula: string;
    atomCounts: Record<string, number>;
    exactMass: number;
    nominalMass: number;
    ihd: number;
    nitrogenCount?: number;
    nitrogenParity?: "ODD_MW" | "EVEN_MW";
    nitrogenRuleConstraint?: string;
    allowedElementsSummary?: string;
    isValid?: boolean;
    isSupported?: boolean;
    validationErrors?: string[];
    validationWarnings?: string[];
    sourceType: "USER_FORMULA_INPUT";
  };
  userSuppliedFormulaValidation?: CandidateHardValidationResult;
  formulaNotSpecifiedByUser?: boolean;
  h1IntegrationSemantics?: H1NMRIntegrationSummary;
  userChemicalNotes?: string;
  exactMass?: MassConstraint;
  molecularMassConstraint?: MassConstraint;
  dbe?: DBEConstraint;
  inferredScaffolds?: StructuralScaffoldCandidate[];
  heteroaromaticConstraints?: HeteroaromaticConstraint;
  heteroaromatic?: HeteroaromaticConstraint;
  requiredFunctionalGroups?: FunctionalGroupConstraint[];
  excludedFunctionalGroups?: FunctionalGroupConstraint[];
  functionalGroups?: FunctionalGroupConstraint[];
  substructures?: NMRSubstructureConstraint[];
  requiredSubstructures?: StructuralMotifConstraint[];
  preferredSubstructures?: (StructuralMotifConstraint | string)[];
  excludedSubstructures?: StructuralMotifConstraint[];
  aromaticity?: AromaticityConstraint;
  aromaticSubstitutionPattern?:
    | "MONO"
    | "ORTHO"
    | "META"
    | "PARA"
    | "POLYSUBSTITUTED"
    | "NONE"
    | "UNKNOWN"
    | string
    | null;
  unsaturationEstimateRange?: [number, number] | null;
  estimatedMolecularWeight?: number | null;
  nitrogenRuleParity?: "ODD" | "EVEN" | "UNKNOWN";
  estimatedProtonCount?: number | null;
  estimatedCarbonEnvironmentCount?: number | null;
  symmetryHint?: string | null;
  carbonyl?: CarbonylConstraint;
  heteroAtoms?: HeteroAtomConstraint[];
  protonEnvironments?: ProtonEnvironmentConstraint[];
  protonNMR?: {
    totalIntegratedProtons?: number;
    couplingPatterns?: string[];
    confidence?: number;
  };
  carbonEnvironments?: CarbonEnvironmentConstraint[];
  carbonNMR?: {
    observedSignalCount?: number;
    hasAromaticCarbons?: boolean;
    hasHeteroaromaticCarbons?: boolean;
    hasCarbonylCarbons?: boolean;
    symmetryHint?: string;
    confidence?: number;
  };
  connectivityConstraints?: ConnectivityConstraint[];
  isotopeConstraints?: IsotopeConstraint;
  fragmentationConstraints?: FragmentationConstraint[];
  source?: StructuralConstraintsSource;
  contributingSources?: StructuralConstraintsSource[];
  crossModalNotes?: string[];
  confidence?: number; // 0 - 100
  evidence?: EvidenceReference[];
}

export interface CandidateGenerator {
  generate(constraints: StructuralConstraints): CandidateStructure[];
}

export type ChemicalFeatureStatus =
  | "SUPPORTED"
  | "POSSIBLE"
  | "WEAK"
  | "CONTRADICTED"
  | "UNKNOWN / NOT OBSERVED";

export type EvidenceMatrixCellSymbol = "+" | "?" | "-" | "NOT PROVIDED";

export interface SupportingSignalRecord {
  modality: SpectrumModality | "MS/MS" | "ToF-SIMS";
  sourceType?: SpectrumSourceType;
  evidenceQuality?: EvidenceQuality;
  position?: number;
  positionConfidence?: number;
  signalLabel: string;
  directObservation?: string;
  observedValue?: string;
  interpretation: string;
  candidateMechanism?: string;
  provenance?: ModelType;
  confidence: number; // 0.0 - 1.0
}

export type EvidenceSpectrumSource =
  | "IR"
  | "H1_NMR"
  | "C13_NMR"
  | "MS"
  | "MSMS"
  | "TOF_SIMS";

export type EvidenceSupportLevel = "STRONG" | "MODERATE" | "WEAK";

export type EvidenceMethodType =
  | "THEORETICAL"
  | "EMPIRICAL"
  | "REFERENCE_BASED"
  | "HEURISTIC"
  | "QUANTUM_BACKEND";

export interface EvidenceProvenance {
  source: EvidenceSpectrumSource | "MULTI_MODAL";
  sourceType?: SpectrumSourceType;
  dataQuality?: ExperimentalDataQuality;
  evidenceQuality?: EvidenceQuality;
  dataReliabilityLevel?: DataReliabilityLevel;
  fileName?: string;
  calibrationConfidence?: number;
  originalSignalId?: string;
  model: string;
  modelVersion: string;
  basis: string;
  method: EvidenceMethodType | string;
  isTheoretical: boolean;
  isEmpirical: boolean;
  isReferenceBased: boolean;
  isHeuristic: boolean;
  isQuantumBackend: boolean;
  confidence: number; // 0.0 - 1.0
}

export interface ChemicalFeatureEvidence {
  id?: string;
  sourceType?: SpectrumSourceType;
  evidenceQuality?: EvidenceQuality;
  position?: number;
  positionConfidence?: number;
  featureType?: string;
  feature?: string;
  value?: string | number;
  unit?: string;
  supportLevel?: EvidenceSupportLevel;
  uncertainty?: number; // 0.0 - 1.0
  provenance?: EvidenceProvenance;
  scientificBasis?: string;
  featureId: string;
  featureKey:
    | "CARBONYL"
    | "ALDEHYDE"
    | "KETONE"
    | "ESTER"
    | "CARBOXYLIC_ACID"
    | "AMIDE"
    | "AROMATIC_SYSTEM"
    | "PARA_DISUBSTITUTED_RING"
    | "PARA_DISUBSTITUTED_BENZENE"
    | "MONOSUBSTITUTED_BENZENE"
    | "ORTHO_OR_META_BENZENE"
    | "ALCOHOL_OR_PHENOL"
    | "HYDROXYL_OR_PHENOL"
    | "AMINE"
    | "NITRILE"
    | "ETHER_OR_ALKOXY"
    | "HALOGEN_BROMINE"
    | "HALOGEN_CHLORINE"
    | "SILOXANE_MOTIF"
    | "SILOXANE_OR_ORGANOSILICON"
    | "ALIPHATIC_CHAIN"
    | "HETEROAROMATIC_RING"
    | "HETEROAROMATIC_SYSTEM"
    | "PYRIDINE_RING"
    | "PYRROLE_OR_INDOLE_RING"
    | "FURAN_OR_THIOPHENE_RING"
    | "ALKYNE"
    | "NITRO"
    | "SULFONYL"
    | "ANHYDRIDE"
    | "ACYL_CHLORIDE";
  featureName: string;
  category:
    | "Functional Group"
    | "Structural Motif"
    | "Element / Isotope"
    | "Carbon Skeleton";
  sourceSpectrum: (
    | SpectrumModality
    | "MS/MS"
    | "ToF-SIMS"
    | "H1_NMR"
    | "C13_NMR"
    | "MSMS"
    | "TOF_SIMS"
  )[];
  supportingSignals: SupportingSignalRecord[];
  contradictingSignals: SupportingSignalRecord[];
  interpretation: string;
  possibleFunctionalGroups: string[];
  possibleStructuralMotifs: string[];
  confidence: number; // 0.0 - 1.0
  evidenceStrength: "Strong" | "Moderate" | "Suggestive" | "Weak";
  contradictions: string[];
  limitations: string[];
  status: ChemicalFeatureStatus | "UNKNOWN" | "NOT_PROVIDED";
  provenanceType: ModelType;
  inferenceLevel?: InferenceLevel;
  alternativeExplanations?: string[];
  competingHypotheses?: CompetingHypothesisRecord[];
  sourceSignalKey?: string;
}

/**
 * Unified SpectrumEvidence Object (Sections 十四, 十五, 三十一, 三十六)
 * Peak -> Observation -> Chemical interpretation -> Evidence -> Constraint -> Candidate -> Validation
 */
export interface SpectrumEvidence {
  id: string;
  sourceId?: string;
  sourceSpectrum?: ExtendedSpectrumModality | "FORMULA" | "CHEMICAL_NOTES";
  spectrumType?: ExtendedSpectrumModality | "FORMULA" | "CHEMICAL_NOTES";
  evidenceCategory?:
    | "EXPERIMENTAL_SPECTRUM"
    | "CHEMICAL_FORMULA_EVIDENCE"
    | "USER_CHEMICAL_INFO"
    | "DERIVED_ANALYSIS"
    | "PREDICTED_SPECTRUM";
  peakId?: string;
  peakPosition?: string | number;
  peakRange?: string | [number, number];
  intensity?: string | number;
  shape?: string;
  multiplicity?: string;
  integral?: number;
  shapeOrMultiplicity?: string;
  inferredGroup?: string;
  chemicalMeaning?: string;
  ruleApplied?: string;
  direction?: "SUPPORTING" | "CONTRADICTING" | "INCONCLUSIVE";
  dataQualityNote?: string;
  uncertaintyNote?: string;
  scoreImpact?: string;
  requiredOrOptional?: "REQUIRED" | "OPTIONAL" | "EXCLUDED";
  supportingPeakIds?: string[];
  sourcePeakIds?: string[];

  observation?: string;
  interpretation?: string;

  chemicalFeature?: string;
  structuralConstraint?: string;

  status?:
    | "SUPPORTED"
    | "POSSIBLE"
    | "CONTRADICTED"
    | "UNKNOWN"
    | "NOT_PROVIDED";

  confidence: number; // 0 - 100 or 0 - 1

  provenance?: "RULE" | "EMPIRICAL" | "REFERENCE" | "AI";
  scientificProvenance?:
    | "EXPERIMENTAL"
    | "CHEMICAL_FORMULA_EVIDENCE"
    | "USER_CHEMICAL_INFO"
    | "DERIVED_ANALYSIS"
    | "REFERENCE"
    | "EMPIRICAL"
    | "THEORETICAL"
    | "AI_INFERENCE"
    | "SIMULATED";

  reason?: string;

  // Traceability Chain (Observed Peak -> Interpretation -> Functional Group -> Constraint -> Candidate -> Validation)
  evidenceChain?: {
    observedPeak: string;
    interpretation: string;
    functionalGroup: string;
    constraint: string;
    candidateMatch: string;
    validationStatus: string;
  };
}

export interface EvidenceMatrixRow {
  featureKey: ChemicalFeatureEvidence["featureKey"];
  featureNameZh: string;
  status: ChemicalFeatureStatus;
  statusLabelZh: string;
  confidence: number; // 0.0 - 1.0
  cells: {
    IR: EvidenceMatrixCellSymbol;
    "1H_NMR": EvidenceMatrixCellSymbol;
    "13C_NMR": EvidenceMatrixCellSymbol;
    MS: EvidenceMatrixCellSymbol;
    MSMS: EvidenceMatrixCellSymbol;
    TOF_SIMS: EvidenceMatrixCellSymbol;
  };
  supportingSummary: string;
  contradictingSummary: string;
}

export interface StructureConstraint {
  constraintId: string;
  constraintKey:
    | "mustContainCarbonyl"
    | "likelyContainsAromaticRing"
    | "possibleAldehyde"
    | "possibleKetone"
    | "possibleEster"
    | "possibleCarboxylicAcid"
    | "possibleAlcohol"
    | "possibleAmine"
    | "possibleEther"
    | "possibleHalogen"
    | "minimumCarbonCount"
    | "maximumCarbonCount"
    | "DBERange"
    | "molecularFormulaCandidates"
    | "requiredStructuralMotifs"
    | "forbiddenStructuralMotifs";
  constraintType: "Mandatory" | "Probable" | "Candidate" | "Exclusion";
  labelZh: string;
  valueSummary: string;
  sourceModalities: string[];
  evidenceSources: string[];
  confidence: number; // 0.0 - 1.0
  provenanceType: ModelType;
}

export interface EvidenceAccumulationState {
  analysisStatus:
    | "WAITING_FOR_DATA"
    | "PARTIAL_BUT_VALID"
    | "HIGHER_EVIDENCE_COVERAGE";
  analysisStatusLabelZh: string;
  providedModalities: (SpectrumModality | "MS/MS" | "ToF-SIMS")[];
  missingModalities: (SpectrumModality | "MS/MS" | "ToF-SIMS")[];
  chemicalFeatures: ChemicalFeatureEvidence[];
  rawEngineEvidence?: ChemicalFeatureEvidence[];
  modalityStatusMap?: Record<
    EvidenceSpectrumSource,
    "PROVIDED" | "NOT_PROVIDED"
  >;
  evidenceMatrix: EvidenceMatrixRow[];
  structureConstraints: StructureConstraint[];
  unifiedStructuralConstraints?: StructuralConstraints;
  crossSourceValidations?: CrossSourceValidationRecord[];
  currentCandidateScopeZh: string;
  missingInformationSummary: string[];
  dynamicNextStepRecommendations: {
    recommendedModality: string;
    reasonZh: string;
    expectedResolutionGain: string;
    priority: "High" | "Medium" | "Standard";
  }[];
  accumulationHistoryLog: string[];
}

export interface MultiSpectrumAnalysisReport {
  id: string;
  timestamp: string;
  sampleName: string;
  isDemoPreset: boolean;
  singleModalityWarning?: string;
  mode: "MODE_A_SPECTRUM_TO_STRUCTURE" | "MODE_B_STRUCTURE_TO_SPECTRUM";
  subModeA?:
    | "UNKNOWN_STRUCTURE_ELUCIDATION"
    | "EXPECTED_STRUCTURE_VERIFICATION";
  experimentalSpectra: Partial<
    Record<SpectrumModality, ExperimentalSpectrumData>
  >;
  expectedStructure?: ParsedChemicalStructure | null;
  modelRegistryStatus: TheoreticalModelMetadata[];
  evidenceAccumulation?: EvidenceAccumulationState;
  irFindings: IRFunctionalGroupFinding[];
  irStatusMessage?: string;
  h1Environments: ProtonEnvironment[];
  h1SymmetrySummary: string;
  h1StatusMessage?: string;
  c13Analysis: Carbon13SummaryAnalysis;
  c13StatusMessage?: string;
  msAnalysis: MSComprehensiveAnalysis | null;
  msStatusMessage?: string;
  formulaCandidates: MolecularFormulaCandidate[];
  structuralConstraints: {
    id: string;
    sourceModality:
      | SpectrumModality
      | "Multi-Spectrum"
      | "Expected-Structure"
      | string;
    modelType: ModelType;
    constraintType: "Mandatory" | "Probable" | "Exclusion";
    description: string;
    confidence: number;
  }[];
  independentModalityConstraints?: Partial<
    Record<StructuralConstraintsSource, StructuralConstraints>
  >;
  mergedStructuralConstraints?: StructuralConstraints;
  independentModalityCandidates?: Partial<
    Record<StructuralConstraintsSource, CandidateStructure[]>
  >;
  candidates: CandidateStructure[];
  unknownGenerationStatus?: {
    generationMode: "Internal Candidate Generation (非 Full Chemical Structure Enumeration)";
    canGenerateReliableCandidates: boolean;
    statusMessageZh: string;
    knownConstraints: string[];
    unknownConstraints: string[];
    generatedCandidateCount: number;
    libraryCandidateCount: number;
    aiCandidateCount: number;
  };
  verificationResult?: ExpectedStructureVerificationResult | null;
  predictedBundle?: PredictedSpectrumBundle | null;
  comparisonMetrics: SpectralComparisonMetrics[];
  evidenceLedger: EvidenceItem[];
  confidenceBreakdown: EvidenceConfidenceBreakdown;
  unconfirmedAspects: string[];
  conflicts: {
    severity: "High" | "Medium" | "Low";
    modalitiesInvolved: string[];
    description: string;
    resolutionSuggestion: string;
  }[];
  recommendations: {
    experiment: string;
    purpose: string;
    priority: "High" | "Medium" | "Standard";
  }[];
  aiReasoningAugmentation?: {
    executiveAssessment: string;
    candidateComparisonReasoning: string;
    keyStructuralConstraints: string[];
    crossSpectrumConflicts: string[];
    recommendedExperiments: string[];
  } | null;
  aiStatusMessage?: string;
}

export interface SpecReaderProject {
  id: string;
  name: string;
  sampleCode: string;
  createdAt: string;
  updatedAt: string;
  mode: "MODE_A_SPECTRUM_TO_STRUCTURE" | "MODE_B_STRUCTURE_TO_SPECTRUM";
  description: string;
  report: MultiSpectrumAnalysisReport;
}

export interface SpectrumScientificEngine<TPhysicsModel = unknown> {
  readonly engineName: string;
  readonly engineVersion: string;
  readonly modality: EvidenceSpectrumSource | "NMR";
  readonly scientificTheoryBasis: string;
  extractPhysicsModel(spectrum?: ExperimentalSpectrumData): TPhysicsModel;
  generateEvidence(
    spectrum?: ExperimentalSpectrumData
  ): ChemicalFeatureEvidence[];
  deriveStructuralConstraints(
    spectrum?: ExperimentalSpectrumData
  ): StructuralConstraints;
}

export interface VibrationalMode {
  modeIndex: number;
  frequency: number;
  intensity: number;
  bandRegion:
    | "X-H Stretch (2500–4000 cm⁻¹)"
    | "Triple Bond (2000–2500 cm⁻¹)"
    | "Double Bond / Carbonyl (1500–2000 cm⁻¹)"
    | "Fingerprint Region (400–1500 cm⁻¹)";
  symmetry: string;
  dipoleDerivativeActivity:
    | "IR_ACTIVE_STRONG (Large |∂μ/∂Q|)"
    | "IR_ACTIVE_MODERATE (Moderate |∂μ/∂Q|)"
    | "IR_ACTIVE_WEAK (Small |∂μ/∂Q|)";
  assignment: string;
  possibleFunctionalGroups: string[];
  confidence: number;
  source: "REFERENCE_BASED" | "EMPIRICAL" | "QUANTUM_BACKEND";
  provenance: EvidenceProvenance;
}

export interface IRQuantumBackendAdapter {
  readonly adapterName: string;
  readonly status: "NOT_CONNECTED" | "CONNECTED";
  readonly fallbackMethod: "REFERENCE_BASED" | "EMPIRICAL";
  readonly scientificHonestyNote: string;
  computeNormalModes(smiles: string): {
    status: "NOT_CONNECTED";
    fallbackMethod: "REFERENCE_BASED" | "EMPIRICAL";
    modes: VibrationalMode[];
    message: string;
  };
}

export interface ProtonNMRModel {
  nucleus: "1H";
  spinQuantumNumber: 0.5;
  gyromagneticRatioMHzPerT: 42.577;
  observedEnvironments: ProtonEnvironment[];
  couplings: JCoupling[];
  totalIntegratedProtons: number | null;
  karplusInterface: KarplusModel;
  quantumBackendStatus: "NOT_CONNECTED";
  estimationMethod: "EMPIRICAL_ESTIMATE" | "REFERENCE_BASED";
}

export interface CarbonNMRModel {
  nucleus: "13C";
  spinQuantumNumber: 0.5;
  gyromagneticRatioMHzPerT: 10.708;
  observedEnvironments: CarbonEnvironment[];
  uniqueCarbonSignalCount: number;
  quantumBackendStatus: "NOT_CONNECTED";
  estimationMethod: "EMPIRICAL_ESTIMATE" | "REFERENCE_BASED";
}

export interface NMRQuantumBackendAdapter {
  readonly adapterName: string;
  readonly status: "NOT_CONNECTED" | "CONNECTED";
  readonly supportedMethods: ("GIAO" | "DFT_SHIELDING")[];
  readonly fallbackMethod: "REFERENCE_BASED" | "EMPIRICAL_ESTIMATE";
  readonly scientificHonestyNote: string;
  computeShieldingTensor(smiles: string): {
    status: "NOT_CONNECTED";
    fallbackMethod: "REFERENCE_BASED" | "EMPIRICAL_ESTIMATE";
    message: string;
  };
}

export interface MassFeature {
  mz: number;
  intensity: number;
  charge: number;
  ionType:
    | "neutral_radical_cation_[M]+•"
    | "[M+H]+"
    | "[M-H]-"
    | "[M+Na]+"
    | "[M+NH4]+"
    | "isotope_peak"
    | "fragment_ion";
  isotopeRelation: "M" | "M+1" | "M+2" | "fragment" | "adduct";
  confidence: number;
}

export interface FormulaCandidate {
  formula: string;
  exactMass: number;
  averageMolecularMass: number;
  massError: number;
  ppmError: number;
  DBE: number;
  isotopeCompatibility: number;
  adductType:
    | "neutral molecule [M]+•"
    | "[M+H]+"
    | "[M-H]-"
    | "[M+Na]+"
    | "[M+NH4]+";
  confidence: number;
}

export interface PrecursorIon {
  mz: number;
  charge: number;
  adductType: string;
  activationMethod: "CID" | "HCD" | "EI_IN_SOURCE" | "NOT_PROVIDED";
  collisionEnergyEv: number | "NOT_PROVIDED";
}

export interface ProductIon {
  mz: number;
  intensity: number;
  charge: number;
  possibleFormula: string;
  structuralMotifHint?: string;
  confidence: number;
}

export interface NeutralLoss {
  precursorMz: number;
  productMz: number;
  lossDa: number;
  possibleIdentity:
    | "H2O"
    | "CO"
    | "CO2"
    | "NH3"
    | "C2H4"
    | "CH3OH"
    | "CH3CO•"
    | string;
  status: "POSSIBLE";
  scientificNote: string;
  confidence: number;
}

export interface FragmentRelation {
  parentIonMz: number;
  productIonMz: number;
  neutralLossDa: number;
  possibleNeutralLoss: string;
  confidence: number;
}

export interface PossibleCleavage {
  mechanismType:
    | "alpha_cleavage"
    | "benzylic_cleavage"
    | "McLafferty_rearrangement"
    | "charge_directed_fragmentation"
    | "charge_remote_fragmentation"
    | "retro_diels_alder";
  mechanismLabel?: MSFragmentationMechanismCategory;
  status: "POSSIBLE_MECHANISM_HYPOTHESIS";
  relatedIonMz: number;
  structuralMotifImplied: string;
  confidence: number;
}

export interface ToFSIMSSurfaceConditionState {
  polarity: "positive" | "negative" | "NOT_PROVIDED";
  primaryIon: string | "NOT_PROVIDED";
  primaryIonEnergy: string | "NOT_PROVIDED";
  dose: string | "NOT_PROVIDED";
  fluence: string | "NOT_PROVIDED";
  matrix: string | "NOT_PROVIDED";
}

export interface ToFSIMSFeature {
  mz: number;
  intensity: number;
  polarity: "positive" | "negative" | "NOT_PROVIDED";
  ionAssignment: string;
  ionClass:
    | "organosilicon_secondary_ion"
    | "aromatic_hydrocarbon_secondary_ion"
    | "aliphatic_hydrocarbon_secondary_ion"
    | "oxygenated_secondary_ion"
    | "nitrogenated_secondary_ion"
    | "inorganic_substrate_secondary_ion"
    | "unassigned_secondary_ion";
  fragmentClass: string;
  surfaceFragmentationMechanism?: string;
  surfaceRelevance:
    | "Polymer / Siloxane Surface Backbone"
    | "Aromatic / Organic Overlayer"
    | "Aliphatic Hydrocarbon Chain"
    | "Polar Functional Surface Group"
    | "Substrate / Inorganic Matrix"
    | "General Secondary Ion Fragment";
  confidence: number;
}

export interface ModalityPredictionAdapter<
  TOutput = ExperimentalSpectrumData,
> {
  readonly adapterName: string;
  readonly modality: EvidenceSpectrumSource | "NMR";
  readonly calculationMethod: "REFERENCE_BASED" | "EMPIRICAL";
  readonly quantumBackendStatus: "NOT_CONNECTED";
  readonly scientificDisclaimer: string;
  predictForStructure(structure: ParsedChemicalStructure): TOutput;
}

export interface ValidationResult {
  candidateSmiles: string;
  candidateFormula: string;
  overallCompatibilityScore: number;
  supportingEvidence: ChemicalFeatureEvidence[];
  contradictingEvidence: ChemicalFeatureEvidence[];
  unknownOrNotProvidedModalities: EvidenceSpectrumSource[];
  modalityComparisonSummary: Partial<Record<EvidenceSpectrumSource, string>>;
  provenanceNote: string;
}

export interface TwoDNMREvidenceProvider {
  readonly providerName: string;
  readonly supportedExperiments: (
    | "COSY"
    | "TOCSY"
    | "HSQC"
    | "HMQC"
    | "HMBC"
    | "NOESY"
    | "ROESY"
  )[];
  readonly status: "INTERFACE_RESERVED_NOT_IMPLEMENTED";
  extractEvidence(): ChemicalFeatureEvidence[];
}

export interface TwoPointCalibrationPoint {
  pixelX: number;
  pixelY: number;
  realX: number;
  realY: number;
}

export interface DigitizedImageMetadata {
  rawImageDataUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  extractionMethod?: "GEMINI_VISION" | "LOCAL_CANVAS" | "DIGITIZATION_FAILED" | string;
  fallbackReason?: string;
  digitizationConfidence?: number;
  confidenceScore?: number;
  calibrationQuality?: string;
  isTwoPointCalibrated?: boolean;
  calibrationPointA?: TwoPointCalibrationPoint;
  calibrationPointB?: TwoPointCalibrationPoint;
  xRange?: [number, number];
  yRange?: [number, number];
  methodDescription?: string;
}

export interface ProtonNMRSummaryAnalysis {
  solvent: NMRSolvent | string;
  totalIntegratedProtons: number | null;
  aromaticPatternHint: string;
  environments: ProtonEnvironment[];
  hasAldehydeProton: boolean;
  hasCarboxylicAcidProton: boolean;
  hasExchangeableProton: boolean;
  hasMethoxyGroup: boolean;
  hasAcetoxyOrMethylKetone: boolean;
  summaryNotes: string[];
}

export interface MSDetectedIon {
  id: string;
  mz: number;
  relativeIntensity: number;
  ionRole:
    | "MOLECULAR_ION"
    | "QUASI_MOLECULAR_ION"
    | "BASE_PEAK"
    | "ISOTOPE_M_PLUS_1"
    | "ISOTOPE_M_PLUS_2"
    | "CHARACTERISTIC_FRAGMENT"
    | "MINOR_FRAGMENT";
  proposedFormulaOrIdentity: string;
  confidence: number | "HIGH" | "MEDIUM" | "LOW";
  reasoning: string;
}

export interface MSNeutralLossFinding {
  fromMz: number;
  toMz: number;
  lossMass: number;
  proposedNeutralFormula: string;
  chemicalImplication: string;
  confidence: number | "HIGH" | "MEDIUM" | "LOW";
}

export interface IsotopeAnalysisReport {
  molecularIonMz: number | null;
  mPlus1IntensityPercent: number | null;
  mPlus2IntensityPercent: number | null;
  estimatedCarbonCount: number | null;
  halogenHint: "NONE" | "CHLORINE_1" | "BROMINE_1" | "SULFUR_POSSIBLE" | "UNKNOWN";
  nitrogenRuleParity: "ODD_NITROGEN" | "EVEN_OR_ZERO_NITROGEN" | "UNKNOWN";
  notes: string[];
}

export interface MSAnalysisSummary {
  msType: MSType | string;
  ionizationMode: IonizationMode | string;
  molecularIonMz: number | null;
  basePeakMz: number | null;
  detectedIons: MSDetectedIon[];
  neutralLosses: MSNeutralLossFinding[];
  isotopeReport: IsotopeAnalysisReport;
  summaryNotes: string[];
}

export interface EvidenceChainLink {
  id?: string;
  stepNumber?: number;
  stepOrder?: number;
  stage?:
    | "OBSERVATION"
    | "FEATURE_EXTRACTION"
    | "STRUCTURAL_CONSTRAINT"
    | "CANDIDATE_DEDUCTION"
    | "CROSS_VALIDATION";
  modality:
    | ExtendedSpectrumModality
    | "FORMULA"
    | "CHEMICAL_NOTES"
    | "CROSS_MODAL";
  title?: string;
  detail?: string;
  observation?: string;
  chemicalMeaning?: string;
  structuralConstraint?: string;
  confidence: number | "HIGH" | "MEDIUM" | "LOW";
  provenance?: ModelType;
  supportingEvidenceIds?: string[];
}

export interface CrossPeakAlignmentRow {
  id?: string;
  modality: SpectrumModality;
  structuralFeature?: string;
  predictedPosition?: number;
  experimentalPosition?: number | null;
  predictedValue?: string;
  experimentalValue?: string;
  deviation: number | string | null;
  unit?: string;
  assignment?: string;
  status?: "MATCHED" | "SHIFTED" | "MISSING_IN_EXPERIMENTAL" | "EXTRA_IN_EXPERIMENTAL";
  matchStatus?: "MATCHED" | "SHIFTED" | "MISSING_IN_EXP" | "SIMULATED_ONLY" | string;
  scientificExplanation?: string;
}

export interface ModeADeductionReport {
  timestamp: string;
  activeModalities: ExtendedSpectrumModality[];
  experimentalModalities?: ExtendedSpectrumModality[];
  providedModalities?: ExtendedSpectrumModality[];
  missingModalities?: ExtendedSpectrumModality[];
  irFindings: IRFunctionalGroupFinding[];
  protonSummary: any;
  carbonSummary: any;
  msSummary: any;
  constraints: StructuralConstraints;
  structuralConstraints?: StructuralConstraints;
  candidates: CandidateStructure[];
  evidenceChain: EvidenceChainLink[];
  crossModalConsistencyNotes: string[];
  conflictAlerts?: string[];
  uncertaintyNotes: string[];
  overallConfidence?: number;
  uncertaintySummary?: string[];
  recommendedNextExperiments?: string[];
  aiAugmentationNotes?: string[];
  rejectedCandidates?: any[];
  noValidCandidateMessage?: string;
  noValidCandidateReason?: string | null;
  formulaInputValidation?: CandidateHardValidationResult;
  h1IntegrationSummary?: H1NMRIntegrationSummary;
  candidateDispositionSummary?: {
    hardRejectedCount: number;
    passedLowSupportCount: number;
    passedMultiModalCount: number;
    inconclusiveCount: number;
    statusMessage: string;
  };
}

export interface ModeBPredictionReport {
  timestamp: string;
  structure?: ParsedChemicalStructure;
  targetStructure?: ParsedChemicalStructure;
  predictedSpectra: Record<ExtendedSpectrumModality, ExperimentalSpectrumData> & {
    irPredictions?: IRFunctionalGroupFinding[];
    h1Nmr?: ExperimentalSpectrumData;
    c13Nmr?: ExperimentalSpectrumData;
  };
  crossPeakAlignment?: CrossPeakAlignmentRow[];
  alignmentRows?: CrossPeakAlignmentRow[];
  modelMethodologyStatement?: string;
  overallValidationSummary?: string;
  modalityConsistencyScores?: Partial<Record<SpectrumModality, number>>;
  overallConsistencyScore?: number | null;
  compatibleFeatures?: string[];
  missingExpectedPeaks?: string[];
  extraExperimentalPeaks?: string[];
  summaryConclusion?: string;
}


