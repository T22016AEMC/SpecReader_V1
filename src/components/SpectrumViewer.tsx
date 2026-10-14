import {prepareIR} from '../engines/scientificEngines/irSignalProcessing';
import {baselineAt,mirrorIR,inferIRDirection,type IRManualSettings} from '../engines/scientificEngines/irManualBaseline';
import React, { useEffect, useMemo, useState } from "react";
import {
  Crosshair,
  Eye,
  EyeOff,
  FlaskConical,
  Image as ImageIcon,
  Layers,
  MapPin,
  PlusCircle,
  Sliders,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { SpectrumParser } from "../engines/spectrumParser";
import { ExperimentalSpectrumData, SpectralPeak } from "../types/spectrum";

export type ImageInteractionMode = "CALIBRATE" | "MARK_PEAK";

interface SpectrumViewerProps {
  spectrum: ExperimentalSpectrumData;
  overlaySpectrum?: ExperimentalSpectrumData;
  selectedPeakId?: string | null;
  onSelectPeak?: (peak: SpectralPeak) => void;
  onPickImagePixel?: (pixelX: number, pixelY: number) => void;
  onMarkPeakFromImage?: (params: {
    pixelX: number;
    pixelY: number;
    physicalX: number;
    physicalY: number;
  }) => void;
  onMovePeakFromImage?: (
    peakId: string,
    params: {
      pixelX: number;
      pixelY: number;
      physicalX: number;
      physicalY: number;
    }
  ) => void;
  onMarkPeakFromPlot?: (physicalX: number, physicalY: number) => void;
  onMovePeakFromPlot?: (
    peakId: string,
    physicalX: number,
    physicalY: number
  ) => void;
  imageInteractionMode?: ImageInteractionMode;
  onChangeImageInteractionMode?: (mode: ImageInteractionMode) => void;
  activeCalibTargetLabel?: string;
  calibrationPreviewPoints?: {
    label: string;
    pixelX: number;
    pixelY: number;
    physicalX: number;
    color: string;
  }[];
  livePreviewMapPixelX?: ((pixelX: number) => number) | null;
  hideModeSwitchButtons?: boolean;
  onIRSettingsChange?: (settings:IRManualSettings)=>void;
  height?: number;
}

export const SpectrumViewer: React.FC<SpectrumViewerProps> = ({
  spectrum: originalSpectrum,
  onIRSettingsChange,
  overlaySpectrum,
  selectedPeakId,
  onSelectPeak,
  onPickImagePixel,
  onMarkPeakFromImage,
  onMovePeakFromImage,
  onMarkPeakFromPlot,
  onMovePeakFromPlot,
  imageInteractionMode: controlledMode,
  onChangeImageInteractionMode,
  activeCalibTargetLabel,
  calibrationPreviewPoints = [],
  livePreviewMapPixelX = null,
  hideModeSwitchButtons = false,
  height = 310,
}) => {
  const [irView,setIRView]=useState<'ORIGINAL'|'UP'|'CORRECTED'>('ORIGINAL');
  const [draggingAnchor,setDraggingAnchor]=useState<number|null>(null);
  const [baselineEdit,setBaselineEdit]=useState(false);
  const [irDraft,setIRDraft]=useState<IRManualSettings|undefined>();
  useEffect(()=>setIRDraft(undefined),[originalSpectrum.sourceId,originalSpectrum.fileName]);
  const rawIR=originalSpectrum.irPixelCurve?originalSpectrum.points:originalSpectrum.rawExperimentalSnapshot?.rawPoints??originalSpectrum.points;
  const settings=irDraft??originalSpectrum.irManualSettings??{direction:'AUTO' as const,anchors:[],enabled:false};
  const direction=settings.direction==='AUTO'?(/transmitt|%t|透過/i.test(originalSpectrum.yUnit)?'DOWN':inferIRDirection(rawIR).direction):settings.direction;
  const mirroredIR=mirrorIR(rawIR,direction);
  const processedIR=useMemo(()=>originalSpectrum.modality==='IR'?prepareIR({...originalSpectrum,irProcessingApplied:false,irManualSettings:{...settings,enabled:settings.anchors.length===5&&new Set(settings.anchors.map(p=>p.x)).size===5}}):originalSpectrum,[originalSpectrum,irDraft]);
  const spectrum=originalSpectrum.modality==='IR'&&irView!=='ORIGINAL'?{...processedIR,points:irView==='UP'?mirroredIR:processedIR.irCorrectedPoints??processedIR.points}:originalSpectrum;
  const resetBaseline=()=>{
    const sorted=mirroredIR.slice().sort((a,b)=>a.x-b.x);
    if(sorted.length<5)return;
    const anchors=Array.from({length:5},(_,i)=>({...sorted[Math.round(i*(sorted.length-1)/4)]}));
    setIRDraft({...settings,anchors,enabled:false});setIRView('UP');setBaselineEdit(true);
  };
  const [showOverlay, setShowOverlay] = useState<boolean>(true);
  const [showPeakLabels, setShowPeakLabels] = useState<boolean>(true);
  const [showCalibrationGuides, setShowCalibrationGuides] =
    useState<boolean>(true);
  const [internalMode, setInternalMode] =
    useState<ImageInteractionMode>("MARK_PEAK");
  const [zoomFactor, setZoomFactor] = useState<number>(1);
  const [draggingPeakId, setDraggingPeakId] = useState<string | null>(null);
  const [didDragPeak, setDidDragPeak] = useState<boolean>(false);
  const [hoverCoord, setHoverCoord] = useState<{
    x: number;
    y: number;
    pixelX?: number;
    pixelY?: number;
  } | null>(null);

  const interactionMode = controlledMode ?? internalMode;
  const setInteractionMode = (mode: ImageInteractionMode) => {
    setInternalMode(mode);
    onChangeImageInteractionMode?.(mode);
  };

  const imageSrc =
    spectrum.originalImageUrl ||
    spectrum.imagePreviewUrl ||
    spectrum.companionImageReference?.originalImageUrl ||
    spectrum.companionImageReference?.imagePreviewUrl;

  const isImageSpectrum = Boolean(
    imageSrc &&
      (spectrum.sourceType === "IMAGE_EXPERIMENTAL" ||
        spectrum.digitizedFromImage ||
        ["IMAGE", "PNG", "JPG", "JPEG", "WEBP", "IMAGE_DIGITIZED"].includes(
          spectrum.sourceFormat
        ))
  );

  const hasNumericSeries = (spectrum.points?.length || 0) >= 2;
  const showSvgChart =
    !isImageSpectrum || hasNumericSeries || Boolean(overlaySpectrum);

  const [showCompanionImage, setShowCompanionImage] = useState<boolean>(true);

  const isReversedX =
    spectrum.modality === "IR" ||
    spectrum.modality === "1H_NMR" ||
    spectrum.modality === "13C_NMR";

  const imageDimensions = useMemo(() => {
    return (
      spectrum.imageDimensions || {
        width: spectrum.digitizedMetadata?.imageWidth || 800,
        height: spectrum.digitizedMetadata?.imageHeight || 450,
      }
    );
  }, [spectrum.imageDimensions, spectrum.digitizedMetadata]);

  const effectiveCalibration = useMemo(() => {
    if (spectrum.imageCalibration) return spectrum.imageCalibration;
    return SpectrumParser.buildImageCalibration(
      spectrum.modality,
      imageDimensions
    );
  }, [spectrum.imageCalibration, spectrum.modality, imageDimensions]);

  const isImageCalibrated = useMemo(() => {
    if (!isImageSpectrum) return true;
    return SpectrumParser.isSpectrumCalibrated(spectrum);
  }, [isImageSpectrum, spectrum]);

  const domain = useMemo(() => {
    const allX = [
      ...spectrum.points.map((p) => p.x),
      ...spectrum.peaks.map((p) => p.x),
      ...(overlaySpectrum ? overlaySpectrum.peaks.map((p) => p.x) : []),
    ];
    if (allX.length === 0) {
      if (spectrum.modality === "IR")
        return { minX: 400, maxX: 4000, minY: 0, maxY: 105 };
      if (spectrum.modality === "1H_NMR")
        return { minX: 0, maxX: 13, minY: 0, maxY: 110 };
      if (spectrum.modality === "13C_NMR")
        return { minX: 0, maxX: 220, minY: 0, maxY: 110 };
      return { minX: 10, maxX: 220, minY: 0, maxY: 110 };
    }

    let minX = Math.min(...allX);
    let maxX = Math.max(...allX);
    if (spectrum.modality === "IR") {
      minX = Math.min(450, minX);
      maxX = Math.max(3800, maxX);
    } else if (spectrum.modality === "1H_NMR") {
      minX = Math.min(0, minX);
      maxX = Math.max(12.5, maxX + 0.5);
    } else if (spectrum.modality === "13C_NMR") {
      minX = Math.min(0, minX);
      maxX = Math.max(210, maxX + 10);
    } else {
      minX = Math.max(0, minX - 15);
      maxX = maxX + 20;
    }

    if (zoomFactor > 1) {
      const center = (minX + maxX) / 2;
      const halfSpan = (maxX - minX) / (2 * zoomFactor);
      minX = center - halfSpan;
      maxX = center + halfSpan;
    }

    const ys=spectrum.modality==='IR'?spectrum.points.map(p=>p.y):[];
    const minY=ys.length?Math.min(...ys,0):0,maxY=ys.length?Math.max(...ys,1):108;
    const margin=(maxY-minY)*.08;
    return {minX,maxX,minY:minY-margin,maxY:maxY+margin};
  }, [spectrum, overlaySpectrum, zoomFactor]);

  const svgWidth = 860;
  const svgHeight = height;
  const padLeft = 54;
  const padRight = 26;
  const padTop = 28;
  const padBottom = 42;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const mapX = (xVal: number) => {
    const span = domain.maxX - domain.minX || 1;
    const ratio = (xVal - domain.minX) / span;
    return isReversedX
      ? padLeft + (1 - ratio) * plotW
      : padLeft + ratio * plotW;
  };

  const mapY = (yVal: number) => {
    const clamped = Math.max(domain.minY, Math.min(domain.maxY, yVal));
    const ratio = (clamped - domain.minY) / (domain.maxY - domain.minY || 1);
    return padTop + (1 - ratio) * plotH;
  };

  const unmapX = (px: number) => {
    const ratio = Math.max(0, Math.min(1, (px - padLeft) / plotW));
    const span = domain.maxX - domain.minX || 1;
    return isReversedX
      ? domain.maxX - ratio * span
      : domain.minX + ratio * span;
  };

  const unmapY = (py: number) => {
    const ratio = Math.max(0, Math.min(1, 1 - (py - padTop) / plotH));
    return domain.minY + ratio * (domain.maxY - domain.minY || 100);
  };

  const polylinePoints = useMemo(() => {
    if (spectrum.modality === "MS" || spectrum.points.length < 2) return "";
    const sorted = [...spectrum.points].sort((a, b) =>
      isReversedX ? b.x - a.x : a.x - b.x
    );
    return sorted
      .map((pt) => `${mapX(pt.x).toFixed(1)},${mapY(pt.y).toFixed(1)}`)
      .join(" ");
  }, [spectrum, domain, isReversedX]);

  const overlayPolylinePoints = useMemo(() => {
    if (
      !overlaySpectrum ||
      !showOverlay ||
      spectrum.modality === "MS" ||
      overlaySpectrum.points.length < 2
    )
      return "";
    const sorted = [...overlaySpectrum.points].sort((a, b) =>
      isReversedX ? b.x - a.x : a.x - b.x
    );
    return sorted
      .map((pt) => `${mapX(pt.x).toFixed(1)},${mapY(pt.y).toFixed(1)}`)
      .join(" ");
  }, [overlaySpectrum, showOverlay, domain, isReversedX, spectrum.modality]);

  const ticksX = useMemo(() => {
    const count = 8;
    const step = (domain.maxX - domain.minX) / count;
    const arr: number[] = [];
    for (let i = 0; i <= count; i++) {
      arr.push(domain.minX + i * step);
    }
    return arr;
  }, [domain]);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/95 p-3 shadow-inner">
      {originalSpectrum.modality==='IR'&&onIRSettingsChange&&<div className="mb-2 flex flex-wrap gap-2 text-xs text-slate-300">
        <select aria-label="IR 分析視圖" value={irView} onChange={e=>setIRView(e.target.value as typeof irView)} className="bg-slate-900"><option value="ORIGINAL">原始數值／原圖</option><option value="UP">向上峰（幾何鏡像）</option><option value="CORRECTED">基線校正預覽</option></select>
        <select aria-label="IR 峰朝向" value={settings.direction} onChange={e=>{const next={...settings,direction:e.target.value as IRManualSettings['direction']};setIRDraft(next);onIRSettingsChange(next);}} className="bg-slate-900"><option value="AUTO">自動方向（請確認）</option><option value="UP">原峰朝上</option><option value="DOWN">原峰朝下</option></select>
        <button onClick={resetBaseline}>重設五點基線</button>
        <button onClick={()=>{setIRDraft({...settings,anchors:[],enabled:false});setBaselineEdit(true);setIRView('UP');}}>清除並選五點</button>
        <button onClick={()=>{setBaselineEdit(!baselineEdit);setIRView('UP');}}>拖曳／點選五點</button>
        <button disabled={settings.anchors.length!==5||new Set(settings.anchors.map(p=>p.x)).size!==5} onClick={()=>{const next={...settings,enabled:true};setIRDraft(next);onIRSettingsChange(next);setIRView('CORRECTED');setBaselineEdit(false);}}>套用基線並供重新分析</button>
        <button onClick={()=>{setIRDraft({...settings,enabled:false,anchors:[]});onIRSettingsChange({...settings,enabled:false});}}>停用基線</button>
        <span>相對幾何強度；不是吸光度。控制點穿過寬峰可能扣除真實吸收。</span>
      </div>}
      {originalSpectrum.modality==='IR'&&irView!=='ORIGINAL'&&<details className="text-xs text-slate-400 mb-2"><summary>峰型證據與資料品質</summary>{processedIR.irProcessingWarnings?.map((s,i)=><p key={i}>{s}</p>)}{processedIR.peaks.slice(0,16).map(p=><p key={p.id}>{p.x.toFixed(1)} cm⁻¹ · FWHM {p.fwhm?.toFixed(1)??'未量測'} · 面積 {p.area?.toFixed(2)??'未知'} · 相對峰高 {p.y.toFixed(1)} · S/N {p.signalToNoise?.toFixed(1)??'未知'}</p>)}</details>}
      {/* 頂部儀表列 */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-cyan-500/15 px-2 py-0.5 font-mono text-xs font-bold text-cyan-300 border border-cyan-500/30">
            {spectrum.modality === "1H_NMR"
              ? "¹H NMR"
              : spectrum.modality === "13C_NMR"
                ? "¹³C NMR"
                : spectrum.modality}
          </span>
          <span className="font-mono text-xs text-slate-200 font-semibold">
            {spectrum.originalFileName || spectrum.fileName}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${
              spectrum.isSimulated
                ? "border border-amber-500/30 bg-amber-950/40 text-amber-300"
                : isImageSpectrum
                  ? "border border-cyan-500/30 bg-cyan-950/50 text-cyan-300"
                  : "border border-emerald-500/30 bg-emerald-950/40 text-emerald-300"
            }`}
          >
            {spectrum.isSimulated
              ? "PREDICTED (EMPIRICAL RULE)"
              : isImageSpectrum
                ? `ORIGINAL IMAGE (${spectrum.sourceFormat})`
                : `NUMERIC EXPERIMENTAL (${spectrum.sourceFormat})`}
          </span>

          {isImageSpectrum && (
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                isImageCalibrated
                  ? "border border-emerald-500/40 bg-emerald-950/50 text-emerald-300"
                  : "border border-amber-500/30 bg-amber-950/40 text-amber-300"
              }`}
            >
              {isImageCalibrated
                ? `${spectrum.imageCalibration?.calibrationMode === "THREE_POINT" ? "3-Point OLS" : "2-Point"} 已校正${
                    spectrum.imageCalibration?.rSquared !== undefined
                      ? ` (R²=${spectrum.imageCalibration.rSquared.toFixed(4)})`
                      : ""
                  }`
                : "尚未校正 (僅顯示原始像素位置 px)"}
            </span>
          )}

          {spectrum.nmrSolvent && spectrum.nmrSolvent !== "Unknown" && (
            <span className="inline-flex items-center gap-1 rounded border border-violet-500/30 bg-violet-950/40 px-1.5 py-0.5 font-mono text-[10px] text-violet-300">
              <FlaskConical className="h-3 w-3" />
              Solvent: {spectrum.nmrSolvent}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {hoverCoord && (
            <span className="mr-1 inline-flex items-center gap-1 rounded bg-slate-900 px-2 py-0.5 font-mono text-[11px] text-cyan-300 border border-slate-800">
              <Crosshair className="h-3 w-3" />
              {hoverCoord.pixelX !== undefined ? (
                <>
                  <span className="text-slate-300">
                    原始像素 px({hoverCoord.pixelX}, {hoverCoord.pixelY})
                  </span>
                  {isImageCalibrated ? (
                    <span className="text-emerald-300">
                      →{" "}
                      {spectrum.modality === "IR" || spectrum.modality === "MS"
                        ? hoverCoord.x.toFixed(1)
                        : hoverCoord.x.toFixed(2)}{" "}
                      {spectrum.xUnit}
                    </span>
                  ) : livePreviewMapPixelX ? (
                    <span className="text-amber-300">
                      → [校正預覽]{" "}
                      {spectrum.modality === "IR" || spectrum.modality === "MS"
                        ? livePreviewMapPixelX(hoverCoord.pixelX).toFixed(1)
                        : livePreviewMapPixelX(hoverCoord.pixelX).toFixed(2)}{" "}
                      {spectrum.xUnit}
                    </span>
                  ) : (
                    <span className="text-amber-400/90">
                      (尚未校正物理座標)
                    </span>
                  )}
                </>
              ) : (
                <span>
                  {spectrum.modality === "IR" || spectrum.modality === "MS"
                    ? hoverCoord.x.toFixed(1)
                    : hoverCoord.x.toFixed(2)}{" "}
                  {spectrum.xUnit}
                </span>
              )}
            </span>
          )}

          {/* 圖片互動模式切換：直接點擊原圖標記訊號 vs 點選校正基準點 */}
          {!hideModeSwitchButtons &&
            isImageSpectrum &&
            (onMarkPeakFromImage || onPickImagePixel) && (
              <div className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-900 p-0.5">
                {onMarkPeakFromImage && (
                  <button
                    type="button"
                    onClick={() => setInteractionMode("MARK_PEAK")}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition ${
                      interactionMode === "MARK_PEAK"
                        ? "bg-emerald-600 text-white"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                    title="點擊原始光譜圖片上的任意訊號峰，直接新增標記"
                  >
                    <PlusCircle className="h-3 w-3" />
                    點擊原圖標記訊號
                  </button>
                )}
                {onPickImagePixel && (
                  <button
                    type="button"
                    onClick={() => setInteractionMode("CALIBRATE")}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition ${
                      interactionMode === "CALIBRATE"
                        ? "bg-cyan-600 text-white"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                    title="點擊原始光譜圖片之 X 軸刻度，設定 2 點或 3 點線性校正基準點"
                  >
                    <Sliders className="h-3 w-3" />
                    點選校正點
                    {activeCalibTargetLabel
                      ? ` (${activeCalibTargetLabel})`
                      : ""}
                  </button>
                )}
              </div>
            )}

          {isImageSpectrum && (
            <button
              type="button"
              onClick={() => setShowCalibrationGuides((v) => !v)}
              className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition ${
                showCalibrationGuides
                  ? "border-cyan-500/40 bg-cyan-950/40 text-cyan-300"
                  : "border-slate-700 bg-slate-900 text-slate-400"
              }`}
            >
              <MapPin className="h-3 w-3" />
              {showCalibrationGuides ? "校正框線" : "隱藏框線"}
            </button>
          )}

          {!isImageSpectrum && imageSrc && (
            <button
              type="button"
              onClick={() => setShowCompanionImage((v) => !v)}
              className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition ${
                showCompanionImage
                  ? "border-cyan-500/40 bg-cyan-950/40 text-cyan-300"
                  : "border-slate-700 bg-slate-900 text-slate-400"
              }`}
            >
              <ImageIcon className="h-3 w-3" />
              {showCompanionImage ? "顯示伴隨原圖" : "隱藏原圖"}
            </button>
          )}

          {overlaySpectrum && (
            <button
              type="button"
              onClick={() => setShowOverlay((v) => !v)}
              className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium transition ${
                showOverlay
                  ? "border-amber-500/40 bg-amber-950/40 text-amber-300"
                  : "border-slate-700 bg-slate-900 text-slate-400"
              }`}
            >
              <Layers className="h-3 w-3" />
              {showOverlay ? "顯示預測疊圖" : "隱藏疊圖"}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowPeakLabels((v) => !v)}
            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800"
          >
            {showPeakLabels ? (
              <>
                <Eye className="h-3 w-3 text-cyan-400" />
                峰標記 ({spectrum.peaks.length})
              </>
            ) : (
              <>
                <EyeOff className="h-3 w-3 text-slate-500" />
                隱藏標記
              </>
            )}
          </button>

          {showSvgChart && (
            <>
              <button
                type="button"
                onClick={() => setZoomFactor((z) => Math.min(4, z + 0.5))}
                className="rounded border border-slate-700 bg-slate-900 p-1 text-slate-300 hover:bg-slate-800"
                title="放大座標區間"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoomFactor(1)}
                className="rounded border border-slate-700 bg-slate-900 p-1 text-slate-300 hover:bg-slate-800"
                title="重置縮放"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* 主要原始光譜圖片檢視器 (Original Spectrum Image — 圖片光譜唯一真實視覺來源) */}
      {/* ================================================================= */}
      {imageSrc && (isImageSpectrum || showCompanionImage) && (
        <div
          className={`${
            showSvgChart ? "mb-3" : ""
          } rounded-lg border border-slate-800 bg-slate-900/75 p-2.5`}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 font-semibold text-cyan-300">
                <ImageIcon className="h-3.5 w-3.5" />
                原始實驗光譜圖片 ({spectrum.originalFileName || spectrum.fileName})
              </span>
              <span className="text-slate-400">
                — 絕不以合成曲線取代原始影像；所有自動與手動峰值皆直接標記於原圖座標上
              </span>
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span className="rounded bg-slate-950 px-2 py-0.5 text-slate-300 border border-slate-800">
                {imageDimensions.width} × {imageDimensions.height} px
              </span>
              <span
                className={`rounded px-2 py-0.5 font-semibold ${
                  interactionMode === "MARK_PEAK" && onMarkPeakFromImage
                    ? "bg-emerald-950/70 text-emerald-300 border border-emerald-500/30"
                    : "bg-cyan-950/70 text-cyan-300 border border-cyan-500/30"
                }`}
              >
                {interactionMode === "MARK_PEAK" && onMarkPeakFromImage
                  ? "點擊原圖直接新增訊號峰"
                  : `點擊原圖擷取校正點${activeCalibTargetLabel ? ` ${activeCalibTargetLabel}` : ""}`}
              </span>
            </div>
          </div>

          {spectrum.digitizationErrorMessage && (
            <div className="mb-2 rounded border border-amber-500/30 bg-amber-950/30 px-2.5 py-1.5 text-[11px] text-amber-200">
              {spectrum.digitizationErrorMessage}
            </div>
          )}

          <div className="relative overflow-hidden rounded-lg border border-slate-800 bg-slate-950 flex justify-center">
            <div className="relative inline-block w-full max-w-[960px]">
              <img
                src={imageSrc}
                alt={spectrum.originalFileName || spectrum.fileName}
                className="block w-full h-auto select-none object-contain"
              />
              {/* 互動式 SVG 疊加層：與原始圖片像素空間 (imageDimensions.width × height) 1:1 對齊 */}
              <svg
                viewBox={`0 0 ${imageDimensions.width} ${imageDimensions.height}`}
                className="absolute inset-0 h-full w-full cursor-crosshair select-none"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const px = Math.max(
                    0,
                    Math.min(
                      imageDimensions.width,
                      Math.round(
                        ((e.clientX - rect.left) / Math.max(1, rect.width)) *
                          imageDimensions.width
                      )
                    )
                  );
                  const py = Math.max(
                    0,
                    Math.min(
                      imageDimensions.height,
                      Math.round(
                        ((e.clientY - rect.top) / Math.max(1, rect.height)) *
                          imageDimensions.height
                      )
                    )
                  );
                  const physX = SpectrumParser.pixelToPhysicalX(
                    px,
                    effectiveCalibration
                  );
                  const physY = SpectrumParser.pixelToPhysicalIntensity(
                    py,
                    effectiveCalibration,
                    spectrum.modality
                  );
                  setHoverCoord({
                    x: physX,
                    y: physY,
                    pixelX: px,
                    pixelY: py,
                  });

                  if (draggingPeakId && onMovePeakFromImage) {
                    setDidDragPeak(true);
                    onMovePeakFromImage(draggingPeakId, {
                      pixelX: px,
                      pixelY: py,
                      physicalX: physX,
                      physicalY: physY,
                    });
                  }
                }}
                onMouseUp={() => {
                  if (draggingPeakId) {
                    setDraggingPeakId(null);
                  }
                }}
                onMouseLeave={() => {
                  setHoverCoord(null);
                  setDraggingPeakId(null);
                }}
                onClick={(e) => {
                  if (didDragPeak) {
                    setDidDragPeak(false);
                    return;
                  }
                  const rect = e.currentTarget.getBoundingClientRect();
                  const px = Math.round(
                    ((e.clientX - rect.left) / Math.max(1, rect.width)) *
                      imageDimensions.width
                  );
                  const py = Math.round(
                    ((e.clientY - rect.top) / Math.max(1, rect.height)) *
                      imageDimensions.height
                  );
                  const physX = SpectrumParser.pixelToPhysicalX(
                    px,
                    effectiveCalibration
                  );
                  const physY = SpectrumParser.pixelToPhysicalIntensity(
                    py,
                    effectiveCalibration,
                    spectrum.modality
                  );

                  if (
                    interactionMode === "MARK_PEAK" &&
                    onMarkPeakFromImage
                  ) {
                    onMarkPeakFromImage({
                      pixelX: px,
                      pixelY: py,
                      physicalX: physX,
                      physicalY: physY,
                    });
                  } else if (onPickImagePixel) {
                    onPickImagePixel(px, py);
                  } else if (onMarkPeakFromImage) {
                    onMarkPeakFromImage({
                      pixelX: px,
                      pixelY: py,
                      physicalX: physX,
                      physicalY: physY,
                    });
                  }
                }}
              >
                {/* 有效繪圖區邊界與校正參考點 */}
                {showCalibrationGuides && (
                  <g>
                    <rect
                      x={effectiveCalibration.plotLeftPx}
                      y={effectiveCalibration.plotTopPx}
                      width={Math.max(
                        10,
                        effectiveCalibration.plotRightPx -
                          effectiveCalibration.plotLeftPx
                      )}
                      height={Math.max(
                        10,
                        effectiveCalibration.plotBottomPx -
                          effectiveCalibration.plotTopPx
                      )}
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth={1.5}
                      strokeDasharray="6 4"
                      opacity={0.65}
                    />
                    {/* 顯示使用者正在設定或已校正的參考基準點 (A / B / C) */}
                    {calibrationPreviewPoints.map((pt, idx) => (
                      <g key={`cal-pt-${idx}`}>
                        <line
                          x1={pt.pixelX}
                          y1={effectiveCalibration.plotTopPx}
                          x2={pt.pixelX}
                          y2={effectiveCalibration.plotBottomPx}
                          stroke={pt.color}
                          strokeWidth={1.5}
                          strokeDasharray="4 2"
                          opacity={0.85}
                        />
                        <circle
                          cx={pt.pixelX}
                          cy={pt.pixelY}
                          r={6}
                          fill={pt.color}
                          stroke="#020617"
                          strokeWidth={1.8}
                        />
                        <rect
                          x={pt.pixelX - 42}
                          y={Math.max(4, pt.pixelY - 26)}
                          width={84}
                          height={18}
                          rx={4}
                          fill="#020617"
                          fillOpacity={0.85}
                          stroke={pt.color}
                          strokeWidth={1}
                        />
                        <text
                          x={pt.pixelX}
                          y={Math.max(16, pt.pixelY - 14)}
                          textAnchor="middle"
                          fill={pt.color}
                          fontSize={10}
                          fontWeight={700}
                          fontFamily="IBM Plex Mono, monospace"
                        >
                          {pt.label}: {pt.physicalX}
                        </text>
                      </g>
                    ))}
                  </g>
                )}

                {/* 原圖峰值標記點 (對應 spectrum.peaks 與 imageAnnotations) */}
                {spectrum.peaks.map((pk, pkIdx) => {
                  const ann = (spectrum.imageAnnotations || []).find(
                    (a) => a.id === pk.id
                  );
                  const px =
                    pk.pixelX ??
                    ann?.pixelX ??
                    SpectrumParser.physicalToPixelX(
                      pk.x,
                      effectiveCalibration
                    );
                  const py =
                    pk.pixelY ??
                    ann?.pixelY ??
                    SpectrumParser.physicalIntensityToPixelY(
                      pk.y,
                      effectiveCalibration
                    );
                  const isSelected = pk.id === selectedPeakId;
                  const isSolvent =
                    pk.userClassification === "SOLVENT" ||
                    pk.classificationTag === "SOLVENT" ||
                    pk.isSolventVerified;
                  const isNoise =
                    pk.userClassification === "NOISE" ||
                    pk.classificationTag === "NOISE";
                  const isPeakCalibrated =
                    pk.isCalibrated !== undefined
                      ? pk.isCalibrated
                      : isImageCalibrated;

                  const dotColor = isSelected
                    ? "#f43f5e"
                    : isSolvent
                      ? "#a855f7"
                      : isNoise
                        ? "#64748b"
                        : isPeakCalibrated
                          ? "#10b981"
                          : "#f59e0b";

                  const badgeText = isPeakCalibrated
                    ? `${
                        spectrum.modality === "IR" || spectrum.modality === "MS"
                          ? pk.x.toFixed(0)
                          : pk.x.toFixed(2)
                      }${isSolvent ? " [Solv]" : ""}`
                    : livePreviewMapPixelX
                      ? `px(${px})→${
                          spectrum.modality === "IR" ||
                          spectrum.modality === "MS"
                            ? livePreviewMapPixelX(px).toFixed(0)
                            : livePreviewMapPixelX(px).toFixed(2)
                        }`
                      : `#${pkIdx + 1} px(${px},${py})`;

                  const badgeWidth = Math.max(76, badgeText.length * 6.4);

                  return (
                    <g
                      key={`img-pk-${pk.id}`}
                      className={
                        onMovePeakFromImage ? "cursor-move" : "cursor-pointer"
                      }
                      onMouseDown={(e) => {
                        if (onMovePeakFromImage) {
                          e.stopPropagation();
                          setDraggingPeakId(pk.id);
                          setDidDragPeak(false);
                          onSelectPeak?.(pk);
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPeak?.(pk);
                      }}
                    >
                      <line
                        x1={px}
                        y1={py}
                        x2={px}
                        y2={Math.max(14, py - 18)}
                        stroke={dotColor}
                        strokeWidth={1.5}
                      />
                      <circle
                        cx={px}
                        cy={py}
                        r={isSelected ? 6.5 : 5}
                        fill={dotColor}
                        stroke="#020617"
                        strokeWidth={1.6}
                      />
                      {showPeakLabels && (
                        <g>
                          <rect
                            x={px - badgeWidth / 2}
                            y={Math.max(2, py - 34)}
                            width={badgeWidth}
                            height={16}
                            rx={3}
                            fill="#020617"
                            fillOpacity={0.88}
                            stroke={dotColor}
                            strokeWidth={0.9}
                          />
                          <text
                            x={px}
                            y={Math.max(13, py - 23)}
                            textAnchor="middle"
                            fill="#f8fafc"
                            fontSize={10}
                            fontWeight={700}
                            fontFamily="IBM Plex Mono, monospace"
                          >
                            {badgeText}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 數值光譜 / 預測疊圖 SVG 畫布 (僅在有真實數值點、手動數值表或預測疊圖時顯示) */}
      {/* ================================================================= */}
      {showSvgChart && (
        <div className="relative overflow-x-auto">
          {isImageSpectrum && overlaySpectrum && (
            <div className="mb-1.5 flex items-center justify-between rounded bg-amber-950/30 px-2.5 py-1 text-[11px] text-amber-200 border border-amber-500/30">
              <span>
                理論預測光譜與實驗標記峰位比對圖 (Theoretical Prediction vs. Calibrated Image Peaks)
              </span>
              <span className="font-mono text-[10px]">
                虛線為候選結構理論預測，圓點為原圖提取/標記之實驗峰位
              </span>
            </div>
          )}
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className={`w-full select-none ${
              onMarkPeakFromPlot ? "cursor-crosshair" : ""
            }`}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const relX = ((e.clientX - rect.left) / rect.width) * svgWidth;
              const relY = ((e.clientY - rect.top) / rect.height) * svgHeight;
              if (relX >= padLeft && relX <= svgWidth - padRight) {
                const physX = Number(
                  unmapX(relX).toFixed(spectrum.modality === "MS" ? 4 : 2)
                );
                const physY = Number(
                  Math.max(5, Math.min(100, unmapY(relY))).toFixed(1)
                );
                setHoverCoord({
                  x: physX,
                  y: physY,
                });
                if(draggingAnchor!==null&&onIRSettingsChange){
                  setDidDragPeak(true);
                  setIRDraft({...settings,enabled:false,anchors:settings.anchors.map((p,i)=>i===draggingAnchor?{x:unmapX(relX),y:unmapY(relY)}:p)});
                }
                if (draggingPeakId && onMovePeakFromPlot) {
                  setDidDragPeak(true);
                  onMovePeakFromPlot(draggingPeakId, physX, physY);
                }
              } else {
                setHoverCoord(null);
              }
            }}
            onMouseUp={() => {
              setDraggingAnchor(null);
              if (draggingPeakId) setDraggingPeakId(null);
            }}
            onMouseLeave={() => {
              setDraggingAnchor(null);
              setHoverCoord(null);
              setDraggingPeakId(null);
            }}
            onClick={(e) => {
              if (didDragPeak) {
                setDidDragPeak(false);
                return;
              }
              if(baselineEdit&&onIRSettingsChange){
                const rect=e.currentTarget.getBoundingClientRect();
                const point={x:unmapX((e.clientX-rect.left)/rect.width*svgWidth),y:unmapY((e.clientY-rect.top)/rect.height*svgHeight)};
                const anchors=settings.anchors.length<5?[...settings.anchors,point]:settings.anchors;
                setIRDraft({...settings,anchors,enabled:false});return;
              }
              if (!onMarkPeakFromPlot) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const relX = ((e.clientX - rect.left) / rect.width) * svgWidth;
              const relY = ((e.clientY - rect.top) / rect.height) * svgHeight;
              if (
                relX >= padLeft &&
                relX <= svgWidth - padRight &&
                relY >= padTop &&
                relY <= svgHeight - padBottom
              ) {
                const physX = Number(
                  unmapX(relX).toFixed(spectrum.modality === "MS" ? 4 : 2)
                );
                const physY = Number(
                  Math.max(5, Math.min(100, unmapY(relY))).toFixed(1)
                );
                onMarkPeakFromPlot(physX, physY);
              }
            }}
          >
            {/* 網格線 */}
            {[0, 25, 50, 75, 100].map((yTick) => {
              const py = mapY(yTick);
              return (
                <g key={yTick}>
                  <line
                    x1={padLeft}
                    y1={py}
                    x2={svgWidth - padRight}
                    y2={py}
                    stroke="#1e293b"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                  />
                  <text
                    x={padLeft - 8}
                    y={py + 4}
                    textAnchor="end"
                    fill="#64748b"
                    fontSize={10}
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {yTick}
                  </text>
                </g>
              );
            })}

            {ticksX.map((xTick, idx) => {
              const px = mapX(xTick);
              return (
                <g key={idx}>
                  <line
                    x1={px}
                    y1={padTop}
                    x2={px}
                    y2={svgHeight - padBottom}
                    stroke="#1e293b"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                  />
                  <text
                    x={px}
                    y={svgHeight - padBottom + 16}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize={10}
                    fontFamily="IBM Plex Mono, monospace"
                  >
                    {spectrum.modality === "IR" || spectrum.modality === "MS"
                      ? xTick.toFixed(0)
                      : xTick.toFixed(1)}
                  </text>
                </g>
              );
            })}

            {/* 座標軸邊框 */}
            <line
              x1={padLeft}
              y1={svgHeight - padBottom}
              x2={svgWidth - padRight}
              y2={svgHeight - padBottom}
              stroke="#475569"
              strokeWidth={1.5}
            />
            <line
              x1={padLeft}
              y1={padTop}
              x2={padLeft}
              y2={svgHeight - padBottom}
              stroke="#475569"
              strokeWidth={1.5}
            />

            {/* 預測疊圖曲線 (若啟用) */}
            {overlaySpectrum && showOverlay && spectrum.modality !== "MS" && (
              <polyline
                fill="none"
                stroke="#f59e0b"
                strokeWidth={1.6}
                strokeDasharray="5 3"
                opacity={0.85}
                points={overlayPolylinePoints}
              />
            )}

            {/* 預測疊圖 MS 棒狀圖 */}
            {overlaySpectrum &&
              showOverlay &&
              spectrum.modality === "MS" &&
              overlaySpectrum.peaks.map((pk) => {
                const px = mapX(pk.x) + 3;
                const py = mapY(pk.y);
                const basePy = mapY(0);
                return (
                  <line
                    key={`ov-${pk.id}`}
                    x1={px}
                    y1={basePy}
                    x2={px}
                    y2={py}
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="3 2"
                    opacity={0.85}
                  />
                );
              })}

            {/* 主光譜連續曲線 (僅限真實數值點，絕不為圖片合成假曲線) */}
            {spectrum.modality !== "MS" && polylinePoints && (
              <polyline
                fill="none"
                stroke={spectrum.isSimulated ? "#f59e0b" : "#22d3ee"}
                strokeWidth={1.9}
                points={polylinePoints}
              />
            )}

            {/* MS 棒狀質譜圖 或 手動無曲線峰值垂線 */}
            {(spectrum.modality === "MS" || !polylinePoints) &&
              spectrum.peaks.map((pk) => {
                const px = mapX(pk.x);
                const py = mapY(pk.y);
                const basePy =
                  spectrum.modality === "IR" ? mapY(100) : mapY(0);
                const isSelected = pk.id === selectedPeakId;
                const isNoise = pk.userClassification === "NOISE";
                return (
                  <g
                    key={pk.id}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPeak?.(pk);
                    }}
                  >
                    <line
                      x1={px}
                      y1={basePy}
                      x2={px}
                      y2={py}
                      stroke={
                        isSelected
                          ? "#f43f5e"
                          : isNoise
                            ? "#64748b"
                            : spectrum.isSimulated
                              ? "#f59e0b"
                              : "#38bdf8"
                      }
                      strokeWidth={isSelected ? 3.2 : 2.1}
                      strokeDasharray={
                        spectrum.modality === "MS" ? undefined : "3 2"
                      }
                    />
                  </g>
                );
              })}

            {/* 峰值標記點與文字 */}
            {spectrum.peaks.map((pk) => {
              const px = mapX(pk.x);
              if (px < padLeft || px > svgWidth - padRight) return null;
              const py = mapY(pk.y);
              const isSelected = pk.id === selectedPeakId;
              const isSolvent =
                pk.userClassification === "SOLVENT" ||
                pk.classificationTag === "SOLVENT" ||
                pk.isSolventVerified;
              const isNoise =
                pk.userClassification === "NOISE" ||
                pk.classificationTag === "NOISE";

              const dotColor = isSelected
                ? "#f43f5e"
                : isSolvent
                  ? "#a855f7"
                  : isNoise
                    ? "#64748b"
                    : "#10b981";

              return (
                <g
                  key={`marker-${pk.id}`}
                  className={onMovePeakFromPlot ? "cursor-move" : "cursor-pointer"}
                  onMouseDown={(e) => {
                    if (onMovePeakFromPlot) {
                      e.stopPropagation();
                      setDraggingPeakId(pk.id);
                      setDidDragPeak(false);
                      onSelectPeak?.(pk);
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectPeak?.(pk);
                  }}
                >
                  <circle
                    cx={px}
                    cy={py}
                    r={isSelected ? 5.5 : 4}
                    fill={dotColor}
                    stroke="#020617"
                    strokeWidth={1.2}
                  />
                  {showPeakLabels && (
                    <g>
                      <text
                        x={px}
                        y={
                          spectrum.modality === "IR"
                            ? Math.min(svgHeight - padBottom - 6, py + 14)
                            : Math.max(padTop + 10, py - 8)
                        }
                        textAnchor="middle"
                        fill={
                          isSolvent
                            ? "#d8b4fe"
                            : isNoise
                              ? "#94a3b8"
                              : isSelected
                                ? "#fda4af"
                                : "#e2e8f0"
                        }
                        fontSize={10}
                        fontWeight={600}
                        fontFamily="IBM Plex Mono, monospace"
                      >
                        {spectrum.modality === "IR" ||
                        spectrum.modality === "MS"
                          ? pk.x.toFixed(0)
                          : pk.x.toFixed(2)}
                        {isSolvent
                          ? " [Solvent]"
                          : pk.multiplicity
                            ? ` (${pk.multiplicity}${pk.integral ?? pk.integration ? `,${pk.integral ?? pk.integration}H` : ""})`
                            : ""}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* X 軸單位標題 */}
            <text
              x={svgWidth / 2}
              y={svgHeight - 6}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize={11}
              fontFamily="IBM Plex Mono, monospace"
            >
              {spectrum.xUnit} {isReversedX ? "(由高至低標準化學慣例)" : ""}
            </text>
            {spectrum.modality==='IR'&&irView==='UP'&&settings.anchors.length===5&&new Set(settings.anchors.map(p=>p.x)).size===5&&<g>
              <polyline fill="none" stroke="#fbbf24" strokeWidth="2" points={mirroredIR.map(p=>`${mapX(p.x)},${mapY(baselineAt(p.x,settings.anchors))}`).join(' ')}/>
              {settings.anchors.map((p,i)=><circle key={i} aria-label={`基線控制點 ${i+1}`} cx={mapX(p.x)} cy={mapY(p.y)} r="7" fill="#fbbf24" onMouseDown={e=>{e.stopPropagation();setDraggingAnchor(i);setDidDragPeak(false);}}/>)}</g>}
          </svg>
        </div>
      )}

      {/* 底部圖例與溶劑峰提示 */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            已校正 / 數值標記訊號 (Calibrated / Numeric)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            原始像素標記 (尚未校正 Uncalibrated px)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            目前選取訊號 (可拖曳移動或於面板編輯)
          </span>
          {overlaySpectrum && showOverlay && (
            <span className="inline-flex items-center gap-1.5 text-amber-300">
              <span className="h-0.5 w-4 border-b-2 border-dashed border-amber-400" />
              理論預測疊圖 (Predicted Overlay)
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-purple-400" />
            SOLVENT 溶劑峰 (不納入未知物推論)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
            NOISE 雜訊峰
          </span>
        </div>
        <span className="font-mono text-[10px] text-slate-400">
          {isImageSpectrum
            ? "點擊原圖直接標記或拖曳訊號位置；校正前僅顯示原始像素 px，校正後自動轉換為物理座標"
            : "點擊真實數值曲線可直接標記峰頂/谷底，或拖曳已標記點調整位置"}
        </span>
      </div>
    </div>
  );
};

