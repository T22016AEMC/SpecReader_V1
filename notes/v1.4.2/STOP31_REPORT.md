# 第三十一站報告：發布前整理之一（備份推送、「確認峰表完整」依賴面、顯示錯誤修正、文件補寫）

分支 v1.4.2；沒有升版、沒有標籤、沒有 Release、沒有打包、沒有部署。

## A. 備份推送
- `git push -u origin v1.4.2`：只推分支本身，遠端新建 `refs/heads/v1.4.2`，推送時最新 commit 是 `4c96be9`。
- 推送前確認：遠端 `https://github.com/T22016AEMC/SpecReader_V1.git`；`gh` 使用中的帳號是 T22016AEMC（scope 含 repo、workflow）；倉庫沒有 `.github`、沒有 Actions workflow（API 回 0 個）、沒有 webhook、沒有 GitHub Pages（404）；唯一的部署設定是 `render.yaml`（Render，Web Service），裡面沒有 preview／分支設定。**Render 面板上「自動部署的分支」與「PR preview」我從倉庫看不到**；過去每次部署都是 main 合併後才由 health 回報新版本（歷史上推送 claude-mode、v1.3.0、v1.3.1 等分支從未觸發部署），所以判斷推 v1.4.2 不會部署。推送後我沒有去查 health（沒有被要求，也不屬於這一站）。

## B. 「確認峰表完整」（`observationCoverage === 'CONFIRMED_COMPLETE'`）的依賴面（只讀）

**前提（已重新確認）**：`src/` 下沒有任何一行程式碼把 `observationCoverage` 設成 `CONFIRMED_COMPLETE`（也沒有 `CONTINUOUS_TRACE`）；唯一會碰這個欄位的產品碼是 `observationSemantics.observationSpectrum`，預設補 `PARTIAL_MARKERS`。介面（`.tsx`）完全沒有讀寫它。所以在產品中，**所有圖譜（IR、¹H、¹³C、MS）永遠是未確認完整**。（若使用者匯入的檔案自己帶這個欄位，我沒有看到任何解析器會讀它。）

測試端：`tests/helpers/v121Golden.ts` 的 `fixtureSpectra`（52 個檔案用它）把 **IR 設成 CONFIRMED_COMPLETE**（¹H 沒有設），所以所有以它為基礎的 IR 量測與快照都是「IR 已確認完整」的世界；產品不是。

| # | 功能（出貨版本） | 讀取位置 | 在產品裡的實際效果 | 測試是否只靠手動設狀態 |
|---|---|---|---|---|
| 1 | IR 缺帶項 `IR:coverage 1630–1850／2100–2300`（v1 基線；2100–2300 窗另有 y≥70 條件，本來就是死碼） | `irSignalProcessing.irRangeCovered:128` → `evidenceLedger:228` | **從不生效**（第一道檢查就回 false） | 是（`fixtureSpectra`、`tests/irProcessing.test.ts:9` 手動設） |
| 2 | IR 帶比對的「伴隨帶缺失」輕扣（伴隨帶沒有峰、且該窗在涵蓋範圍內時，分數 ×(1−0.1×缺失比例)）（v1 基線） | `irBandKnowledge.irBandMatch` 的 `coverage` 參數 ← `evidenceLedger:178`、`irBandKnowledge:254`（IR 判讀清單） | **從不生效**：分數恆用「沒涵蓋」的分支（缺失伴隨帶不扣）。幅度上限 −10% ×（缺失伴隨帶比例） | 是（`fixtureSpectra` 的 IR 是完整的，量測全在「會扣」的世界） |
| 3 | 預測 vs 實驗的缺峰分類（`MISSING_IN_EXPERIMENTAL`）（v1 基線） | `predictionAndValidationFramework:358`（`irRangeCovered`） | **IR 缺峰一律歸「未評估」，從不歸「缺失」**（這是設計上保守） | 未找到專測它的測試；是否在目前介面主流程中被用到（`StructureSpectrumValidationPage`）我沒有逐一追蹤 |
| 4 | **¹H δ9–10 醛基解讀的刪除（IR 涵蓋醛區且沒有強 C=O → 刪 ALDEHYDE）（v1.2.0，已出貨）** | `sixStepAnalysis:34` `irCoversAldehydeRegion` → `shiftClasses:110` | **從不生效**（`coversRegion` 恆 false）；醛基解讀只在 IR 強度未知分支留下註記時才可能保留，但那一支也要 `coversRegion` 為真，所以產品中連註記都不出 | 是：測試直接把旗標 `irCoversAldehydeRegion` 傳 true（`tests/helpers/v121Golden.ts:149` 寫死 true；`generatorV12.test.ts` 用 `opts.irCovers`），不是從「IR 圖譜設完整」一路走來；v1.2.1 黃金檔也是在這個「IR 涵蓋」的世界量的 |
| 5 | **酯次甲基的羰基狀態 `esterCarbonyl`（v1.2.3，已含在 v1.3.1）** | `v12Evidence.irAldehydeContext:41`（`coversRegion && known`） | **恆為 `UNKNOWN`**（`coversRegion` 恆 false），「無強酯羰基→不給酯次甲基解讀」的分支不會走到 | 是（`v123Ester.test.ts` 經 `fixtureSpectra`，IR 是完整的） |
| 6 | 負向證據（腈／C-硝基／末端炔）的資料閘 G2（v1.4.2，未出貨，預設關） | `negativeEvidence:40`（`negativeEvidenceGateClosedReason`） | **從不觸發**：第一個條件 `NOT_CONFIRMED_COMPLETE` | 是（`v142NegativeEvidence.test.ts:114` 手設 `coverage: 'CONFIRMED_COMPLETE'`；`v142Probe` 預設就是完整） |
| 7 | ¹H「預測有、實測沒有」環境的扣分（雙向比對）（v1.2.0，已出貨） | `evidenceLedger:216`（`sources['1H_NMR'].observationCoverage`）→ `bidirectional1H:84` | **恆用「未確認完整」係數 0.5**（扣分減半），並在說明裡加「（1H 涵蓋未確認…）」；不會有全額扣分的情形 | 部分：`stage3.test.ts` 有 `complete=true/false` 兩種都測；`pipelineV12.test.ts`、`generatorV12.test.ts` 用手設 CONFIRMED_COMPLETE |
| 8 | 組成推斷的 ¹H 總氫數分數（未完整→分數因子 0.5，說明列「¹H 峰表未確認完整」）（v1.1.7／v1.2.0） | `hypothesisGenerator:17`（逐觀測的 `coverage`）→ `nmrComposition:68` → `compositionScoring:104／109` | **恆為未完整**：因子恆 0.5、說明文字恆出現 | 完整分支只靠手設：`generatorV12`／`provenance`／`v121bVinyl` 手造的觀測帶 `CONFIRMED_COMPLETE`；未完整分支是預設（`fixtureSpectra` 的 ¹H 沒設） |
| 9 | 組成推斷 ¹³C 的 `complete` 欄位 | `nmrComposition:55` | **沒有任何地方讀它**（欄位存在但無效果） | — |
| 10 | 原子庫存（atom inventory）的 `coverageComplete` | `v12Evidence:29` → `atomInventory:100／106／249` | **欄位被帶著走，但沒有任何程式讀它**（註解說「評分減半」，實際減半在第 7 項直接讀 `sources`） | — |
| 11 | **MS 的 M+2／M+1／M+4 缺席判斷（缺席＋涵蓋完整→視為「確定沒有」→ Cl／Br 硬排除、同位素分數）（v1.1.7 組成推斷，已出貨）** | `msComposition:48／89` → `inferComposition:151`、`compositionScoring:79／82` | **缺席的 M+2 永遠是「未標記」，從不是「確定缺席」**：Cl／Br 不會因為「沒標 M+2」被排除（只有「標了、且比值小於門檻」才排）；同位素缺席不計分，只在說明列「未標記；不當作不存在」 | **沒有任何測試覆蓋「缺席＋完整」分支**（`tests/`、`src/engines/__tests__/` 內搜不到 `ABSENT_COVERED`，也沒有測試把 MS 設成完整）；只有「標了且比值小」的分支有測 |
| 12 | 候選的「NMR 科學一致性」區塊 `nmrConsistencyAnalysis` | `candidateGenerator:301`（任一來源 CONFIRMED_COMPLETE 才輸出）→ `ui/CandidateEvidence.tsx:94` | **從不顯示**（候選卡片裡沒有「NMR 科學一致性」那一塊） | 輸出欄位本身由 `spectrumConsistencyEvaluator` 的測試覆蓋；「被隱藏」這一條沒有專測 |
| 13 | 組成面板的「¹H 涵蓋尚未確認完整…」建議文字 | `compositionPanelModel:409` → `exclusionStats:94` | **只要有 ¹H 就永遠出現**（只是一行建議，沒有分數影響） | — |

**只有負向證據嗎？缺帶判斷呢？** 都不是。受影響的缺帶類功能：#1、#2、#3、#4、#5（IR 範圍涵蓋）、#11（MS 缺席）、#6（負向證據）。¹H 的 #7、#8 沒有「失效」，只是**永遠走保守分支**（扣分減半）。#9、#10 是無效欄位。

**沒有受影響的缺帶功能（確認過）**：
- v1.3.0 的缺羰基扣分（`carbonylMissingStatus`）：峰表走「兩側都有峰＋強度已知」、影像走校正與描線涵蓋（`irImageRangeCovered`，原始碼註解明寫「Not tied to observationCoverage」），**都不讀 `observationCoverage`**，產品中可以生效。
- v1.2.1 B4 影像 IR 缺羰基帶（`carbonylBandStatus`）、v1.4.1 以後的帶（烯 OOP 等）、v1.3.2 視窗／多帶：都不讀它。

**一個量測面的缺口（沒有量化）**：#2 的輕扣、#4、#5 在測試與倉庫外的量測腳本裡是「IR 已確認完整」的狀態，產品是「未確認」；所以那些量測裡 IR 分數、¹H 排名（醛基、酯次甲基）與產品實際值有差。差的幅度上限在 #2 是 −10%×伴隨帶缺失比例（只影響有伴隨帶缺失的帶）；#4、#5 影響的是「是否保留某個 ¹H 解讀」。**我沒有重跑任何量測去量差多少**（這站要求只讀）。

## C. 顯示錯誤修正
- 位置：`src/components/PeakObservationTable.tsx` 的 `irObservedHeight`（觀測表「基線相對強度」）。
- 原因：單位寫成 "Transmittance"（不含 %）時被當成 0–1 的分數，顯示 `1 − y`；資料其實是 0–100 時 y=39.21 顯示 −38.21。
- 修法：新增 `transmittanceFullScale(values)`：該圖譜（原始點，沒有原始點就用標記峰）的最大值 > 1.5 → 基準 100，否則維持 1。**只改顯示**：`prepareIR`、峰表、分數、`irRangeCovered` 都沒動。
- 確認不受影響：`%Transmittance` 仍 100−y；`Absorbance` 仍 y；T 略大於 1（例如 1.02）仍視為分數；未知單位仍顯示「未知」；`irManualSettings.enabled`（手動基線）路徑沒動（用相減，不依賴單位）；有影像（`originalImageUrl`）仍回 null。
- 沒有處理的對稱情形：單位寫 `%Transmittance`／"percent" 但資料其實是 0–1（會顯示 100 − 0.39）。這次指令只涉及 0–100 配 Transmittance，沒有改；這個方向沒有實例也沒有人回報。
- 測試：新增 `tests/ui/irObservedHeight.test.ts`（9 個；移除修正後其中 4 個失敗）。**受影響的既有測試：沒有**（`irObservedHeight` 與 `transmittanceFullScale` 只有這個元件與新測試引用；`irPiecewiseUi.test.ts` 只是描述字串提到元件名）。
- 驗證範圍（這站依指示不跑全套與 E2E）：新測試＋`tests/ui/`（全部）＋`irPiecewiseUi`＋`irProcessing`＋`irNumericGolden`＋`observationWorkflow`：15 檔 166 個全過；`tsc --noEmit` 乾淨。

## D. 文件
- `KNOWN_LIMITS.md` 新增第 15 節；第 14 節觀測表顯示的那句加註「已修」。
- `RELEASE_NOTES_DRAFT.md`：負向證據一律改成「實驗性、預設關、目前產品中不會觸發」；第 2.4 節（含誤殺率與凝相樣本數）、旗標表、第 7 節第 7 項、第 13 節加註「在使用者能確認峰表完整的前提下量得」；新增 1.8（顯示修正）；新增第 7 節決定項。
- 第 2.5 節（NMRShiftDB2 聲明文字）沒有引用任何負向證據誤殺率，所以沒有改；實際引用誤殺率的是 2.4 與第 13 節。
