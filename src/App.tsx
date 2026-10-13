import type {ExtendedSpectrumModality} from './types/spectrum';
import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Beaker,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Download,
  FileText,
  FlaskConical,
  FolderKanban,
  GitBranch,
  History as HistoryIcon,
  Layers,
  Microscope,
  Play,
  Plus,
  Ruler,
  Settings as SettingsIcon,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { ReportExportModal } from "./components/ReportExportModal";
import { SpectrumViewer } from "./components/SpectrumViewer";
import { StructureRenderer2D } from "./components/StructureRenderer2D";
import { StructureSpectrumValidationPage } from "./components/StructureSpectrumValidationPage";
import {
  REFERENCE_SAMPLE_PRESETS,
  buildPresetSpectra,
} from "./data/referencePresets";
import { SpectrumParser } from "./engines/spectrumParser";
import {
  NMR_SOLVENT_REFERENCE_SHIFTS,
  WorkbenchOrchestrationState,
  WorkbenchOrchestrator,
} from "./engines/workbenchOrchestrator";
import { TheoreticalModelRegistry } from "./models/theoreticalModelRegistry";
import {
  ScientificEngineTestSuite,
  ScientificTestCaseResult,
} from "./tests/scientificEngineTestSuite";
import {
  ExperimentalSpectrumData,
  ImageSpectrumCalibration,
  NMRSolvent,
  SpectralPeak,
  SpectrumModality,
} from "./types/spectrum";

type PrimaryAppMode =
  | "MODE_A"
  | "MODE_B"
  | "PROJECTS"
  | "HISTORY"
  | "SETTINGS";

type ModeAPageId =
  | "PAGE_1_SIGNAL_MARKING"
  | "PAGE_2_CALIBRATION"
  | "PAGE_3_INTERPRETATION";

type ExtendedModality =
  | "IR"
  | "1H_NMR"
  | "13C_NMR"
  | "MS"
  | "MS/MS"
  | "ToF-SIMS";

interface AnalysisHistoryRecord {
  id: string;
  timestamp: string;
  presetName: string;
  activeModalities: string[];
  topCandidateName: string;
  topCandidateFormula: string;
  topScore: number;
}

const ALL_EXTENDED_MODALITIES: {
  id: ExtendedModality;
  baseModality: SpectrumModality;
  shortLabel: string;
  title: string;
  xUnit: string;
  yUnit: string;
  defaultDirection: "PEAK_TOP" | "ABSORPTION_VALLEY" | "ION_BAR";
  directionLabel: string;
  axisDesc: string;
}[] = [
  {
    id: "IR",
    baseModality: "IR",
    shortLabel: "IR",
    title: "IR 紅外線吸收光譜",
    xUnit: "cm⁻¹",
    yUnit: "%T",
    defaultDirection: "ABSORPTION_VALLEY",
    directionLabel: "吸收谷底 (Absorption Valley / Transmittance Dip)",
    axisDesc: "4000 → 400 cm⁻¹ (高至低)",
  },
  {
    id: "1H_NMR",
    baseModality: "1H_NMR",
    shortLabel: "¹H NMR",
    title: "¹H NMR 氫核磁共振譜",
    xUnit: "ppm",
    yUnit: "Rel. Intensity",
    defaultDirection: "PEAK_TOP",
    directionLabel: "共振峰頂 (Resonance Peak Top)",
    axisDesc: "14 → 0 ppm (高至低)",
  },
  {
    id: "13C_NMR",
    baseModality: "13C_NMR",
    shortLabel: "¹³C NMR",
    title: "¹³C NMR 碳核磁共振譜",
    xUnit: "ppm",
    yUnit: "Rel. Intensity",
    defaultDirection: "PEAK_TOP",
    directionLabel: "共振峰頂 (Carbon Peak Top)",
    axisDesc: "220 → 0 ppm (高至低)",
  },
  {
    id: "MS",
    baseModality: "MS",
    shortLabel: "MS",
    title: "MS 質譜 (EI / ESI / HRMS)",
    xUnit: "m/z",
    yUnit: "Rel. Abundance (%)",
    defaultDirection: "ION_BAR",
    directionLabel: "離子訊號峰頂 (Ion Peak / Bar Top)",
    axisDesc: "m/z 由低至高",
  },
  {
    id: "MS/MS",
    baseModality: "MS",
    shortLabel: "MS/MS",
    title: "MS/MS 串聯質譜 (CID / HCD)",
    xUnit: "m/z",
    yUnit: "Rel. Abundance (%)",
    defaultDirection: "ION_BAR",
    directionLabel: "子離子訊號峰頂 (Product Ion Peak)",
    axisDesc: "m/z 由低至高",
  },
  {
    id: "ToF-SIMS",
    baseModality: "MS",
    shortLabel: "ToF-SIMS",
    title: "ToF-SIMS 二次離子質譜",
    xUnit: "m/z",
    yUnit: "Intensity (counts)",
    defaultDirection: "ION_BAR",
    directionLabel: "表面二次離子峰頂 (Secondary Ion Peak)",
    axisDesc: "m/z 由低至高",
  },
];

export default function App() {
  // ============================================================================
  // 1. 獨立雙模式導覽狀態 (Mode A vs Mode B 徹底分離，移除舊版繁瑣 7 階段導覽)
  // ============================================================================
  const [primaryMode, setPrimaryMode] = useState<PrimaryAppMode>("MODE_A");
  const [modeAPage, setModeAPage] = useState<ModeAPageId>(
    "PAGE_1_SIGNAL_MARKING"
  );

  // ============================================================================
  // 2. Mode A 狀態：實驗光譜 (IR, 1H, 13C, MS, MS/MS, ToF-SIMS) + 一級分子式與化學證據
  // ============================================================================
  const [activePresetId, setActivePresetId] = useState<string>("");
  const [spectra, setSpectra] = useState<
    Partial<Record<SpectrumModality, ExperimentalSpectrumData>>
  >(() => ({}));
  const [auxSpectraMap, setAuxSpectraMap] = useState<
    Partial<Record<"MS/MS" | "ToF-SIMS", ExperimentalSpectrumData>>
  >(() => ({}));

  // 分子式與其他化學證據與光譜處於同一層級，可單獨輸入或與任意光譜組合
  const [molecularFormulaInput, setMolecularFormulaInput] =
    useState<string>("");
  const [chemicalNotesInput, setChemicalNotesInput] = useState<string>("");
  const [msmsPrecursorMz, setMsmsPrecursorMz] = useState<string>("");

  const [focusedModality, setFocusedModality] =
    useState<ExtendedModality>("IR");
  const [selectedCandidateId, setSelectedCandidateId] = useState<
    string | undefined
  >(undefined);

  // ============================================================================
  // 3. Mode B 獨立狀態：輸入結構 → 選擇模態 → 明確執行預測光譜（不依賴 Mode A，亦不汙染 Mode A 實驗證據）
  // ============================================================================
  const [modeBStructureInput, setModeBStructureInput] = useState<string>("");
  const [modeBSelectedModalities, setModeBSelectedModalities] = useState<
    ExtendedSpectrumModality[]
  >(["IR", "1H_NMR", "13C_NMR", "MS"]);
  const [modeBExecutionState, setModeBExecutionState] = useState<{
    bidirectionalReport: WorkbenchOrchestrationState["bidirectionalReport"];
    modeBReport: WorkbenchOrchestrationState["modeBReport"];
    errorMessage: string | null;
  }>({
    bidirectionalReport: null,
    modeBReport: null,
    errorMessage: null,
  });

  // ============================================================================
  // 4. Mode A 第 1 頁：手動訊號標記與編輯狀態
  // ============================================================================
  const [selectedPeakId, setSelectedPeakId] = useState<string | null>(null);
  const [newPeakX, setNewPeakX] = useState<string>("");
  const [newPeakY, setNewPeakY] = useState<string>("65");
  const [newPeakSignalDirection, setNewPeakSignalDirection] = useState<
    "PEAK_TOP" | "ABSORPTION_VALLEY" | "SHOULDER" | "ION_BAR"
  >("ABSORPTION_VALLEY");
  const [newPeakMultiplicity, setNewPeakMultiplicity] =
    useState<SpectralPeak["multiplicity"]>("s");
  const [newPeakIntegral, setNewPeakIntegral] = useState<string>("1");
  const [newPeakJValues, setNewPeakJValues] = useState<string>("");
  const [newPeakCarbonType, setNewPeakCarbonType] =
    useState<SpectralPeak["carbonType"]>("CH");
  const [newPeakAssignment, setNewPeakAssignment] = useState<string>("");
  const [newPeakClass, setNewPeakClass] =
    useState<SpectralPeak["userClassification"]>("COMPOUND");

  // ============================================================================
  // 5. Mode A 第 2 頁：座標校正狀態（預設兩點校正，三點校正置於進階選項）
  // ============================================================================
  const [calibrationMode, setCalibrationMode] = useState<
    "TWO_POINT" | "THREE_POINT"
  >("TWO_POINT");
  const [showAdvancedCalibration, setShowAdvancedCalibration] =
    useState<boolean>(false);
  const [calibPointA, setCalibPointA] = useState({
    pixelX: 120,
    pixelY: 320,
    realX: 3600,
    realY: 10,
  });
  const [calibPointB, setCalibPointB] = useState({
    pixelX: 780,
    pixelY: 80,
    realX: 600,
    realY: 95,
  });
  const [calibPointC, setCalibPointC] = useState({
    pixelX: 450,
    pixelY: 200,
    realX: 1700,
    realY: 50,
  });
  const [nextCalibTarget, setNextCalibTarget] = useState<"A" | "B" | "C">("A");
  const [calibrationMessage, setCalibrationMessage] = useState<{
    type: "SUCCESS" | "ERROR" | "INFO";
    text: string;
  } | null>(null);

  const [uploadStatusMsg, setUploadStatusMsg] = useState<string | null>(null);
  const [autoDetectOnUpload, setAutoDetectOnUpload] = useState<boolean>(true);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [testResults, setTestResults] = useState<
    ScientificTestCaseResult[] | null
  >(null);
  const [historyRecords, setHistoryRecords] = useState<AnalysisHistoryRecord[]>(
    []
  );

  // 取得當前聚焦模態之定義與光譜物件
  const focusedModalityMeta =
    ALL_EXTENDED_MODALITIES.find((m) => m.id === focusedModality) ||
    ALL_EXTENDED_MODALITIES[0];

  const getSpectrumForModality = (
    mod: ExtendedModality
  ): ExperimentalSpectrumData | undefined => {
    if (mod === "MS/MS" || mod === "ToF-SIMS") {
      return auxSpectraMap[mod];
    }
    return spectra[mod];
  };

  const updateSpectrumForModality = (
    mod: ExtendedModality,
    updated: ExperimentalSpectrumData | undefined
  ) => {
    const tagged = updated
      ? {
          ...updated,
          originalModality: mod,
        }
      : undefined;
    if (mod === "MS/MS" || mod === "ToF-SIMS") {
      setAuxSpectraMap((prev) => {
        const next = { ...prev };
        if (tagged) {
          next[mod] = tagged;
        } else {
          delete next[mod];
        }
        return next;
      });
    } else {
      setSpectra((prev) => {
        const next = { ...prev };
        if (tagged) {
          next[mod] = tagged;
        } else {
          delete next[mod];
        }
        return next;
      });
    }
  };

  const currentSpectrum = getSpectrumForModality(focusedModality);

  // 根據當前聚焦模態同步預設訊號方向
  const handleSelectModality = (mod: ExtendedModality) => {
    setFocusedModality(mod);
    setSelectedPeakId(null);
    const meta = ALL_EXTENDED_MODALITIES.find((m) => m.id === mod);
    if (meta) {
      setNewPeakSignalDirection(meta.defaultDirection);
    }
    const spec = getSpectrumForModality(mod);
    if (spec?.imageCalibration) {
      const cal = spec.imageCalibration;
      const pLeft = cal.physicalXLeft ?? cal.xAxisStart;
      const pRight = cal.physicalXRight ?? cal.xAxisEnd;
      const midPx = Math.round((cal.plotLeftPx + cal.plotRightPx) / 2);
      const midPhys = Number(((pLeft + pRight) / 2).toFixed(2));
      setCalibPointA({
        pixelX: cal.plotLeftPx,
        pixelY: cal.plotBottomPx,
        realX: pLeft,
        realY: cal.physicalYBottom ?? 0,
      });
      setCalibPointB({
        pixelX: cal.plotRightPx,
        pixelY: cal.plotTopPx,
        realX: pRight,
        realY: cal.physicalYTop ?? 100,
      });
      setCalibPointC({
        pixelX: midPx,
        pixelY: Math.round((cal.plotTopPx + cal.plotBottomPx) / 2),
        realX: midPhys,
        realY: 50,
      });
    } else {
      // 根據模態提供合理校正參考預設值（僅作為輸入框初始值，絕不自動套用為已校正）
      if (mod === "IR") {
        setCalibPointA({ pixelX: 120, pixelY: 320, realX: 4000, realY: 0 });
        setCalibPointB({ pixelX: 780, pixelY: 80, realX: 400, realY: 100 });
        setCalibPointC({ pixelX: 450, pixelY: 200, realX: 2000, realY: 50 });
      } else if (mod === "1H_NMR") {
        setCalibPointA({ pixelX: 120, pixelY: 320, realX: 12, realY: 0 });
        setCalibPointB({ pixelX: 780, pixelY: 80, realX: 0, realY: 100 });
        setCalibPointC({ pixelX: 450, pixelY: 200, realX: 6, realY: 50 });
      } else if (mod === "13C_NMR") {
        setCalibPointA({ pixelX: 120, pixelY: 320, realX: 220, realY: 0 });
        setCalibPointB({ pixelX: 780, pixelY: 80, realX: 0, realY: 100 });
        setCalibPointC({ pixelX: 450, pixelY: 200, realX: 110, realY: 50 });
      } else {
        setCalibPointA({ pixelX: 120, pixelY: 320, realX: 50, realY: 0 });
        setCalibPointB({ pixelX: 780, pixelY: 80, realX: 300, realY: 100 });
        setCalibPointC({ pixelX: 450, pixelY: 200, realX: 175, realY: 50 });
      }
    }
  };

  // ============================================================================
  // 6. 即時校正預覽計算 (僅於第 2 頁座標校正預覽使用，未點擊套用前不寫入正式證據)
  // ============================================================================
  const liveCalibrationPreview = useMemo<
    ImageSpectrumCalibration | undefined
  >(() => {
    if (!currentSpectrum) return undefined;
    const isImg =
      currentSpectrum.sourceType === "IMAGE_EXPERIMENTAL" ||
      currentSpectrum.digitizedFromImage;
    if (!isImg) return undefined;

    const dxPx = calibPointB.pixelX - calibPointA.pixelX;
    const dxPhys = calibPointB.realX - calibPointA.realX;
    if (Math.abs(dxPx) < 2 || Math.abs(dxPhys) < 1e-6) {
      return undefined;
    }

    const isRev =
      (calibPointA.pixelX < calibPointB.pixelX &&
        calibPointA.realX > calibPointB.realX) ||
      (calibPointB.pixelX < calibPointA.pixelX &&
        calibPointB.realX > calibPointA.realX);

    return {
      plotLeftPx: Math.min(calibPointA.pixelX, calibPointB.pixelX),
      plotRightPx: Math.max(calibPointA.pixelX, calibPointB.pixelX),
      plotTopPx: Math.min(calibPointA.pixelY, calibPointB.pixelY),
      plotBottomPx: Math.max(calibPointA.pixelY, calibPointB.pixelY),
      xAxisStart:
        calibPointA.pixelX <= calibPointB.pixelX
          ? calibPointA.realX
          : calibPointB.realX,
      xAxisEnd:
        calibPointA.pixelX <= calibPointB.pixelX
          ? calibPointB.realX
          : calibPointA.realX,
      physicalXLeft:
        calibPointA.pixelX <= calibPointB.pixelX
          ? calibPointA.realX
          : calibPointB.realX,
      physicalXRight:
        calibPointA.pixelX <= calibPointB.pixelX
          ? calibPointB.realX
          : calibPointA.realX,
      physicalYBottom: Math.min(calibPointA.realY, calibPointB.realY),
      physicalYTop: Math.max(calibPointA.realY, calibPointB.realY),
      xAxisDirection: isRev ? "DESCENDING" : "ASCENDING",
      confidence: 0.98,
      calibrationMode,
      source: "USER_CALIBRATED",
    };
  }, [currentSpectrum, calibPointA, calibPointB, calibrationMode]);

  // ============================================================================
  // 7. 核心確定性科學工作台 Orchestration 計算 (Mode A 與 Mode B 狀態反應式更新)
  // ============================================================================
  const extraChemicalInput = useMemo(() => {
    const msmsSpec = auxSpectraMap["MS/MS"];
    const tofSimsSpec = auxSpectraMap["ToF-SIMS"];
    const parsedPrecursor = parseFloat(msmsPrecursorMz);
    return {
      molecularFormula: molecularFormulaInput.trim() || undefined,
      chemicalNotes: chemicalNotesInput.trim() || undefined,
      msmsSpectrum: msmsSpec
        ? {
            ...msmsSpec,
            canonicalModality: "MSMS" as const,
            msParams: {
              ...(msmsSpec.msParams || {
                msType: "MS/MS" as const,
                ionization: "ESI+" as const,
              }),
              msType: "MS/MS" as const,
              ionization: msmsSpec.msParams?.ionization || ("ESI+" as const),
              precursorMz: Number.isFinite(parsedPrecursor)
                ? parsedPrecursor
                : msmsSpec.msParams?.precursorMz,
            },
          }
        : undefined,
      msmsPrecursorMz: Number.isFinite(parsedPrecursor)
        ? parsedPrecursor
        : undefined,
      tofSimsSpectrum: tofSimsSpec
        ? {
            ...tofSimsSpec,
            canonicalModality: "TOF_SIMS" as const,
            msParams: {
              ...(tofSimsSpec.msParams || {
                msType: "ToF-SIMS" as const,
                ionization: "ToF-SIMS+" as const,
              }),
              msType: "ToF-SIMS" as const,
              ionization:
                tofSimsSpec.msParams?.ionization || ("ToF-SIMS+" as const),
            },
          }
        : undefined,
    };
  }, [
    molecularFormulaInput,
    chemicalNotesInput,
    auxSpectraMap,
    msmsPrecursorMz,
  ]);

  // Mode A 獨立計算管線：僅依賴實驗光譜與化學證據，絕不依賴 selectedCandidateId 或 Mode B 狀態，亦絕不自動觸發 Mode B
  const modeAOrchestration = useMemo(() => {
    return WorkbenchOrchestrator.runModeAPipeline(spectra, extraChemicalInput);
  }, [spectra, extraChemicalInput]);

  const {
    bundle,
    modeAReport,
    spectrumEvidenceList,
    solvedConstraintSpace,
    validatedGraphs,
    rejectedCandidates,
    rankedCandidates,
    validationMatrix,
  } = modeAOrchestration;

  const selectedCandidate = useMemo(() => {
    return (
      rankedCandidates.find((c) => c.id === selectedCandidateId) ||
      rankedCandidates[0] ||
      null
    );
  }, [rankedCandidates, selectedCandidateId]);

  const handleToggleModeBModality = (mod: ExtendedSpectrumModality) => {
    setModeBSelectedModalities((prev) => {
      const exists = prev.includes(mod);
      if (exists && prev.length === 1) return prev;
      return exists ? prev.filter((m) => m !== mod) : [...prev, mod];
    });
  };

  const handleExecuteModeBPrediction = (overrideInput?: string) => {
    const targetInput =
      overrideInput !== undefined ? overrideInput : modeBStructureInput;
    const out = WorkbenchOrchestrator.runModeBPrediction(
      targetInput,
      modeBSelectedModalities,
      spectra
    );
    setModeBExecutionState({
      bidirectionalReport: out.bidirectionalReport,
      modeBReport: out.modeBReport,
      errorMessage: out.errorMessage,
    });
  };

  const bidirectionalReport = modeBExecutionState.bidirectionalReport;

  const orchestrationState: WorkbenchOrchestrationState = useMemo(
    () => ({
      bundle,
      modeAReport,
      spectrumEvidenceList,
      solvedConstraintSpace,
      validatedGraphs,
      rejectedCandidates,
      rankedCandidates,
      validationMatrix,
      selectedCandidate,
      bidirectionalReport: modeBExecutionState.bidirectionalReport,
      modeBReport: modeBExecutionState.modeBReport,
    }),
    [
      bundle,
      modeAReport,
      spectrumEvidenceList,
      solvedConstraintSpace,
      validatedGraphs,
      rejectedCandidates,
      rankedCandidates,
      validationMatrix,
      selectedCandidate,
      modeBExecutionState,
    ]
  );

  // 統計目前已載入之證據來源與標記數量
  const activeEvidenceSummary = useMemo(() => {
    const modalitiesWithData: ExtendedModality[] = [];
    let totalMarkedSignals = 0;
    let calibratedSignalsCount = 0;
    let uncalibratedSignalsCount = 0;

    for (const m of ALL_EXTENDED_MODALITIES) {
      const spec = getSpectrumForModality(m.id);
      if (spec) {
        modalitiesWithData.push(m.id);
        for (const pk of spec.peaks) {
          totalMarkedSignals += 1;
          if (pk.isCalibrated === false) {
            uncalibratedSignalsCount += 1;
          } else {
            calibratedSignalsCount += 1;
          }
        }
      }
    }

    return {
      modalitiesWithData,
      hasFormula: Boolean(molecularFormulaInput.trim()),
      hasChemicalNotes: Boolean(chemicalNotesInput.trim()),
      totalMarkedSignals,
      calibratedSignalsCount,
      uncalibratedSignalsCount,
    };
  }, [spectra, auxSpectraMap, molecularFormulaInput, chemicalNotesInput]);

  // ============================================================================
  // 8. 事件處理函式：重置、載入範例、檔案上傳、訊號標記、座標校正
  // ============================================================================
  const handleResetToEmptyUnknownSample = () => {
    setActivePresetId("");
    setSpectra({});
    setAuxSpectraMap({});
    setMolecularFormulaInput("");
    setChemicalNotesInput("");
    setMsmsPrecursorMz("");
    setSelectedCandidateId(undefined);
    setSelectedPeakId(null);
    setCalibrationMessage(null);
    setUploadStatusMsg(
      "已重置為空白未知物狀態 (Empty Unknown Sample)。可單獨輸入分子式、上傳任意單一或多種光譜，並於第 1 頁手動標記訊號。"
    );
  };

  // 為任意模態建立空白手動光譜
  const handleInitEmptyModalitySpectrum = (mod: ExtendedModality) => {
    const meta =
      ALL_EXTENDED_MODALITIES.find((m) => m.id === mod) ||
      ALL_EXTENDED_MODALITIES[0];
    const emptySpec: ExperimentalSpectrumData = {
      modality: meta.baseModality,
      fileName: `Manual_${mod}_Signals.csv`,
      sourceFormat: "MANUAL",
      sourceType: "NUMERIC_EXPERIMENTAL",
      dataOrigin: "EXPERIMENTAL_UPLOAD",
      modelType: "EXPERIMENTAL",
      isSimulated: false,
      xUnit: meta.xUnit,
      yUnit: meta.yUnit,
      nmrSolvent:
        mod === "1H_NMR" || mod === "13C_NMR" ? "CDCl3" : undefined,
      points: [],
      peaks: [],
      validation: {
        isValid: true,
        qualityScore: 85,
        dataQuality: "MEDIUM",
        pointCount: 0,
        peakCount: 0,
        xRange: [0, 0],
        yRange: [0, 100],
        issues: [],
      },
    };
    updateSpectrumForModality(mod, emptySpec);
    handleSelectModality(mod);
    setUploadStatusMsg(
      `已建立 ${meta.title} 手動訊號工作表，可直接在下方新增或編輯實測訊號。`
    );
  };

  // 載入參考標準樣品
  const handleSelectPreset = (presetId: string) => {
    const found = REFERENCE_SAMPLE_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setActivePresetId(presetId);
    const nextSpectra = buildPresetSpectra(found);
    setSpectra(nextSpectra);
    setAuxSpectraMap({});
    setMolecularFormulaInput(found.expectedFormula || "");
    setSelectedCandidateId(undefined);
    setUploadStatusMsg(
      `已載入標準樣品「${found.title}」實驗數據與分子式 (${found.expectedFormula})。您可隨時刪除任意模態、修改標記或切換為空白未知物。`
    );

    const nextState = WorkbenchOrchestrator.runModeAPipeline(nextSpectra, {
      molecularFormula: found.expectedFormula,
    });
    const top = nextState.rankedCandidates[0];
    if (top) {
      setHistoryRecords((prev) => [
        {
          id: `hist-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          presetName: found.title,
          activeModalities: [
            `Formula(${found.expectedFormula})`,
            ...Object.keys(nextSpectra),
          ],
          topCandidateName: top.name,
          topCandidateFormula: top.molecularFormula,
          topScore: top.scoreBreakdown.totalScore,
        },
        ...prev.slice(0, 14),
      ]);
    }
  };

  // 第 1 頁：上傳光譜檔案（整合自動讀譜與手動覆核能力，保留原始數據）
  const handleFileUpload = async (
    mod: ExtendedModality,
    file: File | undefined
  ) => {
    if (!file) return;
    const meta =
      ALL_EXTENDED_MODALITIES.find((m) => m.id === mod) ||
      ALL_EXTENDED_MODALITIES[0];
    setUploadStatusMsg(`正在載入 ${file.name} (${meta.shortLabel})...`);

    const uploadMsParams =
      mod === "MS/MS"
        ? {
            msType: "MS/MS" as const,
            ionization: "ESI+" as const,
            precursorMz: Number.isFinite(parseFloat(msmsPrecursorMz))
              ? parseFloat(msmsPrecursorMz)
              : undefined,
          }
        : mod === "ToF-SIMS"
          ? {
              msType: "ToF-SIMS" as const,
              ionization: "ToF-SIMS+" as const,
            }
          : undefined;

    try {
      const parsed = await SpectrumParser.parseUploadedFile(
        file,
        meta.baseModality,
        uploadMsParams,
        {
          disableAutoPeakDetection: !autoDetectOnUpload,
        }
      );

      updateSpectrumForModality(mod, parsed);
      handleSelectModality(mod);
      setCalibrationMessage(null);

      const isImg =
        parsed.sourceType === "IMAGE_EXPERIMENTAL" || parsed.digitizedFromImage;

      setUploadStatusMsg(
        isImg
          ? autoDetectOnUpload
            ? `已載入光譜圖片 ${file.name}（自動讀譜檢出 ${parsed.peaks.length} 個建議訊號，保留 100% 原始圖片）。可於下方原圖覆核、增刪訊號或前往「第 2 頁：座標校正」。`
            : `已載入原始光譜圖片 ${file.name}（手動讀譜模式，保留 100% 原始圖片）。請直接在下方原圖點選訊號峰頂或吸收谷底進行標記，再前往「第 2 頁：座標校正」。`
          : autoDetectOnUpload
            ? `已載入真實數值光譜 ${file.name}（共 ${parsed.points.length} 個真實 X/Y 數據點，自動讀譜提取 ${parsed.peaks.length} 個特徵峰）。可直接於下方檢視、增刪或修改標記。`
            : `已載入真實數值光譜 ${file.name}（共 ${parsed.points.length} 個真實 X/Y 數據點，手動讀譜模式）。請直接在下方真實曲線上點擊標記訊號位置。`
      );
    } catch (err: any) {
      setUploadStatusMsg(
        `檔案解析失敗：${err?.message || "請確認檔案為有效之 PNG/JPG/WEBP 圖片或 CSV/TXT/JCAMP-DX/XLSX 數值光譜。"}`
      );
    }
  };

  // 第 1 頁：重新執行自動讀譜（保留所有人工新增/修改/刪除之訊號優先權）
  const handleReRunAutoPeakDetection = (mod: ExtendedModality) => {
    const spec = getSpectrumForModality(mod);
    if (!spec) return;
    const updated = SpectrumParser.reRunAutoPeakDetection(spec);
    updateSpectrumForModality(mod, updated);
    setUploadStatusMsg(
      `已對 ${mod} 重新執行自動讀譜（共 ${updated.peaks.length} 筆訊號，已完整保留人工新增與編輯紀錄）。`
    );
  };

  // 第 1 頁：直接點擊原始圖片標記訊號（僅記錄原始像素座標與訊號方向，若尚未校正則 isCalibrated=false）
  const handleMarkPeakFromImage = (params: {
    pixelX: number;
    pixelY: number;
    physicalX: number;
    physicalY: number;
  }) => {
    const spec = currentSpectrum;
    if (!spec) return;
    const isAlreadyCalibrated = SpectrumParser.isSpectrumCalibrated(spec);

    const updated = WorkbenchOrchestrator.addManualPeak(spec, {
      x: isAlreadyCalibrated ? params.physicalX : params.pixelX,
      y: isAlreadyCalibrated ? params.physicalY : 65,
      pixelX: params.pixelX,
      pixelY: params.pixelY,
      isCalibrated: isAlreadyCalibrated,
      signalDirection: newPeakSignalDirection,
      multiplicity:
        focusedModality === "1H_NMR" ? newPeakMultiplicity : undefined,
      integral:
        focusedModality === "1H_NMR"
          ? parseFloat(newPeakIntegral) || 1
          : undefined,
      carbonType:
        focusedModality === "13C_NMR" ? newPeakCarbonType : undefined,
      assignment:
        newPeakAssignment.trim() ||
        (isAlreadyCalibrated
          ? `${params.physicalX} ${spec.xUnit}`
          : `原始像素標記 px(${params.pixelX}, ${params.pixelY})`),
      userClassification: newPeakClass,
    });

    updateSpectrumForModality(focusedModality, updated);

    const newestPeak = updated.peaks.find(
      (pk) => pk.pixelX === params.pixelX && pk.pixelY === params.pixelY
    );
    if (newestPeak) {
      setSelectedPeakId(newestPeak.id);
    }

    setUploadStatusMsg(
      isAlreadyCalibrated
        ? `已於原圖標記訊號：px(${params.pixelX}, ${params.pixelY}) → 校正座標 ${params.physicalX} ${spec.xUnit}。`
        : `已於原圖記錄原始像素標記：px(${params.pixelX}, ${params.pixelY}) [尚未校正]。完成標記後請進入「第 2 頁：座標校正」轉換為實際物理座標。`
    );
  };

  // 第 1 頁：在原始圖片上拖曳移動既有訊號標記
  const handleMovePeakMarkerOnImage = (
    peakId: string,
    params: {
      pixelX: number;
      pixelY: number;
      physicalX: number;
      physicalY: number;
    }
  ) => {
    const spec = currentSpectrum;
    if (!spec) return;
    const isAlreadyCalibrated = SpectrumParser.isSpectrumCalibrated(spec);

    const updated = WorkbenchOrchestrator.updatePeak(spec, peakId, {
      pixelX: params.pixelX,
      pixelY: params.pixelY,
      x: isAlreadyCalibrated ? params.physicalX : params.pixelX,
      y: isAlreadyCalibrated ? params.physicalY : 65,
      isCalibrated: isAlreadyCalibrated,
    });
    updateSpectrumForModality(focusedModality, updated);
  };

  // 第 1 頁：直接點擊真實數值曲線標記訊號（自動貼合局部峰頂或吸收谷底）
  const handleMarkPeakFromPlot = (physicalX: number, physicalY: number) => {
    const spec = currentSpectrum;
    if (!spec) return;

    const snapMode =
      newPeakSignalDirection === "ABSORPTION_VALLEY"
        ? "ABSORPTION_VALLEY"
        : newPeakSignalDirection === "PEAK_TOP" ||
            newPeakSignalDirection === "ION_BAR"
          ? "PEAK_TOP"
          : "EXACT";

    const snapped = SpectrumParser.snapToLocalNumericExtremum(
      spec,
      physicalX,
      physicalY,
      snapMode
    );

    const updated = WorkbenchOrchestrator.addManualPeak(spec, {
      x: snapped.x,
      y: snapped.y,
      isCalibrated: true,
      signalDirection: newPeakSignalDirection,
      multiplicity:
        focusedModality === "1H_NMR" ? newPeakMultiplicity : undefined,
      integral:
        focusedModality === "1H_NMR"
          ? parseFloat(newPeakIntegral) || 1
          : undefined,
      carbonType:
        focusedModality === "13C_NMR" ? newPeakCarbonType : undefined,
      assignment:
        newPeakAssignment.trim() ||
        `${snapped.x} ${spec.xUnit} (${newPeakSignalDirection})`,
      userClassification: newPeakClass,
    });

    updateSpectrumForModality(focusedModality, updated);
    const newestPeak = updated.peaks.find(
      (pk) => Math.abs(pk.x - snapped.x) < 1e-4
    );
    if (newestPeak) {
      setSelectedPeakId(newestPeak.id);
    }
    setUploadStatusMsg(
      `已於真實數值曲線標記訊號：${snapped.x} ${spec.xUnit} (強度 ${snapped.y})。`
    );
  };

  // 第 1 頁：在真實數值曲線上拖曳移動既有訊號標記
  const handleMovePeakFromPlot = (
    peakId: string,
    physicalX: number,
    physicalY: number
  ) => {
    const spec = currentSpectrum;
    if (!spec) return;
    const snapMode =
      newPeakSignalDirection === "ABSORPTION_VALLEY"
        ? "ABSORPTION_VALLEY"
        : newPeakSignalDirection === "PEAK_TOP" ||
            newPeakSignalDirection === "ION_BAR"
          ? "PEAK_TOP"
          : "EXACT";
    const snapped = SpectrumParser.snapToLocalNumericExtremum(
      spec,
      physicalX,
      physicalY,
      snapMode
    );
    const updated = WorkbenchOrchestrator.updatePeak(spec, peakId, {
      x: snapped.x,
      y: snapped.y,
      isCalibrated: true,
    });
    updateSpectrumForModality(focusedModality, updated);
  };

  // 第 1 頁：透過表單手動新增訊號
  const handleAddManualPeak = (e: React.FormEvent) => {
    e.preventDefault();
    const spec = currentSpectrum;
    if (!spec) return;
    const xNum = parseFloat(newPeakX);
    const yNum = parseFloat(newPeakY);
    if (!Number.isFinite(xNum) || !Number.isFinite(yNum)) return;

    const isImg =
      spec.sourceType === "IMAGE_EXPERIMENTAL" || spec.digitizedFromImage;
    const isAlreadyCalibrated =
      !isImg || SpectrumParser.isSpectrumCalibrated(spec);

    const jArr = newPeakJValues
      .split(/[,;\s]+/)
      .map((s) => parseFloat(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);

    const updated = WorkbenchOrchestrator.addManualPeak(spec, {
      x: xNum,
      y: yNum,
      pixelX: isImg && !isAlreadyCalibrated ? Math.round(xNum) : undefined,
      pixelY: isImg && !isAlreadyCalibrated ? Math.round(yNum) : undefined,
      isCalibrated: isAlreadyCalibrated,
      signalDirection: newPeakSignalDirection,
      multiplicity:
        focusedModality === "1H_NMR" ? newPeakMultiplicity : undefined,
      integral:
        focusedModality === "1H_NMR"
          ? parseFloat(newPeakIntegral) || 1
          : undefined,
      jValues:
        focusedModality === "1H_NMR" && jArr.length > 0 ? jArr : undefined,
      carbonType:
        focusedModality === "13C_NMR" ? newPeakCarbonType : undefined,
      assignment: newPeakAssignment.trim() || undefined,
      userClassification: newPeakClass,
    });

    updateSpectrumForModality(focusedModality, updated);
    setNewPeakX("");
    setNewPeakAssignment("");
  };

  // 第 1 頁：更新單一標記屬性
  const handleUpdatePeak = (
    mod: ExtendedModality,
    peakId: string,
    patch: Partial<SpectralPeak>
  ) => {
    const spec = getSpectrumForModality(mod);
    if (!spec) return;
    const updated = WorkbenchOrchestrator.updatePeak(spec, peakId, patch);
    updateSpectrumForModality(mod, updated);
  };

  // 第 1 頁：刪除單一標記
  const handleDeletePeak = (mod: ExtendedModality, peakId: string) => {
    const spec = getSpectrumForModality(mod);
    if (!spec) return;
    const updated = WorkbenchOrchestrator.deletePeak(spec, peakId);
    updateSpectrumForModality(mod, updated);
    if (selectedPeakId === peakId) {
      setSelectedPeakId(null);
    }
  };

  // 第 1 頁：清空當前模態全部標記
  const handleClearAllPeaks = (mod: ExtendedModality) => {
    const spec = getSpectrumForModality(mod);
    if (!spec) return;
    const updated = SpectrumParser.clearAllPeakMarkers(spec);
    updateSpectrumForModality(mod, updated);
    setSelectedPeakId(null);
    setUploadStatusMsg(`已清空 ${mod} 之所有訊號標記。`);
  };

  // 變更 NMR 溶劑
  const handleChangeNmrSolvent = (
    mod: "1H_NMR" | "13C_NMR",
    solvent: NMRSolvent
  ) => {
    const spec = spectra[mod];
    if (!spec) return;
    const updated = WorkbenchOrchestrator.applyNmrSolventTagging(spec, solvent);
    setSpectra((prev) => ({
      ...prev,
      [mod]: updated,
    }));
  };

  // 第 2 頁：套用兩點或三點座標校正（讀取第 1 頁標記，轉換為實際物理座標，保留原始像素座標與校正紀錄）
  const handleApplyCalibration = () => {
    const spec = currentSpectrum;
    if (!spec) return;

    const dxPx = Math.abs(calibPointB.pixelX - calibPointA.pixelX);
    const dxPhys = Math.abs(calibPointB.realX - calibPointA.realX);

    if (dxPx < 5) {
      setCalibrationMessage({
        type: "ERROR",
        text: `校正失敗：校正點 A (px=${calibPointA.pixelX}) 與校正點 B (px=${calibPointB.pixelX}) 的水平像素距離過近 (< 5 px)，請在原圖 X 軸左右兩端選擇距離足夠的兩個已知刻度。`,
      });
      return;
    }

    if (dxPhys < 1e-5) {
      setCalibrationMessage({
        type: "ERROR",
        text: `校正失敗：校正點 A 與校正點 B 輸入之實際物理數值相同 (${calibPointA.realX} ${spec.xUnit})，請輸入兩個不同刻度的已知數值。`,
      });
      return;
    }

    if (calibrationMode === "THREE_POINT" && showAdvancedCalibration) {
      const calibrated = WorkbenchOrchestrator.applyThreePointCalibration(
        spec,
        {
          pointA: calibPointA,
          pointB: calibPointB,
          pointC: calibPointC,
        }
      );
      updateSpectrumForModality(focusedModality, calibrated);
      const r2 = calibrated.imageCalibration?.rSquared;
      const grade = calibrated.imageCalibration?.qualityGrade;
      setCalibrationMessage({
        type: "SUCCESS",
        text: `三點最小平方法校正成功 (${focusedModality})！共轉換 ${calibrated.peaks.length} 個訊號標記為實際物理座標 (${spec.xUnit})${
          r2 !== undefined ? `，線性擬合度 R² = ${r2.toFixed(5)} (${grade})` : ""
        }。原始像素座標已完整保留。`,
      });
    } else {
      const calibrated = WorkbenchOrchestrator.applyTwoPointCalibration(spec, {
        pointA: calibPointA,
        pointB: calibPointB,
      });
      updateSpectrumForModality(focusedModality, calibrated);
      const directionDesc =
        calibrated.imageCalibration?.xAxisDirection === "DESCENDING"
          ? "由左至右遞減 (高值→低值)"
          : "由左至右遞增 (低值→高值)";
      setCalibrationMessage({
        type: "SUCCESS",
        text: `兩點線性座標校正成功 (${focusedModality})！X 軸方向：${directionDesc}。已將第 1 頁標記之 ${calibrated.peaks.length} 個訊號轉換為實際物理座標 (${spec.xUnit})，可隨時返回第 1 頁增刪標記或前往第 3 頁檢視化學判讀。`,
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* ===================================================================== */}
      {/* 頂部主導覽列：明確區分 Mode A 與 Mode B 兩個獨立模式                   */}
      {/* ===================================================================== */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-slate-950/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          {/* Logo 與系統名稱 */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-500/40 bg-cyan-950/60 text-cyan-300 shadow-sm">
              <Microscope className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold tracking-tight text-slate-50">
                  SpecReader
                </span>
                <span className="rounded border border-cyan-500/30 bg-cyan-950/50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-300">
                  DETERMINISTIC DUAL-MODE WORKBENCH
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Mode A（實驗證據 → 官能基判讀 → 候選結構推論）｜Mode B（輸入結構 → 預測光譜）
              </p>
            </div>
          </div>

          {/* 兩大核心獨立模式切換 + 輔助資料庫/測試 */}
          <nav className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/90 p-1">
            <button
              type="button"
              onClick={() => setPrimaryMode("MODE_A")}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                primaryMode === "MODE_A"
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
              }`}
            >
              <GitBranch className="h-3.5 w-3.5" />
              <span>Mode A：實驗證據 → 官能基判讀 → 候選結構推論</span>
            </button>

            <button
              type="button"
              onClick={() => setPrimaryMode("MODE_B")}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                primaryMode === "MODE_B"
                  ? "bg-amber-500 text-slate-950 shadow-sm"
                  : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Mode B：輸入結構 → 預測光譜</span>
            </button>

            <span className="mx-1 h-4 w-px bg-slate-800" />

            <button
              type="button"
              onClick={() => setPrimaryMode("PROJECTS")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                primaryMode === "PROJECTS"
                  ? "bg-slate-800 text-cyan-300 border border-cyan-500/40"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <FolderKanban className="h-3.5 w-3.5" />
              <span>標準樣品庫</span>
            </button>

            <button
              type="button"
              onClick={() => setPrimaryMode("HISTORY")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                primaryMode === "HISTORY"
                  ? "bg-slate-800 text-cyan-300 border border-cyan-500/40"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <HistoryIcon className="h-3.5 w-3.5" />
              <span>紀錄</span>
            </button>

            <button
              type="button"
              onClick={() => setPrimaryMode("SETTINGS")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                primaryMode === "SETTINGS"
                  ? "bg-slate-800 text-cyan-300 border border-cyan-500/40"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <SettingsIcon className="h-3.5 w-3.5" />
              <span>引擎與測試</span>
            </button>
          </nav>

          {/* 右側狀態與匯出報告 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/60 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-900/60"
            >
              <Download className="h-3.5 w-3.5 text-cyan-400" />
              匯出報告
            </button>
          </div>
        </div>

        {/* =================================================================== */}
        {/* Mode A 專屬三頁式依序工作流切換列 (取代舊版 7 階段導覽列)           */}
        {/* =================================================================== */}
        {primaryMode === "MODE_A" && (
          <div className="border-t border-slate-800/80 bg-slate-900/80">
            <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    {
                      id: "PAGE_1_SIGNAL_MARKING" as ModeAPageId,
                      step: "第 1 頁",
                      title: "訊號標記 (Signal Marking)",
                      subtitle: "上傳原圖/數值檔・手動點選峰頂或谷底・記錄原始位置",
                      icon: Crosshair,
                    },
                    {
                      id: "PAGE_2_CALIBRATION" as ModeAPageId,
                      step: "第 2 頁",
                      title: "座標校正 (Calibration)",
                      subtitle: "點選原圖已知刻度・2點線性/3點進階校正・轉換物理座標",
                      icon: Ruler,
                    },
                    {
                      id: "PAGE_3_INTERPRETATION" as ModeAPageId,
                      step: "第 3 頁",
                      title: "化學判讀與結構推論 (Interpretation)",
                      subtitle: "讀取校正訊號與分子式・官能基判讀・候選結構生成與驗證",
                      icon: FlaskConical,
                    },
                  ] as const
                ).map((pg, idx) => {
                  const Icon = pg.icon;
                  const isCurrent = modeAPage === pg.id;
                  return (
                    <React.Fragment key={pg.id}>
                      <button
                        type="button"
                        onClick={() => setModeAPage(pg.id)}
                        className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2 text-left transition ${
                          isCurrent
                            ? "border-cyan-500 bg-cyan-950/70 text-cyan-100 shadow-sm"
                            : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                        }`}
                      >
                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-extrabold ${
                            isCurrent
                              ? "bg-cyan-500 text-slate-950"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                              {pg.step}
                            </span>
                            <span className="text-xs font-bold text-slate-100">
                              {pg.title}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {pg.subtitle}
                          </div>
                        </div>
                      </button>
                      {idx < 2 && (
                        <ArrowRight className="h-4 w-4 shrink-0 text-slate-600" />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* 右側：目前標記與校正統計摘要 */}
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                <span className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-slate-300">
                  已標記訊號：
                  <strong className="ml-1 text-cyan-300">
                    {activeEvidenceSummary.totalMarkedSignals}
                  </strong>
                </span>
                <span className="rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-2.5 py-1 text-emerald-300">
                  已校正物理座標：
                  <strong className="ml-1">
                    {activeEvidenceSummary.calibratedSignalsCount}
                  </strong>
                </span>
                {activeEvidenceSummary.uncalibratedSignalsCount > 0 && (
                  <span className="rounded-lg border border-amber-500/40 bg-amber-950/50 px-2.5 py-1 text-amber-300">
                    待校正像素標記：
                    <strong className="ml-1">
                      {activeEvidenceSummary.uncalibratedSignalsCount}
                    </strong>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ===================================================================== */}
      {/* 主內容區                                                              */}
      {/* ===================================================================== */}
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5">
        {/* =================================================================== */}
        {/* MODE A：實驗證據 → 官能基判讀 → 候選結構推論                        */}
        {/* =================================================================== */}
        {primaryMode === "MODE_A" && (
          <div className="space-y-5">
            {/* 頂部一級輸入證據列：分子式、其他化學證據、六大光譜模態與測試樣品快速切換 */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-100">
                    Mode A 輸入證據中心（分子式與各類光譜處於同一層級，可單獨輸入分子式、單一光譜或任意組合）
                  </h2>
                  <p className="text-xs text-slate-400">
                    支援 IR、¹H NMR、¹³C NMR、MS、MS/MS、ToF-SIMS、分子式及其他化學證據。不強迫所有模態皆完成才可分析。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleResetToEmptyUnknownSample}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                      activePresetId === ""
                        ? "border-emerald-500 bg-emerald-950/60 text-emerald-200"
                        : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                    }`}
                  >
                    重置空白未知物 (Empty Unknown)
                  </button>
                  <span className="text-slate-700">|</span>
                  <span className="text-[11px] text-slate-400">標準測試樣品：</span>
                  {REFERENCE_SAMPLE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectPreset(preset.id)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                        activePresetId === preset.id
                          ? "border-cyan-500 bg-cyan-950/60 text-cyan-200"
                          : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                      }`}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 第一層級化學證據輸入：分子式 (Molecular Formula) 與其他化學資訊 */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                <div className="md:col-span-4 rounded-lg border border-cyan-500/30 bg-slate-950/90 p-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-cyan-300">
                      一級輸入證據：已知或實驗測定分子式 (Molecular Formula)
                    </label>
                    <span className="rounded bg-cyan-950 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
                      FIRST-CLASS INPUT
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      type="text"
                      value={molecularFormulaInput}
                      onChange={(e) => setMolecularFormulaInput(e.target.value)}
                      placeholder="例如：C9H8O4、C8H8O2、C10H12O2（可單獨輸入立即推論）"
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                    />
                    {molecularFormulaInput && (
                      <button
                        type="button"
                        onClick={() => setMolecularFormulaInput("")}
                        className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-400 hover:text-slate-200"
                      >
                        清除
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                    <span>快速填入分子式測試：</span>
                    {["C9H8O4", "C8H8O2", "C8H9NO2", "C4H8O2"].map((fm) => (
                      <button
                        key={fm}
                        type="button"
                        onClick={() => setMolecularFormulaInput(fm)}
                        className="rounded border border-slate-800 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300 hover:border-cyan-500/40"
                      >
                        {fm}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-5 rounded-lg border border-slate-800 bg-slate-950/90 p-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-200">
                      其他化學證據與實驗條件備註 (Chemical Notes / Chemical Tests)
                    </label>
                    <span className="font-mono text-[10px] text-slate-400">
                      選填輔助證據
                    </span>
                  </div>
                  <input
                    type="text"
                    value={chemicalNotesInput}
                    onChange={(e) => setChemicalNotesInput(e.target.value)}
                    placeholder="例如：FeCl3 呈色陽性(酚類)、NaHCO3 冒泡(羧酸)、D2O 交換消失峰、元素分析結果..."
                    className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                  />
                  <div className="mt-1.5 text-[11px] text-slate-400">
                    輸入之化學試劑反應或樣品來源備註將連同光譜與分子式一併納入第 3 頁判讀紀錄。
                  </div>
                </div>

                <div className="md:col-span-3 rounded-lg border border-slate-800 bg-slate-950/90 p-3 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-200">
                      當前有效推論輸入摘要
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-cyan-300">
                      {activeEvidenceSummary.hasFormula
                        ? `✓ 分子式: ${molecularFormulaInput.trim()}`
                        : "○ 分子式: 未提供"}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-emerald-300">
                      ✓ 已提供光譜:{" "}
                      {activeEvidenceSummary.modalitiesWithData.length > 0
                        ? activeEvidenceSummary.modalitiesWithData.join(", ")
                        : "無 (僅依分子式或待上傳)"}
                    </div>
                  </div>
                  {modeAPage !== "PAGE_3_INTERPRETATION" && (
                    <button
                      type="button"
                      onClick={() => setModeAPage("PAGE_3_INTERPRETATION")}
                      className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-cyan-600/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500"
                    >
                      直接前往第 3 頁檢視判讀結果
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {uploadStatusMsg && (
              <div className="rounded-xl border border-cyan-500/40 bg-cyan-950/30 px-4 py-2.5 text-xs text-cyan-200">
                {uploadStatusMsg}
              </div>
            )}

            {/* =============================================================== */}
            {/* 第 1 頁：訊號標記 (Signal Marking)                              */}
            {/* =============================================================== */}
            {modeAPage === "PAGE_1_SIGNAL_MARKING" && (
              <div className="space-y-5">
                {/* 第 1 頁工作說明與前往第 2 頁按鈕 */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-500/30 bg-slate-900/90 px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-cyan-500 px-2 py-0.5 font-mono text-[11px] font-extrabold text-slate-950">
                        MODE A · 第 1 頁
                      </span>
                      <h1 className="text-base font-bold text-slate-50">
                        訊號標記（Signal Marking）— 保留原圖與真實曲線，由使用者手動點選訊號位置
                      </h1>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-300">
                      已全面停用 AI 自動尋峰寫入正式實驗證據。請選擇光譜模態並上傳檔案，直接在原始圖片或真實數值曲線上點擊標記峰頂或吸收谷底（圖片於此階段僅記錄原始像素座標，不要求先校正）。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200">
                      <input
                        type="checkbox"
                        checked={autoDetectOnUpload}
                        onChange={(e) => setAutoDetectOnUpload(e.target.checked)}
                        className="rounded border-slate-600 text-cyan-500"
                      />
                      <span>上傳時啟用自動讀譜尋峰</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setModeAPage("PAGE_2_CALIBRATION")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-cyan-500"
                    >
                      <span>下一步：前往第 2 頁座標校正</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* 六大光譜模態選擇與檔案上傳卡片 (IR, 1H, 13C, MS, MS/MS, ToF-SIMS) */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  {ALL_EXTENDED_MODALITIES.map((card) => {
                    const spec = getSpectrumForModality(card.id);
                    const isFocused = focusedModality === card.id;
                    const isImg =
                      spec &&
                      (spec.sourceType === "IMAGE_EXPERIMENTAL" ||
                        spec.digitizedFromImage);
                    const isCalibrated =
                      spec &&
                      (!isImg || SpectrumParser.isSpectrumCalibrated(spec));

                    return (
                      <div
                        key={card.id}
                        onClick={() => handleSelectModality(card.id)}
                        className={`cursor-pointer rounded-xl border p-3 transition flex flex-col justify-between ${
                          isFocused
                            ? "border-cyan-500 bg-slate-900 shadow-md"
                            : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono text-xs font-bold text-cyan-300">
                              {card.shortLabel}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                                spec
                                  ? "border border-emerald-500/30 bg-emerald-950/50 text-emerald-300"
                                  : "border border-slate-700 bg-slate-800 text-slate-400"
                              }`}
                            >
                              {spec ? `${spec.peaks.length} 標記` : "未載入"}
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] font-medium text-slate-200">
                            {card.title}
                          </div>
                          <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                            {card.axisDesc}
                          </div>

                          {spec ? (
                            <div className="mt-2 rounded border border-slate-800 bg-slate-950/90 p-2 font-mono text-[10px] space-y-1">
                              <div className="truncate text-slate-300">
                                {spec.fileName}
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">型態:</span>
                                <span className="text-cyan-300">
                                  {isImg ? "原始圖片" : `數值(${spec.sourceFormat})`}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-400">座標狀態:</span>
                                <span
                                  className={
                                    isCalibrated
                                      ? "text-emerald-300 font-bold"
                                      : "text-amber-300 font-bold"
                                  }
                                >
                                  {isCalibrated ? "已具備物理座標" : "原始像素(待校正)"}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 rounded border border-dashed border-slate-800 bg-slate-950/40 p-2.5 text-center text-[11px] text-slate-500">
                              尚未提供此光譜
                            </div>
                          )}
                        </div>

                        <div
                          className="mt-2.5 flex flex-wrap items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <label className="flex-1 inline-flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-700">
                            <Upload className="h-3 w-3 text-cyan-400" />
                            <span>上傳圖/數值</span>
                            <input
                              type="file"
                              accept=".csv,.txt,.jdx,.dx,.jcamp,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                              className="hidden"
                              onChange={(e) =>
                                handleFileUpload(card.id, e.target.files?.[0])
                              }
                            />
                          </label>
                          {!spec ? (
                            <button
                              type="button"
                              onClick={() =>
                                handleInitEmptyModalitySpectrum(card.id)
                              }
                              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200"
                            >
                              + 手動表
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                updateSpectrumForModality(card.id, undefined)
                              }
                              className="rounded-lg border border-rose-500/30 bg-rose-950/40 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-900/50"
                              title="移除此光譜"
                            >
                              移除
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 第 1 頁主要工作區：左側原圖/真實曲線點選標記檢視器 + 右側標記新增/移動/編輯/刪除清單 */}
                {currentSpectrum ? (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                    {/* 左側：純粹的訊號標記檢視器 (不塞入校正工具或化學判讀) */}
                    <div className="lg:col-span-7 space-y-3">
                      {/* 標記方向與溶劑設定控制列 */}
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3.5 py-2.5 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-200">
                            點擊標記訊號類型 ({focusedModalityMeta.shortLabel})：
                          </span>
                          {(
                            [
                              {
                                id: "ABSORPTION_VALLEY",
                                label: "吸收谷底 (IR Valley)",
                              },
                              {
                                id: "PEAK_TOP",
                                label: "共振/訊號峰頂 (Peak Top)",
                              },
                              {
                                id: "SHOULDER",
                                label: "肩峰 (Shoulder)",
                              },
                              {
                                id: "ION_BAR",
                                label: "質譜離子頂點 (Ion Bar)",
                              },
                            ] as const
                          ).map((dir) => (
                            <button
                              key={dir.id}
                              type="button"
                              onClick={() => setNewPeakSignalDirection(dir.id)}
                              className={`rounded-lg border px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
                                newPeakSignalDirection === dir.id
                                  ? "border-cyan-500 bg-cyan-950/70 text-cyan-200"
                                  : "border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200"
                              }`}
                            >
                              {dir.label}
                            </button>
                          ))}
                        </div>

                        {(focusedModality === "1H_NMR" ||
                          focusedModality === "13C_NMR") && (
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] text-violet-300">
                                氘代溶劑：
                              </span>
                              <select
                                value={currentSpectrum.nmrSolvent || "CDCl3"}
                                onChange={(e) =>
                                  handleChangeNmrSolvent(
                                    focusedModality,
                                    e.target.value as NMRSolvent
                                  )
                                }
                                className="rounded border border-violet-500/40 bg-violet-950/50 px-2 py-1 font-mono text-[11px] text-violet-200"
                              >
                                {Object.entries(NMR_SOLVENT_REFERENCE_SHIFTS).map(
                                  ([k, v]) => (
                                    <option key={k} value={k}>
                                      {v.label}
                                    </option>
                                  )
                                )}
                              </select>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] text-cyan-300">
                                儀器頻率：
                              </span>
                              <select
                                value={
                                  currentSpectrum.spectrometerFrequencyMHz || 400
                                }
                                onChange={(e) => {
                                  const freq = Number(e.target.value) || 400;
                                  updateSpectrumForModality(focusedModality, {
                                    ...currentSpectrum,
                                    spectrometerFrequencyMHz: freq,
                                  });
                                }}
                                className="rounded border border-cyan-500/40 bg-slate-950 px-1.5 py-1 font-mono text-[11px] text-cyan-200"
                              >
                                {[300, 400, 500, 600, 800].map((mhz) => (
                                  <option key={mhz} value={mhz}>
                                    {mhz} MHz
                                  </option>
                                ))}
                              </select>
                            </div>
                            {focusedModality === "13C_NMR" && (
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-amber-300">
                                  實驗型態：
                                </span>
                                <select
                                  value={
                                    currentSpectrum.c13ExperimentMode ||
                                    "1D_PROTON_DECOUPLED"
                                  }
                                  onChange={(e) => {
                                    updateSpectrumForModality("13C_NMR", {
                                      ...currentSpectrum,
                                      c13ExperimentMode: e.target.value as any,
                                    });
                                  }}
                                  className="rounded border border-amber-500/40 bg-slate-950 px-1.5 py-1 font-mono text-[11px] text-amber-200"
                                >
                                  <option value="1D_PROTON_DECOUPLED">
                                    1D ¹³C{`{¹H}`} 去耦
                                  </option>
                                  <option value="DEPT_135">DEPT-135</option>
                                  <option value="DEPT_90">DEPT-90</option>
                                  <option value="APT">APT</option>
                                </select>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {focusedModality === "MS/MS" && (
                        <div className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-950/20 px-3.5 py-2 text-xs">
                          <span className="font-semibold text-violet-200">
                            MS/MS 母離子 (Precursor Ion m/z)：
                          </span>
                          <input
                            type="number"
                            step="any"
                            value={msmsPrecursorMz}
                            onChange={(e) => setMsmsPrecursorMz(e.target.value)}
                            placeholder="例如：180.04 或 137"
                            className="w-36 rounded border border-violet-500/40 bg-slate-950 px-2.5 py-1 font-mono text-xs text-violet-200"
                          />
                          <span className="text-[11px] text-slate-400">
                            設定母離子 m/z 可於第 3 頁自動計算 MS/MS 中性丟失 (Neutral Losses)。
                          </span>
                        </div>
                      )}

                      <SpectrumViewer
                        spectrum={currentSpectrum}
                        selectedPeakId={selectedPeakId}
                        onSelectPeak={(pk) => setSelectedPeakId(pk.id)}
                        imageInteractionMode="MARK_PEAK"
                        onMarkPeakFromImage={handleMarkPeakFromImage}
                        onMovePeakFromImage={handleMovePeakMarkerOnImage}
                        onMarkPeakFromPlot={handleMarkPeakFromPlot}
                        onMovePeakFromPlot={handleMovePeakFromPlot}
                        hideModeSwitchButtons
                        height={340}
                      />
                    </div>

                    {/* 右側：第 1 頁已標記訊號清單（支援新增、移動微調、編輯、刪除、選取） */}
                    <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-slate-900/80 p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                          <div>
                            <h3 className="text-sm font-bold text-slate-100">
                              已標記訊號清單 ({focusedModalityMeta.shortLabel}：{currentSpectrum.peaks.length} 筆)
                            </h3>
                            <p className="text-[11px] text-slate-400">
                              可直接在左圖點擊新增或拖曳移動標記，或於下方微調像素/數值座標、裂分、積分與備註。
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleReRunAutoPeakDetection(focusedModality)
                              }
                              className="inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-950/50 px-2 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-900/60"
                              title="重新執行自動讀譜尋峰（保留人工新增與編輯訊號）"
                            >
                              自動尋峰
                            </button>
                            {selectedPeakId && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleDeletePeak(
                                    focusedModality,
                                    selectedPeakId
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded border border-rose-500/40 bg-rose-950/50 px-2 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-900/60"
                              >
                                <Trash2 className="h-3 w-3" />
                                刪除選取
                              </button>
                            )}
                            {currentSpectrum.peaks.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleClearAllPeaks(focusedModality)
                                }
                                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-rose-300 hover:bg-slate-800"
                              >
                                清空全部標記
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 手動輸入座標或像素新增標記表單 */}
                        <form
                          onSubmit={handleAddManualPeak}
                          className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-950/90 p-2.5 text-xs sm:grid-cols-4"
                        >
                          <div>
                            <label className="text-[10px] text-slate-400">
                              {currentSpectrum.sourceType ===
                                "IMAGE_EXPERIMENTAL" &&
                              !SpectrumParser.isSpectrumCalibrated(
                                currentSpectrum
                              )
                                ? "Pixel X (px)"
                                : `位置 (${currentSpectrum.xUnit})`}
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={newPeakX}
                              onChange={(e) => setNewPeakX(e.target.value)}
                              placeholder={
                                currentSpectrum.sourceType ===
                                  "IMAGE_EXPERIMENTAL" &&
                                !SpectrumParser.isSpectrumCalibrated(
                                  currentSpectrum
                                )
                                  ? "px X"
                                  : currentSpectrum.xUnit
                              }
                              className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-100"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400">
                              {currentSpectrum.sourceType ===
                                "IMAGE_EXPERIMENTAL" &&
                              !SpectrumParser.isSpectrumCalibrated(
                                currentSpectrum
                              )
                                ? "Pixel Y (px)"
                                : `強度 (${currentSpectrum.yUnit})`}
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={newPeakY}
                              onChange={(e) => setNewPeakY(e.target.value)}
                              className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-100"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400">
                              標籤 / 備註
                            </label>
                            <input
                              type="text"
                              value={newPeakAssignment}
                              onChange={(e) =>
                                setNewPeakAssignment(e.target.value)
                              }
                              placeholder="選填備註..."
                              className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                            />
                          </div>
                          <div className="flex items-end">
                            <button
                              type="submit"
                              className="inline-flex w-full items-center justify-center gap-1 rounded bg-cyan-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-cyan-500"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              新增標記
                            </button>
                          </div>
                        </form>

                        {/* 標記列表表格 */}
                        <div className="mt-3 max-h-[380px] overflow-y-auto">
                          {currentSpectrum.peaks.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/50 p-6 text-center text-xs text-slate-400">
                              目前尚無任何訊號標記。請直接點擊左側原始圖片或真實數值曲線上的吸收谷底/峰頂進行標記。
                            </div>
                          ) : (
                            <table className="w-full border-collapse text-left text-xs">
                              <thead>
                                <tr className="border-b border-slate-800 text-[10px] text-slate-400">
                                  <th className="py-1.5 pr-2">原始像素 / 位置</th>
                                  <th className="px-2 py-1.5">校正狀態 / 物理值</th>
                                  {focusedModality === "1H_NMR" && (
                                    <th className="px-2 py-1.5">裂分 / 積分</th>
                                  )}
                                  {focusedModality === "13C_NMR" && (
                                    <th className="px-2 py-1.5">DEPT</th>
                                  )}
                                  <th className="px-2 py-1.5">分類 / 備註</th>
                                  <th className="py-1.5 pl-2 text-right">刪除</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60">
                                {currentSpectrum.peaks.map((pk) => {
                                  const isSel = pk.id === selectedPeakId;
                                  const isUncal = pk.isCalibrated === false;
                                  return (
                                    <tr
                                      key={pk.id}
                                      onClick={() => setSelectedPeakId(pk.id)}
                                      className={`cursor-pointer transition ${
                                        isSel
                                          ? "bg-cyan-950/40"
                                          : "hover:bg-slate-800/40"
                                      }`}
                                    >
                                      {/* 原始像素位置 (可微調移動) */}
                                      <td className="py-2 pr-2 font-mono text-[11px]">
                                        {pk.pixelX !== undefined &&
                                        pk.pixelY !== undefined ? (
                                          <div className="flex items-center gap-1">
                                            <span className="text-slate-400">
                                              px(
                                            </span>
                                            <input
                                              type="number"
                                              value={pk.pixelX}
                                              onChange={(e) => {
                                                const nextPx = Number(
                                                  e.target.value
                                                );
                                                if (!Number.isFinite(nextPx))
                                                  return;
                                                handleUpdatePeak(
                                                  focusedModality,
                                                  pk.id,
                                                  {
                                                    pixelX: nextPx,
                                                    x: isUncal ? nextPx : pk.x,
                                                  }
                                                );
                                              }}
                                              className="w-14 rounded border border-slate-700 bg-slate-950 px-1 py-0.5 font-mono text-[11px] text-amber-300"
                                              title="微調原始像素 X"
                                            />
                                            <span className="text-slate-400">
                                              ,
                                            </span>
                                            <input
                                              type="number"
                                              value={pk.pixelY}
                                              onChange={(e) => {
                                                const nextPy = Number(
                                                  e.target.value
                                                );
                                                if (!Number.isFinite(nextPy))
                                                  return;
                                                handleUpdatePeak(
                                                  focusedModality,
                                                  pk.id,
                                                  {
                                                    pixelY: nextPy,
                                                  }
                                                );
                                              }}
                                              className="w-14 rounded border border-slate-700 bg-slate-950 px-1 py-0.5 font-mono text-[11px] text-amber-300"
                                              title="微調原始像素 Y"
                                            />
                                            <span className="text-slate-400">
                                              )
                                            </span>
                                          </div>
                                        ) : (
                                          <input
                                            type="number"
                                            step="any"
                                            value={pk.x}
                                            onChange={(e) => {
                                              const nextX = Number(
                                                e.target.value
                                              );
                                              if (!Number.isFinite(nextX))
                                                return;
                                              handleUpdatePeak(
                                                focusedModality,
                                                pk.id,
                                                { x: nextX }
                                              );
                                            }}
                                            className="w-20 rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 font-mono text-[11px] text-cyan-300"
                                          />
                                        )}
                                      </td>

                                      {/* 校正狀態與物理座標 */}
                                      <td className="px-2 py-2 font-mono text-[11px]">
                                        {isUncal ? (
                                          <span className="inline-flex items-center rounded border border-amber-500/40 bg-amber-950/50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                                            尚未校正 (待第 2 頁轉換)
                                          </span>
                                        ) : (
                                          <span className="font-bold text-emerald-300">
                                            {pk.x} {currentSpectrum.xUnit}
                                          </span>
                                        )}
                                      </td>

                                      {/* 1H NMR 裂分、積分與 J 值 */}
                                      {focusedModality === "1H_NMR" && (
                                        <td className="px-2 py-2">
                                          <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-1">
                                              <select
                                                value={pk.multiplicity || "s"}
                                                onChange={(e) =>
                                                  handleUpdatePeak(
                                                    focusedModality,
                                                    pk.id,
                                                    {
                                                      multiplicity: e.target
                                                        .value as SpectralPeak["multiplicity"],
                                                    }
                                                  )
                                                }
                                                className="rounded border border-slate-700 bg-slate-950 px-1 py-0.5 font-mono text-[10px] text-cyan-200"
                                              >
                                                {[
                                                  "s",
                                                  "d",
                                                  "t",
                                                  "q",
                                                  "dd",
                                                  "td",
                                                  "dt",
                                                  "ddd",
                                                  "sept",
                                                  "dq",
                                                  "qd",
                                                  "ABq",
                                                  "m",
                                                  "br s",
                                                ].map((m) => (
                                                  <option key={m} value={m}>
                                                    {m}
                                                  </option>
                                                ))}
                                              </select>
                                              <input
                                                type="number"
                                                step="0.5"
                                                min="0.5"
                                                value={
                                                  pk.integral ??
                                                  pk.integration ??
                                                  1
                                                }
                                                onChange={(e) => {
                                                  const v =
                                                    parseFloat(e.target.value) ||
                                                    1;
                                                  handleUpdatePeak(
                                                    focusedModality,
                                                    pk.id,
                                                    {
                                                      integral: v,
                                                      integration: v,
                                                    }
                                                  );
                                                }}
                                                className="w-11 rounded border border-slate-700 bg-slate-950 px-1 py-0.5 font-mono text-[10px] text-emerald-300"
                                              />
                                              <span className="text-[10px] text-slate-400">
                                                H
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                              <span className="font-mono text-[9px] text-slate-400">
                                                J(Hz):
                                              </span>
                                              <input
                                                type="text"
                                                defaultValue={
                                                  pk.jValues &&
                                                  pk.jValues.length > 0
                                                    ? pk.jValues.join(", ")
                                                    : pk.jCouplingHz
                                                      ? String(pk.jCouplingHz)
                                                      : ""
                                                }
                                                placeholder="例: 7.8, 1.6"
                                                onBlur={(e) => {
                                                  const parsedJ = e.target.value
                                                    .split(/[,\s]+/)
                                                    .map((v) => parseFloat(v))
                                                    .filter(
                                                      (n) =>
                                                        Number.isFinite(n) &&
                                                        n > 0
                                                    );
                                                  handleUpdatePeak(
                                                    focusedModality,
                                                    pk.id,
                                                    {
                                                      jValues: parsedJ,
                                                      jCouplingHz: parsedJ[0],
                                                    }
                                                  );
                                                }}
                                                className="w-20 rounded border border-slate-700 bg-slate-950 px-1 py-0.5 font-mono text-[10px] text-violet-200"
                                              />
                                            </div>
                                          </div>
                                        </td>
                                      )}

                                      {/* 13C NMR DEPT */}
                                      {focusedModality === "13C_NMR" && (
                                        <td className="px-2 py-2">
                                          <select
                                            value={
                                              pk.carbonType ||
                                              pk.deptType ||
                                              "CH"
                                            }
                                            onChange={(e) =>
                                              handleUpdatePeak(
                                                focusedModality,
                                                pk.id,
                                                {
                                                  carbonType: e.target
                                                    .value as SpectralPeak["carbonType"],
                                                }
                                              )
                                            }
                                            className="rounded border border-slate-700 bg-slate-950 px-1 py-0.5 font-mono text-[10px] text-amber-200"
                                          >
                                            <option value="C_quat">
                                              C (季碳)
                                            </option>
                                            <option value="CH">CH</option>
                                            <option value="CH2">CH₂</option>
                                            <option value="CH3">CH₃</option>
                                          </select>
                                        </td>
                                      )}

                                      {/* 分類與備註 */}
                                      <td className="px-2 py-2">
                                        <div className="flex flex-col gap-1">
                                          <select
                                            value={
                                              pk.userClassification ||
                                              "COMPOUND"
                                            }
                                            onChange={(e) =>
                                              handleUpdatePeak(
                                                focusedModality,
                                                pk.id,
                                                {
                                                  userClassification: e.target
                                                    .value as SpectralPeak["userClassification"],
                                                }
                                              )
                                            }
                                            className="rounded border border-slate-700 bg-slate-950 px-1 py-0.5 font-mono text-[10px] text-slate-200"
                                          >
                                            <option value="COMPOUND">
                                              樣品實測峰 (Sample)
                                            </option>
                                            <option value="SOLVENT">
                                              溶劑峰 (Solvent)
                                            </option>
                                            <option value="IMPURITY">
                                              雜質峰 (Impurity)
                                            </option>
                                            <option value="NOISE">
                                              雜訊 (Noise)
                                            </option>
                                          </select>
                                          <input
                                            type="text"
                                            value={pk.assignment || ""}
                                            onChange={(e) =>
                                              handleUpdatePeak(
                                                focusedModality,
                                                pk.id,
                                                { assignment: e.target.value }
                                              )
                                            }
                                            placeholder="備註..."
                                            className="rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5 text-[11px] text-slate-300"
                                          />
                                        </div>
                                      </td>

                                      <td className="py-2 pl-2 text-right">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeletePeak(
                                              focusedModality,
                                              pk.id
                                            );
                                          }}
                                          className="rounded p-1 text-slate-400 hover:bg-rose-950/60 hover:text-rose-300"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 border-t border-slate-800 pt-3 flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">
                          標記完成後，請進入第 2 頁進行座標校正
                        </span>
                        <button
                          type="button"
                          onClick={() => setModeAPage("PAGE_2_CALIBRATION")}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-cyan-500"
                        >
                          前往第 2 頁：座標校正
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/50 p-8 text-center">
                    <Crosshair className="mx-auto h-8 w-8 text-cyan-400" />
                    <h3 className="mt-2 text-sm font-bold text-slate-100">
                      尚未載入 {focusedModalityMeta.title} 檔案
                    </h3>
                    <p className="mx-auto mt-1 max-w-xl text-xs text-slate-400">
                      請點擊上方「上傳圖/數值」按鈕上傳 PNG/JPG/WEBP 原始光譜圖片或 CSV/TXT/JCAMP-DX/XLSX 數值檔案，或點擊下方按鈕建立手動訊號表。若您僅有分子式，亦可直接於上方輸入分子式並前往第 3 頁判讀。
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleInitEmptyModalitySpectrum(focusedModality)
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-cyan-500"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        建立 {focusedModalityMeta.shortLabel} 手動訊號工作表
                      </button>
                      {activeEvidenceSummary.hasFormula && (
                        <button
                          type="button"
                          onClick={() => setModeAPage("PAGE_3_INTERPRETATION")}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/60 px-3.5 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-900/60"
                        >
                          已輸入分子式 ({molecularFormulaInput}) → 直接進入第 3 頁判讀
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* =============================================================== */}
            {/* 第 2 頁：座標校正 (Calibration)                                 */}
            {/* =============================================================== */}
            {modeAPage === "PAGE_2_CALIBRATION" && (
              <div className="space-y-5">
                {/* 第 2 頁標題與前後頁導覽 */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-slate-900/90 px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-amber-500 px-2 py-0.5 font-mono text-[11px] font-extrabold text-slate-950">
                        MODE A · 第 2 頁
                      </span>
                      <h1 className="text-base font-bold text-slate-50">
                        座標校正（Calibration）— 點選原圖已知刻度並輸入實際物理數值
                      </h1>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-300">
                      讀取第 1 頁已標記的訊號，預設採用直覺之兩點線性校正（三點最小平方法校正置於進階選項）。返回第 1 頁修改標記再回到第 2 頁重新校正絕不遺失標記。
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setModeAPage("PAGE_1_SIGNAL_MARKING")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      <span>返回第 1 頁修改訊號標記</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setModeAPage("PAGE_3_INTERPRETATION")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-cyan-500"
                    >
                      <span>下一步：前往第 3 頁化學判讀與結構推論</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* 模態切換列 */}
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                  <span className="text-xs font-semibold text-slate-300">
                    選擇欲校正之光譜模態：
                  </span>
                  {ALL_EXTENDED_MODALITIES.map((m) => {
                    const spec = getSpectrumForModality(m.id);
                    const isFocused = focusedModality === m.id;
                    const isImg =
                      spec &&
                      (spec.sourceType === "IMAGE_EXPERIMENTAL" ||
                        spec.digitizedFromImage);
                    const isCal =
                      spec &&
                      (!isImg || SpectrumParser.isSpectrumCalibrated(spec));

                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleSelectModality(m.id)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-xs font-bold transition ${
                          isFocused
                            ? "border-amber-500 bg-amber-950/60 text-amber-200"
                            : "border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <span>{m.shortLabel}</span>
                        {spec && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] ${
                              isCal
                                ? "bg-emerald-950 text-emerald-300"
                                : "bg-amber-950 text-amber-300"
                            }`}
                          >
                            {isImg
                              ? isCal
                                ? "已校正"
                                : `待校正(${spec.peaks.length}峰)`
                              : "數值免校正"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {calibrationMessage && (
                  <div
                    className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-center justify-between ${
                      calibrationMessage.type === "SUCCESS"
                        ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-200"
                        : calibrationMessage.type === "ERROR"
                          ? "border-rose-500/40 bg-rose-950/30 text-rose-200"
                          : "border-cyan-500/40 bg-cyan-950/30 text-cyan-200"
                    }`}
                  >
                    <span>{calibrationMessage.text}</span>
                    {calibrationMessage.type === "SUCCESS" && (
                      <button
                        type="button"
                        onClick={() => setModeAPage("PAGE_3_INTERPRETATION")}
                        className="ml-3 shrink-0 rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-500"
                      >
                        進入第 3 頁判讀 →
                      </button>
                    )}
                  </div>
                )}

                {currentSpectrum ? (
                  currentSpectrum.sourceType === "NUMERIC_EXPERIMENTAL" &&
                  !currentSpectrum.digitizedFromImage ? (
                    /* 已具有可靠物理座標之數值資料提示 */
                    <div className="space-y-4">
                      <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-5 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-400 mt-0.5" />
                          <div>
                            <h3 className="text-sm font-bold text-emerald-200">
                              此光譜 ({currentSpectrum.fileName}) 為已具備可靠物理座標之數值資料 ({currentSpectrum.sourceFormat})
                            </h3>
                            <p className="mt-1 text-xs text-slate-300">
                              全部 {currentSpectrum.peaks.length} 個已標記訊號皆已直接對應至真實物理座標 ({currentSpectrum.xUnit})，可略過不必要的圖片像素校正步驟，直接前往第 3 頁進行化學判讀與結構推論。
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setModeAPage("PAGE_3_INTERPRETATION")}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                        >
                          略過圖片校正 → 直接進入第 3 頁判讀
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>

                      <SpectrumViewer
                        spectrum={currentSpectrum}
                        selectedPeakId={selectedPeakId}
                        onSelectPeak={(pk) => setSelectedPeakId(pk.id)}
                        height={300}
                      />
                    </div>
                  ) : (
                    /* 原始圖片座標校正工作區 */
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                      {/* 左側：原圖校正點取樣與即時預覽檢視器 */}
                      <div className="lg:col-span-7 space-y-3">
                        <SpectrumViewer
                          spectrum={currentSpectrum}
                          selectedPeakId={selectedPeakId}
                          onSelectPeak={(pk) => setSelectedPeakId(pk.id)}
                          imageInteractionMode="CALIBRATE"
                          activeCalibTargetLabel={`校正點 ${nextCalibTarget}`}
                          livePreviewMapPixelX={
                            liveCalibrationPreview
                              ? (px: number) =>
                                  SpectrumParser.pixelToPhysicalX(
                                    px,
                                    liveCalibrationPreview
                                  )
                              : null
                          }
                          hideModeSwitchButtons
                          calibrationPreviewPoints={
                            calibrationMode === "THREE_POINT" &&
                            showAdvancedCalibration
                              ? [
                                  {
                                    label: "Pt A",
                                    pixelX: calibPointA.pixelX,
                                    pixelY: calibPointA.pixelY,
                                    physicalX: calibPointA.realX,
                                    color: "#22d3ee",
                                  },
                                  {
                                    label: "Pt B",
                                    pixelX: calibPointB.pixelX,
                                    pixelY: calibPointB.pixelY,
                                    physicalX: calibPointB.realX,
                                    color: "#f59e0b",
                                  },
                                  {
                                    label: "Pt C",
                                    pixelX: calibPointC.pixelX,
                                    pixelY: calibPointC.pixelY,
                                    physicalX: calibPointC.realX,
                                    color: "#c084fc",
                                  },
                                ]
                              : [
                                  {
                                    label: "Pt A",
                                    pixelX: calibPointA.pixelX,
                                    pixelY: calibPointA.pixelY,
                                    physicalX: calibPointA.realX,
                                    color: "#22d3ee",
                                  },
                                  {
                                    label: "Pt B",
                                    pixelX: calibPointB.pixelX,
                                    pixelY: calibPointB.pixelY,
                                    physicalX: calibPointB.realX,
                                    color: "#f59e0b",
                                  },
                                ]
                          }
                          onPickImagePixel={(px, py) => {
                            if (nextCalibTarget === "A") {
                              setCalibPointA((prev) => ({
                                ...prev,
                                pixelX: px,
                                pixelY: py,
                              }));
                              setNextCalibTarget("B");
                              setCalibrationMessage({
                                type: "INFO",
                                text: `已點選設定「校正點 A」像素座標 (${px}, ${py})，請確認點 A 對應之實際數值 (${currentSpectrum.xUnit})，並點擊原圖設定「校正點 B」。`,
                              });
                            } else if (nextCalibTarget === "B") {
                              setCalibPointB((prev) => ({
                                ...prev,
                                pixelX: px,
                                pixelY: py,
                              }));
                              setNextCalibTarget(
                                calibrationMode === "THREE_POINT" &&
                                  showAdvancedCalibration
                                  ? "C"
                                  : "A"
                              );
                              setCalibrationMessage({
                                type: "INFO",
                                text: `已點選設定「校正點 B」像素座標 (${px}, ${py})。右側已即時預覽所有標記訊號之轉換座標，請點擊「套用座標校正」完成確認！`,
                              });
                            } else {
                              setCalibPointC((prev) => ({
                                ...prev,
                                pixelX: px,
                                pixelY: py,
                              }));
                              setNextCalibTarget("A");
                              setCalibrationMessage({
                                type: "INFO",
                                text: `已點選設定進階「校正點 C」像素座標 (${px}, ${py})，請點擊「套用三點最小平方法校正」。`,
                              });
                            }
                          }}
                          height={340}
                        />
                      </div>

                      {/* 右側：兩點校正設定（預設）+ 進階三點校正 + 第 1 頁標記即時轉換預覽表 */}
                      <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                          <div>
                            <h3 className="text-sm font-bold text-slate-100">
                              原圖已知刻度校正設定 ({focusedModalityMeta.shortLabel})
                            </h3>
                            <p className="text-[11px] text-slate-400">
                              步驟：1. 點擊左圖 X 軸第一個已知刻度 (Pt A) 並輸入數值 → 2. 點擊第二個已知刻度 (Pt B) 並輸入數值 → 3. 點擊套用校正。
                            </p>
                          </div>
                          <span className="rounded bg-cyan-950 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
                            預設：2點校正
                          </span>
                        </div>

                        {/* Point A 與 Point B 輸入區 */}
                        <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/90 p-3 text-xs">
                          {/* Point A */}
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-cyan-300">
                              校正點 A (已知刻度 1，例如左端刻度)
                            </span>
                            <button
                              type="button"
                              onClick={() => setNextCalibTarget("A")}
                              className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold ${
                                nextCalibTarget === "A"
                                  ? "bg-cyan-600 text-white"
                                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                              }`}
                            >
                              {nextCalibTarget === "A"
                                ? "● 目前點圖設定 Pt A"
                                : "切換為點圖取樣 A"}
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-slate-400">
                                原圖像素 Pixel X / Y
                              </label>
                              <div className="mt-0.5 flex gap-1">
                                <input
                                  type="number"
                                  value={calibPointA.pixelX}
                                  onChange={(e) =>
                                    setCalibPointA((p) => ({
                                      ...p,
                                      pixelX: Number(e.target.value),
                                    }))
                                  }
                                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs"
                                />
                                <input
                                  type="number"
                                  value={calibPointA.pixelY}
                                  onChange={(e) =>
                                    setCalibPointA((p) => ({
                                      ...p,
                                      pixelY: Number(e.target.value),
                                    }))
                                  }
                                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-cyan-300">
                                實際物理刻度值 ({currentSpectrum.xUnit})
                              </label>
                              <input
                                type="number"
                                step="any"
                                value={calibPointA.realX}
                                onChange={(e) =>
                                  setCalibPointA((p) => ({
                                    ...p,
                                    realX: Number(e.target.value),
                                  }))
                                }
                                className="mt-0.5 w-full rounded border border-cyan-500/50 bg-slate-900 px-2.5 py-1 font-mono text-xs font-bold text-cyan-200"
                              />
                            </div>
                          </div>

                          {/* Point B */}
                          <div className="flex items-center justify-between border-t border-slate-800/80 pt-2.5">
                            <span className="font-mono font-bold text-amber-300">
                              校正點 B (已知刻度 2，例如右端刻度)
                            </span>
                            <button
                              type="button"
                              onClick={() => setNextCalibTarget("B")}
                              className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold ${
                                nextCalibTarget === "B"
                                  ? "bg-amber-600 text-white"
                                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                              }`}
                            >
                              {nextCalibTarget === "B"
                                ? "● 目前點圖設定 Pt B"
                                : "切換為點圖取樣 B"}
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-slate-400">
                                原圖像素 Pixel X / Y
                              </label>
                              <div className="mt-0.5 flex gap-1">
                                <input
                                  type="number"
                                  value={calibPointB.pixelX}
                                  onChange={(e) =>
                                    setCalibPointB((p) => ({
                                      ...p,
                                      pixelX: Number(e.target.value),
                                    }))
                                  }
                                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs"
                                />
                                <input
                                  type="number"
                                  value={calibPointB.pixelY}
                                  onChange={(e) =>
                                    setCalibPointB((p) => ({
                                      ...p,
                                      pixelY: Number(e.target.value),
                                    }))
                                  }
                                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-amber-300">
                                實際物理刻度值 ({currentSpectrum.xUnit})
                              </label>
                              <input
                                type="number"
                                step="any"
                                value={calibPointB.realX}
                                onChange={(e) =>
                                  setCalibPointB((p) => ({
                                    ...p,
                                    realX: Number(e.target.value),
                                  }))
                                }
                                className="mt-0.5 w-full rounded border border-amber-500/50 bg-slate-900 px-2.5 py-1 font-mono text-xs font-bold text-amber-200"
                              />
                            </div>
                          </div>

                          {/* 進階選項：三點校正 (3-Point OLS) 與圖表邊界設定 */}
                          <div className="border-t border-slate-800 pt-2">
                            <button
                              type="button"
                              onClick={() => {
                                const nextOpen = !showAdvancedCalibration;
                                setShowAdvancedCalibration(nextOpen);
                                setCalibrationMode(
                                  nextOpen ? "THREE_POINT" : "TWO_POINT"
                                );
                                if (!nextOpen && nextCalibTarget === "C") {
                                  setNextCalibTarget("A");
                                }
                              }}
                              className="flex w-full items-center justify-between text-left text-[11px] font-semibold text-slate-400 hover:text-slate-200"
                            >
                              <span>
                                進階選項：三點最小平方法校正 (3-Point OLS) 與軸向診斷
                              </span>
                              {showAdvancedCalibration ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </button>

                            {showAdvancedCalibration && (
                              <div className="mt-2.5 space-y-2 rounded border border-violet-500/30 bg-violet-950/20 p-2.5">
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-bold text-purple-300">
                                    進階校正點 C (中段線性度驗證點)
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setNextCalibTarget("C")}
                                    className={`rounded px-2 py-0.5 font-mono text-[10px] font-semibold ${
                                      nextCalibTarget === "C"
                                        ? "bg-purple-600 text-white"
                                        : "bg-slate-800 text-slate-300"
                                    }`}
                                  >
                                    {nextCalibTarget === "C"
                                      ? "● 目前點圖設定 Pt C"
                                      : "點圖取樣 C"}
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] text-slate-400">
                                      Pixel X / Y
                                    </label>
                                    <div className="mt-0.5 flex gap-1">
                                      <input
                                        type="number"
                                        value={calibPointC.pixelX}
                                        onChange={(e) =>
                                          setCalibPointC((p) => ({
                                            ...p,
                                            pixelX: Number(e.target.value),
                                          }))
                                        }
                                        className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs"
                                      />
                                      <input
                                        type="number"
                                        value={calibPointC.pixelY}
                                        onChange={(e) =>
                                          setCalibPointC((p) => ({
                                            ...p,
                                            pixelY: Number(e.target.value),
                                          }))
                                        }
                                        className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs"
                                      />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="text-[10px] text-purple-300">
                                      實際刻度值 ({currentSpectrum.xUnit})
                                    </label>
                                    <input
                                      type="number"
                                      step="any"
                                      value={calibPointC.realX}
                                      onChange={(e) =>
                                        setCalibPointC((p) => ({
                                          ...p,
                                          realX: Number(e.target.value),
                                        }))
                                      }
                                      className="mt-0.5 w-full rounded border border-purple-500/40 bg-slate-900 px-2 py-1 font-mono text-xs text-purple-200"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={handleApplyCalibration}
                            className="w-full rounded-lg bg-amber-500 py-2.5 text-xs font-extrabold text-slate-950 shadow-sm hover:bg-amber-400"
                          >
                            {showAdvancedCalibration &&
                            calibrationMode === "THREE_POINT"
                              ? `套用三點最小平方法校正並轉換 ${currentSpectrum.peaks.length} 個標記訊號`
                              : `套用兩點線性座標校正並轉換 ${currentSpectrum.peaks.length} 個標記訊號`}
                          </button>
                        </div>

                        {/* 即時預覽與已校正結果對照表 */}
                        <div className="rounded-lg border border-slate-800 bg-slate-950/90 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-200">
                              第 1 頁標記訊號座標轉換即時預覽 ({currentSpectrum.peaks.length} 筆)
                            </span>
                            <span className="font-mono text-[10px] text-cyan-300">
                              {liveCalibrationPreview
                                ? liveCalibrationPreview.xAxisDirection ===
                                  "DESCENDING"
                                  ? "X軸方向：左高右低"
                                  : "X軸方向：左低右高"
                                : "請設定兩個不同刻度點"}
                            </span>
                          </div>

                          <div className="mt-2 max-h-48 overflow-y-auto">
                            {currentSpectrum.peaks.length === 0 ? (
                              <div className="py-3 text-center text-[11px] text-slate-500">
                                第 1 頁尚未標記任何訊號。可點擊上方「返回第 1 頁修改訊號標記」新增標記。
                              </div>
                            ) : (
                              <table className="w-full border-collapse text-left font-mono text-[11px]">
                                <thead>
                                  <tr className="border-b border-slate-800 text-[10px] text-slate-400">
                                    <th className="py-1 pr-2">原始像素 (px, py)</th>
                                    <th className="px-2 py-1 text-cyan-300">
                                      即時預覽 ({currentSpectrum.xUnit})
                                    </th>
                                    <th className="py-1 pl-2 text-emerald-300">
                                      已套用正式值
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/60">
                                  {currentSpectrum.peaks.map((pk) => {
                                    const previewVal =
                                      liveCalibrationPreview &&
                                      pk.pixelX !== undefined
                                        ? SpectrumParser.pixelToPhysicalX(
                                            pk.pixelX,
                                            liveCalibrationPreview
                                          ).toFixed(
                                            focusedModality === "IR" ? 1 : 2
                                          )
                                        : "—";
                                    return (
                                      <tr key={pk.id}>
                                        <td className="py-1.5 pr-2 text-slate-300">
                                          px({pk.pixelX ?? "—"},{" "}
                                          {pk.pixelY ?? "—"})
                                        </td>
                                        <td className="px-2 py-1.5 font-bold text-cyan-300">
                                          {previewVal} {currentSpectrum.xUnit}
                                        </td>
                                        <td className="py-1.5 pl-2">
                                          {pk.isCalibrated === false ? (
                                            <span className="text-amber-300">
                                              尚未套用校正
                                            </span>
                                          ) : (
                                            <span className="font-bold text-emerald-300">
                                              {pk.x} {currentSpectrum.xUnit}
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/50 p-8 text-center">
                    <Ruler className="mx-auto h-8 w-8 text-amber-400" />
                    <h3 className="mt-2 text-sm font-bold text-slate-100">
                      此模態 ({focusedModalityMeta.shortLabel}) 尚未載入光譜
                    </h3>
                    <p className="mx-auto mt-1 max-w-lg text-xs text-slate-400">
                      請返回第 1 頁上傳光譜並標記訊號，或切換上方已載入之光譜模態進行校正。
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* =============================================================== */}
            {/* 第 3 頁：化學判讀與結構推論 (Interpretation)                    */}
            {/* =============================================================== */}
            {modeAPage === "PAGE_3_INTERPRETATION" && (
              <div className="space-y-5">
                {/* 第 3 頁頂部工作列（與第 1、2 頁標記及校正工具完全分離） */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-slate-900/90 px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-emerald-500 px-2 py-0.5 font-mono text-[11px] font-extrabold text-slate-950">
                        MODE A · 第 3 頁
                      </span>
                      <h1 className="text-base font-bold text-slate-50">
                        化學判讀與結構推論（Interpretation）— 官能基判讀、正反證據鏈與候選結構排名
                      </h1>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-300">
                      讀取已校正之人工確認訊號、分子式及其他化學證據。每個判讀皆明確列出支持證據、反對證據、相關峰位、可信度與不確定性，絕不單憑單一孤立峰斷言唯一結構。
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setModeAPage("PAGE_1_SIGNAL_MARKING")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      返回第 1 頁修改標記
                    </button>
                    <button
                      type="button"
                      onClick={() => setModeAPage("PAGE_2_CALIBRATION")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
                    >
                      <Ruler className="h-3.5 w-3.5 text-amber-400" />
                      返回第 2 頁重新校正
                    </button>
                  </div>
                </div>

                {/* 未校正訊號警告橫幅（未校正訊號保留顯示，但明確標示座標尚未確定，絕不假裝成可靠物理座標） */}
                {bundle.uncalibratedSignals &&
                  bundle.uncalibratedSignals.length > 0 && (
                    <div className="rounded-xl border border-amber-500/50 bg-amber-950/30 p-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
                        <div>
                          <h3 className="text-xs font-bold text-amber-200">
                            注意：偵測到 {bundle.uncalibratedSignals.length} 個尚未完成座標校正之原始像素標記（座標尚未確定，不假裝為物理座標納入自動比對）
                          </h3>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {bundle.uncalibratedSignals.map((u) => (
                              <span
                                key={`${u.modality}-${u.id}`}
                                className="rounded border border-amber-500/40 bg-slate-950/90 px-2 py-0.5 font-mono text-[11px] text-amber-300"
                              >
                                [{u.modality}] px({u.pixelX ?? "?"},{" "}
                                {u.pixelY ?? "?"}) — 座標尚未確定
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setModeAPage("PAGE_2_CALIBRATION")}
                        className="rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-extrabold text-slate-950 hover:bg-amber-400"
                      >
                        前往第 2 頁完成座標校正 →
                      </button>
                    </div>
                  )}

                {/* 量化結構約束與分子式收斂指標列 */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                    <div className="text-[11px] text-slate-400">
                      推論 / 輸入分子式
                    </div>
                    <div className="mt-1 font-mono text-base font-bold text-cyan-300">
                      {solvedConstraintSpace.plausibleFormulas[0]?.formula ||
                        molecularFormulaInput.trim() ||
                        "待補充分子式或 MS"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                    <div className="text-[11px] text-slate-400">
                      標稱分子量 (MW)
                    </div>
                    <div className="mt-1 font-mono text-base font-bold text-slate-100">
                      {modeAReport.constraints.estimatedMolecularWeight
                        ? `${modeAReport.constraints.estimatedMolecularWeight} Da`
                        : "NOT PROVIDED"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                    <div className="text-[11px] text-slate-400">
                      不飽和度範圍 (IHD / DBE)
                    </div>
                    <div className="mt-1 font-mono text-base font-bold text-amber-300">
                      {solvedConstraintSpace.unsaturationRange[0]} –{" "}
                      {solvedConstraintSpace.unsaturationRange[1]}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                    <div className="text-[11px] text-slate-400">
                      氮規則奇偶性 (N-Rule)
                    </div>
                    <div className="mt-1 font-mono text-base font-bold text-emerald-300">
                      {modeAReport.constraints.nitrogenRuleParity || "UNKNOWN"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                    <div className="text-[11px] text-slate-400">
                      ¹H 積分 / ¹³C 環境數
                    </div>
                    <div className="mt-1 font-mono text-sm font-bold text-slate-100">
                      {modeAReport.constraints.estimatedProtonCount !== undefined
                        ? `${modeAReport.constraints.estimatedProtonCount}H`
                        : "—"}{" "}
                      /{" "}
                      {modeAReport.constraints
                        .estimatedCarbonEnvironmentCount !== undefined
                        ? `${modeAReport.constraints.estimatedCarbonEnvironmentCount}C`
                        : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                    <div className="text-[11px] text-slate-400">
                      芳環取代型態
                    </div>
                    <div className="mt-1 font-mono text-xs font-bold text-violet-300">
                      {modeAReport.constraints.aromaticSubstitutionPattern ||
                        "UNKNOWN / NONE"}
                    </div>
                  </div>
                </div>

                {/* =========================================================== */}
                {/* 第一部分：官能基與化學環境判讀（顯示支持證據、反對證據、相關峰位、可信度、不確定性） */}
                {/* =========================================================== */}
                <div className="rounded-xl border border-cyan-500/30 bg-slate-900/90 p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div>
                      <h2 className="text-sm font-bold text-cyan-200">
                        1. 官能基與化學環境判讀（Functional Groups &amp; Chemical Environments）
                      </h2>
                      <p className="text-xs text-slate-400">
                        整合所有已校正光譜訊號、分子式與化學備註，逐項列出支持證據、反對證據、相關峰位、可信度與不確定性說明。
                      </p>
                    </div>
                    <span className="rounded border border-cyan-500/30 bg-cyan-950/60 px-2.5 py-1 font-mono text-[11px] font-bold text-cyan-300">
                      {(modeAReport.constraints.functionalGroups || []).length}{" "}
                      項官能基約束評估
                    </span>
                  </div>

                  {/* 跨模態官能基詳細判讀卡片 (含支持證據、反對證據、相關峰位、可信度、不確定性) */}
                  {(modeAReport.constraints.functionalGroups || []).length ===
                  0 ? (
                    <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/50 p-6 text-center text-xs text-slate-400">
                      目前尚無已校正之特徵光譜峰可供官能基判讀。若您僅輸入分子式，請直接參閱下方「分子式異構物與候選結構推論」；若已標記圖片訊號，請確認已於第 2 頁套用座標校正。
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {(modeAReport.constraints.functionalGroups || []).map(
                        (fg, idx) => {
                          const fgDisplayName =
                            fg.groupName || fg.label || fg.groupFamily;
                          const associatedEv = spectrumEvidenceList.filter(
                            (ev) => {
                              const inf = (ev.inferredGroup || "").toLowerCase();
                              const gName = fgDisplayName.toLowerCase();
                              const gFam = (fg.groupFamily || "").toLowerCase();
                              return (
                                (inf && gName && inf.includes(gName)) ||
                                (inf && gName && gName.includes(inf)) ||
                                (inf && gFam && inf.includes(gFam))
                              );
                            }
                          );
                          const srcModalities =
                            fg.sourceModalities &&
                            fg.sourceModalities.length > 0
                              ? fg.sourceModalities
                              : [fg.sourceModality];
                          const isSinglePeakOnly =
                            associatedEv.length === 1 &&
                            srcModalities.length <= 1;
                          const confPct =
                            fg.confidence <= 1
                              ? Math.round(fg.confidence * 100)
                              : Math.round(fg.confidence);

                          return (
                            <div
                              key={idx}
                              className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 text-xs flex flex-col justify-between space-y-2.5"
                            >
                              <div>
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-bold text-slate-100 text-sm">
                                    {fgDisplayName}
                                  </span>
                                  <span
                                    className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold ${
                                      fg.status === "REQUIRED"
                                        ? "border border-emerald-500/40 bg-emerald-950/70 text-emerald-300"
                                        : fg.status === "SUPPORTED" ||
                                            fg.status === "PROBABLE"
                                          ? "border border-cyan-500/40 bg-cyan-950/70 text-cyan-300"
                                          : fg.status === "CONFLICTING" ||
                                              fg.status === "EXCLUDED" ||
                                              fg.status === "FORBIDDEN"
                                            ? "border border-rose-500/40 bg-rose-950/70 text-rose-300"
                                            : "border border-slate-700 bg-slate-800 text-slate-400"
                                    }`}
                                  >
                                    {fg.status} · 可信度 {confPct}%
                                  </span>
                                </div>

                                {/* 相關峰位 */}
                                <div className="mt-2 font-mono text-[11px] text-cyan-300">
                                  <span className="text-slate-400">
                                    相關峰位與模態：
                                  </span>
                                  {fg.observedSignal
                                    ? `${srcModalities.join("+")} (${fg.observedSignal})`
                                    : associatedEv.length > 0
                                      ? associatedEv
                                          .map(
                                            (e) =>
                                              `${e.spectrumType}(${e.peakPosition})`
                                          )
                                          .join("、")
                                      : srcModalities.join(" + ") ||
                                        "跨譜規則評估"}
                                </div>

                                {/* 支持證據 */}
                                <div className="mt-1.5 rounded border border-emerald-500/20 bg-emerald-950/15 p-2 text-[11px] text-slate-200">
                                  <span className="font-semibold text-emerald-300">
                                    支持證據：
                                  </span>
                                  {fg.status !== "FORBIDDEN" &&
                                  fg.status !== "EXCLUDED" &&
                                  fg.status !== "CONFLICTING"
                                    ? fg.notes ||
                                      fg.reasoning ||
                                      "符合實驗特徵區間與結構約束"
                                    : "未觀測到足夠支持此官能基之實驗訊號"}
                                </div>

                                {/* 反對證據 */}
                                <div className="mt-1.5 rounded border border-rose-500/20 bg-rose-950/15 p-2 text-[11px] text-slate-300">
                                  <span className="font-semibold text-rose-300">
                                    反對證據 / 排他檢查：
                                  </span>
                                  {fg.status === "FORBIDDEN" ||
                                  fg.status === "EXCLUDED" ||
                                  fg.status === "CONFLICTING"
                                    ? fg.notes ||
                                      fg.reasoning ||
                                      "實驗光譜缺乏此官能基必備吸收帶或共振峰"
                                    : "目前提供的光譜中無直接反對證據"}
                                </div>
                              </div>

                              {/* 不確定性與單一峰警告 */}
                              <div className="rounded border border-amber-500/25 bg-amber-950/20 px-2.5 py-1.5 text-[11px] text-amber-200/90">
                                <span className="font-semibold text-amber-300">
                                  不確定性說明：
                                </span>
                                {isSinglePeakOnly
                                  ? "目前僅依賴單一模態之孤立峰支持，吸收帶可能受重疊或化學環境影響，不可單憑此單一峰斷言唯一官能基，需結合其他光譜或分子式綜合確認。"
                                  : srcModalities.length >= 2
                                    ? `已獲 ${srcModalities.join(" + ")} 跨模態雙重印證，不確定性較低。`
                                    : "建議結合互補光譜模態（如 ¹³C NMR 或 MS）進一步降低同分異構物不確定性。"}
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  )}

                  {/* 各模態細部化學環境卡片 (IR / 1H / 13C / MS / MS/MS / ToF-SIMS) */}
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 pt-2">
                    {/* IR */}
                    <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-xs">
                      <div className="font-mono font-bold text-cyan-300">
                        IR 吸收帶化學環境判讀
                      </div>
                      {spectra.IR ? (
                        <div className="mt-2 space-y-1.5 max-h-44 overflow-y-auto">
                          {modeAReport.irFindings
                            .filter((f) => f.status !== "ABSENT")
                            .map((f, i) => {
                              const rawPeaks =
                                f.observedPeaks && f.observedPeaks.length > 0
                                  ? f.observedPeaks
                                  : f.observedPeak !== undefined
                                    ? [f.observedPeak]
                                    : [];
                              const confVal =
                                (f.confidence || 0.7) <= 1
                                  ? Math.round((f.confidence || 0.7) * 100)
                                  : Math.round(f.confidence || 70);
                              return (
                                <div
                                  key={i}
                                  className="rounded border border-slate-800 bg-slate-900/70 p-2"
                                >
                                  <div className="flex justify-between font-semibold text-emerald-300">
                                    <span>
                                      {f.groupName || f.functionalGroup}
                                    </span>
                                    <span className="font-mono text-[10px]">
                                      {confVal}%
                                    </span>
                                  </div>
                                  <div className="mt-0.5 font-mono text-[10px] text-cyan-200">
                                    峰位：
                                    {rawPeaks
                                      .filter((p) => Number.isFinite(Number(p)))
                                      .map((p) => `${Number(p).toFixed(0)} cm⁻¹`)
                                      .join(", ") || f.expectedRange}
                                  </div>
                                  <div className="mt-0.5 text-[11px] text-slate-400">
                                    {f.chemicalInterpretation ||
                                      f.reasoning ||
                                      f.evidence?.reasoning}
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] text-slate-500">
                          未提供 IR 光譜
                        </div>
                      )}
                    </div>

                    {/* 1H NMR */}
                    <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-xs">
                      <div className="font-mono font-bold text-cyan-300">
                        ¹H NMR 質子環境與自旋偶合
                      </div>
                      {modeAReport.protonSummary ? (
                        <div className="mt-2 space-y-1.5 max-h-44 overflow-y-auto">
                          {(modeAReport.protonSummary.environments || []).map(
                            (env: any, i: number) => {
                              const shiftVal = Number(
                                env.shiftPpm ?? env.chemicalShift ?? env.shift ?? 0
                              );
                              const integVal =
                                env.integration ?? env.integral ?? "—";
                              const envText =
                                env.environmentLabel ||
                                env.environment ||
                                env.environmentType ||
                                env.regionCategory ||
                                "質子共振環境";
                              return (
                                <div
                                  key={i}
                                  className="rounded border border-slate-800 bg-slate-900/70 p-2"
                                >
                                  <div className="font-mono font-semibold text-cyan-200">
                                    δ {shiftVal.toFixed(2)} ppm (
                                    {env.multiplicity || "s"}, {integVal}H)
                                  </div>
                                  <div className="text-[11px] text-slate-300">
                                    環境：{envText}
                                  </div>
                                </div>
                              );
                            }
                          )}
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] text-slate-500">
                          未提供 ¹H NMR 光譜
                        </div>
                      )}
                    </div>

                    {/* 13C NMR */}
                    <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-xs">
                      <div className="font-mono font-bold text-cyan-300">
                        ¹³C NMR 碳骨架與對稱性
                      </div>
                      {modeAReport.carbonSummary ? (
                        <div className="mt-2 space-y-1.5 max-h-44 overflow-y-auto">
                          <div className="rounded border border-slate-800 bg-slate-900 p-2 text-[11px] text-slate-300">
                            {modeAReport.carbonSummary.symmetryAndOverlapNote ||
                              (modeAReport.carbonSummary as any)
                                .symmetryAssessment}
                          </div>
                          {(modeAReport.carbonSummary.environments || []).map(
                            (cEnv: any, i: number) => {
                              const cShift = Number(
                                cEnv.shiftPpm ??
                                  cEnv.chemicalShift ??
                                  cEnv.shift ??
                                  0
                              );
                              const cLabel =
                                cEnv.regionCategory ||
                                cEnv.assignment ||
                                cEnv.regionLabel ||
                                "碳化學環境";
                              return (
                                <div
                                  key={i}
                                  className="rounded border border-slate-800 bg-slate-900/70 p-1.5 font-mono text-[11px]"
                                >
                                  <span className="text-amber-300">
                                    δ {cShift.toFixed(1)} ppm (
                                    {cEnv.deptType || "C"})
                                  </span>{" "}
                                  → {cLabel}
                                </div>
                              );
                            }
                          )}
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] text-slate-500">
                          未提供 ¹³C NMR 光譜
                        </div>
                      )}
                    </div>

                    {/* MS / MS/MS / ToF-SIMS */}
                    <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-xs">
                      <div className="font-mono font-bold text-cyan-300">
                        MS / MS/MS / ToF-SIMS 裂解診斷
                      </div>
                      <div className="mt-2 space-y-1.5 max-h-44 overflow-y-auto">
                        {modeAReport.msSummary ? (
                          <>
                            <div className="rounded border border-slate-800 bg-slate-900 p-2 font-mono text-[11px] text-slate-200">
                              M+• ={" "}
                              {modeAReport.msSummary.estimatedMolecularIonMz ??
                                "—"}{" "}
                              | Base Peak = {modeAReport.msSummary.basePeakMz}
                            </div>
                            {modeAReport.msSummary.neutralLosses.map(
                              (nl: any, i: number) => (
                                <div
                                  key={i}
                                  className="rounded border border-slate-800 bg-slate-900/70 p-1.5 text-[11px] text-slate-300"
                                >
                                  <span className="font-mono text-amber-300">
                                    -Δ{nl.lossMass} Da:
                                  </span>{" "}
                                  {nl.lostNeutralFormula} ({nl.chemicalMeaning})
                                </div>
                              )
                            )}
                          </>
                        ) : (
                          <div className="text-[11px] text-slate-500">
                            未提供一級 MS 質譜
                          </div>
                        )}
                        {bundle.msmsAnalysis && (
                          <div className="rounded border border-violet-500/30 bg-violet-950/30 p-2 text-[11px] text-violet-200">
                            <strong>MS/MS 診斷：</strong>
                            共擷取{" "}
                            {
                              bundle.msmsAnalysis.physicsModel.productIons
                                .length
                            }{" "}
                            個子離子與{" "}
                            {
                              bundle.msmsAnalysis.physicsModel.neutralLosses
                                .length
                            }{" "}
                            條中性脫去路徑
                          </div>
                        )}
                        {bundle.tofSimsAnalysis && (
                          <div className="rounded border border-violet-500/30 bg-violet-950/30 p-2 text-[11px] text-violet-200">
                            <strong>ToF-SIMS 診斷：</strong>
                            共解析{" "}
                            {
                              bundle.tofSimsAnalysis.physicsModel
                                .secondaryIonFeatures.length
                            }{" "}
                            個表面特徵二次離子
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* =========================================================== */}
                {/* 第二部分：候選結構生成、正反證據鏈與排序 (Candidate Structures) */}
                {/* =========================================================== */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div>
                      <h2 className="text-sm font-bold text-slate-100">
                        2. 候選結構生成與排序（Candidate Structures &amp; Evidence Ranking）
                      </h2>
                      <p className="text-xs text-slate-400">
                        依據分子式與已校正光譜之官能基約束生成候選異構物，並完整列出每個候選結構的支持證據、反對證據、相關峰位與不確定性。
                      </p>
                    </div>
                    <span className="rounded bg-emerald-950/70 px-2.5 py-1 font-mono text-xs font-bold text-emerald-300">
                      共生成 {rankedCandidates.length} 個候選結構
                    </span>
                  </div>

                  {rankedCandidates.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/60 p-8 text-center">
                      <FlaskConical className="mx-auto h-8 w-8 text-cyan-400" />
                      <h3 className="mt-2 text-sm font-bold text-slate-100">
                        目前尚無收斂之完整候選分子結構
                      </h3>
                      <p className="mx-auto mt-1 max-w-xl text-xs text-slate-400">
                        若您僅標記了單一峰（如單一 IR 吸收峰），基於科學嚴謹性，系統只會列出上方「可能官能基與化學環境範圍」，絕不會單憑單一峰妄斷唯一分子結構。您可以於上方「一級輸入證據：分子式」輸入分子式（如 C9H8O4、C8H8O2），或補充 MS / NMR 訊號以生成並排序候選結構。
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                      {rankedCandidates.map((cand) => {
                        const isSelected =
                          (selectedCandidate?.id || rankedCandidates[0]?.id) ===
                          cand.id;
                        const graphInfo = validatedGraphs.find(
                          (vg) => vg.candidate.id === cand.id
                        )?.graphValidation;

                        return (
                          <div
                            key={cand.id}
                            onClick={() => setSelectedCandidateId(cand.id)}
                            className={`cursor-pointer flex flex-col justify-between rounded-xl border p-4 transition ${
                              isSelected
                                ? "border-cyan-500 bg-slate-950 shadow-lg"
                                : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${
                                    cand.rank === 1
                                      ? "bg-emerald-500 text-slate-950"
                                      : "bg-slate-800 text-slate-300"
                                  }`}
                                >
                                  Rank #{cand.rank}
                                </span>
                                <span className="font-mono text-lg font-extrabold text-cyan-300">
                                  模型相容度：{cand.scoreBreakdown.totalScore}/100（非機率）
                                </span>
                              </div>

                              <h3 className="mt-2 text-sm font-bold text-slate-100">
                                {cand.name}
                              </h3>
                              <div className="font-mono text-xs text-slate-400">
                                IUPAC: {cand.iupacName} |{" "}
                                <strong className="text-cyan-300">
                                  {cand.molecularFormula}
                                </strong>{" "}
                                (IHD={cand.unsaturationIndex})
                              </div>

                              <div className="my-3">
                                <StructureRenderer2D
                                  smiles={cand.smiles}
                                  formula={cand.molecularFormula}
                                  compact
                                />
                              </div>

                              {graphInfo && (
                                <div className="mb-3 rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-2 font-mono text-[11px] text-emerald-300">
                                  ✓ 拓撲化合價檢驗通過 | 重原子數:{" "}
                                  {graphInfo.heavyAtomCount} | 環數:{" "}
                                  {graphInfo.ringCount}
                                </div>
                              )}

                              {cand.nmrConsistencyAnalysis && (
                                <div className="mb-3 rounded-lg border border-violet-500/30 bg-violet-950/20 p-2.5 text-[11px] space-y-1">
                                  <div className="flex items-center justify-between font-mono font-bold text-violet-200">
                                    <span>
                                      NMR 科學一致性 ({cand.nmrConsistencyAnalysis.overallStatus})
                                    </span>
                                    <span>
                                      {cand.nmrConsistencyAnalysis.overallScore}%
                                    </span>
                                  </div>
                                  <div className="text-slate-300">
                                    <span className="text-cyan-300 font-semibold">
                                      ¹H 積分/活潑氫：
                                    </span>
                                    總氫 {cand.nmrConsistencyAnalysis.protonIntegrationConsistency.computedTotalH}H（碳上 {cand.nmrConsistencyAnalysis.protonIntegrationConsistency.computedCarbonAttachedH}H + 可交換 {cand.nmrConsistencyAnalysis.protonIntegrationConsistency.computedExchangeableH}H）· {cand.nmrConsistencyAnalysis.protonIntegrationConsistency.status}
                                  </div>
                                  <div className="text-slate-300">
                                    <span className="text-amber-300 font-semibold">
                                      ¹³C 對稱與弛豫：
                                    </span>
                                    預期 {cand.nmrConsistencyAnalysis.carbonSymmetryAndCountConsistency.expectedUniqueCarbons} 組不等價碳（含 {cand.nmrConsistencyAnalysis.carbonSymmetryAndCountConsistency.quaternaryCarbonsCount} 個四級碳）
                                  </div>
                                </div>
                              )}

                              {/* 支持證據 */}
                              <div className="space-y-1.5 text-xs">
                                <div className="font-semibold text-emerald-300">
                                  支持證據与相關峰位 ({cand.supportingReasons.length})：
                                </div>
                                <ul className="list-disc space-y-1 pl-4 text-[11px] text-slate-300">
                                  {cand.supportingReasons.map((r, i) => (
                                    <li key={i}>{r}</li>
                                  ))}
                                </ul>

                                {/* 反對證據 */}
                                <div className="mt-2 font-semibold text-rose-300">
                                  反對證據 / 排他矛盾點 (
                                  {cand.contradictingReasons.length})：
                                </div>
                                {cand.contradictingReasons.length > 0 ? (
                                  <ul className="list-disc space-y-1 pl-4 text-[11px] text-rose-200/90">
                                    {cand.contradictingReasons.map((r, i) => (
                                      <li key={i}>{r}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <div className="text-[11px] text-slate-400">
                                    目前提供的實驗證據中無直接排他矛盾。
                                  </div>
                                )}

                                {/* 不確定性說明 */}
                                <div className="mt-2 rounded border border-amber-500/20 bg-amber-950/20 p-2 text-[11px] text-amber-200/90">
                                  <span className="font-semibold text-amber-300">
                                    不確定性評估：
                                  </span>
                                  {activeEvidenceSummary.modalitiesWithData
                                    .length <= 1
                                    ? "目前僅依賴有限模態或分子式生成同分異構物候選，位置異構物（如鄰/間/對位）仍具不確定性，建議補充 ¹H/¹³C NMR 裂分與對稱性證據。"
                                    : "已結合多模態光譜進行交叉排他評分；若排名相近，建議對照下方跨譜驗證矩陣。"}
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 flex gap-2 border-t border-slate-800 pt-3">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setModeBStructureInput(cand.smiles);
                                  handleExecuteModeBPrediction(cand.smiles);
                                  setPrimaryMode("MODE_B");
                                }}
                                className="w-full rounded-lg border border-amber-500/40 bg-amber-950/40 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-900/50"
                              >
                                送入 Mode B 獨立預測其理論光譜 →
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* =========================================================== */}
                {/* 第三部分：跨光譜一致性驗證矩陣 (支援全 6 種光譜模態)             */}
                {/* =========================================================== */}
                {validationMatrix.length > 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                    <h3 className="text-sm font-bold text-slate-100">
                      3. 跨光譜一致性驗證矩陣 (Cross-Spectrum Validation Matrix — IR / ¹H / ¹³C / MS / MS-MS / ToF-SIMS)
                    </h3>
                    <p className="text-xs text-slate-400">
                      未提供之光譜模態嚴格標記為 NOT PROVIDED，絕不當成反證扣分。
                    </p>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                            <th className="py-2 pr-3">排名 / 候選結構</th>
                            <th className="px-3 py-2 font-mono">分子式 / SMILES</th>
                            <th className="px-2 py-2 font-mono">IR</th>
                            <th className="px-2 py-2 font-mono">¹H NMR</th>
                            <th className="px-2 py-2 font-mono">¹³C NMR</th>
                            <th className="px-2 py-2 font-mono">MS</th>
                            <th className="px-2 py-2 font-mono">MS/MS</th>
                            <th className="px-2 py-2 font-mono">ToF-SIMS</th>
                            <th className="py-2 pl-3 font-mono">綜合吻合度</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70">
                          {validationMatrix.map((row, idx) => {
                            const renderBadge = (
                              st:
                                | "SUPPORTED"
                                | "COMPATIBLE"
                                | "CONTRADICTED"
                                | "NOT_PROVIDED"
                                | undefined,
                              sc: number | null | undefined
                            ) => {
                              if (!st || st === "NOT_PROVIDED") {
                                return (
                                  <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400">
                                    NOT PROVIDED
                                  </span>
                                );
                              }
                              if (st === "SUPPORTED") {
                                return (
                                  <span className="rounded border border-emerald-500/30 bg-emerald-950/60 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                                    SUPPORTED ({sc}%)
                                  </span>
                                );
                              }
                              if (st === "COMPATIBLE") {
                                return (
                                  <span className="rounded border border-cyan-500/30 bg-cyan-950/60 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
                                    COMPATIBLE ({sc}%)
                                  </span>
                                );
                              }
                              return (
                                <span className="rounded border border-rose-500/30 bg-rose-950/60 px-2 py-0.5 font-mono text-[10px] font-bold text-rose-300">
                                  CONTRADICTED ({sc}%)
                                </span>
                              );
                            };

                            return (
                              <tr key={row.candidateId}>
                                <td className="py-2.5 pr-3 font-semibold text-slate-100">
                                  #{idx + 1} {row.candidateName}
                                </td>
                                <td className="px-3 py-2.5 font-mono text-[11px] text-cyan-300">
                                  <div>{row.formula}</div>
                                  <div className="text-[10px] text-slate-400">
                                    {row.smiles}
                                  </div>
                                </td>
                                <td className="px-2 py-2.5">
                                  {renderBadge(
                                    row.modalityStatus.IR,
                                    row.modalityScores.IR
                                  )}
                                </td>
                                <td className="px-2 py-2.5">
                                  {renderBadge(
                                    row.modalityStatus["1H_NMR"],
                                    row.modalityScores["1H_NMR"]
                                  )}
                                </td>
                                <td className="px-2 py-2.5">
                                  {renderBadge(
                                    row.modalityStatus["13C_NMR"],
                                    row.modalityScores["13C_NMR"]
                                  )}
                                </td>
                                <td className="px-2 py-2.5">
                                  {renderBadge(
                                    row.modalityStatus.MS,
                                    row.modalityScores.MS
                                  )}
                                </td>
                                <td className="px-2 py-2.5">
                                  {renderBadge(
                                    row.modalityStatus["MS/MS"],
                                    row.modalityScores["MS/MS"]
                                  )}
                                </td>
                                <td className="px-2 py-2.5">
                                  {renderBadge(
                                    row.modalityStatus["ToF-SIMS"],
                                    row.modalityScores["ToF-SIMS"]
                                  )}
                                </td>
                                <td className="py-2.5 pl-3 font-mono text-sm font-extrabold text-cyan-300">
                                  {row.totalScore}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* =========================================================== */}
                {/* 第四部分：Mode A 可追溯證據推理鏈總覽 (Evidence Traceability Chain) */}
                {/* =========================================================== */}
                {spectrumEvidenceList.length > 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-100">
                          4. 可追溯證據推理鏈明細（Evidence Traceability Chain：原始訊號/化學式 → 特徵規則 → 結構限制 → 評分影響）
                        </h3>
                        <p className="text-xs text-slate-400">
                          明確區分「化學式證據 (FORMULA)」、「使用者化學資訊 (CHEMICAL_NOTES)」與六種獨立「實驗光譜證據 (IR / ¹H NMR / ¹³C NMR / MS / MS/MS / ToF-SIMS)」。
                        </p>
                      </div>
                      <span className="rounded bg-slate-800 px-2.5 py-1 font-mono text-[11px] text-cyan-300">
                        共 {spectrumEvidenceList.length} 筆可追溯證據
                      </span>
                    </div>
                    <div className="mt-3 max-h-64 overflow-y-auto">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-[10px] text-slate-400">
                            <th className="py-1.5 pr-2">證據 ID / 來源模態</th>
                            <th className="px-2 py-1.5">證據類別</th>
                            <th className="px-2 py-1.5">觀測訊號 / 輸入值</th>
                            <th className="px-2 py-1.5">推論特徵與套用規則</th>
                            <th className="px-2 py-1.5">方向</th>
                            <th className="py-1.5 pl-2">對候選結構之影響與不確定性</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {spectrumEvidenceList.map((ev) => (
                            <tr key={ev.id}>
                              <td className="py-2 pr-2 font-mono text-[11px]">
                                <div className="font-bold text-cyan-300">
                                  [{ev.sourceSpectrum || ev.spectrumType}]
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  {ev.id}
                                </div>
                              </td>
                              <td className="px-2 py-2 font-mono text-[10px]">
                                <span
                                  className={`rounded px-1.5 py-0.5 ${
                                    ev.evidenceCategory ===
                                    "CHEMICAL_FORMULA_EVIDENCE"
                                      ? "bg-amber-950/70 text-amber-300 border border-amber-500/30"
                                      : ev.evidenceCategory ===
                                          "USER_CHEMICAL_INFO"
                                        ? "bg-violet-950/70 text-violet-300 border border-violet-500/30"
                                        : "bg-cyan-950/70 text-cyan-300 border border-cyan-500/30"
                                  }`}
                                >
                                  {ev.evidenceCategory || "EXPERIMENTAL_SPECTRUM"}
                                </span>
                              </td>
                              <td className="px-2 py-2 font-mono text-[11px] text-slate-200">
                                {ev.evidenceChain?.observedPeak ||
                                  `${ev.peakPosition} (${ev.intensity ?? ""})`}
                              </td>
                              <td className="px-2 py-2 text-[11px]">
                                <div className="font-semibold text-slate-100">
                                  {ev.inferredGroup}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {ev.ruleApplied || ev.chemicalMeaning}
                                </div>
                              </td>
                              <td className="px-2 py-2 font-mono text-[10px]">
                                <span
                                  className={`rounded px-1.5 py-0.5 font-bold ${
                                    ev.direction === "CONTRADICTING"
                                      ? "bg-rose-950/70 text-rose-300"
                                      : ev.direction === "INCONCLUSIVE"
                                        ? "bg-amber-950/70 text-amber-300"
                                        : "bg-emerald-950/70 text-emerald-300"
                                  }`}
                                >
                                  {ev.direction || "SUPPORTING"}
                                </span>
                              </td>
                              <td className="py-2 pl-2 text-[11px] text-slate-300">
                                <div>{ev.scoreImpact || ev.chemicalMeaning}</div>
                                {ev.uncertaintyNote && (
                                  <div className="text-[10px] text-amber-300/80">
                                    不確定性：{ev.uncertaintyNote}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 跨模態共識與資料不確定性紀錄 */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                      跨模態共識與輔助證據印證 (Cross-Modality Consensus)
                    </h4>
                    <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs text-slate-300">
                      {modeAReport.crossModalConsistencyNotes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                      不確定性、未校正訊號與溶劑排除紀錄 (Uncertainty &amp; Limitations)
                    </h4>
                    <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs text-slate-300">
                      {modeAReport.uncertaintyNotes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* MODE B：輸入結構 → 預測光譜 (獨立工作區與狀態管理)                   */}
        {/* =================================================================== */}
        {primaryMode === "MODE_B" && (
          <StructureSpectrumValidationPage
            bidirectionalReport={bidirectionalReport}
            experimentalSpectra={spectra}
            customStructureInput={modeBStructureInput}
            onChangeStructureInput={(val) => setModeBStructureInput(val)}
            selectedModalities={modeBSelectedModalities}
            onToggleModality={handleToggleModeBModality}
            onExecutePrediction={handleExecuteModeBPrediction}
            predictionError={modeBExecutionState.errorMessage}
          />
        )}

        {/* =================================================================== */}
        {/* 標準測試樣品庫 (PROJECTS)                                           */}
        {/* =================================================================== */}
        {primaryMode === "PROJECTS" && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-100">
              標準未知物樣品專案庫 (Reference Elucidation Projects)
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {REFERENCE_SAMPLE_PRESETS.map((preset) => (
                <div
                  key={preset.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/80 p-4"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-cyan-300">
                        {preset.expectedFormula}
                      </span>
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                        IR + ¹H + ¹³C + MS
                      </span>
                    </div>
                    <h3 className="mt-1.5 text-sm font-bold text-slate-100">
                      {preset.title}
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">
                      {preset.description}
                    </p>
                    <div className="mt-3">
                      <StructureRenderer2D
                        smiles={preset.referenceSmiles}
                        formula={preset.expectedFormula}
                        compact
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        handleSelectPreset(preset.id);
                        setPrimaryMode("MODE_A");
                        setModeAPage("PAGE_1_SIGNAL_MARKING");
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-500"
                    >
                      載入至 Mode A 分析
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const targetSmiles =
                          preset.referenceSmiles || preset.smiles;
                        setModeBStructureInput(targetSmiles);
                        handleExecuteModeBPrediction(targetSmiles);
                        setPrimaryMode("MODE_B");
                      }}
                      className="rounded-lg border border-amber-500/40 bg-amber-950/50 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-900/60"
                    >
                      Mode B 預測
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* 歷史紀錄 (HISTORY)                                                  */}
        {/* =================================================================== */}
        {primaryMode === "HISTORY" && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5">
            <h2 className="text-base font-bold text-slate-100">
              工作台結構判讀歷史紀錄 (Session Elucidation History)
            </h2>
            {historyRecords.length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-slate-800 bg-slate-950/60 p-6 text-center text-xs text-slate-400">
                目前尚無歷史紀錄。上傳光譜或載入測試專案後將自動記錄於此。
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 pr-3">時間</th>
                      <th className="px-3 py-2">分析樣品</th>
                      <th className="px-3 py-2">啟用證據</th>
                      <th className="px-3 py-2">Top #1 推導結構</th>
                      <th className="px-3 py-2 font-mono">分子式</th>
                      <th className="py-2 pl-3 font-mono">綜合吻合度</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {historyRecords.map((rec) => (
                      <tr key={rec.id}>
                        <td className="py-2.5 pr-3 font-mono text-slate-400">
                          {rec.timestamp}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-slate-200">
                          {rec.presetName}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-cyan-300">
                          {rec.activeModalities.join(" + ")}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-emerald-300">
                          {rec.topCandidateName}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-slate-200">
                          {rec.topCandidateFormula}
                        </td>
                        <td className="py-2.5 pl-3 font-mono font-bold text-cyan-300">
                          {rec.topScore}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* 引擎與測試 (SETTINGS)                                               */}
        {/* =================================================================== */}
        {primaryMode === "SETTINGS" && (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-100">
                    SpecReader 科學計算架構與內建自動化測試套件
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    嚴格遵循：Mode A (三頁式標記 → 校正 → 判讀) 與 Mode B (結構 → 預測光譜) 獨立架構
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setTestResults(ScientificEngineTestSuite.runAllTests())
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  <Play className="h-3.5 w-3.5" />
                  執行全部核心科學引擎測試
                </button>
              </div>

              {testResults && (
                <div className="mt-4 space-y-2 border-t border-slate-800 pt-4">
                  <div className="text-xs font-bold text-emerald-300">
                    自動化測試結果：通過{" "}
                    {testResults.filter((t) => t.passed).length} /{" "}
                    {testResults.length} 項
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                    {testResults.map((tr) => (
                      <div
                        key={tr.id}
                        className={`rounded-lg border p-3 text-xs ${
                          tr.passed
                            ? "border-emerald-500/40 bg-emerald-950/20"
                            : "border-rose-500/40 bg-rose-950/20"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-100">
                            {tr.name}
                          </span>
                          <span className="font-mono text-[11px] text-emerald-300">
                            {tr.passed ? "PASS" : "FAIL"} ({tr.durationMs} ms)
                          </span>
                        </div>
                        <div className="mt-1 font-mono text-[11px] text-slate-400">
                          預期：{tr.expectedSummary}
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-cyan-300">
                          實際：{tr.actualSummary}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-5 border-t border-slate-800 pt-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  TheoreticalModelRegistry 已註冊之科學模型
                </h3>
                <div className="mt-2.5 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {TheoreticalModelRegistry.getAllModels().map((m) => (
                    <div
                      key={m.modelId}
                      className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-cyan-300">{m.name}</span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                          {m.modelType}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {m.approximationLevel}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 報告匯出 Modal */}
      <ReportExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        orchestrationState={orchestrationState}
      />
    </div>
  );
}


