# P1b 階段 3：組成推斷面板 UI 設計（待審核，尚未實作）

狀態：**設計稿。UI 尚未實作**；等使用者審核後才實作（階段 4）。
範圍：Mode A 結果頁（第 3 頁「化學判讀與結構推論」）新增一個**唯讀、可收合**的「組成推斷（分子式假設）」面板。不改既有版面結構，不新增輸入，不改任何分析結果。

## 1. 位置與收合行為

- 位置：第 3 頁，在既有的 `generation-status` 區塊（`App.tsx` 約 2780–2782 行：狀態訊息、「組成來源：…」、局部結構假設清單）**之後**、候選結構清單之前。既有元素的順序與樣式不動。
- 只在分析完成後顯示（`completedAnalysis` 存在）；分析進行中或尚未分析時不顯示（既有的「六步驟化學推理」面板已顯示進行中的進度）。
- 資料已變更（既有的 `analysisStale`）時：面板標題旁顯示「資料已變更，以下為舊結果」，內容不更新，與既有「資料已變更，請重新分析」一致。
- 收合：用原生 `<details>`，**預設收合**；收合時摘要列（`<summary>`）仍顯示一行重點：
  `組成推斷（分子式假設）｜<組成狀態>｜<N 個分子式假設>｜窮舉 <完整／未完整／未使用>`
  展開後的內部分段各自也是 `<details>`（理由、元素線索、限制），預設只有「分子式假設表」展開。
- `data-testid`：`composition-panel`（外層）、`composition-hypotheses`（表）、`composition-limitations`。

## 2. 資料來源（欄位對應，唯讀）

| 面板內容 | 欄位 |
|---|---|
| 組成狀態 | `result.compositionInference.status`（USER_FORMULA／INFERRED／INSUFFICIENT_DATA／INVALID_USER_FORMULA） |
| 分子式假設 | `compositionInference.hypotheses[]`：`formula`、`dbe`、`symmetryMultiple`（k）、`massBasis`、`massErrorDa`、`massErrorPpm`、`relativeConfidence`（`calibrated: false`）、`sizeConfirmed`、`support`／`contradiction`／`unknown`（`CompositionReason`：`text`、`source`、`strength`、`observationIds`）、`generatorSupported`、`unsupportedElements`、`searched` |
| 該分子式的窮舉結果 | `reasoningTrace.compositionSearch.runs[]`（以 `hypothesisId` 對應假設 `id`；使用者分子式時只有一筆）：`candidates`、`visited`、`termination`、`diagnostic`、`symmetry`、**`enumeration`**（`EnumerationRunDiagnostic`：`used`、`complete`、`incompleteReasons`、`fallbackReason`、`readings[]`、`incompatibleReadings`、`candidates`、`relaxedToFormulaOnly`、`legacySupplement`、`rejected`、`notes`） |
| 窮舉總覽 | `solvedConstraintSpace.searchResult.enumeration`：`used`、`complete`、`enumerated`、`scored`、`deferred{count,samples,prefilter}`、`maxScoredCandidates` |
| N 證據 | `compositionInference.nitrogenEvidence`：`mode`、`allowed`、`note`、`reasons[]` |
| 元素線索 | `compositionInference.elementClues[]`（`element`、`minimum`、`strength`、`text`、`source`）、`elementsConsidered`、`elementsExcluded[]`（`element`、`reason`） |
| 邊界 | `compositionInference.bounds`（碳範圍、氫倍數、雜原子下限、DBE 下限、`hardBoundsRelaxed`） |
| 限制 | `compositionInference.limitations[]`＋下列固定句 |

不新增任何 API 或型別；所有欄位在本版已存在。格式化邏輯放在純函式模組 `compositionPanelModel.ts`（輸入結果物件，輸出面板需要的列與文字），元件只負責呈現，方便單元測試。

## 3. 版面與文字（繁體中文）

### 3.1 摘要列（收合時可見）
`組成推斷（分子式假設）｜<狀態標籤>｜<N> 個分子式假設｜窮舉：<完整（COMPLETE）／未完整（INCOMPLETE）／未使用（舊搜尋）／無分子式>`

狀態標籤：
| status | 標籤 |
|---|---|
| USER_FORMULA | 使用者分子式（硬限制） |
| INFERRED | 由光譜推斷（假設，非確認） |
| INSUFFICIENT_DATA | 資料不足，不猜測分子式 |
| INVALID_USER_FORMULA | 使用者分子式無效 |

### 3.2 分子式假設表（預設展開）
欄位（由左至右）：

| 欄 | 內容 | 規則 |
|---|---|---|
| 排序 | 1…N | 依 `compositionInference.hypotheses` 順序 |
| 分子式 | `formula` | 含不支援元素時加註「生成器不支援：<元素>」 |
| DBE | `dbe` | |
| k | `symmetryMultiple`，空值顯示「—」 | 欄名提示（title）：「對稱單元倍數：總 H ≈ k × 單元 H；沒有 1H 積分時為 —」 |
| 質量依據 | USER_FORMULA→「使用者分子式」、HRMS→「高解析 MS」、LOW_RES_MS→「低解析 MS」、NONE→「無質量依據」 | 有 `massErrorDa` 時附「誤差 x.xxxx Da（y.y ppm）」 |
| 相對信心（未校準） | `relativeConfidence` 以百分比顯示 | **欄名固定含「未校準」**；欄名提示：「各假設間的相對比較，不是機率，也沒有以實測準確度校準」 |
| 大小 | `sizeConfirmed`：true→「質量已確認」、false→「大小未確認」 | |
| 窮舉結果 | 見下 | |

「窮舉結果」格的內容（依該分子式對應的 run）：
- 使用窮舉器且 complete：`N 個候選｜完整（COMPLETE）`；附小字「只相對於目前分子式與片段約束，不代表所有可能結構」。
- 使用窮舉器但未完整：`N 個候選｜未完整（INCOMPLETE：時間預算／步數預算／候選上限／已取消）`。
- 另有補跑舊搜尋：加「＋舊 beam 搜尋補充 M 個」。
- 放寬為純分子式（`relaxedToFormulaOnly`）：加「片段讀法與分子式矛盾，已放寬為只依分子式」。
- 退回舊搜尋（`used = false`）：`N 個候選｜舊 beam 搜尋（原因：<fallbackReason>）`。
- `searched = false`：`未搜尋（<原因：排名在前 8 之外／含生成器不支援的元素>）`。
- 展開（點列）：各讀法一行 `讀法 k：<局部結構 id 與種類>｜完整／未完整｜候選 n｜與分子式不相容時顯示原因`。

### 3.3 窮舉總覽（表下方一行）
`共列舉 <enumerated> 個候選，其中 <scored> 個進入完整評分；<deferred.count> 個超過評分上限（<maxScoredCandidates>）而保留但未評分。`
有預排序時加：`未評分的候選依「拓樸氫環境數不得少於觀測 1H 訊號數（<h1Required>）、碳等價類不得少於觀測 13C 訊號數（<c13Required>）」排在後面；通過 <passing> 個、未通過 <failing> 個。`
沒有使用窮舉器時整行不顯示。

### 3.4 展開區段（各自可收合，預設收合）
1. **支持／矛盾／未知理由**：每個假設一組，三個子清單；每條理由顯示 `text`、來源標籤（MS／MS 同位素／13C／1H／IR／假設／使用者／規則）、強度（硬／軟）。
2. **氮證據**：標題「氮（N）證據：<EVIDENCE 有專屬證據／EVEN_ION_ONLY 只有偶電子離子（不足）／NONE 沒有 N 專屬證據>」，內文 `note`，下列 `reasons[]`。
3. **元素線索**：`element ≥ minimum`（強度、來源、`text`）；「已排除的元素」列出 `element` 與 `reason`。
4. **邊界**：`碳 <範圍>；氫為 <倍數> 的倍數；雜原子下限 <…>；DBE ≥ <…>`；`hardBoundsRelaxed` 為 true 時加「硬邊界已放寬」。

### 3.5 限制（固定文字，一律顯示，預設展開）
- 「分子式是假設，不是確認；使用者分子式永遠優先並作為硬限制。」
- 「相對信心沒有校準，只表示假設之間的相對比較。」
- 「窮舉完整性只相對於目前的分子式、片段讀法與禁止規則（COMPLETE），不代表列出所有可能結構；未完整時請看原因。」
- 「片段讀法由光譜推得的局部結構轉成：H 數不固定（彈性原子），不是已確認的取代數。」
- 再接 `compositionInference.limitations[]` 的每一條。

## 4. 空狀態與錯誤
- `status = INSUFFICIENT_DATA`：表格位置顯示「資料不足，沒有可列舉的分子式假設」，仍顯示元素線索與限制。
- `status = INVALID_USER_FORMULA`：顯示「使用者分子式無效，沒有推論；請修正分子式」。
- 假設為空但狀態是 INFERRED：顯示「沒有任何假設通過硬限制」並列出 `bounds`。
- 資料欄位缺漏（舊結果沒有 `enumeration`）：窮舉結果格顯示「—」。

## 5. 測試計畫（階段 4）
- vitest：`compositionPanelModel.ts` 的各列與文字（4 種狀態、k 空值、質量依據四種、未校準欄名、窮舉結果六種情況、預排序文字、空狀態）。
- E2E 至少 1 支：合成資料＋使用者分子式 → 開始分析 → 面板存在且預設收合；展開後出現「未校準」「完整（COMPLETE）」「只相對於目前分子式與片段約束」；改資料後出現「資料已變更，以下為舊結果」。
- 既有 vitest 與 E2E 全部要通過；不改任何既有預期值。

## 6. 需要審核時決定的事
1. 預設收合是否可以（面板可能很長）？或預設展開？
2. 「相對信心」是否顯示百分比，還是只顯示名次與相對長條（避免被誤讀成機率）？
3. 窮舉結果格是否要列出各讀法（局部結構 id 與種類），還是只顯示彙總（目前設計是點列展開）？
4. 「不納入任何讀法」的局部結構（例如分子式沒有 O 時的 HYDROXYL）是否要在面板中列出？（目前只在診斷備註）
5. 補跑舊搜尋與放寬為純分子式的標示是否夠清楚，或需要更醒目的徽章？
