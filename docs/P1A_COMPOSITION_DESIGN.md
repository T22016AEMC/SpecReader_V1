# P1a 組成推斷層設計（Composition Inference）

狀態：**設計稿，待規劃者確認後實作**。基準：`claude-mode` @ `102e045`（v1.1.4，PR #1 未合併）。

本層只產生**多個競爭分子式假設**，每個附證據與未校準的相對信心。它不判斷結構，也不宣稱任何真實化合物的準確率。使用者填寫的分子式仍是硬限制，優先於一切推斷。

---

## 0. 現況研究（1-2 的紀錄）

### 0.1 MS 相關

| 項目 | 位置 | 現況 |
|---|---|---|
| 分子離子判定 | `msEngine.ts` `MSAnalysisEngine.analyzeExperimentalMS`（:64 起） | 先找標了 `isMolecularIonCandidate`／`isPrecursorIon` 的峰；否則從最高 m/z 往下取「沒有更強的 M−1、M−2 母峰」的第一個峰；最後退回最高 m/z。**只產生一個**分子離子候選，**沒有**不合理丟失（M−3…M−14、M−21…M−25）檢查 |
| 離子型式 | 同上 | `adductType` 非 Auto 時用它；否則 ESI− → `[M-H]-`、ESI+ → `[M+H]+`，其餘 → `[M]+•`。只有一種 |
| M+1／M+2 | 同上 | 在 parent+1.00335（±0.4）與 parent+1.997（±0.45）找峰；`M+2/M` 80–120% 視為 Br、25–42% 視為 Cl；碳數估計 `round((M+1/M)/1.1)`，**沒有誤差範圍** |
| 分子式枚舉 | `formulaEngine.ts` `MolecularFormulaCandidateEngine.generateCandidates`（:15） | **只在 `ionAssignmentConfirmed=true` 時執行**。元素 Br≤1(3)、Cl≤1(3)、Si≤1(3)、S≤2、P≤1、F≤3、I≤1、N≤4、O≤12、C≤35，質量 ≤600；H 由剩餘質量四捨五入求得（每組重原子只有一個 H 值）；篩選只有 DBE 為非負整數；節點上限 250000，截斷時在 notes 註記；回傳前 24 筆。**沒有** SENIOR、Golden Rules、元素比例 |
| 同位素包絡 | `scientificEngines/isotopeEnvelope.ts` `isotopeEnvelope` | NIST 豐度表（H C N O S Cl Br Si；F P I 單一同位素），名義質量分箱，可直接重用 |
| 離子質量 | `scientificEngines/ionMass.ts` | `ionMz`、`neutralMassFromIon`、`massError`、`confirmedNeutralMass`（需確認離子） |
| `massSpectrometryEngine.ts` | `MassSpectrometryEngine.analyze` | 物理模型／證據包裝，不做組成枚舉 |
| 質量進入搜尋 | `chemicalFeatureEngine.ts`、`deNovoGraphSearch.graphSearchHints` | MS 的 `exactMass` 與 `estimatedNominalMw` **只在離子歸屬已確認時**才有值，再成為搜尋的 `neutralMass`（容差預設 1 Da）。這回答了 P0 報告留下的疑問：未確認的 MS 不會限制搜尋 |

### 0.2 NMR

- **¹³C**：`bundle.c13Summary`（`Carbon13SummaryAnalysis`，`types/spectrum.ts:1230`）有 `observedSignalCount`、`uniqueCarbonCount`、`expectedTheoreticalEnvironments`、`environments`、`solventExcludedCount`。`c13ExperimentMode`（DEPT／APT）只在 `nmrEngine.ts:1606` 被讀取；逐峰 `deptType` 可由人工標峰帶入。
- **¹H**：`bundle.totalIntegratedProtons` 由 `ChemicalHardConstraintValidator.analyzeH1NMRIntegrationSemantics` 產生；既有程式在某些分支會把四捨五入後的整數加總當成「已正規化絕對氫數」。P1a **不使用**這個值當總氫數，改為自己列出整數倍 k（見 A.3）。
- 觀測 ID：`collectObservedEvidence`（`hypothesisGenerator.ts:9`）產生 `${modality}:${sourceId}:${x}`，P1a 沿用。

### 0.3 官能基推論

- IR：`bundle.irFindings: IRFunctionalGroupFinding[]`，有 `family`、`functionalGroup`、`matchLevel`（Strong／Moderate／Weak／Absent）、`status`（PRESENT／POSSIBLE／…）、`observedPeak`。
- 彙整約束：`bundle.constraints.functionalGroups: FunctionalGroupConstraint[]`，`status` 為 REQUIRED／PROBABLE／CANDIDATE／POSSIBLE／SUPPORTED／CONFLICTING／EXCLUDED／FORBIDDEN。
- 假設層：`generateChemicalHypotheses` 產生 `HypothesisKind`（CARBONYL、AROMATIC、NITRILE、HYDROXYL…），每個附 `observationIds` 與 `level`（SUPPORTED／POSSIBLE）。

### 0.4 使用者分子式

`extraInput.molecularFormula`（備援 `userSuppliedFormula`）→ `ChemicalHardConstraintValidator.parseAndValidateFormula` → `bundle.userSuppliedFormula` → `plan.userFormula` → `searchMolecularGraphsAsync(formula)`，並在 `DeterministicStructureGenerator`、`rankCandidates`、`scoreScientificEvidence` 作硬限制。

### 0.5 溶劑峰 bug 的實際狀況（比 P0 描述的更嚴重）

- **UI 目前沒有任何讓使用者明確標記峰分類的控制項。** `App.tsx:236` 的 `newPeakClass` 永遠是 `"COMPOUND"`（`setNewPeakClass` 從未被呼叫）；`PeakObservationTable` 沒有分類欄位；`handlePeakUpdate` 只轉送表格的 patch。
- 唯一寫入 SOLVENT 的 UI 路徑是選溶劑時**自動**執行的 `WorkbenchOrchestrator.applyNmrSolventTagging`（`workbenchOrchestrator.ts:397`），它把落在參考位移容差（¹H 0.06／¹³C 0.6 ppm）內的峰寫成 `userClassification:"SOLVENT"`、`isSolventVerified:true`——**與「使用者明確標記」用的是同一組欄位，無法區分**。
- 其他自動判定：`nmrEngine.ts:299`（分析內部複本設 `signalRole:"SOLVENT"`）、`nmrAtomicEnvironmentModel.ts` 的 `matchSolventOrReferenceSignal`（`role` SOLVENT／WATER／REFERENCE_TMS），都在引擎內部，不回寫使用者資料。
- `observationSpectrum`（`observationSemantics.ts:3`）把所有非預測峰重設為 ANALYTE／COMPOUND，所以上述標記在 Mode A 都無效。
- `SpectrumViewer` 圖例寫「SOLVENT 溶劑峰（不納入未知物推論）」，並以 `isSolventVerified` 著色——對自動標記而言，修正後這段文字會不正確（P1c 處理）。

### 0.6 版本號

`server.ts:53`（`/api/health`）與 `:460`（啟動日誌）寫死 `'1.1.3'`。正式建置以 esbuild 打包成 `dist/server.mjs`（`--packages=external`），由 repo 根目錄 `node dist/server.mjs` 啟動。`tests/api.test.ts` 以 `createApp({serveClient:false})` + supertest 測 `/api/health`。

### 0.7 不能改動的既有契約

`tests/sixStepReasoning.test.ts` 斷言進度步驟恰為 `[1,2,3,4,5,6]`、`trace.stages` 長度 6 且前後串接；`ReasoningPanel` 直接列出 `trace.stages`。因此**組成推斷不新增進度步驟、不新增 trace stage**，改掛在獨立欄位（見 E）。

---

## 1. 開源參考評估（1-3 的紀錄）

| 項目 | 授權 | 結論 | 理由 |
|---|---|---|---|
| cheminfo `mf-finder` 3.4.25 | MIT | **不直接引入；參考演算法自寫**（可選：只作 devDependency 測試對照，見問題 Q3） | 純 JS、Worker／Node 都能跑、2026-09 仍在維護；但相依 `mf-parser`、`mf-matcher`、`mf-utilities`、`atom-sorter`、`chemical-elements`（後者解壓 656 KB），前端主 chunk 已 1.34 MB。我們只需要 10 個元素的有界枚舉，自寫可完全控制截斷回報與確定性 |
| cheminfo `isotopic-distribution` 3.8.2 | MIT | **不引入** | 額外相依 `ml-spectra-processing`、`spectrum-generator`；既有 `isotopeEnvelope`（NIST 表）已足夠名義質量的 M+1／M+2 比較，且與 Mode B 一致 |
| Seven Golden Rules（Kind & Fiehn 2007, BMC Bioinformatics 8:105, doi:10.1186/1471-2105-8-105） | 論文 | **依原理自寫** | 採用規則 1（依質量的元素上限）、2（LEWIS／SENIOR）、3（同位素）、4（H/C）、5（雜原子／C 比例）、6（多元素機率檢查）；規則 7（TMS）不適用。數值上限在實作時逐值對照論文表格，並以常數表加註出處 |
| 氮規則 | 教科書規則 | 自寫 | 閉殼層 CHNOS＋鹵素：名義中性質量奇偶 = N 數奇偶；用來判斷分子離子假設，而不是在已知質量下重複篩選 |
| EI 不合理丟失（M−3…M−14、M−21…M−25） | McLafferty & Tureček 規則 | 自寫 | 只用於「否定某峰是分子離子」，見 A.1 |
| 同位素豐度 | NIST（既有表） | 沿用 `isotopeEnvelope.ts` | |

不新增任何執行期相依，因此 `THIRD_PARTY_NOTICES.md` 預計不需變動（若 Q3 選擇加入 devDependency，則會更新）。

---

## A. 各模態的組成證據

標記：**硬**＝違反即排除該假設；**軟**＝影響信心並列為矛盾。

### A.1 MS

**分子離子候選（多個）**
- 從高 m/z 往下，最多取 `K_ION = 3` 個候選峰：相對強度 ≥ 閾值（預設 1%）且不是其他候選峰的 M+1／M+2 同位素位置。
- 每個候選峰依游離方式列出離子型式：
  - 使用者已確認（`ionAssignmentConfirmed` 且 `adductType` 非 Auto）：**只用該型式**、只用使用者標示的峰（若標有 `isMolecularIonCandidate`）。
  - EI → `[M]+•`；ESI+／APCI → `[M+H]+`、`[M+Na]+`、`[M+NH4]+`；ESI− → `[M-H]-`；未知 → 依 `polarity`，正離子用 `[M]+•`、`[M+H]+`、`[M+Na]+`，負離子用 `[M-H]-`，極性也未知時兩者都列（Q5）。
- 每個（峰 × 離子型式）是一個**離子假設**，帶自己的權重：已確認＝1；未確認時最高可行峰較高，往下遞減。

**不合理丟失（軟→可升硬）**
- EI（或 `[M]+•`）下，若在候選峰 X 的 X−3…X−14 或 X−21…X−25 有**已標記**的峰，且強度 ≥ X 的 `r` 倍（預設 r = 0.1），該峰作為 `[M]+•` 的假設被**排除**（硬），並記錄理由與觀測 ID。
- 僅用「有標記的峰」作為正面證據；沒有標記不代表沒有峰（原則 5）。

**氮規則（軟）**
- 對 `[M]+•`：奇數名義 m/z → N 為奇數。對 `[M+H]+`／`[M-H]-`：奇偶反轉。
- 在有質量的枚舉中，價數／DBE 整數條件已隱含奇偶，所以氮規則主要用於**標示**離子假設與其他證據（例如 IR／NMR 建議含 N）是否一致。

**M+1 → 碳數範圍（軟）**
- `r1 = I(M+1)/I(M) × 100`。主要貢獻 13C：每個 C ≈ 1.0816%（NIST 0.0107/0.9893）；N 每個 0.365%，H 0.0115%，O 0.038%，S 0.79%，Si 5.08%。
- `C_max = (r1 + δ1) / 1.0816`，`C_min = max(1, (r1 − δ1 − Σ其他貢獻上限) / 1.0816)`，`δ1` 為量測誤差（預設：峰表 `max(0.5, 0.1·r1)` 個百分點；HRMS 數值光譜可更小）。
- 只在 M+1 **有標記**（或為連續數值光譜且涵蓋該位置）時使用；沒有標記 → 未知，不當作碳數為 0。

**M+2 → Cl／Br／S（軟，強證據時部分為硬）**
- 對 Cl 0–4、Br 0–4、S 0–4 的每個組合，以 `isotopeEnvelope` 計算 M+2、M+4（、M+6）理論比值，與觀測比較，得到相似度。Cl 單原子 ≈ 32.0%，Br 單原子 ≈ 97.3%，S 單原子 ≈ 4.5%（加 O、13C₂ 的小貢獻）。
- 只有在 M+2 **有標記**、或連續光譜涵蓋 M+2 時才能說「M+2 很小」。此時 `r2 < 10%` 可**硬排除** Cl≥1 或 Br≥1；其他情況都只當軟證據。

**高解析（硬）**
- `isHighResolution` 時以 ppm 容差枚舉（預設 5 ppm，可由 `massTolerancePpm` 設定）；低解析用 `massToleranceDa`（預設 0.5 Da）。
- 中性質量 = `neutralMassFromIon(m/z, adduct, z)`；電荷 `|z|` 只用使用者給的值，未給時視為 1。

### A.2 ¹³C

- **碳數下限（硬）**：獨立訊號數 `n13`（排除使用者明確標記的非分析物；自動溶劑候選照樣計入，並在理由中註記「可能含溶劑峰」）。
  - 例外：使用者把峰表標為 `CONFIRMED_COMPLETE` 以外時，`n13` 仍只能是下限，不能當作等於碳數。
  - 若有自動判定為溶劑的峰，**下限改為 `n13 − 自動溶劑候選數`**，避免溶劑峰把下限推高（Q6）。
- **碳數上限策略（軟）**：對稱會讓實際碳數大於訊號數。不設硬上限，以軟懲罰描述：`C ≤ n13` 不罰；`n13 < C ≤ 2·n13` 每多一個碳小幅懲罰（理由列為「需要對稱或重疊才能解釋」）；`C > 2·n13` 較大懲罰。有質量時以質量自然界定。
- **DEPT／APT（硬下限）**：有逐峰 `deptType` 時，`H_on_C ≥ Σ(CH=1, CH₂=2, CH₃=3)`；`c13ExperimentMode` 為 DEPT 但峰沒有 `deptType` 時不推論。
- **位移區間元素線索（軟）**：≥160 ppm → C=O 或 C=N，需 O 或 N ≥1、DBE ≥1；50–90 ppm → sp³ C–O／C–N（O 或 N ≥1）；115–125 ppm 的孤立峰配合 IR 腈 → N ≥1；110–160 ppm ≥ 4 個訊號 → 芳環可能（DBE ≥4）。全部只作軟證據。

### A.3 ¹H

- **最簡整數比**：對有積分的峰（排除使用者明確標記的非分析物），找最小單位 u 使每個積分 / u 在容差（預設 ±0.15）內接近整數，得最簡比 `a₁:a₂:…`，`S = Σaᵢ`。
- **總氫數假設**：`H = k·S + e`，k = 1, 2, 3, …（直到超過質量或碳數允許的上限 `2C+2+N+…`）；`e ∈ {0,1,2}` 代表可能缺失的可交換氫（寬峰 OH／NH 未積分或未標記），`e>0` 時輕微懲罰。每個 k 都是**明確列出的整數倍數假設**（原則 5）。
- 沒有積分 → 不產生任何 H 證據。積分只覆蓋部分峰（`PARTIAL_MARKERS`）→ 只能當下限：`H ≥ S`（以 k=1 最簡比計），不給上限。
- 圖片數位化或標示重疊的峰：容差放寬，信心降低。

### A.4 IR 與官能基推論

轉成元素下限與 DBE 下限：

| 推論 | 元素下限 | DBE 下限 |
|---|---|---|
| C=O（羰基） | O≥1 | ≥1 |
| 酯、羧酸、酸酐 | O≥2（酸酐 O≥3） | ≥1（酸酐 ≥2） |
| 醯胺 | O≥1、N≥1 | ≥1 |
| 腈 | N≥1 | ≥2 |
| 炔 | — | ≥2 |
| 芳環 | C≥6 | ≥4 |
| 硝基 | N≥1、O≥2 | ≥1（以 N=O 計） |
| O–H（醇、酚）／醚 C–O | O≥1 | — |
| N–H（胺） | N≥1 | — |

**硬或軟**（建議，見 Q4）：
- 預設全部為**軟**（IR 單一模態的歸屬常有競爭解釋）。
- 升為**硬**的條件：同一推論由兩個獨立模態支持（例如 IR 羰基 Strong＋¹³C ≥160 ppm 訊號；IR 腈＋¹³C 115–125 ppm），或在 `constraints.functionalGroups` 中為 REQUIRED。
- EXCLUDED／FORBIDDEN 的官能基**不**轉成「元素數量上限」，因為未觀測不等於不存在（原則 5）。

### A.5 使用者分子式

- **硬限制**：直接成為唯一假設（信心 1，`massBasis:'USER_FORMULA'`）。其他證據照常計算，但只標示為「支持／矛盾」，不改變它的地位。
- 無法解析或化學上不合理時：沿用既有行為（`generationStatus` 的 INVALID_FORMULA_FORMAT 等），組成層回報錯誤但不另外推斷替代分子式。

---

## B. 分子式枚舉與篩選

### B.1 元素集合

| 元素 | 預設處理 | 理由 |
|---|---|---|
| C、H、N、O | 一律允許 | 有機小分子主體 |
| S | 允許，上限 2；有 M+2 或 S 線索時上限 4 | M+2 只有 4.5%，低解析下難以排除；不給證據時降權 |
| Cl、Br | 允許；無 M+2 證據時上限 1 且降權；有證據時上限 4 | 同位素特徵明顯，有資料時可判斷 |
| F、I、P | **預設禁止**，有特定證據才允許（I：m/z 127 或 M−127；F：M−19、M−20、CF₃⁺ 69；P：使用者加入） | 單一同位素，MS 同位素看不出來；若預設允許，在低解析下會大量增加無根據的組合 |
| Si | 預設禁止（m/z 73／147 的 TMS 線索時允許，沿用既有 `hasSulfurOrSiliconSignature`） | 同上 |

未考慮的元素一律列在結果的 `limitations`（例如「未搜尋 F、I、P、Si；若樣品可能含這些元素需另外提供證據」），不得靜默。是否開放使用者設定見 Q7。

### B.2 有質量時

- 以每個離子假設的中性質量 `M` 與容差枚舉。元素依質量由大到小巢狀迴圈，以「剩餘質量／元素質量」與 B.1、B.3 的上限剪枝；H 依容差求整數範圍（低解析 0.5 Da 下可能 1 個值，HRMS 下通常 0–1 個）。
- 質量上限：P1a 支援中性質量 ≤ 1000 Da（效能目標只要求 ≤600 時 < 1 秒）。

### B.3 沒有質量時

- C 範圍：A.2 的下限到軟上限 `2·n13 + 2`（沒有 ¹³C 時用 ¹H 推得的保守範圍；兩者都沒有 → **不枚舉**，回報「資料不足以界定分子大小」）。
- H：A.3 列出的 `k·S + e` 集合；沒有 ¹H 積分時 H 由 DBE 範圍決定。
- 雜原子：從 A.4 下限起，額外最多加 N +2、O +3、S +1、鹵素僅在有證據時加。
- 每個結果標示 `massBasis:'NONE'`，並附固定說明「**無質量依據，分子大小未確認**」。

### B.4 篩選

- **硬**：元素計數非負整數；DBE = C − H/2 − X/2 + N/2 + 1（P 以 3 價、S 以 2 價計）為**非負整數**；SENIOR（價數總和為偶數、≥ 2×(原子數−1)）；Golden Rules 規則 1（依質量的元素上限）、規則 4 的寬範圍 H/C（0.1–6）、規則 5 的寬範圍比例（N/C ≤ 4、O/C ≤ 3、P/C ≤ 2、S/C ≤ 3、F/C ≤ 6、Cl/C ≤ 2、Br/C ≤ 2、Si/C ≤ 1）、規則 6 多元素機率檢查。
- **軟**：Golden Rules 的「常見範圍」（H/C 0.2–3.1、N/C ≤ 1.3、O/C ≤ 1.2、P/C ≤ 0.3、S/C ≤ 0.8、F/C ≤ 1.5、Cl/C ≤ 0.8、Br/C ≤ 0.8、Si/C ≤ 0.5）超出時降權。
- 上述數值在實作時逐一對照論文 Table 1／正文，常數表附出處。

### B.5 範圍上限與截斷回報

- 枚舉節點上限 `MAX_NODES = 2,000,000`；保留假設上限 `MAX_HYPOTHESES = 200`（依信心排序後截斷）。
- 結果一律回報：`enumeratedNodes`、`passedHardFilters`、`returned`、`truncated:{byNodes:boolean; byKeep:number}`（被丟棄的數量）。不得默默丟棄。

---

## C. 評分與排序

- 每個假設的分數為各項**對數相容度**之和，最後以 softmax 換成「相對信心」（加總為 1），一律標示 `calibrated:false`：

| 項目 | 方式 |
|---|---|
| 質量誤差 | 高斯，σ = 容差/2 |
| 離子假設權重 | 已確認 = 0；未確認依 A.1 遞減的先驗 |
| 同位素相似度 | M+1、M+2 理論與觀測的差，高斯；未標記 → 不計分（未知） |
| 碳數符合度 | A.2 的懲罰階梯 |
| 氫數符合度 | 與最近的 `k·S + e` 的差；`e>0`、k 越大輕微懲罰 |
| 官能基下限 | 違反軟下限每項扣分；違反硬下限已在篩選排除 |
| 氮規則 | 與其他模態的 N 線索不一致時扣分 |
| Golden Rules 常見範圍 | 超出時扣分 |
| 元素先驗 | 無證據的 S／Cl／Br 扣分 |

- 權重以常數表集中管理（`COMPOSITION_WEIGHTS`），P1c 再依使用者評測調整；P1a 不宣稱任何權重被校準。
- 排序：分數降冪；同分依（單同位素質量差、分子式字串）決定，確保**確定性**。
- 每個假設附三類理由，每條理由帶來源觀測 ID（沿用 `${modality}:${sourceId}:${x}`）：
  - `support`：例如「M+2/M = 31%（觀測 MS:file:156），與 Cl₁ 理論 32.0% 相容」
  - `contradiction`：例如「¹³C 9 個訊號，C=7 需要重疊或資料錯誤」
  - `unknown`：例如「M+1 未標記，碳數無同位素依據」

---

## D. 輸出型別（草稿）

```ts
export type CompositionElement='C'|'H'|'N'|'O'|'S'|'P'|'F'|'Cl'|'Br'|'I'|'Si';
export type MassBasis='USER_FORMULA'|'HRMS'|'LOW_RES_MS'|'NONE';

export interface CompositionReason {
  text:string;                       // 中文說明
  observationIds:string[];           // 沿用 ObservedEvidence.id
  source:'MS'|'MS_ISOTOPE'|'13C_NMR'|'1H_NMR'|'IR'|'HYPOTHESIS'|'USER'|'RULE';
  strength:'HARD'|'SOFT';
}

export interface IonHypothesis {
  id:string;                         // 例如 'ion-0'
  observationId:string;              // 被視為分子離子的峰
  observedMz:number;
  adduct:'[M]+•'|'[M+H]+'|'[M+Na]+'|'[M+NH4]+'|'[M-H]-';
  charge:number;
  neutralMass:number;
  toleranceDa:number;
  confirmedByUser:boolean;
  rejected:boolean; rejectionReason:string|null;   // 例如不合理丟失
}

export interface CompositionHypothesis {
  id:string;                         // 'comp-<formula>'，確定性
  formula:string;                    // Hill 順序
  counts:Partial<Record<CompositionElement,number>>;
  dbe:number;
  monoisotopicMass:number;           // 中性單同位素質量
  massBasis:MassBasis;
  ionHypothesisId:string|null;
  massErrorDa:number|null; massErrorPpm:number|null;
  relativeConfidence:number;         // 0–1，softmax，未校準
  calibrated:false;
  score:number;                      // 對數相容度總和（除錯用）
  support:CompositionReason[];
  contradiction:CompositionReason[];
  unknown:CompositionReason[];
  generatorSupported:boolean;        // P1a：僅 C H N O F Cl Br
  unsupportedElements:CompositionElement[];  // 例如 ['S']，P1b 前暫不支援
  searched:boolean;                  // 是否被送進結構生成（E）
  sizeConfirmed:boolean;             // massBasis==='NONE' 時為 false
}

export interface CompositionInferenceResult {
  status:'USER_FORMULA'|'INFERRED'|'INSUFFICIENT_DATA'|'INVALID_USER_FORMULA';
  hypotheses:CompositionHypothesis[];          // 依信心排序；包含未被搜尋者
  ionHypotheses:IonHypothesis[];
  elementsConsidered:CompositionElement[];
  elementsExcluded:{element:CompositionElement;reason:string}[];
  bounds:{carbon:[number,number|null]|null;hydrogenMultiples:number[]|null;heteroMinimums:Partial<Record<CompositionElement,number>>;dbeMin:number};
  enumeration:{enumeratedNodes:number;passedHardFilters:number;returned:number;truncatedByNodes:boolean;droppedByKeepLimit:number};
  limitations:string[];
  elapsedMs:number;
}
```

---

## E. 管線整合

### E.1 位置

```
① prepareModeAEvidence → ② createReasoningPlan（observations 有 ID）
   → 【組成推斷 inferComposition(bundle, plan, userFormula)】   ← 新增，屬於進度步驟 3
   → ③ inferLocalStructures／hints → ④ generateStructures(...) → ⑤⑥⑦ 不變
```

- 放在 `createReasoningPlan` 之後，才能引用既有觀測 ID；放在搜尋之前，才能把分子式送進生成。
- 不新增進度步驟或 trace stage（0.7）。結果掛在：
  - `ReasoningPlan.composition?: CompositionInferenceResult`
  - `ModeAResult.compositionInference?: CompositionInferenceResult`（`runModeAPipeline` 回傳）
  - `ReasoningTrace.composition?: CompositionInferenceResult`，以及每個 `CandidateReasoning.compositionHypothesisIds: string[]`
- 新程式放在 `src/engines/composition/`：`inferComposition.ts`（入口）、`msComposition.ts`、`nmrComposition.ts`、`functionalGroupBounds.ts`、`formulaEnumerator.ts`、`goldenRules.ts`、`compositionScoring.ts`、`types.ts`、`structureGenerator.ts`（E.2）。

### E.2 與生成器無關的介面

```ts
export interface StructureGenerationBudget {timeMs:number;maxStates:number;maxResults:number;shouldCancel?:()=>boolean;onProgress?:(p:GraphSearchProgress)=>void}
export interface StructureGenerationRequest {formula:string|undefined;hints:GraphSearchHints;budget:StructureGenerationBudget}
export interface StructureGenerator {generateStructures(req:StructureGenerationRequest):Promise<DeNovoSearchResult>}
```

- P1a 實作：`DeNovoStructureGenerator` 直接呼叫既有 `searchMolecularGraphsAsync`；P1b 換成完整窮舉器，介面不變。
- 合併多個分子式的結果：`generateForCompositions(hypotheses, hints, totalBudget)`：
  1. **有使用者分子式**：一次呼叫，formula＝使用者分子式，預算＝原本（12 s／120000），行為與現在相同。
  2. **無使用者分子式、有組成假設**：取 `generatorSupported` 的前 N（=3）名。總 `maxStates` 與 `timeMs` 維持原上限，依序分配：第 i 個分到「剩餘預算 / 剩餘個數」，提早結束的預算順延給下一個。結果以 RDKit canonical 去重，`derivations` 合併；另建 `formulaSources: Record<smiles, hypothesisId[]>`。合併後的 `termination` 取各次中最嚴重者，`visited` 為總和。
  3. **沒有任何組成假設**（`INSUFFICIENT_DATA`，或前 N 名全是生成器不支援的元素）：沿用原本無分子式路徑，並在 limitations 註明原因。
- `maxResults`（輸出上限）：建議每個分子式各 48、合併後最多 144，交給既有驗證與排名（見 Q2，會增加評分耗時）。
- 前 N 名以外的假設：`searched:false` 仍完整保留在 `compositionInference.hypotheses`，不得消失；trace 與（P1c 的）結果頁都要能列出。
- 下游不受影響的地方：`DeterministicStructureGenerator` 與 `rankCandidates` 的硬分子式只看使用者分子式，因此來自不同假設的候選都能進入排名。P1a **不**把組成信心加進候選分數（跨分子式排名屬於 P1c）。

---

## F. 兩個修正

### F.1 溶劑峰

目標行為：使用者**明確**標記為溶劑、雜質、雜訊、水、參考峰的峰，不進 Mode A 觀測與證據；自動判定的溶劑候選**保留**在觀測中，但保留其標記資訊。

問題：如 0.5 所述，UI 目前**無法**做出「使用者明確標記」，而自動標記用的是同一組欄位。

最小改動方案（不改 UI 元件）：
1. `SpectralPeak` 新增選填欄位 `classificationSource?: 'USER'|'AUTO_SOLVENT_REFERENCE'|'AUTO_ENGINE'`。
2. `applyNmrSolventTagging` 在寫入 SOLVENT 時一併寫 `classificationSource:'AUTO_SOLVENT_REFERENCE'`，還原時清除。UI 外觀不變（仍以 `isSolventVerified` 著色）。
3. `observationSpectrum` 改為：若峰的 `userClassification`／`classificationTag` ∈ {SOLVENT, IMPURITY, NOISE} 或 `role`／`signalRole` ∈ {SOLVENT, IMPURITY, WATER, MOISTURE, REFERENCE_TMS}，且 `classificationSource` **不是** `AUTO_*` → 從 Mode A 觀測中移除（記錄於 `excludedObservations`，帶 ID 與理由）；自動標記的峰照舊重設為 ANALYTE 進入觀測，但保留 `autoSolventCandidate:true` 與原始標記供 P1c 顯示。
4. 沒有 `classificationSource` 的舊資料：視為**使用者明確**（因為目前 UI 唯一能寫入這些欄位的路徑就是自動標記，而它從 P1a 起會帶 `AUTO_*`；所以缺少來源只會出現在外部資料，例如 benchmark 峰表或測試夾具）。見 Q1。
5. benchmark 峰表新增可選欄位 `classification`（對應 `userClassification` 並設 `classificationSource:'USER'`），讓使用者評測時能明確排除溶劑峰。這是 `scripts/benchmark` 的小改動，同步更新格式文件。

限制：在 P1c 加入 UI 分類控制項之前，**UI 使用者沒有辦法做出明確標記**，所以這個修正在 UI 上的可見效果只有「自動標記不再被誤當成已排除」（行為與現在相同：仍進入觀測）。可在 P1c 的 `PeakObservationTable` 加一個分類下拉選單（寫 `classificationSource:'USER'`），並修正 `SpectrumViewer` 圖例文字。

### F.2 版本號

- 新增小模組 `src/appVersion.ts`（或 `server/appVersion.ts`）：`readAppVersion(startDir)` 從呼叫模組所在目錄（`fileURLToPath(import.meta.url)`）往上找第一個 `package.json` 並讀 `version`，結果快取；找不到時回傳 `'unknown'` 並記錄警告（不讓伺服器啟動失敗）。
- `server.ts` 的兩處改為呼叫它。開發模式（`tsx server.ts`）從 repo 根目錄找到；正式建置（`dist/server.mjs`）從 `dist/` 往上一層找到。
- 不採用 `import pkg from './package.json' with {type:'json'}`：需要改 `tsconfig`（`resolveJsonModule`）且會把版本固化在打包產物中；也不採用 `process.cwd()`（依賴啟動目錄）。

---

## G. 測試計畫（全部用自編合成資料）

新增 `tests/composition*.test.ts`，以程式內建的合成峰表為輸入。不使用任何真實化合物圖譜，測試只斷言邏輯行為（「預期分子式在清單內」「某假設被排除」），不宣稱準確率。

| # | 測試 | 斷言 |
|---|---|---|
| 1 | 合成 EI 峰表：M=150、M+1=10.2%、M+2=0.9% | `C9H10O2` 在競爭清單內；清單 >1 個；`massBasis='LOW_RES_MS'` |
| 2 | Cl：M+2 ≈ 32%；Br：M+2 ≈ 98% | 前幾名假設 Cl₁／Br₁；M+2 標記且 <10% 時 Cl/Br 被硬排除；M+2 未標記時不排除 |
| 3 | 氮規則 | 奇數 m/z 的 `[M]+•` 假設 N 為奇數；`[M+H]+` 反轉 |
| 4 | 不合理丟失 | 最高峰 X 且 X−5 有強峰 → X 的 `[M]+•` 假設 `rejected`，理由含觀測 ID |
| 5 | 高解析 | 5 ppm 容差下候選數少於 0.5 Da；所有 `massErrorPpm` ≤ 5 |
| 6 | ¹³C 下限 | 8 個訊號 → 所有假設 C ≥ 8；無質量時 C>16 的假設信心較低 |
| 7 | ¹H 最簡比與倍數 | 積分 2:3:5（4.0、6.0、10.0）→ S=10，列出 k=1,2,…；可交換氫 e≤2 |
| 8 | 官能基 → 元素下限 | 合成 IR 羰基＋¹³C 170 → O≥1 為硬；只有 IR → 軟 |
| 9 | Golden Rules | 例如 `C1H40`（H/C 違規）、SENIOR 違規者不出現 |
| 10 | 使用者分子式覆蓋 | 唯一假設、信心 1；與 MS 矛盾時列入 contradiction 但仍保留 |
| 11 | 無質量標示 | 只有 ¹³C＋¹H → 每個假設 `massBasis='NONE'`、`sizeConfirmed=false`、含固定說明 |
| 12 | 截斷回報 | 以小上限呼叫 → `truncatedByNodes` 或 `droppedByKeepLimit>0` |
| 13 | 確定性 | 相同輸入跑兩次，JSON 完全相同（排除 `elapsedMs`） |
| 14 | 溶劑峰 | 使用者標記（`classificationSource:'USER'`）的 7.26 不在觀測中；`applyNmrSolventTagging` 自動標記的 7.26 仍在觀測中且帶 `autoSolventCandidate` |
| 15 | health 版本號 | `createApp` 的 `/api/health` 回傳 `package.json` 的 version；`readAppVersion` 從 `dist/` 位置也能找到（以暫存目錄模擬） |
| 16 | 銜接介面 | 有組成假設時對 N 個分子式各呼叫一次（spy）；`Σ maxStates ≤ 120000`、`Σ timeMs ≤ 12000`；候選帶 `compositionHypothesisIds`；有使用者分子式時只呼叫一次且行為同前 |
| 17 | 效能 | 質量 ≤600、HRMS 與低解析各一例，`inferComposition` 在 Node < 1 秒 |

另外：既有 145 個測試、typecheck、build、E2E 全部重跑；若任何既有預期值需要改變，逐項列出新舊值與原因。

---

## 審核決定（規劃者，2026-10-19）

以下決定優先於上文；上文與此衝突時以本節為準。

1. **溶劑**：接受 P1a 修正在 UI 暫無作用（P1c 會新增峰分類控制項）。**沒有 `classificationSource` 的既有 SOLVENT 等標記一律視為 AUTO（不排除）**，因為現行 UI 唯一的寫入者就是選溶劑時的自動標記。只有明確帶 `classificationSource='USER'` 的資料（benchmark 峰表或匯入資料明確指定）才排除。（取代 F.1 第 4 點。）
2. **多分子式搜尋**：每個分子式各最多 48 個（合併最多 144）。量測評分階段總耗時並與只搜尋 48 個時比較，寫入報告；若在 Worker 預算內明顯超時，先回報，不自行縮減。
3. **mf-finder**：加為 devDependency，只用於測試交叉核對枚舉結果，不進入正式建置；更新 `THIRD_PARTY_NOTICES.md`。
4. **IR**：只有 IR 支持的一律為軟證據；兩個獨立模態同時支持才升為硬限制。硬限制只能是**元素下限或 DBE 下限**，不得用來排除元素或官能基。若硬限制使所有分子式假設被刷掉，退回軟證據重算，並在結果中註明。
5. **游離方式與極性未知**：正、負離子型式都列；未經使用者確認的型式降低信心。
6. **自動判定的溶劑峰**：¹³C 不推高碳數下限；¹H 不計入積分總和與最簡比計算。這些峰仍保留在觀測中，並標記 `optionalObservation=true`，供 P1c 雙向比對時「未被解釋也不扣分」使用。（取代 A.2 的「下限改為 n13 − 自動溶劑候選數」的寫法，效果相同。）
7. **F／I／P／Si 預設禁止**，有以下特定證據才開放（開放後仍限量並降信心）：
   - F：¹³C 出現 J≈240–260 Hz 的大耦合雙重峰；或 ¹H 出現 J≈45–50 Hz 的 H–F 耦合；或 MS 有 M−19／M−20（HF）丟失。
   - I：MS 有 m/z 127 峰或 M−127 丟失；或分子離子質量虧損明顯為負且符合含 I。
   - Si：MS 有 m/z 73 離子；或 M+1／M+2 比例明顯符合 Si；或 ¹H 在 0–0.3 ppm 有大積分單峰（且不是 TMS 參考峰）。
   - P：只在高解析質量虧損明確支持時開放。
   - 使用者分子式永遠可以指定任何元素，不受此限。
8. **預設常數**同意（前 3 名分子式、每譜最多 3 個分子離子峰、不合理丟失強度門檻 0.1、¹H 積分容差 ±0.15）。所有可調常數（含節點上限 200 萬、最多 200 個假設、各評分權重）集中在 `src/engines/composition/compositionConfig.ts`，每個常數附一行註解說明意義與來源。

實作時的補充（為落實上述決定所做的具體選擇，列出供審閱）：

- **沒有質量也沒有 ¹³C** 時不枚舉，回報 `INSUFFICIENT_DATA`（B.3 原寫「用 ¹H 推得保守範圍」，但單靠 ¹H 相對積分無法界定碳數，硬做會產生無依據的大量假設）。
- **P 的開放條件**：HRMS 下，同一離子假設在不含 P 的元素集合中**沒有任何**分子式落在容差內，才以含 P 重新枚舉。
- **H/C 硬下限**設為 0（論文延伸範圍為 0.1），避免全鹵化物（例如 C₆Cl₆）被硬排除；0.2–3.1 的常見範圍仍是軟證據。
- **DeterministicStructureGenerator 的「缺少組成約束就不生成」閘門**：當候選來自組成假設的分子式搜尋時略過此閘門（分子式本身就是組成依據）；其他情況維持原行為。
- **M+2 對 Cl／Br 的硬排除是逐離子假設的**：只有該離子的 M+2 已標記且 <10% 才排除；所有可用離子假設都排除時才列入 `elementsExcluded`，否則寫進 `limitations`（例如碎片峰被當成候選離子時，其 M+2 未標記，Cl／Br 仍允許）。
- **使用者確認的分子離子**若觸發不合理丟失，不排除，只寫進 `limitations`；不合理丟失只套用在 `[M]+•`。
- **`applyNmrSolventTagging` 不覆蓋 `classificationSource='USER'` 的峰**（使用者標記優先）。
- **benchmark 峰表**新增 `classification` 欄位（寫入 `classificationSource='USER'`），是 P1c 之前唯一能做出明確標記的方式。
- **預算順延的語意**：每次搜尋分到「剩餘預算 / 剩餘個數」，各次上限加總可能超過總額，但**實際消耗**不超過總額（生成器可能在上限外多數一個狀態才停止）。
- **規劃者第二輪回覆（2026-10-19）**：`binary-search`（CC0-1.0，僅開發）接受；Golden Rules 改用原文核對值（Kind & Fiehn 2007 Table 1 取 DNP／Wiley 較大者，含 Si 與 <2000 Da 區間；Table 2 extended 為硬、common 外為軟；Table 3 為規則 6），已對照 PMC 全文確認與規劃者提供的數值一致；H/C 硬下限 0 同意；無質量也無 ¹³C 時不枚舉，但結果新增 `elementClues`（官能基與元素證據的元素下限線索），搜尋退回無分子式路徑。
- **效能**：兩段式評分（先以數值分數排序所有通過篩選的分子式，只為保留的前 200 個組理由），同位素比以「單一元素分布快取 + 卷積」計算（與 `isotopeEnvelope` 同表、同截斷）。質量 580、低解析的合成例：582 ms → 167 ms。
