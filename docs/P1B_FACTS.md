# P1b（v1.1.7）前置調查：事實報告

調查日期：2026-10-24。基準：claude-mode `8861269`（1.1.7-hotfix.2，已部署）。
範圍：唯讀。只新增本文件；沒有改任何產品程式、測試、設定或 package.json；沒有讀取 `benchmark\`；沒有安裝任何東西。
寫法：只寫事實；每項附「檔案:行號」或指令輸出。不確定寫「未確認」。沒有設計方案或建議（第 10 節只列優缺點，不下結論）。
路徑都相對於 `SpecReader_V1\`。

---

## 1. 組成層輸出（`src/engines/composition/`）

### 1.1 檔案（共 1281 行）
`types.ts`(80)、`inferComposition.ts`(222)、`compositionConfig.ts`(229)、`compositionScoring.ts`(133)、`formulaEnumerator.ts`(77)、`functionalGroupBounds.ts`(72)、`goldenRules.ts`(69)、`msComposition.ts`(118)、`nmrComposition.ts`(81)、`nitrogenEvidence.ts`(70)、`structureGenerator.ts`(130)。

### 1.2 對外函式
- `inferComposition(input:CompositionInput):CompositionInferenceResult` — `inferComposition.ts:48`。
- `CompositionInput`（`inferComposition.ts:14-23`）：`bundle:IntegratedAnalysisBundle`、`observations:ObservedEvidence[]`、`userFormula:string|null`、`nitrogen?:NitrogenEvidence`。
- `enumerateFormulas(spec:EnumerationSpec):EnumerationOutcome` — `formulaEnumerator.ts:30`。
- `generateForCompositions(args)` — `structureGenerator.ts:83`（見第 2 節）。
- `assessNitrogenEvidence(args)` — `nitrogenEvidence.ts:23`。
- 其餘：`hardViolation`、`commonRangeViolations`、`parseCounts`、`formatHill`、`monoisotopicMass`、`dbeOf`、`seniorOk`（`goldenRules.ts:12-57`）。

### 1.3 假設物件 `CompositionHypothesis`（`types.ts:32-56`）
`id`、`formula`、`counts:ElementCounts`、`dbe`、`monoisotopicMass`、`massBasis:'USER_FORMULA'|'HRMS'|'LOW_RES_MS'|'NONE'`、`ionHypothesisId`、`massErrorDa`、`massErrorPpm`、`relativeConfidence`（softmax，未校準，`calibrated:false`）、`score`、`support/contradiction/unknown:CompositionReason[]`、`generatorSupported`、`unsupportedElements`、`searched`、`sizeConfirmed`、`symmetryMultiple:number|null`。
`CompositionReason`（`types.ts:10-16`）：`text`、`observationIds`、`source:'MS'|'MS_ISOTOPE'|'13C_NMR'|'1H_NMR'|'IR'|'HYPOTHESIS'|'USER'|'RULE'`、`strength:'HARD'|'SOFT'`。
元素集合：`COMPOSITION_ELEMENTS = C H N O S P F Cl Br I Si`（`types.ts:3`）；`GENERATOR_ELEMENTS = C H N O F Cl Br`（`types.ts:8`，註解「P1b replaces the generator」）。

### 1.4 整體結果 `CompositionInferenceResult`（`types.ts:66-80`）
`status:'USER_FORMULA'|'INFERRED'|'INSUFFICIENT_DATA'|'INVALID_USER_FORMULA'`、`hypotheses`、`ionHypotheses`、`elementsConsidered`、`elementsExcluded`、`elementClues`（`ElementClue[]`，`types.ts:58-65`）、`nitrogenEvidence:NitrogenEvidence`、`bounds`（碳範圍、氫倍數、雜原子下限、DBE 下限、`hardBoundsRelaxed`）、`enumeration`（節點數、通過硬篩數、回傳數、是否被節點上限截斷、被保留上限丟掉的數量）、`limitations:string[]`、`elapsedMs`。
`NitrogenEvidence`（`nitrogenEvidence.ts:13-18`）：`mode:'EVIDENCE'|'EVEN_ION_ONLY'|'NONE'`、`allowed`、`reasons:CompositionReason[]`、`note`。

### 1.5 呼叫者與結果去向
- 唯一的正式呼叫：`src/engines/reasoning/sixStepAnalysis.ts:19`，結果寫入 `plan.composition`。
- `plan.composition` 之後：
  - `generateForCompositions({composition:plan.composition…})`（`sixStepAnalysis.ts:24`）。
  - `runModeAPipeline` 回傳 `compositionInference:plan.composition`（`workbenchOrchestrator.ts:263`）。
- `symmetryMultiple` 只被 `structureGenerator.ts:50`（`prepareSymmetry`）讀取。
- 測試也直接呼叫：`tests/composition.test.ts`、`tests/hotfix117Carbon.test.ts`、`tests/v116Nitrogen.test.ts`。
- 除 `sixStepAnalysis.ts` 外，`src/` 內沒有其他地方呼叫 `inferComposition`（grep 結果）。

---

## 2. 候選生成流程

### 2.1 呼叫鏈（UI 路徑）
1. `src/workers/modeA.worker.ts:11` → `executeSixStepAnalysis`（`sixStepAnalysis.ts:13`）。
2. `prepareModeAEvidence` → `createReasoningPlan` → `inferComposition`（`sixStepAnalysis.ts:16-19`）。
3. `planningSearchHints` + `graphSearchHints`（`sixStepAnalysis.ts:21`；`deNovoGraphSearch.ts:27`）；N 證據為 `NONE` 時把 `nitrogen:false, nitrogenForbidden:true` 放進 hints（`sixStepAnalysis.ts:11`）。
4. `generateForCompositions`（`sixStepAnalysis.ts:24`；`structureGenerator.ts:83`）→ `deNovoStructureGenerator.generateStructures`（`structureGenerator.ts:15`）→ `searchMolecularGraphsAsync`（`deNovoGraphSearch.ts:122`）。
5. `WorkbenchOrchestrator.runModeAPipeline(..., {searchResult})`（`sixStepAnalysis.ts:27`；`workbenchOrchestrator.ts:228`）→ `CandidateGenerator.executeUnifiedPipelineFromBundle`（`candidateGenerator.ts:361`）→ `DeterministicStructureGenerator.generateValidatedStructuresWithRejections`（`deterministicStructureGenerator.ts:65`）→ `CrossSpectrumValidator.evaluateCrossSpectrum` → `rankCandidates`（`candidateGenerator.ts:54`）→ `buildValidationMatrix`。
- 傳給下一步的旗標：`compositionDriven:plan.compositionSearch?.mode==='COMPOSITION_HYPOTHESES'`、`nitrogenEvidence`（`workbenchOrchestrator.ts:252`）。

### 2.2 生成器介面
- `StructureGenerator{generateStructures(request):Promise<DeNovoSearchResult>}` — `structureGenerator.ts:13`，註解：「P1a: deNovoGraphSearch. P1b swaps in the exhaustive enumerator behind the same interface.」
- `StructureGenerationRequest{formula:string|undefined; hints:GraphSearchHints; budget}` — `structureGenerator.ts:11`。
- `StructureGenerationBudget{timeMs,maxStates,maxResults,maxFrontier,beamWidth,shouldCancel?,onProgress?}` — `structureGenerator.ts:7-10`。
- `generateForCompositions` 可注入 `generator`（`structureGenerator.ts:83` 的 `args.generator`；測試用，`tests/composition.test.ts`、`tests/v116Nitrogen.test.ts` 使用 `StructureGenerator` 型別）。

### 2.3 搜尋行為
- 三種模式：使用者分子式（一次執行）、組成假設（取前 `topFormulasToSearch` 個 `generatorSupported` 的分子式，各自執行）、無分子式（`structureGenerator.ts:92-101`）。
- 預算分配：總狀態與總時間在各分子式間平均分配，未用完的順延（`structureGenerator.ts:105-112`）。
- 圖搜尋語法：非窮舉。檔內註解：「This grammar is a non-exhaustive constitutional search, not a general enumerator.」（`deNovoGraphSearch.ts:36`）。支援原子：`valence={C:4,N:3,O:2,F:1,Cl:1,Br:1}`（`deNovoGraphSearch.ts:14`）。
- 搜尋是 generator 函式 + `setTimeout(0)` 讓出，取消靠 `shouldCancel`（`deNovoGraphSearch.ts:79,112,122-126`）。

### 2.4 「48 個候選上限」所有出現位置
| 位置 | 內容 |
|---|---|
| `src/engines/reasoning/sixStepAnalysis.ts:24` | 無分子式與使用者分子式路徑的預算 `maxResults:48`（另有 `maxFrontier:4096, beamWidth:64`，`timeMs` 預設 12000，`maxStates` 預設 120000） |
| `src/engines/composition/compositionConfig.ts:11` | `maxResultsPerFormula: 48`（組成假設路徑：每個分子式 48） |
| `src/engines/composition/compositionConfig.ts:9` | `topFormulasToSearch: 3`（所以組成假設路徑合計上限 3×48=144，註解 :10 也這樣寫） |
| `src/engines/composition/structureGenerator.ts:110` | 組成假設路徑把 `maxResults` 覆寫成 `CFG.maxResultsPerFormula` |
| `src/engines/scientificEngines/deNovoGraphSearch.ts:50` | 圖搜尋自己的預設 `maxResults=24`（未指定時） |
| `src/engines/scientificEngines/deNovoGraphSearch.ts:83` | 達到 `maxResults` 就以 `OUTPUT_BUDGET` 結束 |
| `src/engines/candidateGeneration/generationStatus.ts:9` | 使用者可見的限制文字：「正式Worker採12秒／120000狀態、4096前沿、48輸出」（同一行） |
- `src/engines/formulaEngine.ts:44` 另有 `.slice(0,24)`（舊的分子式候選，與結構候選無關）。

### 2.5 候選的資料結構
- 搜尋輸出：`DeNovoSearchResult`（`deNovoGraphSearch.ts:9`）：`smiles:string[]`（RDKit canonical SMILES，`:83` 的 `r.smiles.push(m.canonical)`）、`status`、`visited`、`note`、`termination`、`complete`、`partialHypotheses`、`rejectedByComposition`、`error?`、`derivations?:Record<smiles,AssemblyDerivation>`、`elapsedMs?`、`frontierPeak?`、`formulaSources?:Record<smiles,string[]>`。
- 內部圖（不輸出）：`Graph={atoms:string[];edges:{a,b,order}[];rings;aromaticRings;localIds?;operations?;observationIds?;placements?}`（`deNovoGraphSearch.ts:13`）。轉成 V2000 mol block 後交給 RDKit 規範化（`molBlock`，`:15-18`；`canonicalizeMolecule`，`:83`）。
- 所以輸出到下游的是 **SMILES 字串**加上 `derivations`；圖物件本身不離開搜尋函式。
- `AssemblyDerivation{localStructureIds,operations,observationIds}` — `src/engines/reasoning/types.ts`。
- 進入驗證後轉成 `AssembledCandidateGraph`（`graphAssemblyEngine.ts:6-19`）：`id('de-novo-N')、name、iupacName、molecularFormula、smiles、unsaturationIndex、nominalMass、exactMass、assembledFragments、structuralClass、keyStructuralFeatures、assemblyNotes`（建立處 `deterministicStructureGenerator.ts:98-100`）。

---

## 3. 下游驗證與評分

### 3.1 驗證閘門順序（`deterministicStructureGenerator.ts`）
1. 使用者分子式驗證無效／不支援 → 回空（`:73-80`）。
2. 沒有使用者分子式、非 `compositionDriven`、也沒有足夠實測約束 → 回空（`:89`）。
3. 若沒有 `searchResult`，退路為同步 `searchMolecularGraphs`（`:95`，N 被擋時加 `nitrogenForbidden`）。
4. 以 RDKit canonical／簽章去重（`getCanonicalKey` 在 `:113-122`，去重迴圈 `:125-132`）。
5. 逐候選：
   - `ChemicalHardConstraintValidator.validateCandidateStructure`（`:169`；類別在 `chemicalHardConstraintValidator.ts:138`）。
   - `MolecularGraphValidator.validateSmilesGraph`（`:176`；`molecularGraphValidator.ts:46`）。
   - `ChemicalGraphValidator.validateCandidateSmiles`（`:180`）。
   - 化學合理性：`plausibilityViolations(candidate.smiles, plausibility)`（`:269`；規則 `PEROXIDE|N_O_N|N_DI_OH|N_O_LINK|CUMULATED_N|GEM_DIOL|ENOL|KETENE|AMINAL`，`structurePlausibility.ts:22`）。
   - 通過者進 `validatedGraphs`（`:312-321`，`hardConstraintPassed:true`），未通過者進 `rejectedCandidates`（`:285`）並記錄原因。
- Golden Rules（`composition/goldenRules.ts`）：只被組成層使用（`compositionScoring.ts:4`、`formulaEnumerator.ts:2`、`inferComposition.ts:8`、`structureGenerator.ts:5` 只用 `parseCounts`）。候選結構的驗證路徑（上面第 5 點）沒有 import `goldenRules`（grep：`src/` 中只有這四處 import）。

### 3.2 評分
- `CrossSpectrumValidator.evaluateCrossSpectrum(validatedGraphs:ValidatedCandidateGraph[], bundle)` — `crossSpectrumValidator.ts:51`；對每個候選呼叫 `scoreScientificEvidence(validatedGraph.candidate.smiles, bundle)`（`:97`）。
- `scoreScientificEvidence(smiles:string, bundle:IntegratedAnalysisBundle):CandidateScoreLedger` — `evidenceLedger.ts:51`。輸入只有 **SMILES 字串 + bundle**；內部用 `ChemistryEngine.parseStructureInput(smiles)` 與 `graphChemicalFeatures(smiles)`，再用 `NMRGraphPredictor.predict1HFromStructureGraph / predict13CFromStructureGraph` 預測。
- `ScientificEvidence`（`evidenceLedger.ts:13-19`）：`id、sourceModality、observationIds、originalObservedData{position,intensity,relativeIntegral,multiplicity,jValues,formula}、processingMethod、processingSettings、proposedInterpretation、supportedFeature、alternativeInterpretations、uncertainty、dataCoverage、dependency、correlationGroup`。
- 輸出 `CandidateScoreLedger`（`evidenceLedger.ts:21`）：`entries:ScoreLedgerEntry[]、modalityScores、modalityWeights、totalScore、scoreMeaning:'UNCALIBRATED_COMPATIBILITY'、formulaHardCompatible、limitations`。
- 排序：`rankCandidates(crossSpectrumEvaluations, bundle)`（`candidateGenerator.ts:54`，在 `:388` 呼叫）。`rankCandidates` 本身沒有找到候選數量截斷（`candidateGenerator.ts` 唯一的 `slice(0` 在 `:318`，是證據池，不是候選）。
- 候選要被評分的介面條件：在 `validatedGraphs` 裡且 `candidate.smiles` 是 RDKit 可解析的 SMILES；其他欄位由 `parseStructureInput` 從 SMILES 重算（`deterministicStructureGenerator.ts:99` 用 `ChemistryEngine.parseStructureInput`）。

### 3.3 `globalPeakAssignment` 容量
- `src/engines/scientificEngines/globalPeakAssignment.ts:8`：`weights.slice(0,128).map(row=>row.slice(0,128))`；註解（`:6-7`）說明是保護互動式瀏覽器，超出的觀測保留為未配對並在帳本回報此上限。演算法為 Hungarian O(n³)（`:1-4`）。
- 呼叫者：`evidenceLedger.ts:68,81,83`（1H 與 13C 矩陣）、`predictionAndValidationFramework.ts:321`。

---

## 4. 瀏覽器執行架構

### 4.1 引擎在 Web Worker 執行
- Worker 檔：`src/workers/modeA.worker.ts`（14 行）。
- 啟動：`src/engines/analysisSession.ts:14` — `new Worker(new URL('../workers/modeA.worker.ts',import.meta.url),{type:'module'})`；每次分析建立新 Worker，結束時 `worker.terminate()`（`:18`）。
- 輸入型別 `AnalysisInput={spectra:Partial<Record<ExtendedSpectrumModality,ExperimentalSpectrumData>>; extraInput:ExtraChemicalEvidenceInput}`（`analysisSession.ts:5`）。
- 訊息協定（Worker → 主執行緒）：`{type:'progress',progress:AnalysisProgress}`、`{type:'result',result:{...ModeAResult,runtime:{rdkitAvailable}}}`、`{error:string}`（`modeA.worker.ts:11-13`）。
- 訊息協定（主執行緒 → Worker）：`AnalysisInput`，或 `{type:'cancel'}`（`modeA.worker.ts:6-7`）；執行中收到第二個輸入會被忽略（`running` 旗標，`:7`）。
- 進度：`executeSixStepAnalysis` 的 `onProgress` 回報步驟 1–6（`sixStepAnalysis.ts:15-28`）；搜尋中的細粒度進度 `GraphSearchProgress{visited,candidateCount,elapsedMs,frontier}`（`deNovoGraphSearch.ts:11`）。
- 取消：主執行緒 `AbortSignal` → `worker.postMessage({type:'cancel'})`，並設 20 秒保險逾時，逾時就終止 Worker（`analysisSession.ts:17`）；Worker 內 `cancelled` 旗標由 `shouldCancel` 輪詢（`modeA.worker.ts:5,11`；`deNovoGraphSearch.ts:79,112`）。整體另有 120 秒保護逾時（`analysisSession.ts:16`）。UI 按鈕在 `App.tsx:2774`。
- 取消需要引擎讓出事件迴圈：搜尋以 `await setTimeout(0)` 讓出（`deNovoGraphSearch.ts:124`）。沒有讓出的長同步計算會收不到取消訊息（由程式碼推得；未實測）。
- 專案內唯一的 `new Worker`：`analysisSession.ts:14`（grep `src scripts`）。沒有 `importScripts`、沒有直接的 `WebAssembly.` 呼叫。

### 4.2 打包
- 打包：Vite `^8.3.0`（`package.json`）；`vite.config.ts` 只有 `react()`、`tailwindcss()` 兩個外掛、`build.target:'es2022'`，沒有 `worker`、`wasm` 相關設定。
- 建置：`vite build && esbuild server.ts --bundle --platform=node --format=esm --packages=external --outfile=dist/server.mjs`（`package.json` build 腳本）；`prebuild` 先跑 `node scripts/prepare-assets.mjs`。
- 本機 `dist/assets/` 內容：`index-*.js`(1.38 MB)、`modeA.worker-*.js`(1.08 MB)、`RDKit_minimal-*.js`(62 KB)、`rolldown-runtime-*.js`、`index-*.css`。Worker 被打成獨立檔。

### 4.3 WASM／Worker 經驗與 RDKit 載入
- 套件：`@rdkit/rdkit ^2026.9.1`（`package.json`）；安裝版本 `2026.9.1`、`license: BSD-3-Clause`（`node_modules/@rdkit/rdkit/package.json`）。
- 是 WASM：`RDKit_minimal.wasm` 7,379,879 位元組。
- 資產複製：`scripts/prepare-assets.mjs:5-8` 把 `RDKit_minimal.js`、`RDKit_minimal.wasm` 從套件目錄複製到 `public/rdkit/`（`.gitignore:9` 忽略 `public/rdkit/`），再複製授權文字。
- 載入方式（`src/engines/scientificEngines/rdkitAdapter.ts:7-28`）：
  - 無 `window`（Worker 或 Node 測試）：`(await import('@rdkit/rdkit')).default` 工廠，`locateFile` 指向 `/rdkit/<file>`（`:11-13`）。
  - 有 `window`：動態插入 `<script src="/rdkit/RDKit_minimal.js">`，再 `window.initRDKitModule({locateFile})`（`:15-21`）。
  - 失敗時設 `failure` 文字並降級為內建解析器（`:23-25`）。
- Worker 內於 `modeA.worker.ts:10` 先 `await initializeRDKit()`。
- 本專案的 WASM 經驗只有 RDKit（Worker 內動態載入，WASM 檔放在 `public/rdkit/` 用 URL 取得）；沒有自己編譯的 WASM、沒有 Emscripten（見第 8 節）。

---

## 5. 部署與伺服器

- `server.ts`（465 行）：Express 4。靜態檔案：正式環境 `app.use(express.static(distPath))`，其餘路徑回 `index.html`（`server.ts:442-447`）；開發環境用 Vite middleware（`:436-441`）。
- `server.ts` 只 import `express`、`vite`、`path`、`dotenv`、`@google/genai`、`./src/appVersion`（`server.ts:1-6`），**沒有 import 任何 `src/engines`**。API 路由：`/api/health`(:54)、`/api/system-status`(:57)、`/api/pubchem/compound`(:72)、`/api/recognize-structure-image`(:151)、`/api/digitize-spectrum`(:240)、`/api/ai-reasoning`(:331)。化學推論引擎沒有在伺服器端執行（`/api/health` 回傳 `localScientificEngines:true`，`server.ts:54`）。
- 標頭：只對 `/api` 設 `Cache-Control:no-store` 與 `X-Content-Type-Options:nosniff`（`server.ts:38-39`）；`app.disable('x-powered-by')`。`server.ts` 與 `index.html` 內沒有 `Content-Security-Policy`、COOP/COEP、`<meta http-equiv>`（grep 無結果）。
- 實測公開站（2026-10-24，`curl`）：
  - `GET /rdkit/RDKit_minimal.wasm` 的 `Range 0-99` → `206`、`Content-Type: application/wasm`、`content-range: bytes 0-99/7379879`。
  - `HEAD /rdkit/RDKit_minimal.js` → `200`、`application/javascript; charset=UTF-8`、`Cache-Control: public, max-age=0`。
  - 前面有 Cloudflare（`Server: cloudflare`、`x-render-origin-server: Render`）。回應標頭中沒有 CSP。
- `render.yaml`：`runtime: node`、`plan: free`、`buildCommand: npm install -g pnpm@11.25.0 && pnpm install --frozen-lockfile && pnpm run build`、`startCommand: node dist/server.mjs`、`healthCheckPath: /api/health`、`NODE_VERSION 24.19.0`、`EXTERNAL_API_TIMEOUT_MS 20000`。
- Render 建置環境是否有 gcc／emcc 等工具：**未確認**（`render.yaml` 沒有安裝這些；沒有實測）。
- 免費方案限制是否影響「全部在瀏覽器計算」：引擎不在伺服器端執行（見上），伺服器只負責靜態檔案與上述 API。伺服器端對 `/api` 有每分鐘請求限制（`server.ts:35-49`）與 JSON 上限（預設 12 MB，`:51`），這些只作用於 `/api`，不作用於 `/rdkit/*` 與 `/assets/*`。Render 免費方案的記憶體／CPU／休眠限制的具體數字：**未確認**（沒有查官方文件）。

---

## 6. 1H 訊號資料型別

### 6.1 `SpectralPeak`（`src/types/spectrum.ts:345-471`）相關欄位
- 位置／強度：`x`、`y`、`relativeIntensity`、`normalizedIntensity`。
- 積分：`integration?:number|null`（`:398`，註解「strictly nullable」）、`integral?:number`（`:399`）。
- 峰型：`multiplicity?: 's'|'d'|'t'|'q'|'dd'|'dt'|'dq'|'td'|'tt'|'ddd'|"AA'BB'"|'m'|'br'|'br s'|'sept'|'sext'|'quint'|'multiplet'|'unresolved'|null`（`:400-420`）；`shape`（`sharp|broad|…|multiplet`，`:380-392`）；`isBroad`。
- 耦合：`jValues?:number[]`（空陣列＝未知，`:421`）、`jCouplingHz?:number`（`:355`）。
- 其他：`isExchangeable`、`observedRange`、`assignment`、`role/signalRole`、`classificationTag/userClassification`、`classificationSource`、`optionalObservation`、`autoNonAnalyteLabel`、`pixelX/pixelY/isCalibrated`。
- `SpectralPeak` 沒有「對稱」或「位移類別」欄位（grep `symmetry` 在 `types/spectrum.ts` 的命中都在 `ProtonEnvironment`／彙總型別，不在 `SpectralPeak`）。

### 6.2 `ProtonEnvironment`（`spectrum.ts:1011-…`）
`id`、`environmentLabel`、`chemicalEnvironmentClass?:string`（`:1024`）、`shiftPpm`、`expectedShiftRange`、`integration:number|null`、`expectedProtonCount?`、`rawIntegralValue?`、`userRelativeRatio?`、`normalizedIntegralRatio?`、`inferredProtonCount?`、`isExchangeable?`、`isOverlapOrUncertain?`、`multiplicity:string|null`、`jCouplingHz:number[]`、`couplings?`、`spinCouplingAnalysis?`、`symmetryNote:string`（`:1056`）、`symmetry?:string`（`:1057`）。

### 6.3 `ObservedEvidence`（`src/engines/reasoning/types.ts:3-13`）
`id`、`modality`、`signalId`、`sourceId`、`value`、`unit`、`relativeIntensity`、`relativeIntegral:number|null`、`multiplicity:string|null`、`jHz:number[]`、`shape:'BROAD'|'NARROW'|'UNKNOWN'`、`uncertainty`、`origin`、`userOverride`、`metadata`、`coverage:'PARTIAL'|'CONFIRMED_COMPLETE'`、`unknown`、`optional?`。

### 6.4 `H1Evidence`（組成層，`nmrComposition.ts:20-31`）
`ratio:number[]|null`、`sum`、`integralIds`、`complete`、`optionalExcluded`、`missingIntegrals`、`aromaticIds`、`aldehydeIds`。

### 6.5 讀取這些欄位的模組（grep `-l`）
- `.integration`：`App.tsx`、`components/{PeakObservationTable,SpectrumViewer}.tsx`、`engines/{chemicalFeatureEngine,nmrEngine,signalCharacterizationEngine,spectrumParser,workbenchOrchestrator}.ts`、`engines/candidateGeneration/spectrumConsistencyEvaluator.ts`、`engines/reasoning/hypothesisGenerator.ts`、`scientificEngines/{atomicChemicalEnvironment,chemicalHardConstraintValidator,deNovoGraphSearch,evidenceLedger,nmrFragmentEvidence,nmrScientificEngine,spectralEvidenceExtractor}.ts`。
- `.multiplicity`：上列大部分，另加 `composition/{functionalGroupBounds,inferComposition,nmrComposition}.ts`、`candidateGeneration/combinatorialAssembler.ts`、`reasoningEngine.ts`。
- `jValues`：`App.tsx`、`PeakObservationTable.tsx`、`chemicalFeatureEngine.ts`、`nmrEngine.ts`、`hypothesisGenerator.ts`、`atomicChemicalEnvironment.ts`、`evidenceLedger.ts`、`nmrAtomicEnvironmentModel.ts`、`spectrumParser.ts`、`workbenchOrchestrator.ts`。
- `relativeIntegral`：只有 `composition/nmrComposition.ts`、`reasoning/{hypothesisGenerator,types}.ts`、`scientificEngines/evidenceLedger.ts`。
- 圖搜尋讀 1H 資訊的位置：`graphSearchHints` 讀 `protonEnvironments`（`deNovoGraphSearch.ts:27-30`，偵測乙基 q/t 2:3、芳香 6.3–8.3 ppm 等）。

---

## 7. 目前測試與基準

### 7.1 與候選生成相關的測試檔（含 `searchMolecularGraphs|generateForCompositions|executeSixStepAnalysis|generateValidatedStructures|runModeAPipeline|executeUnifiedPipelineFromBundle|DeterministicStructureGenerator`）
`tests/composition.test.ts`、`tests/evidenceGuidedSearch.test.ts`、`tests/evidenceLedger.test.ts`、`tests/hotfix117FullFlow.test.ts`、`tests/hotfix117Paths.test.ts`、`tests/modeBAndIndependence.test.ts`、`tests/observationWorkflow.test.ts`、`tests/sixStepReasoning.test.ts`、`tests/v116Nitrogen.test.ts`、`tests/v11Engineering.test.ts`、`tests/legacy/scientificEngineTestSuite.ts`、`src/engines/__tests__/phase2NmrScientificUpgrade.test.ts`、`src/engines/__tests__/phase3IrNmrOhAntiBias.test.ts`。
另有 `tests/hotfix117{Carbon,IrPeaks,Nitrogen,Plausibility}.test.ts`、`tests/irPiecewise*.test.ts`（組成層／IR／校正相關）。

### 7.2 已存在的「已知答案」型測試
- `tests/evidenceGuidedSearch.test.ts:9-10`：分子式 `C2H6O`、`C3H7N`、`C15H16O2` 的圖搜尋（`maxResults:3`）。
- `tests/sixStepReasoning.test.ts:66-73`：`C15H16O2`（17 個重原子）組成有效；`:64` 取消測試。
- `tests/composition.test.ts:45,49,70,95`：推論結果含 `C9H10O2`；`:221-224` 使用者分子式 `C9H10O2`；`:363` 完整六步流程用 `molecularFormula:'C9H10O2'`；`:181-200` 分子式列舉與 `mf-finder`（devDependency）對照兩個質量窗（150.0681、182.0368）；`:183` CCl4 例。
- `tests/observationWorkflow.test.ts:46-47`：`C15H16O2` DBE=8。
- `src/engines/__tests__/phase2NmrScientificUpgrade.test.ts`、`phase3IrNmrOhAntiBias.test.ts`：以已知 SMILES（乙基苯甲酸酯、阿斯匹林、對甲酚、硝基苯等）比較 `scoreScientificEvidence` 的相對分數（例如 `phase3…:128,163,203,239,277,469`）。
- `tests/benchmarkHarness.test.ts`：評測工具本身的單元測試，用 `synthetic_` 案例（`:39`），不是真實圖譜。
- **同分異構體數量的已知答案測試（和 OEIS／MOLGEN 計數比較）：沒有找到**（grep `isomer`/OEIS 無對應測試；未逐檔確認所有測試）。

### 7.3 benchmark 格式（只讀 `docs/BENCHMARK_FORMAT.md`，161 行）
- benchmark 資料夾在倉庫外（預設 `..\benchmark`），原始光譜不進 Git。
- 結構：`benchmark\cases\<case_id>\case.json` + 光譜檔。
- `case.json` 欄位：`id`、`name`、`answerSmiles`、`formula`（只在 `withFormula` 條件使用）、`source{name,url,notes}`、`tags`、`spectra{IR,1H_NMR,13C_NMR,MS: {file,…}}`。`tags` 含 `synthetic` 的案例不計入準確率。
- 光譜類型：數值檔（csv/txt/jdx/xlsx 等）走 `SpectrumParser.parseUploadedFile`；`.json` 峰表（欄位 `x,y,integration,integral,multiplicity,j`）；圖片無法無頭評測（略過）。
- 評測走 `executeSixStepAnalysis`，與 UI 同一入口；指令 `pnpm benchmark`（`package.json`：`tsx scripts/benchmark/run-benchmark.mts`）。

---

## 8. 本機工具鏈（只檢查，沒有安裝）

環境：Windows 11 Home 10.0.26200。

| 工具 | 結果 |
|---|---|
| node | `C:\Program Files\nodejs\node.exe`，`v24.22.0` |
| corepack | `0.36.0`（專案用 `corepack pnpm@11.25.0`） |
| npm | `11.19.1` |
| pnpm（PATH 上的 `pnpm.ps1`） | 位於 `…\WinGet\Packages\OpenJS.NodeJS.22_…\node-v22.23.2-win-x64\pnpm.ps1`；未執行 `pnpm --version`（未確認其版本） |
| python | `Python 3.13.16`（`…\Python313\python.exe`）；另有 `py.exe` |
| git | `2.56.0.windows.2` |
| emcc / em++ | 未找到 |
| cargo / rustc / rustup / wasm-pack / wasm-bindgen | 未找到 |
| gcc / g++ / clang / cl（MSVC） | 未找到 |
| make / mingw32-make / cmake / ninja | 未找到 |
| java / javac / mvn / gradle | 未找到 |
| go | 未找到 |
| wasm-opt / wasm-ld | 未找到 |
| docker | 未找到 |
| choco / scoop | 未找到 |
| winget | 有（`…\WindowsApps\winget.exe`） |
| wsl.exe | 檔案存在（`C:\Windows\system32\wsl.exe`，`10.0.26100.9549`）；執行 `wsl.exe --status` 與 `-l -v` 的輸出為亂碼，可辨識的內容是提示需要執行 `wsl.exe --install` 與 `https://aka.ms/wslinstall`。判讀為「WSL 尚未安裝」，但輸出為亂碼，標為未完全確認 |
| Visual Studio / Build Tools | 未檢查（沒有執行 `vswhere`）：未確認 |

### Smart App Control
- 登錄檔 `HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy` 的 `VerifiedAndReputablePolicyState` 讀到 `1`。依微軟文件該值 1 表示「開啟（強制）」；此對應關係未另行查證。本調查沒有更動它。
- 在這台電腦上，可能被 Smart App Control 擋住的事實類別（只陳述事實，沒有逐一實測）：
  - 需要下載後執行的未簽章安裝程式（例如 Emscripten SDK 的 `emsdk` 取得的 `emcc`/LLVM/Binaryen 二進位檔、rustup-init、MSYS2／MinGW 安裝程式、CMake／Ninja 解壓後的未簽章執行檔）。
  - 從原始碼編譯出的本機 `.exe`（沒有簽章）。
  - 這些工具是否真的被擋，**未確認**（沒有嘗試）。

---

## 9. 公開窮舉器調查

（網路來源皆於 2026-10-24 查詢。查不到的寫「未確認」。）

### 9.1 Surge
- 來源：J. Cheminform. 2022，McKay、Yirik、Steinbeck（DOI 10.1186/s13321-022-00604-9，https://pmc.ncbi.nlm.nih.gov/articles/PMC9034616）。
- 倉庫：https://github.com/StructureGenerator/surge；主頁 https://structuregenerator.github.io ；作者頁 https://users.cecs.anu.edu.au/~bdm/surge/
- **授權**：倉庫 LICENSE 檔標題「Apache License Version 2.0, January 2004」（https://github.com/StructureGenerator/surge/blob/main/LICENSE ，已讀到開頭）；論文 Availability 寫「License: Apache 2.0」。
- 語言：C（論文：「portable subset of C」）。依賴：nauty（README 寫 2.9.3，需另外下載）；zlib 為選配（`-DZLIB`）。
- nauty 授權：Apache License 2.0（版本 2.6r3 及之後），見 https://users.cecs.anu.edu.au/~bdm/nauty/COPYRIGHT.txt（已讀到「Licensed under the Apache License, Version 2.0」）。檔案版權分屬 McKay（多數）、Piperno（traces.h/traces.c/dretodot.c）、Brinkmann、Magma 專案、Niskanen/Östergård、Royle。
- 約束支援（來源：論文與 README）：
  - 輸入為分子式，元素數必須符合；價數規則（價數 ≥ 度數）。
  - 環限制：論文有 `-p0:1`（最多一個五員環）、`-P`（平面）；README 2.0 版有 `-h#`（六員環數）、`-C#`（無弦六碳環）。
  - 禁止子結構：`-B#,…,#` 選預設的避免集合（無三鍵於 ≤7 員環、Bredt 規則變體、A=A=A、K33/K24、同原子在多個 3/4 員環）；論文提到「badlists」與外掛過濾（plugins）。
  - **必要子結構（required substructure）：論文與 README 都未提到**（未確認有無）。
  - 使用者自訂的任意禁止 SMARTS／子結構：未確認。
- 同分異構體數量驗證：論文 Table 1 與 MOLGEN 5.0 比較，數量相同。例：C10H16O5（Bassianolone）1,092,378,303 個（surge 69 s／MOLGEN 5146 s，MOLGEN 為外推）；C9H18N2O4（Lysopine）5,979,199,394 個。C7H14N2O7 給出 15,425,657,612 個但未報告比較。論文未與 OMG／PMG 比較。
- WASM／JS 移植：論文與 README 都沒提到；搜尋「surge WebAssembly/wasm/emscripten」沒有找到任何結果 → **未確認有無**。README 的建置方式是 gcc／Makefile／Docker。
- Worker 內執行證據：**沒有**（未找到）。

### 9.2 MAYGEN
- 來源：J. Cheminform. 2021，Yirik、Sorokina、Steinbeck（DOI 10.1186/s13321-021-00529-9，PMC8254276）。倉庫 https://github.com/MehmetAzizYirik/MAYGEN
- **授權**：LICENSE 檔首行「MIT License」、「Copyright (c) 2021 Mehmet Aziz Yirik」（https://github.com/MehmetAzizYirik/MAYGEN/blob/main/LICENSE ）。論文可見內容沒有寫程式授權（只有文章本身 CC BY 4.0）。
- 語言：Java（README：Java 1.8 或更新、Maven）。依賴 CDK（Chemistry Development Kit）；CDK 的授權：**未查證**。
- 約束支援（README 用法文字）：分子式 `-f`、模糊分子式 `-fuzzy`（例 `C[2-5]O2H[4-8]`）、自訂價數 `-setElements`、`-b` 邊界條件（README 沒有說明內容）、多執行緒 `-m`、輸出 SMILES／SDF。必要／禁止子結構、環限制：README 與論文可見內容**沒有**。
- 數量驗證：論文 Table 4：MAYGEN 與 MOLGEN 5.0 的結構數相同（「MAYGEN generated the same number of structures as Molgen 5.0」）。例：C10H15N 2,569,697；C7H9NO2 3,237,132；C5H6N2O3 4,513,867；C12H20O 6,100,808；C10H16S2 4,676,149；C10H16O 452,458（MOLGEN 約 3 s、MAYGEN 1.4 版 10 s、PMG 45 s）。單執行緒平均比 PMG 快 47 倍、比 MOLGEN 慢約 3 倍。PMG 對 S/P/N 計入較多價數所以結構數較多。（論文 Results 後段與 Availability 段未完整讀到。）
- WASM／JS：README 提到「A webservice is also developed … maygen.cheminfo.org」（實作方式未確認）；沒有看到 WASM／JS 移植 → **未確認**。
- 瀏覽器 Worker 內執行證據：**沒有**。（Java 在瀏覽器需要 JVM 移植，例如 CheerpJ：Leaning Technologies 的 WASM 版 JVM，宣稱支援 Java 8/11/17；其授權：搜尋結果只顯示免費層僅限「個人專案、評估」，商用條件**未確認**，不是開源。MAYGEN 實際在 CheerpJ 上能否跑：**未確認**。）

### 9.3 nauty／Traces
- 官方：https://users.cecs.anu.edu.au/~bdm/nauty/ ；授權 Apache 2.0（2.6r3 起，見 9.1）。Debian、Arch 的套件記錄也寫 Apache-2.0。
- 語言：C。用途：圖的自同構群與規範標記（Surge、OMG 使用 nauty；OMG 使用修改過的 nauty，見 9.4）。
- 本身不是結構生成器；`geng` 等隨附程式能生成圖（本調查未查其約束與驗證資料）：未確認。
- WASM／JS 移植：搜尋「nauty WebAssembly emscripten」沒有找到 → **未確認**。

### 9.4 OMG（Open Molecule Generator）
- 來源：J. Cheminform. 2012，Peironcely 等（https://pmc.ncbi.nlm.nih.gov/articles/PMC3558358）。
- **授權**：論文 Availability 寫「GNU AGPL v3」；專案名 openmg，主頁 `http://sourceforge.net/p/openmg`；語言「Java, C」。倉庫 LICENSE 原文：**未查到**（沒有取得 sourceforge 頁面）。
- 約束：支援「prescribed substructures」（輸出必須含給定的不重疊子結構）；禁止子結構：論文可見內容未提到。
- 數量驗證：Table 2（C、H、O）與 MOLGEN 完全相同，例：C3H4O3 152、C4H6O5 8,070、C6H12O6 267,258；含 N、P、S 時 OMG 產生比 MOLGEN 多（因價數處理不同；例：Creatinine MOLGEN 93,323 vs OMG 303,601）。
- WASM／JS：論文可見內容無；未確認。

### 9.5 其他
- MOLGEN：論文稱為閉源（MAYGEN 論文：「MOLGEN, closed source」）；授權原文未查：**未確認**。
- PMG：只在 MAYGEN 論文中作為比較對象；授權未查：**未確認**。

### 9.6 公開的同分異構體數量資料（供日後驗證用，只列事實）
- OEIS A000602（碳數 n 的烷烴 CnH2n+2 同分異構體數，不含立體異構）：n=0…19 為 1, 1, 1, 1, 2, 3, 5, 9, 18, 35, 75, 159, 355, 802, 1858, 4347, 10359, 24894, 60523, 148284（https://oeis.org/A000602 ，已讀到前 20 項）。
- 上列 Surge 與 MAYGEN 論文中的分子式計數（9.1、9.2）。
- 其他 OEIS 序列（含雜原子的分子式計數）：未查。

---

## 10. 選項比較（只列優缺點，不下結論）

### (a) 把現有開源窮舉器（如 Surge）編譯成 WASM
- 授權風險：Surge 與 nauty 都是 Apache 2.0（9.1）。Apache 2.0 要求保留授權與版權聲明，修改過的檔案需標示；散佈時要附 NOTICE（若有）。nauty 內部各檔版權人不同（9.1）。專案現有 `docs/licenses/` 與 `THIRD_PARTY_NOTICES.txt` 已有第三方授權彙整的做法（`scripts/prepare-assets.mjs:8-10`）。
- 本機工具鏈：**不具備**。emcc、clang、gcc、make、cmake 全部未找到（第 8 節）；Smart App Control 為開啟（讀到值 1）。取得 Emscripten 需要下載未簽章二進位檔，是否被擋未確認。
- 預期難度：C 程式碼小、依賴只有 nauty（需另外取得）；但 Surge 是命令列程式，需要把 main 包成函式或用 Emscripten 的 `callMain`，並處理輸出（記憶體內串流）。沒有找到現成 WASM 版（9.1）。取消與進度需另外設計（Worker 內長時間同步迴圈收不到取消訊息，見 4.1）。
- 已知風險：
  - 同分異構體數量爆炸（論文例：C9H18N2O4 約 60 億個），需要輸出上限與串流。
  - Surge 的必要子結構支援未確認；現有 `localStructures` 假設是「必要片段」性質（`structureGenerator.ts:49-55`），如何對應未確認。
  - 本專案生成器元素限制為 C/H/N/O/F/Cl/Br（`types.ts:8`）；Surge 輸入為分子式（支援哪些元素未查）：未確認。
  - 本專案目前沒有編譯或載入自製 WASM 的經驗（第 4.3 節）。

### (b) 以 TypeScript 自行實作窮舉器
- 授權風險：自行實作沒有第三方程式碼授權問題；若參考論文演算法（canonical augmentation／orderly generation），需自行確認演算法描述本身的使用條件（未查）。若直接移植 nauty 的規範標記，則適用 Apache 2.0。
- 本機工具鏈：**具備**（Node 24.22.0、`tsc`、vitest、Vite 都已在專案內）。不需要安裝新東西。
- 預期難度：高。需要自己做正確的規範性／去重（可借用 RDKit 的 canonical SMILES，專案已使用，`deNovoGraphSearch.ts:83`，但每個候選都過 RDKit 的成本在大規模下未測）；要追上 Surge／MAYGEN 的速度不容易（MAYGEN 約為 MOLGEN 的 1/3，Surge 論文報告更快；TypeScript 與 C 的差距未實測）。
- 已知風險：
  - 沒有現成已知答案測試可驗證正確性，但有公開計數（9.6）可對照；需要自己建立。
  - 瀏覽器 Worker 內效能與記憶體上限未實測；專案現有 Worker 在 120 秒保護逾時內運作（`analysisSession.ts:16`）。
  - 好處是可直接與現有 `StructureGenerator` 介面、`localStructures`、取消與進度機制整合（`structureGenerator.ts:13`、`deNovoGraphSearch.ts:79`）。

### (c) 移植 Java 版（如 MAYGEN）
- 授權風險：MAYGEN 為 MIT（9.2）；但它依賴 CDK，CDK 授權未查證：**未確認**。若透過 CheerpJ 在瀏覽器執行，CheerpJ 非開源，免費層條件有限（9.2）：商用與開源專案適用性未確認。
- 本機工具鏈：**不具備**。java／javac／mvn／gradle 全部未找到（第 8 節）。移植成 TypeScript 則不需要新工具鏈。
- 預期難度：MAYGEN 程式碼量與結構未查（未確認）。逐行移植成 TypeScript 的工作量未評估；用 CheerpJ 則需 JVM-in-WASM 載入 CDK 與 MAYGEN（體積與啟動時間未實測）。
- 已知風險：
  - 約束支援較少：README 只有分子式、模糊分子式、價數設定與 `-b`（未說明）（9.2）。
  - 驗證資料：論文證明與 MOLGEN 5.0 的數量一致（9.2）。
  - 專案目前沒有 Java 或 JVM 相關的程式。
