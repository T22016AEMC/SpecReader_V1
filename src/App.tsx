import {ReasoningPanel,CandidateReasoningDetails,progressLine} from './components/ReasoningPanel';
import {AnalysisBar,ResultPanels,ResultTabBar,type ResultTabId} from './ui/ResultView';
import {DataCheckBar,type IrVersionInfo} from './ui/DataCheckBar';
import {InputSummaryTab,type InputSummaryRow} from './ui/InputSummaryTab';
import {buildDataCheck} from './ui/dataCheck';
import {PredictionTab} from './ui/PredictionTab';
import type {CandidateView} from './ui/ConclusionCard';
import {CandidateEvidence} from './ui/CandidateEvidence';
import {FunctionalGroupTab} from './ui/FunctionalGroupTab';
import {DiagnosisTab} from './ui/DiagnosisTab';
import {buildDiagnosticSummary,buildFullFormulaTable,type CompositionSourcesLike} from './ui/diagnosticSummary';
import {filterIrEvidence,type FunctionalGroupRow,type IrFindingRow} from './ui/irEvidenceFilter';
import {conclusionBullets,pickTopWarning,searchStatusSentence} from './ui/conclusion';
import {fmtIntegral,fmtMz,fmtScoreOf100,fmtShift13C,fmtShift1H,fmtWavenumber,shortenNumbers} from './ui/format';
import type {ObservationLike} from './ui/obsLabel';
import type {AnalysisProgress} from './engines/reasoning/types';
import {MassExperimentConditions} from './components/MassExperimentConditions';
import {emptyModeAState,executeAnalysisWorker,type ModeAResult} from './engines/analysisSession';
import {PeakObservationTable} from './components/PeakObservationTable';
import {CompositionPanel} from './components/CompositionPanel';
import {buildCompositionPanel, candidateSourceTag, zeroCandidateModel} from './engines/enumeration/compositionPanelModel';
import {carbonylBandStatusOfIr} from './engines/scientificEngines/carbonylClasses';
import type {IRManualSettings} from './engines/scientificEngines/irManualBaseline';
import type {ExtendedSpectrumModality} from './types/spectrum';
import React, { useMemo, useRef, useState } from "react";
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
import { ReportExportModal, buildMarkdownReport, downloadEvidenceJson } from "./components/ReportExportModal";
import { SpectrumViewer } from "./components/SpectrumViewer";
import { StructureRenderer2D } from "./components/StructureRenderer2D";
import { StructureSpectrumValidationPage } from "./components/StructureSpectrumValidationPage";
import { SpectrumParser } from "./engines/spectrumParser";
import {calibrationStatus,calibrationCardText,calibrationReminder} from './ui/calibrationStatus';
import {PiecewiseCalibrationControls,type CalibPixelPoint,type ExtraKey} from './components/PiecewiseCalibrationControls';
import {CalibrationCheckTable} from './components/CalibrationCheckTable';
import {buildCalibrationCheck,threePointFailureMessage,type PanelPoint} from './engines/scientificEngines/axisCalibrationPanel';
import {AXIS_CALIBRATION_CONFIG} from './engines/scientificEngines/axisCalibrationConfig';
import {
  NMR_SOLVENT_REFERENCE_SHIFTS,
  WorkbenchOrchestrationState,
  WorkbenchOrchestrator,
} from "./engines/workbenchOrchestrator";
import { TheoreticalModelRegistry } from "./models/theoreticalModelRegistry";
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
  const [markingEnabled,setMarkingEnabled]=useState(true);
  const [selectedPeakId, setSelectedPeakId] = useState<string | null>(null);
  const [irBaselineDraft,setIrBaselineDraft]=useState<IRManualSettings|undefined>();
  const [newExchangeable,setNewExchangeable]=useState(false);
  const [newIRShape,setNewIRShape]=useState('AUTO');
  const [newIRStart,setNewIRStart]=useState('');
  const [newIREnd,setNewIREnd]=useState('');
  const [newPeakX, setNewPeakX] = useState<string>("");
  const [newPeakY, setNewPeakY] = useState<string>("");
  const [newPeakSignalDirection, setNewPeakSignalDirection] = useState<
    "PEAK_TOP" | "ABSORPTION_VALLEY" | "SHOULDER" | "ION_BAR"
  >("ABSORPTION_VALLEY");
  const [newPeakMultiplicity, setNewPeakMultiplicity] =
    useState<SpectralPeak["multiplicity"]>("unresolved");
  const [newPeakIntegral, setNewPeakIntegral] = useState<string>("");
  const [newPeakJValues, setNewPeakJValues] = useState<string>("");
  const [newPeakCarbonType, setNewPeakCarbonType] =
    useState<SpectralPeak["carbonType"]>("Unknown");
  const [newPeakAssignment, setNewPeakAssignment] = useState<string>("");
  const [newPeakClass, setNewPeakClass] =
    useState<SpectralPeak["userClassification"]>("COMPOUND");

  // ============================================================================
  // 5. Mode A 第 2 頁：座標校正狀態（預設兩點校正，三點校正置於進階選項）
  // ============================================================================
  const [calibrationMode, setCalibrationMode] = useState<
    "TWO_POINT" | "THREE_POINT" | "PIECEWISE"
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
  // v1.1.7-hotfix.2：分段線性校正（僅 IR）。C 沿用上方 3 點的 C；D、E 另設；C/D/E 勾選後才納入。
  const [showPiecewiseCalibration, setShowPiecewiseCalibration] =
    useState<boolean>(false);
  const [calibPointD, setCalibPointD] = useState<CalibPixelPoint>({
    pixelX: 600,
    pixelY: 200,
    realX: 2000,
    realY: 50,
  });
  const [calibPointE, setCalibPointE] = useState<CalibPixelPoint>({
    pixelX: 700,
    pixelY: 200,
    realX: 1000,
    realY: 50,
  });
  const [piecewiseIncluded, setPiecewiseIncluded] = useState<
    Record<ExtraKey, boolean>
  >({ C: false, D: false, E: false });
  const [piecewisePresetOn, setPiecewisePresetOn] = useState<boolean>(false);
  const [nextCalibTarget, setNextCalibTarget] = useState<
    "A" | "B" | "C" | "D" | "E"
  >("A");
  const [calibrationMessage, setCalibrationMessage] = useState<{
    type: "SUCCESS" | "ERROR" | "INFO";
    text: string;
  } | null>(null);

  // 第 2 頁：IR 基線面板要放進圖正下方的容器（SpectrumViewer 以 portal 渲染）；預覽表預設只列前幾筆
  const [irPanelHost, setIrPanelHost] = useState<HTMLElement | null>(null);
  const [showAllPreviewRows, setShowAllPreviewRows] = useState(false);
  const PREVIEW_ROWS_COLLAPSED = 4;
  const [uploadStatusMsg, setUploadStatusMsg] = useState<string | null>(null);
  // 標記清單各列「明細」的展開狀態放在這裡，離開第 1 頁再回來時不會自動收起
  const [openObsIds, setOpenObsIds] = useState<ReadonlySet<string>>(() => new Set());
  const handleToggleObsDetail = (id: string, open: boolean) =>
    setOpenObsIds((prev) => {
      if (prev.has(id) === open) return prev;
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  const [autoDetectOnUpload, setAutoDetectOnUpload] = useState<boolean>(true);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  // 結果頁（第 3 頁）目前的分頁：分析完成回到「圖譜官能基」，分析中與被取消後停在「預測結構」
  const [resultTab, setResultTab] = useState<ResultTabId>("fg");
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
    // Editing never calls a scientific engine; analysis consumes an explicit snapshot.
    if(updated)updated={...updated,dataVersion:(updated.dataVersion??0)+1,irProcessingApplied:false};
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
  const linearCalibrationPreview = useMemo<
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

  // 分段線性（僅 IR）：目前模式、各校正點的檢查結果（輸入值／換算值／差值）與預覽用校正物件
  const piecewiseActive =
    calibrationMode === "PIECEWISE" &&
    showPiecewiseCalibration &&
    focusedModality === "IR";
  const panelCalibrationMode: "TWO_POINT" | "THREE_POINT" | "PIECEWISE" =
    piecewiseActive
      ? "PIECEWISE"
      : calibrationMode === "THREE_POINT" && showAdvancedCalibration
      ? "THREE_POINT"
      : "TWO_POINT";
  const calibrationCheck = useMemo(() => {
    const pts: PanelPoint[] = [
      { label: "A", pixelX: calibPointA.pixelX, physicalX: calibPointA.realX },
      { label: "B", pixelX: calibPointB.pixelX, physicalX: calibPointB.realX },
    ];
    if (panelCalibrationMode === "THREE_POINT") {
      pts.push({ label: "C", pixelX: calibPointC.pixelX, physicalX: calibPointC.realX });
    }
    if (panelCalibrationMode === "PIECEWISE") {
      if (piecewiseIncluded.C) pts.push({ label: "C", pixelX: calibPointC.pixelX, physicalX: calibPointC.realX });
      if (piecewiseIncluded.D) pts.push({ label: "D", pixelX: calibPointD.pixelX, physicalX: calibPointD.realX });
      if (piecewiseIncluded.E) pts.push({ label: "E", pixelX: calibPointE.pixelX, physicalX: calibPointE.realX });
    }
    return buildCalibrationCheck(
      panelCalibrationMode,
      pts,
      panelCalibrationMode === "PIECEWISE" && piecewisePresetOn
        ? "IR_SCALE_BREAK_2000"
        : null
    );
  }, [
    panelCalibrationMode,
    calibPointA,
    calibPointB,
    calibPointC,
    calibPointD,
    calibPointE,
    piecewiseIncluded,
    piecewisePresetOn,
  ]);
  const liveCalibrationPreview = useMemo<
    ImageSpectrumCalibration | undefined
  >(() => {
    if (!piecewiseActive) return linearCalibrationPreview;
    const knots = calibrationCheck.knots;
    if (!knots || !currentSpectrum) return undefined;
    const first = knots[0];
    const last = knots[knots.length - 1];
    const left = SpectrumParser.pixelToPhysicalX(first.pixelX, {
      piecewiseKnots: knots,
    } as ImageSpectrumCalibration);
    const right = SpectrumParser.pixelToPhysicalX(last.pixelX, {
      piecewiseKnots: knots,
    } as ImageSpectrumCalibration);
    return {
      plotLeftPx: first.pixelX,
      plotRightPx: last.pixelX,
      plotTopPx: Math.min(calibPointA.pixelY, calibPointB.pixelY),
      plotBottomPx: Math.max(calibPointA.pixelY, calibPointB.pixelY),
      xAxisStart: left,
      xAxisEnd: right,
      xAxisDirection: right < left ? "DESCENDING" : "ASCENDING",
      confidence: 0.98,
      calibrationMode: "PIECEWISE",
      source: "USER_CORRECTED",
      piecewiseKnots: knots.map((k) => ({
        pixelX: k.pixelX,
        physicalX: k.physicalX,
      })),
    };
  }, [
    piecewiseActive,
    linearCalibrationPreview,
    calibrationCheck,
    currentSpectrum,
    calibPointA,
    calibPointB,
  ]);

  // ============================================================================
  // 7. 核心確定性科學工作台 Orchestration 計算 (Mode A 與 Mode B 狀態反應式更新)
  // ============================================================================
  const extraChemicalInput = useMemo(() => {
    const msmsSpec = auxSpectraMap["MS/MS"];
    const tofSimsSpec = auxSpectraMap["ToF-SIMS"];
    const parsedPrecursor = msmsSpec?.msParams?.precursorMz??NaN;
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
  const [completedAnalysis,setCompletedAnalysis]=useState<{result:ModeAResult;key:string;spectra:typeof spectra}|null>(null);
  const [analysisBusy,setAnalysisBusy]=useState(false);
  const [analysisError,setAnalysisError]=useState<string|null>(null);
  const analysisLock=useRef(false);
  const analysisAbort=useRef<AbortController|null>(null);
  const [analysisProgress,setAnalysisProgress]=useState<AnalysisProgress|null>(null);
  const [cancelRequested,setCancelRequested]=useState(false);
  const [analysisRuns,setAnalysisRuns]=useState(0);
  const currentInputKey=useMemo(()=>JSON.stringify([spectra,extraChemicalInput]),[spectra,extraChemicalInput]);
  const analysisStale=!!completedAnalysis&&completedAnalysis.key!==currentInputKey;
  const candidateOrigins=completedAnalysis?.result.solvedConstraintSpace?.searchResult?.enumeration?.origins;
  const modeAOrchestration=completedAnalysis?.result??emptyModeAState();
  const handleStartAnalysis=async()=>{
    if(analysisLock.current)return;
    analysisLock.current=true;setAnalysisBusy(true);setAnalysisError(null);setAnalysisProgress(null);setCancelRequested(false);analysisAbort.current=new AbortController();setAnalysisRuns(n=>n+1);setResultTab('pred');
    const key=currentInputKey,snapshot=structuredClone(spectra),extra=structuredClone(extraChemicalInput);
    try{const result=await executeAnalysisWorker({spectra:snapshot,extraInput:extra},{signal:analysisAbort.current.signal,onProgress:p=>setAnalysisProgress(old=>({...old,...p,localStructures:p.localStructures??old?.localStructures}))});setCompletedAnalysis({result,key,spectra:result.inputSpectra??snapshot});setResultTab(result.generationStatus?.code==='CANCELLED'?'pred':'fg');}
    catch(error){setAnalysisError(error instanceof Error?error.message:'分析執行失敗');}
    finally{analysisLock.current=false;setAnalysisBusy(false);analysisAbort.current=null;}
  };

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

  // 校正狀態（僅畫面提醒，不影響任何分析行為）：進第 3 頁前列出尚未校正的光譜
  const calibrationReminderInfo = useMemo(
    () =>
      calibrationReminder(
        ALL_EXTENDED_MODALITIES.flatMap((m) => {
          const spec = getSpectrumForModality(m.id);
          return spec ? [{ label: m.shortLabel, status: calibrationStatus(spec) }] : [];
        })
      ),
    [spectra, auxSpectraMap]
  );

  // ============================================================================
  // 8. 事件處理函式：重置、載入範例、檔案上傳、訊號標記、座標校正
  // ============================================================================
  // ============================================================================
  // 結果頁（第 3 頁）的顯示資料：資料檢查、輸入摘要、分析列文字。只讀現有資料，不改任何分析。
  // ============================================================================
  // 資料檢查：分析結果仍是最新時用「分析當時的輸入快照」；資料已變更或尚未分析時用目前輸入
  const dataCheck = useMemo(() => {
    const base = completedAnalysis && !analysisStale ? completedAnalysis.spectra : spectra;
    return buildDataCheck(
      {
        IR: base.IR,
        "1H_NMR": base["1H_NMR"],
        "13C_NMR": base["13C_NMR"],
        MS: base.MS,
        "MS/MS": auxSpectraMap["MS/MS"],
        "ToF-SIMS": auxSpectraMap["ToF-SIMS"],
      },
      { stale: analysisStale }
    );
  }, [completedAnalysis, analysisStale, spectra, auxSpectraMap]);
  const irSnapshot = completedAnalysis?.spectra.IR?.irAnalysisSnapshot;
  const irVersionInfo: IrVersionInfo | null = irSnapshot
    ? {
        version: irSnapshot.settingsVersion,
        signature: irSnapshot.curveSignature,
        text: `IR 已使用設定 v${irSnapshot.settingsVersion} · ${irSnapshot.curvePoints} 個相對吸收數值／${irSnapshot.peakCount} 個峰 · ${irSnapshot.featureChanged ? "峰特徵已更新" : "設定已使用，峰特徵未實質改變"} · ${irSnapshot.previousRankingKey === rankedCandidates.map((c) => c.smiles).join("|") ? "證據不足以改變候選順序" : "候選順序已重新計算"}`,
      }
    : null;
  // 輸入與校正分頁：與資料檢查同一份輸入（分析結果仍是最新時用分析當時的快照）
  const inputBase = completedAnalysis && !analysisStale ? completedAnalysis.spectra : spectra;
  const inputSummaryRows: InputSummaryRow[] = ALL_EXTENDED_MODALITIES.flatMap((m) => {
    const spec = (m.id === "MS/MS" || m.id === "ToF-SIMS" ? auxSpectraMap[m.id] : inputBase[m.id as keyof typeof inputBase]) ?? getSpectrumForModality(m.id);
    if (!spec) return [];
    const st = calibrationStatus(spec);
    const isNmr = m.id === "1H_NMR" || m.id === "13C_NMR";
    const peakPosition = (x: number) =>
      m.id === "IR" ? `${fmtWavenumber(x)} cm⁻¹` : m.id === "1H_NMR" ? `${fmtShift1H(x)} ppm` : m.id === "13C_NMR" ? `${fmtShift13C(x)} ppm` : `m/z ${fmtMz(x)}`;
    return [
      {
        key: m.id,
        label: m.shortLabel,
        fileName: spec.fileName,
        peakCount: spec.peaks.length,
        calibrationLabel: st.label,
        calibrationDetail: st.detail,
        level: st.level,
        peaks: spec.peaks.map((pk) => ({
          id: pk.id,
          position: pk.isCalibrated === false ? `px(${pk.pixelX ?? "—"}, ${pk.pixelY ?? "—"})` : peakPosition(pk.x),
          intensity: Number.isFinite(pk.relativeIntensity ?? pk.y) ? fmtIntegral(pk.relativeIntensity ?? pk.y) : "—",
          detail: [
            pk.isCalibrated === false ? "像素（尚未校正）" : "",
            m.id === "IR" ? (pk.isBroad || pk.shape === "broad" || pk.shape === "very_broad" ? "寬" : pk.shape === "sharp" ? "窄" : "") : "",
            isNmr && pk.integration != null ? `${fmtIntegral(pk.integration)}H` : "",
            isNmr && pk.multiplicity ? String(pk.multiplicity) : "",
            isNmr && pk.jValues?.length ? `J = ${pk.jValues.map((j) => Number(j.toFixed(1))).join(", ")} Hz` : "",
          ].filter(Boolean).join("｜"),
        })),
        solvent: isNmr ? spec.nmrSolvent ?? "" : undefined,
        frequencyMHz: m.id === "1H_NMR" ? spec.spectrometerFrequencyMHz ?? null : undefined,
        irBaselineText: m.id === "IR" ? (irVersionInfo ? irVersionInfo.text : spec.irManualSettings?.enabled ? "已啟用（尚未分析）" : null) : undefined,
      },
    ];
  });
  const traceObservations = modeAOrchestration.reasoningTrace?.observations as unknown as ObservationLike[] | undefined;
  // 診斷分頁：純文字摘要與完整分子式表（只讀畫面上已有的資料）
  const diagnosticPanel = useMemo(() => {
    if (!completedAnalysis) return null;
    const r = completedAnalysis.result;
    return buildCompositionPanel({
      composition: r.compositionInference,
      runs: r.reasoningTrace?.compositionSearch?.runs ?? [],
      mode: r.reasoningTrace?.compositionSearch?.mode,
      enumeration: r.solvedConstraintSpace?.searchResult?.enumeration,
      localStructures: r.reasoningTrace?.localStructures ?? [],
      rejectedCandidates: r.rejectedCandidates,
      carbonylBand: carbonylBandStatusOfIr(r.inputSpectra?.IR),
    });
  }, [completedAnalysis]);
  const diagnosticStamp = useMemo(() => new Date().toLocaleString("zh-TW", { hour12: false }), [completedAnalysis]);
  const irFilterResult = useMemo(
    () => filterIrEvidence((modeAReport.constraints.functionalGroups || []) as FunctionalGroupRow[], (modeAReport.irFindings || []).filter((f) => f.status !== "ABSENT") as unknown as IrFindingRow[]),
    [modeAReport]
  );
  const diagnosticSummaryText = useMemo(() => {
    if (!completedAnalysis) return "";
    const h1 = inputBase["1H_NMR"], ir = inputBase.IR;
    return buildDiagnosticSummary({
      generatedAt: diagnosticStamp,
      appVersion: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "",
      resultIsCurrent: !analysisStale,
      dataCheck,
      h1Peaks: (h1?.peaks ?? []).map((pk) => ({ position: pk.x, integration: pk.integration, multiplicity: pk.multiplicity ?? undefined, jValues: pk.jValues })),
      irPeaks: (ir?.peaks ?? []).map((pk) => ({ position: pk.x, broad: Boolean(pk.isBroad || pk.shape === "broad" || pk.shape === "very_broad") })),
      irCalibrationText: ir ? `${calibrationStatus(ir).label}（${calibrationStatus(ir).detail}）` : undefined,
      hiddenIrGroups: irFilterResult.hiddenCount,
      shownIrGroups: irFilterResult.shownCount,
      panel: diagnosticPanel,
      composition: completedAnalysis.result.compositionInference as unknown as CompositionSourcesLike,
      observations: traceObservations ?? [],
      topCandidates: rankedCandidates.slice(0, 5).map((c, i) => ({ rank: i + 1, formula: c.molecularFormula, score: c.scoreBreakdown.totalScore, smiles: c.smiles })),
    });
  }, [completedAnalysis, analysisStale, dataCheck, diagnosticPanel, diagnosticStamp, irFilterResult, rankedCandidates]);
  const fullFormulaTableText = useMemo(() => (completedAnalysis ? buildFullFormulaTable(diagnosticPanel, diagnosticStamp) : ""), [completedAnalysis, diagnosticPanel, diagnosticStamp]);
  // 分析中與被取消後：「分析過程」卡在「預測結構」；分析完成後只放在「診斷」（同一個 data-testid 全頁只能出現一處）
  const processInPred =
    analysisBusy ||
    completedAnalysis?.result.generationStatus?.code === "CANCELLED" ||
    (!completedAnalysis && !!analysisProgress);
  // 「預測結構」分頁（P4）：結論卡、警告、搜尋狀態一句、約束摘要
  const generationInfo = modeAOrchestration.generationStatus;
  const topWarning =
    completedAnalysis && rankedCandidates.length > 0
      ? pickTopWarning({
          dataCheck,
          generationCode: generationInfo?.code,
          scores: rankedCandidates.map((c) => c.scoreBreakdown.totalScore),
        })
      : null;
  const candidateViews: CandidateView[] = rankedCandidates.map((cand) => {
    const record = modeAOrchestration.reasoningTrace?.candidates.find((r) => r.candidateId === cand.id);
    const graphInfo = validatedGraphs.find((vg) => vg.candidate.id === cand.id)?.graphValidation;
    const originTag = candidateSourceTag(candidateOrigins?.[cand.smiles]);
    return {
      id: cand.id,
      rank: cand.rank,
      name: cand.name,
      formula: cand.molecularFormula,
      scoreText: fmtScoreOf100(cand.scoreBreakdown.totalScore),
      bullets: conclusionBullets({
        evidence: record?.evidence ?? [],
        observations: traceObservations,
        userFormula: generationInfo?.userFormula ?? null,
        candidateFormula: cand.molecularFormula,
      }),
      // 句尾「有界搜尋／未校準相容度…」只在區塊標題講一次；「候選來源：…」字串不變
      sourceLine: `來源：${cand.sourceProvenance || cand.candidateOrigin}${originTag ? `｜候選來源：${originTag}` : ""}`,
      selected: (selectedCandidate?.id || rankedCandidates[0]?.id) === cand.id,
      onSelect: () => setSelectedCandidateId(cand.id),
      onSendToModeB: () => {
        setModeBStructureInput(cand.smiles);
        handleExecuteModeBPrediction(cand.smiles);
        setPrimaryMode("MODE_B");
      },
      structure: () => <StructureRenderer2D smiles={cand.smiles} formula={cand.molecularFormula} compact />,
      reasoning: () => <CandidateReasoningDetails record={record} observations={traceObservations} />,
      evidence: () => <CandidateEvidence cand={cand} graphInfo={graphInfo} modalityCount={activeEvidenceSummary.modalitiesWithData.length} evidence={record?.evidence} observations={traceObservations} />,
    };
  });
  const searchInfo = {
    code: generationInfo?.code as string | undefined,
    sentence: searchStatusSentence(generationInfo?.code, rankedCandidates.length, generationInfo?.message),
    fullText: shortenNumbers(`${generationInfo?.message ?? ""} ${generationInfo?.limits ?? ""}`),
    compositionSource: `組成來源：${generationInfo?.userFormula ? `使用者指定 ${generationInfo.userFormula}（完整候選硬限制）` : "未指定；不以前置猜測分子式限制搜尋"}；候選卡分子式由各自分子圖計算。`,
  };
  const constraintItems: { label: string; value: string }[] = (() => {
    if (!completedAnalysis) return [];
    const c = modeAReport.constraints;
    const items: { label: string; value: string }[] = [];
    const num = (v: unknown, d = 1) => String(Number(Number(v).toFixed(d)));
    if (bundle.userSuppliedFormula) items.push({ label: "使用者指定分子式", value: bundle.userSuppliedFormula });
    if (c.estimatedMolecularWeight) items.push({ label: "標稱分子量", value: `${num(c.estimatedMolecularWeight)} Da` });
    const range = solvedConstraintSpace.unsaturationRange;
    if (range) items.push({ label: "不飽和度範圍 (IHD / DBE)", value: `${num(range[0])} – ${num(range[1])}` });
    if (c.nitrogenRuleParity && c.nitrogenRuleParity !== "UNKNOWN") items.push({ label: "氮規則奇偶性", value: String(c.nitrogenRuleParity) });
    const h = c.estimatedProtonCount, cc = c.estimatedCarbonEnvironmentCount;
    if (h !== undefined || cc !== undefined) {
      items.push({ label: "¹H 積分 / ¹³C 環境數", value: `${h !== undefined ? `${num(h)}H` : "—"} / ${cc !== undefined ? `${num(cc)}C` : "—"}` });
    }
    if (c.aromaticSubstitutionPattern && !/^UNKNOWN/.test(String(c.aromaticSubstitutionPattern))) items.push({ label: "芳環取代型態", value: String(c.aromaticSubstitutionPattern) });
    return items;
  })();
  const zeroCandidateNode = (
    <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/60 p-8 text-center">
      <FlaskConical className="mx-auto h-8 w-8 text-cyan-400" />
      <h3 className="mt-2 text-sm font-bold text-slate-100">目前尚無收斂之完整候選分子結構</h3>
      <p className="mx-auto mt-1 max-w-xl text-xs text-slate-400">
        {modeAOrchestration.generationStatus?.message} 請保留上方局部化學環境假設；搜尋無結果不代表該分子式不存在。
      </p>
      {(() => {
        const z = zeroCandidateModel(modeAOrchestration);
        return z ? <div data-testid="zero-candidate-explanation" className="mx-auto mt-3 max-w-xl rounded border border-amber-500/40 bg-amber-950/30 p-3 text-left text-xs text-amber-100">
          <p className="font-bold" data-testid="zero-candidate-headline">{z.headline}</p>
          <p className="mt-2 font-semibold">被擋掉的結構</p>
          {z.blockedEmpty ? <p data-testid="zero-candidate-blocked-empty">{z.blockedEmpty}</p> : <ul className="ml-4 list-disc" data-testid="zero-candidate-blocked">{z.blocked.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          {z.unfinished.length > 0 && <><p className="mt-2 font-semibold">沒跑完的部分</p><ul className="ml-4 list-disc" data-testid="zero-candidate-unfinished">{z.unfinished.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
          {z.suggestions.length > 0 && <><p className="mt-2 font-semibold">建議</p><ul className="ml-4 list-disc" data-testid="zero-candidate-suggestions">{z.suggestions.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
        </div> : null;
      })()}
    </div>
  );
  const deNovoNode = (
    <details className="text-xs text-slate-400"><summary>De novo 搜尋狀態與界限</summary><p>獨立原子／鍵枚舉目前支援中性 C/N/O/F/Cl/Br，至多九重原子、450 ms／36 候選；不支援的較大組成會保留局部環境假設，資料庫命中不代表答案正確。</p>{solvedConstraintSpace.solverLog.filter(s=>s.startsWith('De novo')).map((s,i)=><p key={i}>{shortenNumbers(s)}</p>)}</details>
  );
  const analysisStatusText = analysisError
    ? "分析失敗；輸入已保留，舊結果供參考。"
    : analysisStale
      ? "資料已變更，請重新分析"
      : completedAnalysis
        ? completedAnalysis.result.generationStatus?.code === "CANCELLED"
          ? "搜尋已取消，顯示保留的部分結果"
          : "分析完成（使用已保存輸入快照）"
        : "尚未分析；上傳與編輯不執行科學推論。";

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
        mod === "1H_NMR" || mod === "13C_NMR" ? "Unknown" : undefined,
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

      if(mod==='IR')setIrBaselineDraft(undefined);
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
  const [manualPeakError,setManualPeakError]=useState('');
  const decorateManualPeak=(updated:ExperimentalSpectrumData,original:ExperimentalSpectrumData,x:number):ExperimentalSpectrumData|null=>{
    const marker=updated.peaks.find(p=>!original.peaks.some(o=>o.id===p.id))??updated.peaks.find(p=>Math.abs(p.x-x)<.05);
    if(!marker)return updated;
    setManualPeakError('');return updated;
  };
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
      signalDirection: focusedModality==='IR'?'ABSORPTION_VALLEY':'PEAK_TOP',
      multiplicity:
        focusedModality === "1H_NMR" ? newPeakMultiplicity : undefined,
      integral:
        focusedModality === "1H_NMR"
          ? Number.isFinite(parseFloat(newPeakIntegral))&&parseFloat(newPeakIntegral)>0?parseFloat(newPeakIntegral):undefined
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

    const decorated=decorateManualPeak(updated,spec,params.physicalX);
    if(!decorated)return;
    updateSpectrumForModality(focusedModality,decorated);

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
      focusedModality === "IR"
        ? "ABSORPTION_VALLEY"
        : "PEAK_TOP";

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
      signalDirection: focusedModality==='IR'?'ABSORPTION_VALLEY':'PEAK_TOP',
      multiplicity:
        focusedModality === "1H_NMR" ? newPeakMultiplicity : undefined,
      integral:
        focusedModality === "1H_NMR"
          ? Number.isFinite(parseFloat(newPeakIntegral))&&parseFloat(newPeakIntegral)>0?parseFloat(newPeakIntegral):undefined
          : undefined,
      carbonType:
        focusedModality === "13C_NMR" ? newPeakCarbonType : undefined,
      assignment:
        newPeakAssignment.trim() ||
        `${snapped.x} ${spec.xUnit} (${newPeakSignalDirection})`,
      userClassification: newPeakClass,
    });

    const decorated=decorateManualPeak(updated,spec,physicalX);
    if(!decorated)return;
    updateSpectrumForModality(focusedModality,decorated);
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
      focusedModality === "IR"
        ? "ABSORPTION_VALLEY"
        : "PEAK_TOP";
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
    const enteredY=parseFloat(newPeakY),yKnown=Number.isFinite(enteredY),yNum=yKnown?enteredY:0;
    if(!Number.isFinite(xNum))return;
    if(!yKnown&&(spec.modality==='MS'||spec.digitizedFromImage)){setManualPeakError('圖片座標或 MS 相對強度需要有效的 Y 值；NMR／IR 未提供強度可留空。');return;}

    const isImg =
      spec.sourceType === "IMAGE_EXPERIMENTAL" || spec.digitizedFromImage;
    const isAlreadyCalibrated =
      !isImg || SpectrumParser.isSpectrumCalibrated(spec);

    const jArr = newPeakJValues
      .split(/[,;\s]+/)
      .map((s) => parseFloat(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);

    let updated = WorkbenchOrchestrator.addManualPeak(spec, {
      x: xNum,
      y: yNum,
      pixelX: isImg && !isAlreadyCalibrated ? Math.round(xNum) : undefined,
      pixelY: isImg && !isAlreadyCalibrated ? Math.round(yNum) : undefined,
      isCalibrated: isAlreadyCalibrated,
      signalDirection: focusedModality==='IR'?'ABSORPTION_VALLEY':'PEAK_TOP',
      multiplicity:
        focusedModality === "1H_NMR" ? newPeakMultiplicity : undefined,
      integral:
        focusedModality === "1H_NMR"
          ? Number.isFinite(parseFloat(newPeakIntegral))&&parseFloat(newPeakIntegral)>0?parseFloat(newPeakIntegral):undefined
          : undefined,
      jValues:
        focusedModality === "1H_NMR" && jArr.length > 0 ? jArr : undefined,
      carbonType:
        focusedModality === "13C_NMR" ? newPeakCarbonType : undefined,
      assignment: newPeakAssignment.trim() || undefined,
      userClassification: newPeakClass,
    });

    let decorated=decorateManualPeak(updated,spec,xNum);if(!decorated)return;
    const added=decorated.peaks.find(p=>!spec.peaks.some(old=>old.id===p.id));
    if(added)decorated=WorkbenchOrchestrator.updatePeak(decorated,added.id,{intensityKnown:yKnown});
    updateSpectrumForModality(focusedModality,decorated);
    setNewPeakX("");
    setNewPeakAssignment("");
  };

  const applyIRSettings=(draft:IRManualSettings)=>{
    const source=spectra.IR;if(!source)return;
    const revision=(source.irManualSettings?.revision??0)+1;
    const settings={...draft,revision};
    updateSpectrumForModality('IR',{...source,irManualSettings:settings,irProcessingApplied:false});
    setIrBaselineDraft(settings);
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

    if (piecewiseActive) {
      const pts = [
        { pixelX: calibPointA.pixelX, realX: calibPointA.realX },
        { pixelX: calibPointB.pixelX, realX: calibPointB.realX },
        ...(piecewiseIncluded.C ? [{ pixelX: calibPointC.pixelX, realX: calibPointC.realX }] : []),
        ...(piecewiseIncluded.D ? [{ pixelX: calibPointD.pixelX, realX: calibPointD.realX }] : []),
        ...(piecewiseIncluded.E ? [{ pixelX: calibPointE.pixelX, realX: calibPointE.realX }] : []),
      ];
      const calibrated = WorkbenchOrchestrator.applyPiecewiseCalibration(spec, {
        points: pts,
        presetId: piecewisePresetOn ? "IR_SCALE_BREAK_2000" : null,
      });
      if (calibrated.calibrationFailed) {
        setCalibrationMessage({
          type: "ERROR",
          text: `分段線性校正失敗，未套用：${calibrated.digitizationErrorMessage ?? "校正點輸入有誤。"}`,
        });
        return;
      }
      updateSpectrumForModality(focusedModality, calibrated);
      const segs = (calibrated.imageCalibration?.piecewiseKnots?.length ?? 2) - 1;
      setCalibrationMessage({
        type: "SUCCESS",
        text: `分段線性校正成功 (${focusedModality})！共 ${segs} 段，已轉換 ${calibrated.peaks.length} 個訊號標記為實際物理座標 (${spec.xUnit})${
          piecewisePresetOn ? "（含預設推定轉折點 2000 cm⁻¹）" : ""
        }。原始像素座標已完整保留。`,
      });
      return;
    }

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
      if (calibrated.calibrationFailed) {
        const reals = [calibPointA.realX, calibPointB.realX, calibPointC.realX];
        setCalibrationMessage({
          type: "ERROR",
          text: threePointFailureMessage(
            calibrated,
            Math.max(...reals) - Math.min(...reals)
          ),
        });
        return;
      }
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
    <div className="sr-app flex h-[100dvh] flex-col overflow-hidden bg-slate-950 text-slate-100">
      {/* ===================================================================== */}
      {/* 頂部主導覽列（v1.2.2：64 px、圖示＋HTML 文字、分段式模式切換）          */}
      {/* 標題列與步驟列固定在上方；<main> 是唯一的捲動區                        */}
      {/* ===================================================================== */}
      <header className="relative z-30 shrink-0 border-b border-slate-800/90 bg-slate-950/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4 px-4">
          {/* Logo 圖示與名稱（字標用 HTML 文字，不放整張字標圖） */}
          <div className="flex min-w-0 shrink-0 items-center gap-3">
            <img
              src="/logo/specreader-icon-96.png"
              width={40}
              height={40}
              alt=""
              className="h-10 w-10 shrink-0 rounded-xl border border-slate-800/80"
            />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-extrabold leading-none tracking-tight text-[color:var(--sr-brand-navy)]">
                  Spec<span className="text-[color:var(--sr-brand-blue)]">Reader</span>
                </span>
                <span
                  title="DETERMINISTIC DUAL-MODE WORKBENCH"
                  className="rounded bg-slate-800 px-1.5 py-px font-mono text-[10px] font-semibold text-slate-400"
                >
                  v{typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : ""}
                </span>
              </div>
              <p className="mt-1 hidden truncate text-xs text-slate-400 min-[1100px]:block">
                規則與證據導向的多光譜結構解析工作台
              </p>
            </div>
          </div>

          {/* 模式切換：Mode A／B 為主，其餘為次；可見文字縮短，可存取名稱保留完整字串 */}
          <nav
            aria-label="工作模式"
            className="mx-auto flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-800/60 p-1"
          >
            <button
              type="button"
              onClick={() => setPrimaryMode("MODE_A")}
              title="Mode A：實驗證據 → 官能基判讀 → 候選結構推論"
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                primaryMode === "MODE_A"
                  ? "bg-slate-900 text-blue-300 shadow-sm ring-1 ring-slate-800"
                  : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
              }`}
            >
              <GitBranch className="h-3.5 w-3.5" />
              <span>
                Mode A：實驗證據
                <span className="sr-only"> → 官能基判讀 → 候選結構推論</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setPrimaryMode("MODE_B")}
              title="Mode B：輸入結構 → 預測光譜"
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                primaryMode === "MODE_B"
                  ? "bg-slate-900 text-blue-300 shadow-sm ring-1 ring-slate-800"
                  : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>
                Mode B：輸入結構
                <span className="sr-only"> → 預測光譜</span>
              </span>
            </button>

            <span className="mx-1 h-4 w-px bg-slate-700" />

            <button
              type="button"
              onClick={() => setPrimaryMode("PROJECTS")}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-normal transition ${
                primaryMode === "PROJECTS"
                  ? "bg-slate-900 text-blue-300 shadow-sm ring-1 ring-slate-800"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <FolderKanban className="h-3.5 w-3.5" />
              <span>專案資訊</span>
            </button>

            <button
              type="button"
              onClick={() => setPrimaryMode("HISTORY")}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-normal transition ${
                primaryMode === "HISTORY"
                  ? "bg-slate-900 text-blue-300 shadow-sm ring-1 ring-slate-800"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <HistoryIcon className="h-3.5 w-3.5" />
              <span>紀錄</span>
            </button>

            <button
              type="button"
              onClick={() => setPrimaryMode("SETTINGS")}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-normal transition ${
                primaryMode === "SETTINGS"
                  ? "bg-slate-900 text-blue-300 shadow-sm ring-1 ring-slate-800"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <SettingsIcon className="h-3.5 w-3.5" />
              <span>引擎與測試</span>
            </button>
          </nav>

          {/* 右側：匯出報告 */}
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5 text-slate-400" />
              匯出報告
            </button>
          </div>
        </div>
        {/* =================================================================== */}
        {/* Mode A 專屬三頁式依序工作流切換列 (取代舊版 7 階段導覽列)           */}
        {/* =================================================================== */}
        {primaryMode === "MODE_A" && (
          <div className="border-t border-slate-800/80 bg-slate-900/80">
            <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-4 py-1.5">
              <nav aria-label="Mode A 三頁流程" className="flex min-w-0 items-center gap-2">
                {(
                  [
                    {
                      id: "PAGE_1_SIGNAL_MARKING" as ModeAPageId,
                      step: "第 1 頁",
                      title: "訊號標記",
                      hint: "上傳原圖/數值檔・手動點選峰頂或谷底・記錄原始位置",
                      icon: Crosshair,
                    },
                    {
                      id: "PAGE_2_CALIBRATION" as ModeAPageId,
                      step: "第 2 頁",
                      title: "座標校正",
                      hint: "點選原圖已知刻度・2點線性/3點進階校正・轉換物理座標",
                      icon: Ruler,
                    },
                    {
                      id: "PAGE_3_INTERPRETATION" as ModeAPageId,
                      step: "第 3 頁",
                      title: "化學判讀與結構推論",
                      hint: "讀取校正訊號與分子式・官能基判讀・候選結構生成與驗證",
                      icon: FlaskConical,
                    },
                  ] as const
                ).map((pg, idx) => {
                  const Icon = pg.icon;
                  const isCurrent = modeAPage === pg.id;
                  const warnHere = pg.id === "PAGE_3_INTERPRETATION" && (calibrationReminderInfo !== null || dataCheck.warnCount > 0);
                  return (
                    <React.Fragment key={pg.id}>
                      <button
                        type="button"
                        onClick={() => setModeAPage(pg.id)}
                        aria-current={isCurrent ? "step" : undefined}
                        title={warnHere ? `${pg.hint}（${calibrationReminderInfo ? `${calibrationReminderInfo.count} 張光譜尚未校正` : `資料檢查有 ${dataCheck.warnCount} 項 ⚠`}，仍可前往）` : pg.hint}
                        className={`flex items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-1.5 text-left transition ${
                          isCurrent
                            ? "border-cyan-500 bg-cyan-950/70 text-cyan-100 shadow-sm"
                            : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                        }`}
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                            isCurrent
                              ? "bg-cyan-500 text-slate-950"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                          {pg.step}
                        </span>
                        <span className="text-xs font-bold text-slate-100">
                          {pg.title}
                        </span>
                        {warnHere && (
                          <span className="text-amber-300">
                            ⚠<span className="sr-only">{calibrationReminderInfo ? "（尚有光譜未校正）" : "（資料檢查有疑慮）"}</span>
                          </span>
                        )}
                      </button>
                      {idx < 2 && (
                        <ArrowRight className="h-4 w-4 shrink-0 text-slate-600" />
                      )}
                    </React.Fragment>
                  );
                })}
              </nav>

              {/* 右側：統計膠囊與三個步驟按鈕同一行 */}
              <div className="flex shrink-0 items-center gap-2 font-mono text-[11px]">
                <span className="whitespace-nowrap rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-slate-300">
                  已標記訊號：
                  <strong className="ml-1 text-cyan-300">
                    {activeEvidenceSummary.totalMarkedSignals}
                  </strong>
                </span>
                <span
                  title="含數值檔與程式預設座標；是否由你校正過，請看各光譜的校正狀態"
                  className="whitespace-nowrap rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-2.5 py-1 text-emerald-300"
                >
                  具物理座標：
                  <strong className="ml-1">
                    {activeEvidenceSummary.calibratedSignalsCount}
                  </strong>
                </span>
                {activeEvidenceSummary.uncalibratedSignalsCount > 0 && (
                  <span className="whitespace-nowrap rounded-lg border border-amber-500/40 bg-amber-950/50 px-2.5 py-1 text-amber-300">
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
      {/* 結果頁（第 3 頁）固定區：資料檢查一行、分析列＋分頁列。不隨內容捲動   */}
      {/* ===================================================================== */}
      {primaryMode === "MODE_A" && modeAPage === "PAGE_3_INTERPRETATION" && (
        <div className="relative z-20 shrink-0 bg-slate-950" data-testid="result-fixed-zone">
          {dataCheck.unprovided.length < 6 && (
            <DataCheckBar check={dataCheck} irVersion={irVersionInfo} onGoCalibration={() => setModeAPage("PAGE_2_CALIBRATION")} />
          )}
          <div className="no-print border-b border-slate-800 bg-slate-950">
            <div className="mx-auto flex h-12 max-w-[1600px] items-center gap-4 px-4">
              <AnalysisBar
                runs={analysisRuns}
                rdkit={completedAnalysis?.result.runtime?.rdkitAvailable ?? false}
                resultCurrent={!!completedAnalysis && !analysisStale}
                busy={analysisBusy}
                cancelRequested={cancelRequested}
                onStart={handleStartAnalysis}
                onCancel={() => {
                  setCancelRequested(true);
                  analysisAbort.current?.abort();
                }}
                statusText={analysisStatusText}
                progressText={analysisProgress ? progressLine(analysisProgress) : null}
                error={analysisError}
              />
              <ResultTabBar
                active={resultTab}
                onChange={setResultTab}
                badges={{
                  candidates: completedAnalysis ? rankedCandidates.length : undefined,
                  predWarn: topWarning !== null,
                  inputWarn: dataCheck.warnCount,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 主內容區                                                              */}
      {/* ===================================================================== */}
      <main className="sr-main-scroll min-h-0 flex-1 overflow-y-scroll">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-3">
        {/* =================================================================== */}
        {/* MODE A：實驗證據 → 官能基判讀 → 候選結構推論                        */}
        {/* =================================================================== */}
        {primaryMode === "MODE_A" && (
          <div className="space-y-3">
            {/* 頂部輸入證據列（緊湊單行）：分子式、其他化學證據備註、有效輸入摘要；每一頁都在 */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2">
              <span
                title="分子式與各類光譜處於同一層級，可單獨輸入分子式、單一光譜或任意組合；不強迫所有模態皆完成才可分析。"
                className="text-xs font-bold text-slate-100"
              >
                Mode A 輸入證據中心
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={molecularFormulaInput}
                  onChange={(e) => setMolecularFormulaInput(e.target.value)}
                  aria-label="分子式（選填）"
                  placeholder="分子式（選填，按開始分析後使用）"
                  title="已知或實驗測定的分子式（一級輸入證據）；按開始分析後才會使用"
                  className="w-60 rounded-lg border border-cyan-500/40 bg-slate-950 px-2.5 py-1 font-mono text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                />
                {molecularFormulaInput && (
                  <button
                    type="button"
                    onClick={() => setMolecularFormulaInput("")}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200"
                  >
                    清除
                  </button>
                )}
              </div>
              <input
                type="text"
                value={chemicalNotesInput}
                onChange={(e) => setChemicalNotesInput(e.target.value)}
                aria-label="其他化學證據備註（選填）"
                placeholder="其他化學證據備註（選填）：FeCl3 呈色、D2O 交換、元素分析…"
                title="化學試劑反應或樣品來源備註，會連同光譜與分子式一併納入判讀紀錄"
                className="min-w-[200px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
              <span className="font-mono text-[11px] text-slate-300">
                <span className="text-cyan-300">
                  {activeEvidenceSummary.hasFormula
                    ? `✓ 分子式 ${molecularFormulaInput.trim()}`
                    : "○ 分子式未提供"}
                </span>
                <span className="mx-1.5 text-slate-600">·</span>
                <span className="text-emerald-300">
                  光譜：
                  {activeEvidenceSummary.modalitiesWithData.length > 0
                    ? activeEvidenceSummary.modalitiesWithData.join("、")
                    : "尚無"}
                </span>
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleResetToEmptyUnknownSample}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                    activePresetId === ""
                      ? "border-emerald-500 bg-emerald-950/60 text-emerald-200"
                      : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  }`}
                >
                  重置空白未知物
                </button>
                {modeAPage === "PAGE_1_SIGNAL_MARKING" && (
                  <button
                    type="button"
                    onClick={() => setModeAPage("PAGE_3_INTERPRETATION")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600/90 px-2.5 py-1 text-xs font-semibold text-white hover:bg-cyan-500"
                  >
                    直接前往第 3 頁檢視判讀結果
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {uploadStatusMsg && modeAPage === "PAGE_1_SIGNAL_MARKING" && (
              <div
                title={uploadStatusMsg}
                className="truncate rounded-lg border border-cyan-500/40 bg-cyan-950/30 px-3 py-1 text-[11px] text-cyan-200"
              >
                {uploadStatusMsg}
              </div>
            )}

            {/* =============================================================== */}
            {/* 第 1 頁：訊號標記 (Signal Marking)                              */}
            {/* =============================================================== */}
            {modeAPage === "PAGE_1_SIGNAL_MARKING" && (
              <div className="space-y-3">
                {/* 一句說明＋自動尋峰勾選＋下一步（步驟列已有「第 1 頁 訊號標記」，這裡不再放第二個標題） */}
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <p className="text-xs text-slate-300">
                    點圖上的峰頂或谷底標記。圖片此階段只記像素位置，不需先校正；AI 自動尋峰不會寫入正式證據。
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-200">
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
                      className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-cyan-500"
                    >
                      <span>下一步：前往第 2 頁座標校正</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* 六個光譜標籤 (IR, 1H, 13C, MS, MS/MS, ToF-SIMS)：已載入顯示檔名／標記數／校正狀態，未載入只留「＋加入」。
                    六個 input[type=file] 的 DOM 順序固定（E2E 依序號操作），而且網頁一載入就存在。 */}
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="光譜檔案">
                  {ALL_EXTENDED_MODALITIES.map((card) => {
                    const spec = getSpectrumForModality(card.id);
                    const isFocused = focusedModality === card.id;
                    const cal = spec ? calibrationStatus(spec) : null;
                    const calText = cal ? calibrationCardText(cal) : null;

                    return (
                      <div
                        key={card.id}
                        className={`flex items-center gap-1.5 rounded-lg border py-1 pl-1 pr-1.5 text-xs transition ${
                          isFocused
                            ? "border-cyan-500 bg-slate-900 shadow-sm"
                            : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectModality(card.id)}
                          aria-pressed={isFocused}
                          title={`${card.title}（${card.axisDesc}）`}
                          className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-0.5 text-left"
                        >
                          <span className="font-mono text-xs font-bold text-cyan-300">
                            {card.shortLabel}
                          </span>
                          {spec && calText && cal && (
                            <>
                              <span
                                className="max-w-[105px] truncate font-mono text-[11px] text-slate-300"
                                title={spec.fileName}
                              >
                                {spec.fileName}
                              </span>
                              <span className="whitespace-nowrap rounded border border-emerald-500/30 bg-emerald-950/50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                                {spec.peaks.length} 標記
                              </span>
                              <span
                                data-calibration-kind={cal.kind}
                                title={cal.detail}
                                className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                                  calText.tone === "ok"
                                    ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-300"
                                    : calText.tone === "info"
                                      ? "border-sky-500/40 bg-sky-950/40 text-sky-300"
                                      : "border-amber-500/40 bg-amber-950/40 text-amber-300"
                                }`}
                              >
                                {calText.tone === "warn" ? "⚠ " : calText.tone === "ok" ? "✓ " : ""}
                                {calText.text}
                              </span>
                            </>
                          )}
                        </button>
                        <label
                          title={spec ? "更換此光譜檔案" : `加入 ${card.shortLabel} 圖片或數值檔`}
                          className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[11px] font-medium text-slate-200 hover:bg-slate-700"
                        >
                          <span aria-hidden={spec ? true : undefined}>{spec ? "↻" : "＋加入"}</span>
                          {spec && <span className="sr-only">{`更換 ${card.shortLabel} 光譜檔案`}</span>}
                          <input
                            type="file"
                            accept=".csv,.txt,.jdx,.dx,.jcamp,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                            className="hidden"
                            onChange={(e) =>
                              handleFileUpload(card.id, e.target.files?.[0])
                            }
                          />
                        </label>
                        {spec && (
                          <button
                            type="button"
                            onClick={() => updateSpectrumForModality(card.id, undefined)}
                            className="rounded border border-rose-500/30 bg-rose-950/40 px-1.5 py-0.5 text-[11px] text-rose-300 hover:bg-rose-900/50"
                            title="移除此光譜"
                            aria-label={`移除 ${card.shortLabel} 光譜`}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 第 1 頁主要工作區：左側原圖/真實曲線點選標記檢視器 + 右側標記新增/移動/編輯/刪除清單 */}
                {currentSpectrum ? (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                    {/* 左側：純粹的訊號標記檢視器 (不塞入校正工具或化學判讀) */}
                    <div className="lg:col-span-7 space-y-2">
                      {/* 標記方向與溶劑設定控制列 */}
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <button type="button" title="開啟後，點圖即新增標記；點圖後於右側資料列補充觀測資訊" className="rounded border border-cyan-600 px-3 py-1" aria-pressed={markingEnabled} onClick={()=>{setMarkingEnabled(v=>!v);setSelectedPeakId(null);}}>標記圖譜</button>
                        </div>

                        {(focusedModality === "1H_NMR" ||
                          focusedModality === "13C_NMR") && (
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1">
                              <span className="text-[11px] text-violet-300">
                                氘代溶劑：
                              </span>
                              <select
                                aria-label="氘代溶劑" value={currentSpectrum.nmrSolvent || "Unknown"}
                                onChange={(e) =>
                                  handleChangeNmrSolvent(
                                    focusedModality,
                                    e.target.value as NMRSolvent
                                  )
                                }
                                className="max-w-[170px] rounded border border-violet-500/40 bg-violet-950/50 px-2 py-1 font-mono text-[11px] text-violet-200"
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

                      {['MS','MS/MS','ToF-SIMS'].includes(focusedModality)&&<MassExperimentConditions spectrum={currentSpectrum} modality={focusedModality} onChange={s=>updateSpectrumForModality(focusedModality,s)}/>}
                      {focusedModality==='13C_NMR'&&<label className="text-xs text-slate-300"><input aria-label="13C 已確認定量實驗" type="checkbox" checked={currentSpectrum.quantitativeCarbonExperiment??false} onChange={e=>updateSpectrumForModality('13C_NMR',{...currentSpectrum,quantitativeCarbonExperiment:e.target.checked})}/>已確認為適當定量 ¹³C 實驗（一般寬頻去耦請勿勾選）</label>}
                      <SpectrumViewer
                        spectrum={currentSpectrum}
                        selectedPeakId={selectedPeakId}
                        onSelectPeak={(pk) => setSelectedPeakId(pk.id)}
                        imageInteractionMode="MARK_PEAK"
                        onMarkPeakFromImage={markingEnabled?handleMarkPeakFromImage:undefined}
                        onMovePeakFromImage={handleMovePeakMarkerOnImage}
                        onMarkPeakFromPlot={markingEnabled?handleMarkPeakFromPlot:undefined}
                        onMovePeakFromPlot={handleMovePeakFromPlot}
                        hideModeSwitchButtons
                        height={420}
                      />
                    </div>

                    {/* 右側：已標記訊號清單（支援新增、移動微調、編輯、刪除、選取） */}
                    <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                        <h3
                          className="text-sm font-bold text-slate-100"
                          title="可直接在左圖點擊新增或拖曳移動標記，或於下方微調位置、積分與備註。"
                        >
                          已標記訊號清單 ({focusedModalityMeta.shortLabel}：{currentSpectrum.peaks.length} 筆)
                        </h3>
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
                                handleDeletePeak(focusedModality, selectedPeakId)
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
                              onClick={() => handleClearAllPeaks(focusedModality)}
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
                          className="mt-2 grid grid-cols-2 items-end gap-2 rounded-lg border border-slate-800 bg-slate-950/90 p-2 text-xs sm:grid-cols-[1fr_1fr_1.3fr_auto]"
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
                          {manualPeakError&&<p className="col-span-full text-amber-300" role="status">{manualPeakError}</p>}
                        </form>

                        {/* 標記列表：隨內容長高（頁面 <main> 是唯一的捲動區） */}
                        <div className="mt-2.5">
                          {currentSpectrum.peaks.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/50 p-5 text-center text-xs text-slate-400">
                              目前尚無任何訊號標記。請直接點擊左側原始圖片或真實數值曲線上的吸收谷底/峰頂進行標記。
                            </div>
                          ) : (
                            <PeakObservationTable
                              spectrum={currentSpectrum}
                              modality={focusedModality}
                              selectedId={selectedPeakId}
                              onSelect={setSelectedPeakId}
                              onUpdate={(id, patch) => handleUpdatePeak(focusedModality, id, patch)}
                              onDelete={(id) => handleDeletePeak(focusedModality, id)}
                              openIds={openObsIds}
                              onToggleOpen={handleToggleObsDetail}
                            />
                          )}
                        </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/50 p-6 text-center">
                    <Crosshair className="mx-auto h-8 w-8 text-cyan-400" />
                    <h3 className="mt-2 text-sm font-bold text-slate-100">
                      尚未載入 {focusedModalityMeta.title} 檔案
                    </h3>
                    <p className="mx-auto mt-1 max-w-xl text-xs text-slate-400">
                      請按上方標籤的「＋加入」上傳 PNG/JPG/WEBP 原始光譜圖片或 CSV/TXT/JCAMP-DX/XLSX 數值檔案，或點下方按鈕建立手動訊號表。若只有分子式，也可直接在上方輸入分子式並前往第 3 頁判讀。
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
                {/* 一句說明＋前後頁（步驟列已有「第 2 頁 座標校正」，不再放第二個標題）。提醒只是提示，不阻止前往第 3 頁。 */}
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <p className="text-xs text-slate-300">
                    在原圖上點兩個已知刻度並輸入真實數值，就能把標記的像素位置換成真實座標。返回第 1 頁修改標記不會遺失標記。
                  </p>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setModeAPage("PAGE_1_SIGNAL_MARKING")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      <span>返回第 1 頁修改訊號標記</span>
                    </button>
                    {calibrationReminderInfo && (
                      <span
                        data-calibration-reminder=""
                        className="rounded-lg border border-amber-500/40 bg-amber-950/40 px-2.5 py-1 text-[11px] font-medium text-amber-200"
                      >
                        ⚠ {calibrationReminderInfo.text}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setModeAPage("PAGE_3_INTERPRETATION")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-cyan-500"
                    >
                      <span>下一步：前往第 3 頁化學判讀與結構推論</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* 模態切換列：每張光譜顯示校正狀態（已校正 ✓／尚未校正 ⚠），來自 calibrationStatus() */}
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2">
                  <span className="text-xs font-semibold text-slate-300">
                    選擇欲校正之光譜：
                  </span>
                  {ALL_EXTENDED_MODALITIES.map((m) => {
                    const spec = getSpectrumForModality(m.id);
                    const isFocused = focusedModality === m.id;
                    const st = spec ? calibrationStatus(spec) : null;

                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleSelectModality(m.id)}
                        aria-pressed={isFocused}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-xs font-bold transition ${
                          isFocused
                            ? "border-amber-500 bg-amber-950/60 text-amber-200"
                            : "border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <span>{m.shortLabel}</span>
                        {st && (
                          <span
                            data-calibration-kind={st.kind}
                            title={st.detail}
                            className={`rounded px-1.5 py-0.5 text-[10px] ${
                              st.level === "ok"
                                ? "bg-emerald-950 text-emerald-300"
                                : st.level === "info"
                                  ? "bg-sky-950 text-sky-300"
                                  : "bg-amber-950 text-amber-300"
                            }`}
                          >
                            {st.label}
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
                    /* 數值檔：座標來自檔案本身（藍色資訊，不是警告；程式無法得知檔案是否已校準） */
                    <div className="space-y-3">
                      <div className="rounded-xl border border-sky-500/40 bg-sky-950/20 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-sky-400 mt-0.5" />
                          <div>
                            <h3 className="text-sm font-bold text-sky-200">
                              此光譜 ({currentSpectrum.fileName}) 為數值資料 ({currentSpectrum.sourceFormat})：座標來自檔案
                            </h3>
                            <p className="mt-0.5 text-xs text-slate-300">
                              {currentSpectrum.peaks.length} 個標記直接使用檔案內的座標 ({currentSpectrum.xUnit})，不需做圖片像素校正。程式無法得知檔案本身是否已對溶劑殘峰或 TMS 校準，請自行確認。
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setModeAPage("PAGE_3_INTERPRETATION")}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-sky-500"
                        >
                          略過圖片校正 → 直接進入第 3 頁判讀
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>

                      <SpectrumViewer
                        spectrum={currentSpectrum}
                        irDraftSettings={irBaselineDraft}
                        onIRDraftChange={setIrBaselineDraft}
                        onIRSettingsChange={applyIRSettings}
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
                          irPanelHost={irPanelHost}
                        irDraftSettings={irBaselineDraft}
                        onIRDraftChange={setIrBaselineDraft}
                        onIRSettingsChange={applyIRSettings}
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
                            piecewiseActive
                              ? [
                                  { label: "Pt A", pixelX: calibPointA.pixelX, pixelY: calibPointA.pixelY, physicalX: calibPointA.realX, color: "#22d3ee" },
                                  { label: "Pt B", pixelX: calibPointB.pixelX, pixelY: calibPointB.pixelY, physicalX: calibPointB.realX, color: "#f59e0b" },
                                  ...(piecewiseIncluded.C ? [{ label: "Pt C", pixelX: calibPointC.pixelX, pixelY: calibPointC.pixelY, physicalX: calibPointC.realX, color: "#c084fc" }] : []),
                                  ...(piecewiseIncluded.D ? [{ label: "Pt D", pixelX: calibPointD.pixelX, pixelY: calibPointD.pixelY, physicalX: calibPointD.realX, color: "#34d399" }] : []),
                                  ...(piecewiseIncluded.E ? [{ label: "Pt E", pixelX: calibPointE.pixelX, pixelY: calibPointE.pixelY, physicalX: calibPointE.realX, color: "#f472b6" }] : []),
                                ]
                              : calibrationMode === "THREE_POINT" &&
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
                                piecewiseActive ||
                                  (calibrationMode === "THREE_POINT" &&
                                    showAdvancedCalibration)
                                  ? "C"
                                  : "A"
                              );
                              setCalibrationMessage({
                                type: "INFO",
                                text: `已點選設定「校正點 B」像素座標 (${px}, ${py})。右側已即時預覽所有標記訊號之轉換座標，請點擊「套用座標校正」完成確認！`,
                              });
                            } else if (nextCalibTarget === "C") {
                              setCalibPointC((prev) => ({
                                ...prev,
                                pixelX: px,
                                pixelY: py,
                              }));
                              if (piecewiseActive) {
                                setPiecewiseIncluded((prev) => ({ ...prev, C: true }));
                                setNextCalibTarget("D");
                              } else {
                                setNextCalibTarget("A");
                              }
                              setCalibrationMessage({
                                type: "INFO",
                                text: piecewiseActive
                                  ? `已點選設定分段線性「校正點 C」像素座標 (${px}, ${py})，請輸入對應刻度值，可繼續點選 D、E，或直接套用。`
                                  : `已點選設定進階「校正點 C」像素座標 (${px}, ${py})，請點擊「套用三點最小平方法校正」。`,
                              });
                            } else {
                              const isD = nextCalibTarget === "D";
                              (isD ? setCalibPointD : setCalibPointE)((prev) => ({
                                ...prev,
                                pixelX: px,
                                pixelY: py,
                              }));
                              setPiecewiseIncluded((prev) => ({
                                ...prev,
                                [isD ? "D" : "E"]: true,
                              }));
                              setNextCalibTarget(isD ? "E" : "A");
                              setCalibrationMessage({
                                type: "INFO",
                                text: `已點選設定分段線性「校正點 ${isD ? "D" : "E"}」像素座標 (${px}, ${py})，請輸入對應刻度值，再點擊「套用分段線性校正」。`,
                              });
                            }
                          }}
                          height={340}
                        />
                      </div>

                      {/* 右側：座標校正（兩點為預設；IR 建議分段）+ 標記即時轉換預覽表 */}
                      <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-slate-900/80 p-3 space-y-3">
                        <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2">
                          <div>
                            <h3 className="text-sm font-bold text-slate-100">
                              座標校正 ({focusedModalityMeta.shortLabel})
                            </h3>
                            <p className="text-[11px] text-slate-400">
                              告訴程式圖上的刻度對應哪個真實數值，只影響峰的位置。
                            </p>
                          </div>
                          <span className="shrink-0 rounded bg-cyan-950 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-300">
                            {piecewiseActive
                              ? "目前：分段校正"
                              : showAdvancedCalibration
                                ? "目前：三點校正"
                                : "預設：2點校正"}
                          </span>
                        </div>

                        {/* IR 建議：分段（五點）校正。預設仍是兩點，這顆按鈕只是展開／收合分段（piecewise-toggle 行為不變） */}
                        {focusedModality === "IR" && (
                          <button
                            type="button"
                            data-testid="piecewise-toggle"
                            aria-expanded={showPiecewiseCalibration}
                            onClick={() => {
                              const nextOpen = !showPiecewiseCalibration;
                              setShowPiecewiseCalibration(nextOpen);
                              if (nextOpen) {
                                setShowAdvancedCalibration(false);
                                setCalibrationMode("PIECEWISE");
                              } else {
                                setCalibrationMode("TWO_POINT");
                                if (nextCalibTarget === "C" || nextCalibTarget === "D" || nextCalibTarget === "E") {
                                  setNextCalibTarget("A");
                                }
                              }
                            }}
                            className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${
                              showPiecewiseCalibration
                                ? "border-emerald-500/60 bg-emerald-950/30"
                                : "border-cyan-500/40 bg-cyan-950/20 hover:bg-cyan-950/40"
                            }`}
                          >
                            <span className="mt-0.5 shrink-0 rounded bg-cyan-500 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-950">
                              IR 建議
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-bold text-slate-100">
                                分段（五點）校正
                              </span>
                              <span className="block text-[11px] text-slate-400">
                                IR 圖的刻度常在中途換比例，不是等距。可用 A–E 最多五個已知刻度，每一段各自換算。
                                {showPiecewiseCalibration ? "（目前使用分段校正）" : "（目前是預設的兩點校正）"}
                              </span>
                            </span>
                            {showPiecewiseCalibration ? (
                              <ChevronUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                            ) : (
                              <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                            )}
                          </button>
                        )}

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
                                  aria-label="校正點 A 像素 X"
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
                                  aria-label="校正點 A 像素 Y"
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
                                aria-label="校正點 A 物理波數"
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
                                  aria-label="校正點 B 像素 X"
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
                                  aria-label="校正點 B 像素 Y"
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
                                aria-label="校正點 B 物理波數"
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
                                if (nextOpen) setShowPiecewiseCalibration(false);
                                if (!nextOpen && (nextCalibTarget === "D" || nextCalibTarget === "E")) {
                                  setNextCalibTarget("A");
                                }
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
                                        aria-label="校正點 C 像素 X"
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
                                        aria-label="校正點 C 像素 Y"
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
                                      aria-label="校正點 C 物理波數"
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

                          {focusedModality === "IR" && (
                            <div className="border-t border-slate-800 pt-2">
                              {showPiecewiseCalibration && (
                                <PiecewiseCalibrationControls
                                  xUnit={currentSpectrum.xUnit}
                                  points={{ C: calibPointC, D: calibPointD, E: calibPointE }}
                                  included={piecewiseIncluded}
                                  onChange={(key, patch) => {
                                    (key === "C" ? setCalibPointC : key === "D" ? setCalibPointD : setCalibPointE)(
                                      (p) => ({ ...p, ...patch })
                                    );
                                    if ("realX" in patch || "pixelX" in patch) {
                                      setPiecewiseIncluded((prev) => ({ ...prev, [key]: true }));
                                    }
                                  }}
                                  onInclude={(key, on) =>
                                    setPiecewiseIncluded((prev) => ({ ...prev, [key]: on }))
                                  }
                                  nextTarget={nextCalibTarget}
                                  onSelectTarget={(key) => setNextCalibTarget(key)}
                                  presetChecked={piecewisePresetOn}
                                  onPresetChange={setPiecewisePresetOn}
                                  knots={calibrationCheck.knots}
                                  error={calibrationCheck.error}
                                />
                              )}
                            </div>
                          )}

                          {panelCalibrationMode === "TWO_POINT" && (
                            <p
                              data-testid="two-point-linearity-hint"
                              className="rounded border border-amber-500/40 bg-amber-950/30 px-2.5 py-1.5 text-[11px] text-amber-200"
                            >
                              {AXIS_CALIBRATION_CONFIG.ui.twoPointHintText}
                            </p>
                          )}
                          {panelCalibrationMode === "THREE_POINT" &&
                            calibrationCheck.warning &&
                            focusedModality === "IR" && (
                              <div
                                data-testid="linearity-warning"
                                className="flex items-center justify-between gap-2 rounded border border-amber-500/40 bg-amber-950/30 px-2.5 py-1.5 text-[11px] text-amber-200"
                              >
                                <span>{calibrationCheck.warning}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowAdvancedCalibration(false);
                                    setShowPiecewiseCalibration(true);
                                    setCalibrationMode("PIECEWISE");
                                    setPiecewiseIncluded((prev) => ({ ...prev, C: true }));
                                  }}
                                  className="shrink-0 rounded bg-amber-600 px-2 py-0.5 text-[10px] font-semibold text-white"
                                >
                                  {AXIS_CALIBRATION_CONFIG.ui.switchToPiecewiseButtonText}
                                </button>
                              </div>
                            )}

                          <button
                            type="button"
                            onClick={handleApplyCalibration}
                            disabled={piecewiseActive && Boolean(calibrationCheck.error)}
                            className="w-full rounded-lg bg-amber-500 py-2.5 text-xs font-extrabold text-slate-950 shadow-sm hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {piecewiseActive
                              ? `套用分段線性校正並轉換 ${currentSpectrum.peaks.length} 個標記訊號`
                              : showAdvancedCalibration &&
                            calibrationMode === "THREE_POINT"
                              ? `套用三點最小平方法校正並轉換 ${currentSpectrum.peaks.length} 個標記訊號`
                              : `套用兩點線性座標校正並轉換 ${currentSpectrum.peaks.length} 個標記訊號`}
                          </button>
                        </div>

                        {/* IR 基線（只管強度）：與上面的「座標校正」是兩件事，但共用左側同一張圖；面板由 SpectrumViewer 渲染到這裡 */}
                        <div ref={setIrPanelHost} />

                        {/* 即時預覽與已校正結果對照表 */}
                        <div className="rounded-lg border border-slate-800 bg-slate-950/90 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-200">
                              標記訊號座標轉換即時預覽 ({currentSpectrum.peaks.length} 筆)
                            </span>
                            <span className="font-mono text-[10px] text-cyan-300">
                              {liveCalibrationPreview
                                ? liveCalibrationPreview.xAxisDirection ===
                                  "DESCENDING"
                                  ? "X軸方向：左高右低"
                                  : "X軸方向：左低右高"
                                : piecewiseActive && calibrationCheck.error
                                ? "分段校正點有誤（見左側紅字）"
                                : "請設定兩個不同刻度點"}
                            </span>
                          </div>

                          <CalibrationCheckTable
                            check={calibrationCheck}
                            xUnit={currentSpectrum.xUnit}
                            digits={focusedModality === "IR" ? 1 : 2}
                          />

                          <div className="mt-2">
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
                                  {(showAllPreviewRows
                                    ? currentSpectrum.peaks
                                    : currentSpectrum.peaks.slice(0, PREVIEW_ROWS_COLLAPSED)
                                  ).map((pk) => {
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
                            {currentSpectrum.peaks.length > PREVIEW_ROWS_COLLAPSED && (
                              <button
                                type="button"
                                onClick={() => setShowAllPreviewRows((v) => !v)}
                                aria-expanded={showAllPreviewRows}
                                className="mt-1.5 text-[11px] font-semibold text-cyan-300 hover:text-cyan-200"
                              >
                                {showAllPreviewRows
                                  ? "收合預覽列"
                                  : `展開全部 ${currentSpectrum.peaks.length} 筆（目前顯示前 ${PREVIEW_ROWS_COLLAPSED} 筆）`}
                              </button>
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
              <div className="space-y-3">
                {/* 舊標題改成視覺隱藏（E2E 以這串文字確認已進入第 3 頁）；步驟列是唯一可見標題 */}
                <h1 className="sr-only">化學判讀與結構推論（Interpretation）</h1>
                <ResultPanels active={resultTab} panels={{
                  fg: (<FunctionalGroupTab
                    hasResult={!!completedAnalysis}
                    groups={modeAReport.constraints.functionalGroups || []}
                    irFindings={modeAReport.irFindings || []}
                    evidenceList={spectrumEvidenceList}
                    observations={traceObservations}
                    proton={modeAReport.protonSummary ?? null}
                    carbon={modeAReport.carbonSummary ?? null}
                    ms={modeAReport.msSummary ?? null}
                    msmsProductIons={bundle.msmsAnalysis ? bundle.msmsAnalysis.physicsModel.productIons.length : null}
                    msmsNeutralLosses={bundle.msmsAnalysis ? bundle.msmsAnalysis.physicsModel.neutralLosses.length : null}
                    tofFeatures={bundle.tofSimsAnalysis ? bundle.tofSimsAnalysis.physicsModel.secondaryIonFeatures.length : null}
                    localStructures={modeAOrchestration.reasoningTrace?.localStructures ?? []}
                    hypotheses={modeAOrchestration.reasoningTrace?.hypotheses ?? []}
                    partialHypotheses={modeAOrchestration.generationStatus?.partialHypotheses}
                    msOnlyNote={!spectra.IR && !spectra["1H_NMR"] && !spectra["13C_NMR"] && !!(spectra.MS || auxSpectraMap["MS/MS"] || auxSpectraMap["ToF-SIMS"])}
                    onNext={() => setResultTab("pred")}
                  />),
                  pred: (<PredictionTab
                    onBack={() => setResultTab("fg")}
                    onGoCalibration={() => setModeAPage("PAGE_2_CALIBRATION")}
                    warning={topWarning}
                    processCard={processInPred ? <ReasoningPanel trace={completedAnalysis?.result.reasoningTrace} progress={analysisProgress} busy={analysisBusy}/> : null}
                    hasResult={!!completedAnalysis}
                    busy={analysisBusy}
                    candidates={candidateViews}
                    zeroCandidate={zeroCandidateNode}
                    search={searchInfo}
                    constraintItems={constraintItems}
                    deNovo={deNovoNode}
                  />),
                  formula: (<>
                    {!completedAnalysis && <p className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-400">尚未分析。分析後，這裡會列出分子式假設與搜尋計畫。</p>}
                    {completedAnalysis&&<CompositionPanel result={completedAnalysis.result} stale={analysisStale} unsearchedRowLimit={4}/>}
                  </>),
                  input: (<InputSummaryTab
                    rows={inputSummaryRows}
                    unprovidedText={dataCheck.unprovidedText}
                    onGoPage1={() => setModeAPage("PAGE_1_SIGNAL_MARKING")}
                    onGoPage2={(key) => { if (key) setFocusedModality(key as ExtendedModality); setModeAPage("PAGE_2_CALIBRATION"); }}
                  />),
                  diag: (<DiagnosisTab
                    hasResult={!!completedAnalysis}
                    summaryText={diagnosticSummaryText}
                    fullFormulaTableText={fullFormulaTableText}
                    onOpenExport={() => setIsExportModalOpen(true)}
                    markdownReport={() => buildMarkdownReport(orchestrationState, null)}
                    onDownloadJson={() => downloadEvidenceJson(orchestrationState)}
                    matrix={validationMatrix}
                    evidence={spectrumEvidenceList}
                    consensusNotes={modeAReport.crossModalConsistencyNotes}
                    uncertaintyNotes={modeAReport.uncertaintyNotes}
                    processCard={!processInPred ? <ReasoningPanel trace={completedAnalysis?.result.reasoningTrace} progress={analysisProgress} busy={analysisBusy}/> : null}
                  />),
                }} />
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
        {primaryMode === "PROJECTS" && <p className="text-slate-300">未知物工作台不載入預設化合物答案；請於 Mode A 輸入實驗資料。</p>}

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
              </div>
              <p className="mt-3 text-xs text-slate-400">工程測試透過 pnpm test 執行；正式工作台不載入固定測試物。</p>
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
      </div>
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


