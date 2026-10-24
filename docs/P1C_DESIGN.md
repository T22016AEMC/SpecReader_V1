# P1c（v1.2.0）設計：組裝邏輯修正＋1H 約束核心

狀態：**階段 0，只有設計，沒有改任何產品程式、測試或設定。** 基準：main `fcc2bda`（1.1.8）。
事實來源：本文件引用的檔案與行號是 `fcc2bda` 的實際行號；與任務描述中的行號（以 `405f530` 為準）不同的地方，以這裡為準。
量測腳本（一次性，不進正式測試、不改 package.json）：`scripts/scratch/substruct-bench.mts`、`scripts/scratch/overlap-demo.mts`、`scripts/scratch/inventory-measure.mts`。

用語：config 旗標 `useV12Constraints`。**false 時所有路徑與 v1.1.8 完全相同**（以黃金結果比對，見 §5）。所有新常數放在新檔 `src/engines/constraints/v12Config.ts`（階段 1 建立）。

---

## 1. 事實確認

### 1.1 RDKit.js 子結構比對（`@rdkit/rdkit` 2026.9.1）
- API（`node_modules/@rdkit/rdkit/dist/RDKit_minimal.d.ts`）：
  - `get_qmol(smarts): Mol|null`（`:210`，解析 SMARTS 查詢）；`get_mol(smiles|molblock)`。
  - `mol.get_substruct_match(query[, details]): string`（`:79-80`，第一個比對，JSON `{atoms:[…],bonds:[…]}`，沒有比對是 `"{}"`）；`mol.get_substruct_matches(query[, details]): string`（`:81-82`，JSON 陣列）。
  - 專案現有用法只有 `matchesSMARTS`（`rdkitAdapter.ts:39-45`）：每次呼叫都重新解析分子與查詢，只問「有沒有」。
- **重疊與多重比對（量測，`overlap-demo`／`substruct-bench`）**：
  - `get_substruct_matches` 預設 `uniquify:true`（同一組原子的不同排列只算一次）；傳 `{"uniquify":false}` 會回傳全部排列（例：苯環對 `c1ccccc1`：預設 1 個、`uniquify:false` 12 個；叔丁基 `[CH3][CX4]([CH3])[CH3]`：預設 1 個、`uniquify:false` 6 個）。
  - 比對本身允許不同比對共用原子（對二甲氧基苯對 `c[OX2]` 回傳兩個比對，原子集合 `[2,1]` 與 `[5,6]`；它們不重疊，但 RDKit 不要求不重疊）。結論：RDKit 的子結構比對**本來就是「允許重疊」的存在性檢查**，沒有「每個原子只能用一次」的限制；W2 要求的語意可直接用它。
  - 原子索引是輸入分子（含 mol block）的原子順序；用 mol block 解析出的分子（不經規範化）可以把比對結果對回窮舉器的原子編號。
- **耗時量測（1000 個候選 × 3 個子結構，Node，本機單次；候選含 425 個有苯環者，命中 425/3000）**：

| 做法 | 耗時 |
|---|---|
| A. 每次重新解析分子與查詢（現有 `matchesSMARTS` 的做法） | 143 ms |
| B. 查詢只解析一次，分子每次解析 | 75 ms |
| C. 分子與查詢都先解析好，`get_substruct_matches(uniquify:false)` | 24 ms（約 8 µs／次比對） |

  Worker 內是同一個 WASM 模組，量測在 Node 完成；Worker 內耗時**未量測**（未確認，預期同量級）。

### 1.2 `NMRGraphPredictor` 的 1H 輸出（`nmrAtomicEnvironmentModel.ts:1677-…`；evidenceLedger 呼叫 `evidenceLedger.ts:54`）
- 輸出 `environments: ProtonEnvironment[]`，**已按拓樸對稱類別分組**（`computeAtomSymmetryClasses`，`:1455`，專案自己的演算法；分組 `:2560-2565`）。
- 每個環境含：`atomIndices`（組內含 H 的重原子）、`expectedProtonCount`／`integration`（**整組**的 H 總數，不是每個原子的）、`multiplicity`、`jCouplingHz`／`couplings`、`isExchangeable`、`chemicalEnvironmentClass`（例如 `ALIPHATIC_CH`）、`shiftPpm`、`uncertaintyPpm`、`environmentLabel`。
- 缺少、需要補的：(1) 每個原子的 H 數（可由 `atomIndices` 與結構推得，不需改預測器；建議在評分端推）；(2) 沒有「預測了但沒被觀測到」的概念，那是評分端的工作（W4）；(3) 非對映異位（diastereotopic）氫不拆分（維持，列為限制）；(4) 可交換 H 的「在此溶劑可能看不到」資訊目前只有 `isExchangeable` 與 `isDeuteriumExchangedOut`（原子內部欄位，沒有輸出到 `ProtonEnvironment`）；W4 的規則只需要 `isExchangeable`，所以**不需要改預測器**。

### 1.3 目前窮舉器（`src/engines/enumeration/`）與 W3 的差距
現有語意：
- 原子模式三種（`problem.ts:97-133`）：closed（不接新鍵）、open（剩餘價必須由新鍵補滿，`forced=true`，`cap = 價數 − 片段內鍵階和 − 固定 H`）、flex（剩餘價可為隱含 H 或新鍵）；自由原子（分子式 − 片段原子）等同 flex 且 H 不固定。**open 原子 + `fixedH` 已經就是「固定 H 的原子」**（`problem.ts:126-128`）。
- 對稱：同元素相鄰自由原子互換的 lex-leader 增量剪枝（`search.ts:221 pairOrdered`，只針對 `isFree` 的自由原子）；相同片段複製的互換只在葉檢查（`search.ts:232 blockSwapsOk`）。
- 葉（`enumerate.ts:69-82`）：mol block → RDKit canonical SMILES → 去重 → strain（`strainViolations`）→ plausibility（`plausibilityViolations`）。
W3 需要改（只列需要改的）：
1. **原子屬性**：`FragmentAtomSpec`（`types.ts:8-22`）新增 `group`、`aromatic`、`noHCarbonNeighbors`；`Problem`（`problem.ts:1-32`）攜帶這些屬性。
2. **對稱類別擴大**：目前只有「自由原子」有增量 lex 剪枝；固定 H 的單原子片段（`count>1`）只有葉檢查，會有 n! 倍冗餘。新語意：所有「完整屬性簽名相同（元素、固定 H、cap、forced、group、旗標）」且相鄰的原子都進 `freePairs` 型的增量檢查（lex-leader 對任意簽名相同的原子互換都成立）。
3. **鄰接限制**：`noHCarbonNeighbors` 在 `search.ts` 建立原子對清單時直接排除「與固定 H > 0 的碳」的配對（`search.ts` 建構子的 pair loop）。
4. **等價群**：列尾（row end）加「同群原子的新鍵度與鍵階多重集必須相同」的必要條件（`checkRow`，`search.ts:197`）；葉端做精確檢查（§4）。
5. **葉端新增**：芳香原子檢查、必含子結構、等價群的精確檢查；mol block 只解析一次、同一個 Mol 取 canonical SMILES 與做 SMARTS 比對（新增 rdkitAdapter 函式，不改既有函式）。
6. **不改**：`enumerate.ts` 的預算／取消／讓出、去重、`rootRejection`、公平分配、`READINGS_TRUNCATED` 機制。
**量測（`inventory-measure`，用現有窮舉器的 open 單原子片段＋`fixedH` 近似「每個原子 H 都釘死」）**：
- 只釘 H、沒有芳香約束：4-叔丁基酚型（C10H14O）60 秒仍 INCOMPLETE（1.1 億步、1.3 萬候選，其中含苯環的只有 22）；二苯基丙烷型（C15H16）60 秒 INCOMPLETE；乙基苯甲酸酯型（C9H10O2）60 秒 INCOMPLETE；對二甲氧基苯型（C8H10O2）26 秒 COMPLETE（1.4 萬候選，含苯環的 6）。原因：「芳香 CH」只是「有 1 個 H 的 sp2 碳」，沒有被迫成環。
- 同樣的原子清單，但**芳香 CH 放進「釘 H 的環模板」**（環上 CH 為 closed、取代位 C 為 open 且 H=0）：4-叔丁基酚型 552 步／2 個候選／2 ms；二苯基丙烷型 63 步／1 個候選；對二甲氧基苯型 208 步／2 個候選；乙基苯甲酸酯型 614 步／15 個候選。
- **結論（設計必須反映）**：W1 的「原子清單」不能只有逐原子的 H 數，必須把芳香 CH 組成**環模板**（環數與取代型式作為替代解讀）。這是任務描述沒有寫、但實測必要的一項。

### 1.4 IR 峰 y／強度的下游位置（W6 影響範圍）
目前 IR 峰有三種強度定義：(a) 描線值（穿透率方向，強帶低）：v1.1.8 後的重新偵測峰；(b) 吸收高度（強帶高）：`processIRSeries` 輸出、`prepareIR` 的結果；(c) 手動標記：未校準 65（預留值）、校正後 `pixelToPhysicalIntensity`（`spectrumParser.ts:1392-1406`，IR：`100 − 高度×0.85`，上方高穿透→小值，與 (a) 相反）。
下游位置：
- 產生 (c)：`spectrumParser.ts:1995`（校正時標註 physicalY）、`:3008`、`SpectrumViewer.tsx:585、634`（點擊標記時算 physicalY，由 `App.tsx:876` 的 `handleMarkPeakFromImage` 當作 `y`）。
- 讀 `y` 的：`SignalCharacterizationEngine.measureSpectrumSignals`（`signalCharacterizationEngine.ts:936-946`：`normalizedIntensity = y / max(y) × 100`；**對穿透率方向的 IR 峰，強帶會得到最低的 normalizedIntensity，方向反了**；v1.1.8 的測試 T1 目前把「`normalizedIntensity` 與 `y` 同序」當成預期，W6 要一併修正並更新這條預期）；`prepareIR`（`irSignalProcessing.ts:136-160`，`down?reference−y:y`）；`PeakObservationTable.irObservedHeight`；證據流程 `collectObservedEvidence`（`hypothesisGenerator.ts:17`，用 `prepareIR` 的結果，所以拿到 (b)）→ `nitrogenEvidence.ts:30-50`（強度比）、`structurePlausibility.ts:29-31`（強帶門檻）、`functionalGroupBounds.ts` 都讀 `relativeIntensity`，來源是 (b)，**不受 W6 影響**。
- 結論：W6 的實際影響面是 (c) 的產生處、`measureSpectrumSignals` 的 IR 分支、顯示（檢視器、峰表）；證據與 N／合理性判定走 (b)，維持不動。**標記在畫面上的位置不變**需要驗證檢視器是用 `pixelX/pixelY` 畫標記而不是 `y`（`SpectrumViewer.tsx:732-760` 區段看起來是用像素；**未確認**，階段 3 開始時先寫測試確認）。

### 1.5 缺陷位置（`fcc2bda` 實際行號）
1. 自由原子 = 分子式 − 所有片段原子：`adapter.ts:157-166`（`conversions`／`sets` 建立）與 `problem.ts:140-153`；「每個觀測都要被一個局部結構解釋」：`adapter.ts:111-119`（`readings()` 的 `next = observations.find(o=>!covered.has(o))`）。
2. 一般 1H 訊號只產生單碳 ALKYL 片段、無 H 數：`localStructureInference.ts:22`；同類片段合併：`localStructureInference.ts:7-8`；轉接器把單一 flex 原子當空洞丟掉：`adapter.ts` 的 `vacuous`。
3. 預測多出的 1H 環境不扣分：`evidenceLedger.ts:69-70`（註解）與 `:103`（方法說明）；圖片來源權重 ×0.5：`evidenceLedger.ts:127`（對 `ev.sourceModality!=='IR'` 的每個模態）。
4. 正式流程沒開應變規則：`enumerationConfig.ts` 的 `pipelineStrainProfile: null`；沒有「非環狀 sp3 碳同時接 OH 與其他 O」的規則：`structurePlausibility.ts:22-25`（規則名單）、`:54-86`（只有 GEM_DIOL＝兩個游離 OH、AMINAL＝N）。
5. IR 強度：見 1.4。
**量測（`overlap-demo`，現行「不重疊片段」語意）**：以「苯環」＋「C–O」兩個彈性片段為讀法——
- 苯酚 C6H6O：`FORMULA_ELEMENT_SHORTAGE`，0 個候選（片段需要 7 個 C，分子式只有 6 個）；只用苯環片段時苯酚被產生。
- C7H8O（含甲酚）：2 個候選，**含芳基 OH 的 0 個**（只剩苄醇、苯甲醚）；C8H10O2：65 個候選、含芳基 OH 的 32 個（其餘酚類被排除）。
這證實規劃者的描述：C–O 讀法與苯環上的 C–O 不能共用原子，含酚 C–O 的目標會被排除。

---

## 2. 總覽與資料流

```
觀測 (1H/IR/13C/MS)                      v1.2 新增                                   既有
 └ collectObservedEvidence ─┬─ W1 buildAtomInventory ──► InventoryAlternative[]  (每個 (formula,k,額外交換H) 一組)
                            ├─ W2 strongEvidenceRules ─► RequiredSubstructure[] (SMARTS，允許重疊)
                            └─ 既有 inferLocalStructures（無積分時走 v1.1.7 彈性原子路徑）
 inventoryAdapter：InventoryAlternative → FragmentAlternativeSet（釘 H 的原子＋環模板＋group／旗標）
 W3 enumerateStructures(原子屬性、required、equivalence) ─► candidates（COMPLETE／INCOMPLETE）
 W5 合理性（含應變規則）→ 既有下游閘門 → W4 雙向評分 → W7 跨 (k) 排名 → W8 面板
 W6：IR y 定義統一（獨立於上面，影響標記與顯示）
```
- 旗標：`useV12Constraints`。false：不呼叫 W1/W2/W3 新路徑，不套 W4–W7 的新規則，W6 不生效，面板不顯示新區段。true：1H 有積分時走 W1→W3；沒有積分時**維持 v1.1.7 的彈性原子路徑**（W2 的必含子結構不適用，W4–W7 仍適用）。
- 新增檔案（預定）：`src/engines/constraints/{v12Config,atomInventory,shiftClasses,requiredSubstructures,inventoryAdapter}.ts`；`src/engines/enumeration/{automorphism,leafChecks}.ts`；改動：`enumeration/{types,problem,search,enumerate,exhaustiveGenerator}.ts`、`rdkitAdapter.ts`（新增函式）、`structurePlausibility.ts`、`evidenceLedger.ts`、`signalCharacterizationEngine.ts`、`spectrumParser.ts`（IR 標記 y）、`candidateGenerator`（k 排名）、`compositionPanelModel.ts`／`CompositionPanel.tsx`。**保持不動**：IR 峰偵測門檻與演算法、基線、平滑、校正換算、`deNovoGraphSearch`、同步退路、預算與公平分配機制。

---

## 3. W1–W8

### W1 1H 原子清單（`atomInventory.ts`）
```ts
export interface H1Signal {observationId: string; shiftPpm: number; relativeIntegral: number|null; multiplicity: string|null; broad: boolean; optional: boolean}
export type ShiftClassId = 'ARO_CH'|'VINYL_CH'|'ALDEHYDE'|'O_CH'|'N_CH'|'ALPHA_CH'|'ALKYL_CH'|'EXCHANGEABLE'
export interface ShiftClass {id: ShiftClassId; rangePpm: [number,number]; hPerAtom: number[]; hybrid: 'AR'|'SP2'|'SP3'|null; exchangeable: boolean; heteroatom?: 'O'|'N'; basis: string}
export interface InventoryGroup {groupId: string; observationId: string; shiftClass: ShiftClassId; hTotal: number; atomCount: number; hPerAtom: number; element: 'C'|'O'|'N'; hybrid: 'AR'|'SP2'|'SP3'|null; exchangeable: boolean; singletNoHNeighbors: boolean; equivalent: boolean}
export interface AromaticRingPlan {rings: {id: string; ch: number; substituents: number; substituentPositionPatterns: number[][]}[]}   // ch = 該環上的芳香 CH 數
export interface InventoryAlternative {id: string; k: number; extraExchangeable: number; groups: InventoryGroup[]; rings: AromaticRingPlan; zeroHAtoms: Record<string, number>; applied: AppliedConstraint[]; notes: string[]}
export interface AtomInventoryResult {status: 'BUILT'|'NOT_AVAILABLE'; reason: string|null; alternatives: InventoryAlternative[]; truncated: boolean; incompleteReasons: ('INVENTORY_ALTERNATIVES_TRUNCATED')[]}
export function buildAtomInventory(input: {signals: H1Signal[]; formula: Record<string,number>; solvent: string; coverageComplete: boolean}): AtomInventoryResult
```
規則：
1. **可用條件**：所有非 `optional` 的 1H 訊號都有積分（`relativeIntegral>0`）；否則 `NOT_AVAILABLE`，沿用 v1.1.7。涵蓋不完整（`coverageComplete=false`）時仍建立，但每個替代解讀加註「1H 未確認完整」且 W4 的「預測多出的環境」扣分減半（`incompleteCoverageUnmatchedFactor`）。
2. **積分→H 數**：以既有 `simplestIntegerRatio`（`nmrComposition.ts:38`，容許誤差 `h1IntegralTolerance=0.15`）取最簡整數比 `r_i`、總和 S。對每個分子式 H 總數 `H`：k 取 {1,2,3} 中滿足 `H − e = k·S`（`e` = 未被觀測到的可交換 H 數，0…`maxExtraExchangeable`=2）的組合（W7）；每個訊號的 H 數 `n_i = k·r_i`。
3. **同訊號 H 等價 → 原子數**：對每個訊號，依位移類別（下）取允許的每原子 H 數 m（`hPerAtom`），所有整除 `n_i` 的 m 各成一個替代（原子數 `n_i/m`；例如 6H 烷基單峰：2×CH3、3×CH2、6×CH）。替代依「常見程度」排序（CH3 先於 CH2 先於 CH，config `hPerAtomPreference`）。多個訊號的替代取乘積，**總數上限 `maxInventoryAlternatives`（預設 64）**，超過只保留前 64 個並標 `INVENTORY_ALTERNATIVES_TRUNCATED`（在診斷與面板顯示為 INCOMPLETE 原因）。
4. **單峰規則**：訊號多重性 `s`、不寬、積分已知、且與其他訊號的位移差都 > `singletOverlapPpm`（預設 0.10）時，該群原子的**相鄰碳原子 H=0**（`singletNoHNeighbors=true`）。只限一階、單峰、無重疊；t/q/d 的鄰位 H 數規則本版不做（乙基以 W2 的必含子結構表達）。可交換 H 不受此規則約束（OH 不與鄰碳耦合）。
5. **位移類別表（config `shiftClasses`；預設值是工程預設，未校準）**：

| 類別 | 範圍（ppm） | 每原子 H | 混成 | 備註 |
|---|---|---|---|---|
| ARO_CH | 6.3–8.5 | 1 | AR | 沿用既有 `h1AromaticRange` 的上限 8.5 與 `graphSearchHints` 的下限 6.3 |
| VINYL_CH | 4.5–6.3 | 1、2 | SP2 | |
| ALDEHYDE | 9.0–10.5 | 1 | SP2 | 沿用 `h1AldehydeRange` 的概念 |
| O_CH | 3.2–5.0 | 1、2、3 | SP3 | 接 O 的 sp3 碳（OCH3 3.2–4.0、OCH2 3.4–4.5、OCH 3.5–5.0）；`heteroatom: 'O'` |
| N_CH | 2.2–3.8 | 1、2、3 | SP3 | `heteroatom: 'N'` |
| ALPHA_CH | 1.9–3.2 | 1、2、3 | SP3 | 鄰羰基／芳環／炔 |
| ALKYL_CH | 0.5–2.2 | 1、2、3 | SP3 | |
| EXCHANGEABLE | 0.5–13 且寬、或位移 > 10 | 1 | — | 元素 O 或 N（依溶劑與其他證據；預設 O）；溶劑為 D2O／CD3OD 時預期看不到 |
類別重疊時（例如 3.4 ppm 同時是 O_CH、ALPHA_CH）**每個符合的類別各成一個替代**，不挑一個。來源依據：通用教科書的 1H 位移範圍表（如 Silverstein、Pretsch 一類的位移相關表）；**上列每個數值是工程預設，我沒有逐一對照原書頁碼（未確認）**，需要你審核（問題 5）。
6. **芳香 CH → 環模板（量測 §1.3 證明必要）**：ARO_CH 群的總芳香 CH 數 A 拆成環：環數 1…`maxAromaticRings`（預設 3），每環 `ch`（1–5）個芳香 CH，`ch` 個 CH + `6−ch` 個取代位（取代位 C 的 H=0）；取代位置型式全部列出（例：`ch=4` → 鄰／間／對位；`ch=5` → 單取代；`ch=3` → 1,2,3／1,2,4／1,3,5），再由等價群與 W2 的子結構（AA'BB' 對位苯）在葉端篩掉。環拆法與型式的總數受同一個上限約束。
7. **其餘原子**：分子式扣掉清單原子後剩下的重原子一律 H=0（`zeroHAtoms`）；清單的 H 總和（含額外可交換 H）必須等於分子式 H，否則該替代作廢（記錄原因）。
8. **可交換 H**：EXCHANGEABLE 群各成原子（O 或 N，1 H）；另外允許 `extraExchangeable ∈ {0,1,2}`（沒被觀測到的 OH／NH），以分子式 H 與 k 決定可行組合。
9. 沒有積分 → `NOT_AVAILABLE`（沿用 v1.1.7）。

### W2 必含子結構（`requiredSubstructures.ts`）
```ts
export interface RequiredSubstructure {id: string; smarts: string; label: string; evidenceObservationIds: string[]; strength: 'STRONG'}
export interface StrongEvidenceRule {id: string; modality: 'IR'|'1H_NMR'|'13C_NMR'; detect: (obs: ObservedEvidence[]) => {observationIds: string[]}|null; smarts: string; label: string}
export function requiredFromEvidence(observations: ObservedEvidence[], rules?: StrongEvidenceRule[]): RequiredSubstructure[]
```
- 取消「每個觀測都必須由一個片段解釋」；只有 `strongEvidenceRules`（config）的規則成為必含子結構。預設清單：
  - 強 C=O：IR 1650–1800 cm⁻¹ 有相對強度 ≥ 0.5×最強者的峰 → `[CX3]=[OX1]`。
  - 腈：IR 2210–2260 cm⁻¹（相對強度 ≥ 0.3）→ `[CX2]#[NX1]`（與 N 證據判定一致：沒有 N 專屬證據時 N 本來就被擋）。
  - 對位苯：1H 有兩個各 2H 的芳香雙峰（或 AA'BB'）且 J 7–9 Hz → `[cH]1[cH]c([!#1])[cH][cH]c1[!#1]`。
  - 乙基：1H 有 q（2H 相對）與 t（3H 相對）、共同 J → `[CH3][CH2]`。
  規則 id、門檻、SMARTS 都在 config；清單可增減。
- 必含子結構**允許與原子清單及其他子結構共用原子**：用 RDKit 子結構比對（§1.1，允許重疊），在葉端對每個候選檢查「至少一個比對」（`minMatches` 預設 1）。不當作不重疊的零件。一般 IR 帶只用於評分，不再產生局部結構的必含要求。
- 無積分（沒有原子清單）時：沿用 v1.1.7 讀法；W2 的子結構仍可作為葉端篩選（因為葉端篩選不會讓列舉變慢），預設啟用（config `requiredInFlexPath=true`）。

### W3 窮舉器支援原子屬性
```ts
// enumeration/types.ts（additive）
interface FragmentAtomSpec { …現有…; group?: string; aromatic?: boolean; noHCarbonNeighbors?: boolean }
interface FragmentAlternativeSet { id: string; fragments: FragmentSpec[]; equivalentGroups?: string[]; required?: {id: string; smarts: string; minMatches?: number}[] }
```
- 固定 H：沿用 open＋`fixedH`（剩餘價必須由新鍵補滿）。清單原子為單原子 open 片段（`count` = 該群原子數；非環原子），芳香環為環模板片段（環上 CH：closed＋fixedH=1；取代位 C：open＋fixedH=0；環鍵 Kekulé＋`aromatic` 旗標，`group` 標示所屬訊號群）。
- 芳香／混成：環模板已讓環原子必為環上 sp2；葉端以 RDKit 檢查 `aromatic:true` 的原子在消毒後確實是芳香原子（對 Mol 做 `[a]` 比對，取原子索引集合）；其他 sp2／sp3 由鍵階與固定 H 隱含（不另設檢查）。
- 鄰接限制：`noHCarbonNeighbors` → 配對清單建立時直接排除（早剪枝，精確）。
- 等價群：列尾必要條件（同群原子的新鍵度與鍵階多重集相同）早剪枝；葉端用**精確的拓樸等價檢查**（`automorphism.ts`：對重原子圖［元素、電荷、H 數、鍵階、芳香旗標］做回溯式自同構軌道計算，不是顏色細化，所以不會漏判「真的等價」也不會誤判；每個葉最多做一次）。同群所有原子必須落在同一個軌道。
- 簽名相同原子的對稱剪枝（§1.3 第 2 點）。
- 必含子結構：葉端對同一個 Mol 做 `get_substruct_matches`（查詢解析一次，§1.1 做法 C，約 8 µs／次）。
- 葉端順序（便宜的先做）：價數／鄰接已在搜尋中保證 → RDKit 解析一次（消毒失敗即拒）→ canonical 去重 → 芳香檢查 → 必含子結構 → 等價群 → 應變規則 → 合理性。
- 正確性驗收方法見 §4：暴力法列舉＋獨立篩選必須與新窮舉器完全相同。

### W4 評分雙向（`evidenceLedger.ts`，`useV12Constraints` 控制）
- 在 1H 評分中新增項目（`ScoreLedgerEntry`，`sourceModality:'1H_NMR'`，`compatibility:0`，`weight>0`，所以會拉低分數）：
  1. **預測多出的環境**：全域配對（既有 `hAssignment`）之後，沒有被任何觀測配到的預測環境，每個加一筆，權重 `unmatchedPredictedWeight`（預設 0.8，與一個未配對的觀測等重）。豁免／減輕：(a) 可交換 H 環境（`isExchangeable`）權重乘 `exchangeableUnmatchedFactor`（預設 0.25）；(b) 重疊：若預測環境與已配對的預測環境的位移差 ≤ `overlapShiftPpm`（預設 0.10），而且該觀測的積分 ≈ 兩環境 H 合計（容許 `h1IntegralTolerance`），則兩者視為同一個重疊訊號，不扣；(c) 1H 涵蓋未確認完整時乘 `incompleteCoverageUnmatchedFactor`（預設 0.5）。
  2. **環境數**：`N_pred`（非可交換）與 `N_obs`：`compatibility = exp(−(Δ/σ)²)`，`Δ = max(0, N_pred − N_obs − 重疊合併數)`，`σ = envCountSigma`（預設 1.0），權重 `envCountWeight`（預設 0.6）。
  3. **積分比**：觀測積分（以 k 換算 H 數）與預測 H 數逐一比較（既有的比例高斯），再加「預測 H 總數（非可交換）與觀測 H 總數」一筆，權重 `integralTotalWeight`（預設 0.6）。
- **圖片權重**：既有 `evidenceLedger.ts:127` 對非 IR 的圖片來源 ×0.5。改為 config `imageSourceWeightFactor` 套用到所有模態（含 IR），預設值見問題 3（建議 1.0＝不降權）。
- 分數仍是 `UNCALIBRATED_COMPATIBILITY`；新常數都在 `v12Config.ts`，標明未校準。
- `useV12Constraints=false`：上述三項不產生、圖片權重維持原樣（×0.5、IR 不降）。

### W5 化學合理性（`structurePlausibility.ts`）
- 新增規則 `HEMIACETAL_ACYCLIC`：非環狀、非羰基的 sp3 碳，同時接 ≥1 個游離 OH 與 ≥1 個其他 O（醚／酯氧）→ 半縮醛／半縮酮；`ORTHOESTER_ACYCLIC`：非環狀 sp3 碳接 ≥3 個 O。**環狀者保留**（糖型半縮醛）；縮醛／縮酮（兩個 OR、沒有 OH）不受影響。證據例外：沿用現有機制（沒有新增例外）。
- 開啟環／鍵應變規則：`pipelineStrainProfile = 'SURGE_INSPIRED'`（v12 時；v1.1.8 行為維持 `null`）。
- 規則放在 `PlausibilityRule` 型別與 `PLAUSIBILITY_CONFIG`；`useV12Constraints=false` 時兩條新規則不啟用。

### W6 IR 強度統一
- 規則：有描線（`irPixelCurve`）時，所有 IR 峰（含手動標記）的 `y` = 描線在該 x 的穿透率（與 v1.1.8 重新偵測峰相同定義）；沒有描線時，手動標記的 `y` = `100·(plotBottom − py)/(plotBottom − plotTop)`（0–100% 穿透率，不再乘 0.85、不再反向）。`pixelToPhysicalIntensity` 的 IR 分支改成這個式子；NMR／MS 分支不動。
- `measureSpectrumSignals` 的 IR 分支：穿透率方向的 `normalizedIntensity` 改以「吸收深度」計（相對基線 100% 的深度，最深者 = 100），讓 `relativeIntensity`／`normalizedIntensity` 的方向是「越強越大」；這會改變 v1.1.8 測試 T1 中「`normalizedIntensity` 與 `y` 同序」的預期（需要逐項更新並說明）。
- 畫面上標記位置不變（待 §1.4 的確認）。證據與 N／合理性判定走 `prepareIR` 的結果，不受影響。
- 影響範圍檔案：`spectrumParser.ts`、`SpectrumViewer.tsx`（若它用 `y` 畫位置，需要同步）、`signalCharacterizationEngine.ts`；`useV12Constraints=false` 時全部維持現狀。

### W7 跨分子式（k）排名
- 對每個分子式假設：k ∈ {1,2,3}（及額外 OH 0–2）中可行的組合各建立 `InventoryAlternative`（W1），各自窮舉；候選合併、去重（同一個結構可由多個 (k) 得到，記錄來源）；以 W4 的雙向評分比較，排名不分 k。
- `generateForCompositions`：每個 (formula,k,extra) 一個 run；預算公平分配沿用現有機制（先按分子式、再按讀法／替代解讀）。k 與額外 OH 記在診斷。
- 沒有積分時沿用 v1.1.7（k 取 `symmetryMultiple`）。

### W8 組成推斷面板（只列資料欄位；UI 設計在階段 4 另行審核）
新增兩個區段的資料（`compositionPanelModel` 擴充，additive）：
- **由 1H 推得的原子清單**（每個分子式假設的每個 (k,額外 OH)）：訊號表（位移、積分、最簡比、H 數、類別、每原子 H、原子數、是否等價、單峰規則是否套用）；替代解讀數與是否被截斷（`INVENTORY_ALTERNATIVES_TRUNCATED`）；芳香環模板（環數、各環 CH 數、取代型式）；不可用時顯示原因（沒有積分等）。
- **實際套用的約束**：必含子結構（id、SMARTS、依據的觀測）、等價群、鄰接限制、釘住 H 的原子數、`useV12Constraints` 狀態；以及 W4 的環境數與扣分摘要（未配對預測環境數、豁免數）。

---

## 4. 正確性論證（W3）

**目標集合**：給定一個替代解讀（原子清單＋環模板＋必含子結構），T = 所有能被 RDKit 消毒的連通分子 M，滿足：元素與分子式一致；存在一個把清單原子對應到 M 原子的方式，使每個原子的元素、H 數、鄰接限制符合，`aromatic` 原子為芳香，同群原子在 M 中拓樸等價，每個必含子結構至少有一個比對。窮舉器要輸出的正是 T（相對該替代解讀）。

**論證**：
1. 搜尋變數是新鍵矩陣（§3 之前的設計不變）；所有早剪枝都是 T 中任何分子的必要條件：容量／單位數（固定 H 使每個原子的新鍵度精確等於 `價數 − H − 片段內鍵階和`）、連通性、鄰接限制（配對根本不存在）、同群原子度數與鍵階多重集相同（等價的原子必然相同）。
2. 葉端檢查都是精確的：芳香用 RDKit 消毒後的原子旗標；必含子結構用 RDKit 比對（存在性、允許重疊）；等價用精確的軌道計算（不是顏色細化，沒有漏判）。因此通過葉端的分子恰好是 T 的元素。
3. 對稱剪枝：lex-leader 用於「完整屬性簽名相同」的原子（元素、固定 H、cap、forced、group、旗標）。這種原子的互換是問題的對稱（它保持分子式、固定 H、群成員資格、必含子結構的有無、等價群的成立與否），所以每個軌道至少留下一個代表（與 stage 1 的論證相同）。簽名不同的原子不互換。環模板內部的自同構仍不剪枝（只影響效率）。
4. 因此在預算內走完的執行是 COMPLETE；其餘標 INCOMPLETE（含 `INVENTORY_ALTERNATIVES_TRUNCATED`）。
**前提／限制**：RDKit 規範化與消毒的行為；等價群的語意是「嚴格拓樸等價」，對重疊的多重峰可能過嚴（問題 2）；單峰規則只在 §3 W1-4 的條件下成立（二階效應、長程耦合不考慮）。
**暴力法對照測試設計**：獨立實作（不 import 窮舉器）：對清單原子，用 mol block 列舉所有鍵階矩陣（每個原子的剩餘價必須補滿＝固定 H 的定義），再依序獨立篩選：連通、RDKit 消毒去重、`[a]` 比對檢查芳香原子集合、RDKit 子結構比對、等價群用「對所有原子置換暴力檢查自同構」（≤ 9 個重原子；不用回溯演算法）。結果的 canonical SMILES 集合必須與窮舉器完全相同；案例限制在 ≤ 9 個重原子（暴力法的上限）。

---

## 5. 測試計畫（只用自編的通用合成案例）

| 組 | 內容 |
|---|---|
| 原子清單單元測試 | 積分→H 數（含 k=2）；等價 H 的分解替代（2×CH3／3×CH2／6×CH）與排序；單峰規則的條件（重疊時不套用、可交換 H 不套用）；位移類別重疊產生多個替代；額外 OH 0–2；沒有積分→`NOT_AVAILABLE`；替代數超過上限→截斷與原因；環模板（環數、`ch`、取代型式） |
| 對稱雙芳環型 | 通用「二芳基＋2 個等價 CH3」型：1H 4:4:2:6（芳香多重峰＋單峰）、C15H16、k=2；目標 2,2-二苯基丙烷必在輸出中，且等價群使鄰／間位各自等價 |
| 叔丁基型 | 9H 單峰＋AA'BB' 兩個 2H 雙峰＋1 個可交換 OH、C10H14O：目標 4-叔丁基酚（含酚 C–O）必在輸出；叔丁基碳 H=0（單峰規則） |
| 乙基酯型 | q 2H、t 3H、5 個芳香 H、C9H10O2：必含乙基；輸出包含乙基苯甲酸酯型 |
| 對二甲氧基苯型 | 4H 單峰（等價）＋6H 單峰、C8H10O2：輸出包含對二甲氧基苯 |
| **重疊正反對照** | 同一組輸入：新語意（原子清單＋重疊必含子結構）輸出**包含**含酚 C–O 的目標；舊語意（v1.1.7 讀法：苯環片段＋C–O 片段、不重疊）**不包含**（§1.5 已量測：C6H6O 0 個、C7H8O 含芳基 OH 0 個）。兩邊都用測試固定住 |
| 窮舉器正確性（階段 2 停點） | 暴力法對照（§4）：每個通用案例的 SMILES 集合完全相同；含等價群、鄰接限制、`aromatic`、必含子結構各自單獨的對照；對稱剪枝前後輸出相同 |
| 評分 W4 | 預測多出的環境扣分；可交換／重疊豁免；環境數與積分比；圖片權重一致；舊旗標維持原行為 |
| 合理性 W5 | 非環狀半縮醛／原酸酯被拒；環狀半縮醛保留；縮醛不受影響；有證據例外沿用 |
| IR 強度 W6 | 描線時 y＝描線穿透率；無描線時像素換算 0–100%；標記畫面位置不變；`normalizedIntensity` 方向；數值檔路徑黃金結果不變；v1.1.8 的 T1 預期更新並逐項說明 |
| k 排名 W7 | 同一分子式 k=1–3 的組合各自窮舉，雙向評分排序 |
| **旗標黃金** | 實作開始前在 `fcc2bda` 的程式碼上擷取黃金結果（候選、runs、狀態、termination、評分帳本重點欄位；IR 標記與峰表），`useV12Constraints=false` 時逐項相同 |
| 既有 | 既有 380 個 vitest 與 21 個 E2E 全數通過、不改預期（若必須改，逐項寫原因，例如 W6 的 `normalizedIntensity` 預期） |

---

## 6. 效能預估與預算

量測（本節所有數字來自本機單次量測）：
- 搜尋速度約 6.4M 步／秒（stage 1 T6）；RDKit 規範化 0.14 ms／個；子結構比對 8 µs／次（§1.1 C）；完整評分 300 個候選約 2.3 s（v1.1.7 剖析）。
- **釘 H＋環模板的案例（§1.3）：63–614 步、≤ 2 ms／替代解讀**；沒有環模板則 4500 萬–1.5 億步仍未完成。所以環模板是效能前提。
預估（典型 1H＋IR 案例，4–6 個 1H 訊號、2–3 個分子式、k 組合 ≤ 6、替代解讀 ≤ 64）：
- 窮舉：替代解讀總數 ≤ 64×6×8（分子式）≈ 3000 個，每個多數在 ms 級；上限情況按 §1.3 的最壞量級（單一替代解讀仍可能因為芳香環拆法不足而達數秒）。**預估 1–10 秒**，仍保留既有 15 秒窮舉預算與公平分配。
- 葉端新增成本（芳香檢查＋子結構 3 次＋軌道檢查）預估每葉 < 1 ms（軌道檢查未量測，階段 2 量測後回填）。
- 評分：維持評分上限 300；W4 新增項目只在配對後做，預估 +10%。
- 整體：沿用既有結構（窮舉 15 s＋補跑舊搜尋 ≤ 8 s＋評分數秒），**最壞約 30 s，典型 ≤ 15 s，遠低於 120 秒保護逾時（餘裕 ≥ 4 倍）**。若實測超過，先調 `maxInventoryAlternatives` 與環拆法上限，不放寬保護逾時。

---

## 7. 分階段實作計畫

| 階段 | 內容 | 檔案 | 測試 | 停點 |
|---|---|---|---|---|
| 0（本文件） | 設計 | `docs/P1C_DESIGN.md`、`scripts/scratch/*` | — | 等你審核 |
| 1 原子清單 | `v12Config.ts`（旗標與常數）、`shiftClasses.ts`、`atomInventory.ts`（含環模板與替代解讀上限）、`inventoryAdapter.ts`（清單→`FragmentAlternativeSet`，此階段只用現有窮舉器能表達的部分）；**先擷取 v1.1.8 黃金結果** | `src/engines/constraints/*`、`tests/v12/atomInventory.test.ts`、`tests/goldens/v12Legacy.v118.json` | 清單單元測試、旗標黃金、全套 | 不停（接階段 2） |
| 2 窮舉器屬性與必含子結構 | W3＋W2（`automorphism.ts`、`leafChecks.ts`、`rdkitAdapter` 新函式、`problem/search/enumerate/types` 改動、`requiredSubstructures.ts`） | `src/engines/enumeration/*`、`src/engines/constraints/requiredSubstructures.ts`、`tests/v12/*` | **暴力法對照、正反對照、對稱剪枝前後相同、四個通用案例、量測葉端成本** | **完成後停下回報正確性測試** |
| 3 評分、合理性、IR 強度、k 排名 | W4、W5、W6、W7 | `evidenceLedger.ts`、`structurePlausibility.ts`、`spectrumParser.ts`、`signalCharacterizationEngine.ts`、`structureGenerator.ts`／`exhaustiveGenerator.ts`、`candidateGenerator` | W4–W7 測試、IR 黃金、既有全套（逐項說明預期改動） | 不停（接階段 4 的設計） |
| 4 面板 | 先寫 `docs/P1C_PANEL_DESIGN.md` 停下審核；通過後實作 W8、E2E、版本 1.2.0、CHANGELOG（逐項 UI 文字）、PR（merge commit）、health 輪詢、同步、zip、`notes\v1.2.0\REPORT.md` | `compositionPanelModel.ts`、`CompositionPanel.tsx`、E2E | 面板模型與 E2E、全套 | 設計後停下 |

---

## 8. 風險、未確認事項與需要你決定的問題

**風險**
- 環模板的替代解讀數（環數×CH 分配×取代型式×H 分解×k）可能爆炸；以 `maxInventoryAlternatives` 截斷並標 INCOMPLETE，真實資料上的實際數量**未量測**。
- 等價群「嚴格拓樸等價」在多重峰重疊時可能過嚴，排除掉真目標（問題 2）。
- 單峰規則只在簡化條件下成立（二階效應、長程耦合不考慮）。
- 位移類別表的數值是工程預設，**未逐一對照原書**（未確認）。
- `measureSpectrumSignals` 對 IR 方向的修正會改變 v1.1.8 測試 T1 的一條預期，並可能影響檢視器；階段 3 先寫測試確認。
- Worker 內的子結構比對耗時未量測（Node 內量測）。
- 原子清單把整個問題變成「所有原子 H 都釘死」的圖實現；若 1H 積分有誤（過度雜訊），整組替代解讀都錯。這是 Sherlock／LSD 型方法本質上的風險；缺少校準資料，本版不處理（僅用 W4 雙向評分在排名端反映）。
**未確認**：Worker 內量測；`SpectrumViewer` 標記是否純用像素定位；位移類別表的來源頁碼；NMR 預測器對所有環系的對稱類別是否與精確軌道一致（預測器用自己的 `computeAtomSymmetryClasses`，W3 的軌道檢查是獨立實作，兩者可能在少數結構上不一致，W4 不需要它們一致）。

**需要你決定的問題**
1. `useV12Constraints` 的預設值：開發階段 false；**1.2.0 發佈時預設 true**，可以嗎？
2. 等價群的嚴格度：預設對所有訊號嚴格等價，**但多重性為 `m`／`unresolved`／寬峰的訊號不要求等價**（config 可調），可以嗎？（嚴格會排除重疊多重峰的真目標；放寬會多一些候選。）
3. 圖片權重一致的方向：(a) 移除 NMR 的 ×0.5（所有模態 1.0），(b) 對 IR 也乘 0.5，(c) 其他？建議 (a)。
4. **W1 必須加入「芳香環模板」**（§1.3 量測：只釘 H 不夠，60 秒仍未完成）。環數上限 3、取代型式全列、由等價群與必含子結構篩選；可以嗎？
5. 位移類別表（§3 W1-5）的數值與替代規則：用我列的工程預設，還是你提供表（或指定教科書）？
6. W6 是否一併修正 `measureSpectrumSignals` 的 IR `normalizedIntensity` 方向（§1.4 發現，會更新 v1.1.8 T1 的一條預期）？
7. W5 範圍：只剔除非環狀的「sp3 碳同時接 OH 與其他 O」（半縮醛／半縮酮）與「≥3 個 O」（原酸酯型）；縮醛／縮酮（兩個 OR、沒有 OH）保留，可以嗎？
8. W7 的 k 上限 3 與額外可交換 H 上限 2：維持任務描述的設定，替代解讀總數上限 64，可以嗎？
9. 沒有 1H 積分時（沿用 v1.1.7 彈性原子路徑），W2 的必含子結構作為葉端篩選是否啟用？（我預設啟用，因為不影響列舉速度。）
