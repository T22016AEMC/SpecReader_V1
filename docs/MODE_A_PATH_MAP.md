# Mode A 正式路徑地圖

基準：V1.1.3（commit `1866a29`）之上的 v1.1.4。本文件只描述現況，不代表任何科學邏輯被修改。行號是撰寫當下的位置，之後程式碼變動時以函式名稱為準。

## 如何得出這張地圖

檔案層級的 import 關係**不等於**正式路徑，所以用了兩種證據互相校正：

1. **靜態**：以腳本解析 `import`／`export … from`／`import()`／`new URL()`，算出 `src/workers/modeA.worker.ts` 的 import 閉包。`src/` 共 73 個非測試檔案，閉包有 62 個（含 worker 本身）；閉包外的 11 個是 UI 元件（`App.tsx`、`main.tsx`、`src/components/*` 共 9 個）加上 `nmrReferenceDatabase.ts`（只被 `src/engines/__tests__/phase2NmrScientificUpgrade.test.ts` import 的相容轉出檔，內容是 `export * from './nmrAtomicEnvironmentModel'`）。
2. **動態**：以 V8 精確覆蓋率實際執行 `executeSixStepAnalysis`（以 IR、¹H、¹³C、MS 四種峰表為輸入，有／無分子式各一次）與 `WorkbenchOrchestrator.runModeBPrediction`，記錄哪些具名函式真的被執行。閉包 62 個檔案中，有 14 個沒有任何函式被執行（見第 3 節）。

限制：動態追蹤的輸入沒有 MS/MS 與 ToF-SIMS 光譜，這兩條分支（`MSMSFragmentationEngine.analyze`、`ToFSIMSScientificEngine.analyze`）是靠閱讀 `chemicalFeatureEngine.ts` 的呼叫程式碼確認，標示為「條件式」。

## 1. 正式路徑（依七個階段分組）

入口：UI `src/App.tsx:507` 呼叫 `executeAnalysisWorker`（`src/engines/analysisSession.ts`）→ 啟動 `src/workers/modeA.worker.ts` → `initializeRDKit()` →（有 `irManualSettings` 時 `refreshIRSnapshot`）→ `executeSixStepAnalysis`（`src/engines/reasoning/sixStepAnalysis.ts:9`）。

程式內部回報進度只有 1–6 步：第 5 步同時涵蓋「硬限制驗證」與「評分排名」，第 6 步是組裝 ReasoningTrace。下表為了與規劃文件對齊，拆成七組。

### ① 觀測萃取

| 檔案 | 主要函式 | 備註 |
|---|---|---|
| `reasoning/sixStepAnalysis.ts` | `executeSixStepAnalysis` (:9) | 唯一正式入口；`options.timeMs` 預設 12000、`options.maxStates` 預設 120000 |
| `workbenchOrchestrator.ts` | `WorkbenchOrchestrator.prepareModeAEvidence` (:204) | |
| `scientificEngines/observationSemantics.ts` | `observationSpectrum` (:3) | 把每個非預測峰重設為 `role/signalRole=ANALYTE`、`userClassification/classificationTag=COMPOUND`、`isSolventVerified=false`，並預設 `observationCoverage=PARTIAL_MARKERS`（見第 2 節發現 4） |
| `scientificEngines/spectralEvidenceExtractor.ts` | `SpectralEvidenceExtractor.extractAllEvidence` (:26) | |
| `chemicalFeatureEngine.ts` | `ChemicalFeatureEngine.extractIntegratedConstraints` (:422) | 實際被呼叫的是這個；`buildIntegratedBundle` (:406) 只是包裝，測試與 Mode B 用。在 :1436 呼叫 `buildScientificEvidence` |
| `scientificEngines/scientificInputValidation.ts` | `validateScientificInput` | |
| `irEngine.ts` | `IRAnalysisEngine.analyzeExperimentalIR` (:15)、`buildStructuralConstraints` | |
| `nmrEngine.ts` | `NMRAnalysisEngine.analyzeExperimental1HNMR` (:138)、`analyzeExperimental13CNMR` (:1521)、`build1HNMRStructuralConstraints`、`build13CNMRStructuralConstraints` | `c13ExperimentMode` 只在 `nmrEngine.ts:1606` 被讀取 |
| `msEngine.ts` | `MSAnalysisEngine.analyzeExperimentalMS` (:64) | 離子已知時呼叫 `formulaEngine.ts` 的 `MolecularFormulaCandidateEngine.generateCandidates` (:15)，產生 MS 質量對應的分子式候選（見第 2 節發現 7） |
| `scientificEngines/massSpectrometryEngine.ts`、`irScientificEngine.ts`、`nmrScientificEngine.ts` | `MassSpectrometryEngine.analyze`、`IRScientificEngine.analyze`、`NMRScientificEngine.analyze1H/analyze13C` | 實測有被執行（由上列分析函式內部呼叫） |
| `scientificEngines/msmsFragmentationEngine.ts` | `MSMSFragmentationEngine.analyze` (:496) | **條件式**：僅在提供 MS/MS 時 |
| `scientificEngines/tofSimsScientificEngine.ts` | `ToFSIMSScientificEngine.analyze` (:462) | **條件式**：僅在提供 ToF-SIMS 時 |
| `scientificEngines/chemicalHardConstraintValidator.ts` | `parseAndValidateFormula` (:204)、`analyzeH1NMRIntegrationSemantics` | 解析使用者分子式（`extraInput.molecularFormula`，備援 `userSuppliedFormula`） |
| `scientificEngines/evidenceLedger.ts` | `buildScientificEvidence` (:33) | 建立 `bundle.scientificEvidence` |
| 支援模組 | `irSignalProcessing.ts`（`prepareIR`、`processIRSeries`、`resolveIRScale`、`measureIRBandMorphology`）、`irBandKnowledge.ts`（`inferIRBands`）、`irManualBaseline.ts`、`atomicChemicalEnvironment.ts`、`nmrFragmentEvidence.ts`、`dataValidator.ts`、`isotopeEnvelope.ts`、`ionMass.ts`、`chemistryEngine.ts` | 實測有被執行 |

### ② 假設生成

| 檔案 | 主要函式 | 備註 |
|---|---|---|
| `reasoning/hypothesisGenerator.ts` | `createReasoningPlan` (:58) → `collectObservedEvidence` (:9)、`generateChemicalHypotheses` (:21) | IR 假設用 `bundle.irFindings` 的官能基家族名稱做關鍵字比對；NMR 假設用 `inferSignalEnvironments`；全是規則式，不使用預測光譜 |
| `scientificEngines/atomicChemicalEnvironment.ts` | `inferSignalEnvironments` (:68) | |
| `scientificEngines/evidenceLedger.ts` | `sourceSpectra`、`uniqueObservations` | 同一原始觀測只計一次 |
| `reasoning/types.ts` | 型別 | |

### ③ 局部結構

| 檔案 | 主要函式 | 備註 |
|---|---|---|
| `reasoning/localStructureInference.ts` | `inferLocalStructures` (:4) | 只產生通用原子／鍵原語（六碳環、C–O、C=O、CH₂–CH₃、三鍵…），元素限 C/N/O |
| `reasoning/sixStepAnalysis.ts` | `planningSearchHints` (:6) | |
| `scientificEngines/deNovoGraphSearch.ts` | `graphSearchHints` (:25) | 從約束萃取 aromatic／carbonyl／oxygen／nitrogen／observedSignals／coupledEthyl／neutralMass（取自 MS 質量約束）等提示 |

### ④ 圖搜尋（deNovoGraphSearch）

| 檔案 | 主要函式 | 備註 |
|---|---|---|
| `scientificEngines/deNovoGraphSearch.ts` | `searchMolecularGraphsAsync` (:120) → `iterateGraphSearch` (:37) | 傳入的分子式為 `plan.userFormula`（= `bundle.userSuppliedFormula`）。`executeSixStepAnalysis` 對外只開放 `timeMs`／`maxStates`，其餘寫死：`maxFrontier=4096`、`maxResults=48`、`beamWidth=64` |
| 同上 | `searchMolecularGraphs` (:117) | 同步版，**不在正式路徑**：只在 `DeterministicStructureGenerator` 沒收到 `searchResult` 時作為退路（900 ms／12000 狀態／24 筆），測試與相容入口使用 |
| 支援 | `chemistryEngine.ts`（`parseFormulaCounts`、`calculateDBE`、`parseStructureInput`、`formatFormula`）、`rdkitAdapter.ts`（`canonicalizeMolecule`） | |

終止原因（`SearchTermination`）：`OUTPUT_BUDGET`、`TIME_BUDGET`、`STATE_BUDGET`、`BEAM_PRUNED`、`GRAMMAR_EXHAUSTED`、`INSUFFICIENT_CONSTRAINTS`、`UNSUPPORTED_CHEMISTRY`、`INVALID_COMPOSITION`、`UNAVAILABLE`、`EXECUTION_ERROR`、`CANCELLED`。

### ⑤ 硬限制驗證（DeterministicStructureGenerator）

| 檔案 | 主要函式 | 備註 |
|---|---|---|
| `workbenchOrchestrator.ts` | `WorkbenchOrchestrator.runModeAPipeline` (:223) | 把 ④ 的 `searchResult` 與 ③ 的 `plan` 傳入 |
| `candidateGenerator.ts` | `CandidateGenerator.executeUnifiedPipelineFromBundle` (:361) | 唯一權威管線 |
| `scientificEngines/fragmentConstraintSolver.ts` | `FragmentConstraintSolver.solveConstraintSpace` (:26) | 會呼叫 `FragmentLibrary.selectCompatibleFragments`，但結果只寫進 `solverLog` 與 `requiredFragments`，沒有下游讀取；`plausibleFormulas` 恆為空陣列（見第 2 節發現 2） |
| `candidateGeneration/fragmentLibrary.ts` | `FragmentLibrary.selectCompatibleFragments` | 同上，**被呼叫但結果無用** |
| `scientificEngines/deterministicStructureGenerator.ts` | `DeterministicStructureGenerator.generateValidatedStructuresWithRejections` (:58) | 無使用者分子式且缺少可支持組成的約束時直接回傳空集合 |
| `scientificEngines/chemicalHardConstraintValidator.ts` | `ChemicalHardConstraintValidator.validateCandidateStructure` (:487) | 價數、目標分子式、總氫數 |
| `scientificEngines/molecularGraphValidator.ts` | `MolecularGraphValidator.validateSmilesGraph` (:55) | 連通性、環閉合、價數、DBE |
| `candidateGeneration/graphValidator.ts` | `ChemicalGraphValidator.validateCandidateSmiles` (:67) | |

### ⑥ 評分排名

| 檔案 | 主要函式 | 備註 |
|---|---|---|
| `scientificEngines/crossSpectrumValidator.ts` | `CrossSpectrumValidator.evaluateCrossSpectrum` (:51) | 逐候選呼叫下面兩個評分器 |
| `scientificEngines/evidenceLedger.ts` | `scoreScientificEvidence` (:51) | **決定名次的分數**：`totalScore` 為各模態相容度依可靠度加權平均；預測函式位置見第 5 節 |
| `scientificEngines/globalPeakAssignment.ts` | `globalPeakAssignment` (:5) | ¹H／¹³C 觀測峰與預測環境的全域一對一配對 |
| `candidateGeneration/spectrumConsistencyEvaluator.ts` | `SpectrumConsistencyEvaluator.evaluateCandidateModalities` (:40) → `evaluateIRConsistency`／`evaluate1HNMRConsistency`／`evaluate13CNMRConsistency`／`evaluateMSConsistency` | 舊評分器，仍每個候選執行一次；其模態細節大多被 ledger 結果覆寫，只剩 `spectrumConsistencyScore`、`matchedEvidenceIds` 等欄位流向 `CandidateResult`（見發現 3） |
| `candidateGenerator.ts` | `rankCandidates` (:54) | 硬限制複核 → 呼叫 `ConstraintValidatorAndRanker`（次要）→ `finalScore = round(ledger.totalScore)` → 排序：`finalScore` 降冪、`contradictingReasons.length` 升冪、`crossSpectrumScore` 降冪、`id`（字串序） |
| `candidateGeneration/constraintValidator.ts` | `ConstraintValidatorAndRanker.validateAndScoreAgainstStructuralConstraints` (:18) | 次要：只提供 `formulaScore`、`functionalGroupScore`、`validationReport`、`tieredConfidence`、`recommendedExperiments` 等顯示欄位，不影響名次 |
| `scientificEngines/crossSpectrumValidator.ts` | `CrossSpectrumValidator.buildValidationMatrix` (:167) | |
| `reasoningEngine.ts` | `ReasoningEngine.coordinateModeAReport` (:29) → `buildEvidenceChain`、`buildCrossModalNotes`、`detectCrossModalConflicts`、`buildUncertaintyNotes` | 只組報告，不影響名次。`ReasoningEngine` 同一檔案也含 Mode B（見第 4 節） |

### ⑦ ReasoningTrace

| 檔案 | 主要函式 | 備註 |
|---|---|---|
| `reasoning/reasoningTrace.ts` | `completeReasoningTrace` (:4) | 由 `runModeAPipeline` 呼叫；階段 6 的 module 欄位寫的是 `StructureRenderer2D + ReasoningPanel`（UI 元件，不是本路徑的運算） |
| `candidateGeneration/generationStatus.ts` | `generationStatus` (:6) | 產生 `generationStatus.code`／`userFormula`／`termination` |

## 2. 與預期不符、後續階段需要知道的發現

1. **import 閉包大於實際路徑。** `candidateGenerator.ts` import 了 `combinatorialAssembler.ts`，但只為了一個無人使用的匯出物件（`CandidateStructureGenerator.evaluateFormula`，:436）；`DeterministicStructureGenerator`、`ConstraintValidatorAndRanker`、`SpectrumConsistencyEvaluator` 對 `combinatorialAssembler`／`graphAssemblyEngine`／`formulaGenerator` 只有型別引用。這些檔案在實測中沒有任何函式被執行。
2. **`FragmentLibrary.selectCompatibleFragments` 仍在正式路徑上被呼叫，但結果沒有下游使用。** 它不影響候選生成或排名，只多出一行 `solverLog`。
3. **三套評分／驗證碼並存。** 名次只由 `evidenceLedger.scoreScientificEvidence` 決定；舊的 `SpectrumConsistencyEvaluator` 與 `ConstraintValidatorAndRanker` 仍逐候選執行（耗時），結果只流向顯示欄位。
4. **UI 的溶劑峰標記在 Mode A 無效。** `App.tsx` 的 `handleChangeNmrSolvent` 呼叫 `applyNmrSolventTagging`，把落在溶劑參考位移容差內的峰標成 `SOLVENT`，介面並寫「已排除於結構推論」；但 `prepareModeAEvidence` 第一步的 `observationSpectrum` 會把所有峰重設為 `COMPOUND`／`isSolventVerified=false`。實測（CDCl₃，峰 7.26、6.9、7.3）：UI 標記後 7.26 與 7.3 為 SOLVENT，經 `prepareModeAEvidence` 後三個峰全為 COMPOUND，`createReasoningPlan` 的觀測清單包含 7.26。結果：殘餘溶劑峰（以及落在容差內的真實峰）都會被當成分析物觀測。對基準評測的意義：峰表不應包含溶劑峰（見 `BENCHMARK_FORMAT.md`）。
5. **預測函式與 Mode B 共用。** Mode A 評分使用的 IR／¹H／¹³C／碎片預測函式（`irCandidateBands`、`NMRGraphPredictor`、`graphFragments`）同時是 Mode B 的預測來源（第 4、5 節）。「後續階段會替換預測函式」與「Mode B 不得修改」無法同時成立，需要先決定怎麼切開（例如在 Mode A 新增獨立預測函式、保留舊函式給 Mode B）。
6. **搜尋預算在實測中不是限制。** 兩次探針（乙基苯甲酸酯的四個 ¹H 峰）：無分子式時於 89 個狀態、有分子式時於 955 個狀態即以 `OUTPUT_BUDGET` 結束，遠低於 `maxStates=120000`；實際約束輸出量的是寫死的 `maxResults=48`（以及 `beamWidth=64`、`maxFrontier=4096`），而這些在 `executeSixStepAnalysis` 沒有對外參數。所以「用狀態數取代時間」對可重現性有幫助，但 top-k 的天花板來自這些常數。
7. **MS 質量已在第 ① 步產生分子式候選與質量約束。** `analyzeExperimentalMS` 在離子歸屬已知時呼叫 `MolecularFormulaCandidateEngine`（`formulaEngine.ts`，與 `candidateGeneration/formulaGenerator.ts` 是不同的兩個模組）。`graphSearchHints` 取 `molecularMassConstraint.exactMass ?? exactMass.exactMass ?? estimatedMolecularWeight` 作為 `neutralMass`（容差預設 1 Da），圖搜尋據此過濾候選。所以即使沒有使用者分子式，提供 MS 仍可能限制搜尋結果；各種 MS 輸入（未確認離子歸屬、低解析）下這個約束是否產生，本文件未逐一驗證，後續做組成推斷時需要先確認。
8. **孤兒測試碼與無人呼叫的方法。** `tests/legacy/*.ts` 不被 `vitest.config.ts` 的 `include`（`*.test.ts`）收錄，也沒有任何檔案 import 它們；`ReasoningEngine.runModeADeduction`、`WorkbenchOrchestrator.runFullWorkbenchPipeline`、`CandidateGenerator.runUnifiedCandidatePipeline`、`CandidateGenerator.rankCandidates` 的唯一呼叫者就是這些孤兒檔。`CandidateGenerator.generateRankedCandidates` 連孤兒檔也沒有呼叫，只被 `CandidateStructureGenerator` 物件綁定而該物件無人使用。`runFullWorkbenchPipeline` 內的 Mode A 不會傳入 `searchResult`，會退回同步搜尋。
9. **版本字串寫死。** `server.ts:53` 與 `:460` 的 `/api/health` 與啟動日誌把版本寫死為 `1.1.3`，不會隨 `package.json` 變動。

## 3. 存在但不在 Mode A 正式路徑的檔案

「實測」指 V8 動態追蹤中該檔案是否有任何函式被執行。

| 檔案 | 實測 | Mode B | UI | 測試 | 說明 |
|---|---|---|---|---|---|
| `candidateGeneration/combinatorialAssembler.ts` | 未執行 | 否 | 否 | 只有 `tests/legacy/scientificEngineTestSuite.ts`（孤兒） | 只被當作型別（`AssembledRawCandidate`）與一個無人使用的匯出引用；`CombinatorialCandidateAssembler` 類別沒有任何呼叫者 |
| `candidateGeneration/formulaGenerator.ts` | 未執行 | 否 | 否 | `tests/evidenceGuidedSearch.test.ts`、`tests/sixStepReasoning.test.ts` 以 `vi.spyOn` 斷言 `FormulaGenerator.enumeratePlausibleFormulas` **不會被呼叫** | 型別 `CandidateMolecularFormula` 仍被 `fragmentConstraintSolver.ts`、`graphAssemblyEngine.ts` 引用 |
| `candidateGeneration/graphAssemblyEngine.ts` | 未執行 | 否 | 否 | 否 | 型別 `AssembledCandidateGraph` 在正式路徑中使用；`GraphAssemblyEngine` 類別沒有呼叫者 |
| `candidateGeneration/fragmentLibrary.ts` | **執行**（見發現 2） | 否 | 否 | 否 | 屬「被呼叫但結果無用」，列在這裡便於後續清理 |
| `scientificEngines/index.ts` | 未執行 | 否 | 否 | `tests/legacy/scientificEngineTestSuite.ts` | 轉出桶檔，`chemicalFeatureEngine.ts` 對它有 import |
| `scientificEngines/nmrReferenceDatabase.ts` | 不在閉包 | 否 | 否 | `src/engines/__tests__/phase2NmrScientificUpgrade.test.ts` | 相容轉出檔 |
| `signalCharacterizationEngine.ts` | 未執行 | 否 | 經 `spectrumParser`（上傳／讀譜） | `tests/observationWorkflow.test.ts` | 解析階段使用，不在 `executeSixStepAnalysis` 內 |
| `scientificEngines/irImageTrace.ts` | 未執行 | 否 | 經 `spectrumParser`（圖片 IR 描線） | `tests/v11Engineering.test.ts` | 同上 |
| `scientificEngines/jcampAdapter.ts` | 未執行 | 否 | 經 `spectrumParser`（JCAMP 上傳） | `tests/inputPrecision.test.ts` | 同上 |
| `scientificEngines/whittakerBaseline.ts` | 未執行 | 否 | 經 `irSignalProcessing`（連續 IR 基線，數值光譜） | `tests/irProcessing.test.ts` | 峰表輸入不會觸發 |
| `models/theoreticalModelRegistry.ts` | 未執行 | 否 | `App.tsx`、`chemistryEngine.ts` 引用 | 否 | 模型登錄／顯示用 |
| `scientificEngines/msmsFragmentationEngine.ts`、`tofSimsScientificEngine.ts` | 未觸發（輸入無該模態） | 否 | 否 | `tests/massScience.test.ts`、`tests/observationWorkflow.test.ts` | 屬正式路徑的**條件式**分支，不是「不在路徑」 |
| `tests/legacy/*.ts`、`ReasoningEngine.runModeADeduction` 等相容方法 | — | — | — | 見發現 8 | 孤兒 |

UI 專用檔案（不在 worker 閉包）：`App.tsx`、`main.tsx`、`components/IRCalibrationTools.tsx`、`MassExperimentConditions.tsx`、`PeakObservationTable.tsx`、`ReasoningPanel.tsx`、`ReportExportModal.tsx`、`SpectrumViewer.tsx`、`StructureRenderer2D.tsx`、`StructureSpectrumValidationPage.tsx`。

## 4. Mode B 使用的檔案（**後續階段不得修改**）

入口：`src/App.tsx:542` → `WorkbenchOrchestrator.runModeBPrediction`（`workbenchOrchestrator.ts:275`）→ `ChemistryEngine.parseStructureInput`、`PredictionAndValidationFramework.runBidirectionalValidation`（`predictionAndValidationFramework.ts:78`）、`ReasoningEngine.runModeBPrediction`（`reasoningEngine.ts:139`）。

**Mode B 專用**（動態追蹤只出現在 Mode B）：

- `scientificEngines/predictionAndValidationFramework.ts`
- `scientificEngines/fragmentSpectrumPrediction.ts`
- `components/StructureSpectrumValidationPage.tsx`（以及它使用的 `SpectrumViewer.tsx`、`StructureRenderer2D.tsx`）、`App.tsx` 的 Mode B 區塊

**與 Mode A 共用**（動態追蹤兩邊都執行；這些檔案內 Mode B 會呼叫的函式視為不得修改，檔內其餘函式尚未逐一確認）：

| 檔案 | Mode B 呼叫的函式 |
|---|---|
| `workbenchOrchestrator.ts` | `runModeBPrediction` |
| `reasoningEngine.ts` | `runModeBPrediction`、`buildOverlayValidationSummary` |
| `irEngine.ts` | `predictEmpiricalIR`、`predictIRFromStructure` |
| `nmrEngine.ts` | `predictEmpirical1HNMR`、`predictEmpirical13CNMR`、`predict1HNMRFromStructure`、`predict13CNMRFromStructure` |
| `msEngine.ts` | `predictEmpiricalMS`、`predictMSFromStructure`、`analyzeExperimentalMS` |
| `scientificEngines/irBandKnowledge.ts` | `irCandidateBands`、`irBandMatch`、`inferIRBands` |
| `scientificEngines/nmrAtomicEnvironmentModel.ts` | `NMRGraphPredictor.predict1HFromStructureGraph`、`predict13CFromStructureGraph`、`simulateFirstOrderMultiplet`、`detectRings`、`computeAtomSymmetryClasses`、`computeDistanceMatrix`、`deriveMultipletNotation`、`classifyRingSubstituent` |
| `scientificEngines/atomicChemicalEnvironment.ts` | `describeAtomicEnvironments`、`enrichAtomicPrediction` |
| `scientificEngines/graphFragmentation.ts`、`graphChemicalFeatures.ts`、`isotopeEnvelope.ts`、`ionMass.ts` | `graphFragments`、`graphChemicalFeatures`、`isotopeEnvelope`、`ionMz`、`neutralMassFromIon` |
| `scientificEngines/molecularGraphValidator.ts` | `validateSmilesGraph` |
| `scientificEngines/globalPeakAssignment.ts`、`irSignalProcessing.ts`（`irRangeCovered`） | `globalPeakAssignment`、`irRangeCovered` |
| `chemistryEngine.ts`、`dataValidator.ts`、`spectrumParser.ts`（`synthesizeCurveFromPeaks`、`defaultXBounds`）、`rdkitAdapter.ts` | `parseStructureInput`、`calculateMasses` 等基礎函式 |
| `types/spectrum.ts` | 型別 |

與 Mode B 相關的測試：`tests/modeBAndIndependence.test.ts`、`src/engines/__tests__/phase3IrNmrOhAntiBias.test.ts`；呼叫預測器的測試還有 `src/engines/__tests__/phase2NmrScientificUpgrade.test.ts`、`tests/irNmrRepairFlow.test.ts`。

## 5. 候選分子 → 預測光譜的函式位置（後續階段預計替換）

下表是**共用風險最高**的清單：第 4 欄是 Mode A 正式路徑的呼叫處，第 5 欄是 Mode B 的呼叫處。同一個函式出現在兩欄代表替換它會同時改變 Mode B（見發現 5）。

| 模態 | 預測函式（位置） | 外層包裝 | Mode A 呼叫處 | Mode B 呼叫處 |
|---|---|---|---|---|
| IR | `irCandidateBands`（`irBandKnowledge.ts:79`）、`irBandMatch`（:65） | `IREngine.predictIRFromStructure`（`irEngine.ts:75`）、`predictEmpiricalIR` | `scoreScientificEvidence`（`evidenceLedger.ts:85` 取候選頻帶；`:84` 用 `predictIRFromStructure` 只做掃描範圍內的「未檢出強吸收」弱反證） | `PredictionAndValidationFramework`（:150、:464、:565）、`ReasoningEngine.runModeBPrediction` |
| ¹H NMR | `NMRGraphPredictor.predict1HFromStructureGraph`（`nmrAtomicEnvironmentModel.ts:1677`） | `NMREngine.predict1HNMRFromStructure`（`nmrEngine.ts:2043`）、`predictEmpirical1HNMR`（:2172） | `scoreScientificEvidence`（`evidenceLedger.ts:54`，決定名次）；舊評分器經 `NMRAnalysisEngine.evaluateCandidateNMRConsistency`（`nmrEngine.ts:2196`） | `PredictionAndValidationFramework`（:161、:487、:566）、`ReasoningEngine` |
| ¹³C NMR | `NMRGraphPredictor.predict13CFromStructureGraph`（`nmrAtomicEnvironmentModel.ts:2922`） | `NMREngine.predict13CNMRFromStructure`（`nmrEngine.ts:2108`）、`predictEmpirical13CNMR`（:2179） | `scoreScientificEvidence`（`evidenceLedger.ts:55`）；`spectrumConsistencyEvaluator.ts:868`；舊評分器同上 | 同 ¹H |
| MS（EI 分子離子、同位素、碎片） | `MSEngine.predictMSFromStructure`（`msEngine.ts:399`）→ `isotopeEnvelope`（`isotopeEnvelope.ts:12`）、`ionMz`（`ionMass.ts:4`）、`graphFragments` | `predictEmpiricalMS`（:449） | Mode A 排名**不**呼叫 `predictMSFromStructure`：`scoreScientificEvidence` 的 MS 分支直接用 `ChemistryEngine.calculateMasses` 與 `ionMz` 比對實測分子離子 | `PredictionAndValidationFramework`（:183、:508、:568）、`ReasoningEngine` |
| MS/MS、ToF-SIMS（碎片） | `graphFragments`（`graphFragmentation.ts:6`） | `predictFragmentSpectrum`（`fragmentSpectrumPrediction.ts:5`） | `scoreScientificEvidence`（`evidenceLedger.ts:88`、`:90`） | `predictFragmentSpectrum` 經 `PredictionAndValidationFramework`（:199、:200、:525、:542）與 `ReasoningEngine`（:153、:154） |
| 官能基／環境特徵（上述預測的輸入） | `graphChemicalFeatures`（`graphChemicalFeatures.ts:2`） | — | `scoreScientificEvidence`（:52）、`irCandidateBands`、`graphFragments` | 同左（經 `irCandidateBands`、`graphFragments`） |

## 6. 重新產生這份追蹤

靜態閉包與動態追蹤都不是倉庫內的工具（避免增加維護面）。要重現時：

- 靜態：對 `src/**` 解析 import 圖，從 `src/workers/modeA.worker.ts` 求閉包。
- 動態：以 `node:inspector` 的 `Profiler.startPreciseCoverage({callCount:true})`，在 Node（`tsx`）中先 `await initializeRDKit()`，再執行 `executeSixStepAnalysis` 與 `WorkbenchOrchestrator.runModeBPrediction`，每次執行後 `takePreciseCoverage` 並收集 `functionName` 非空且 `ranges[0].count>0` 的函式。
