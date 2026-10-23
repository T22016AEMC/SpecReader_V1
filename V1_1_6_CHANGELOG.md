# V1.1.6 — N 需要專屬證據、1H＋IR 組成推斷、對稱單元假設

基準 v1.1.5（`d33c540`），分支 `claude-mode`。中間版本，P1b（v1.1.7 完整窮舉器）與 P1c 將接續。**UI 無變更。** 本版只有工程測試結果，不宣稱任何化合物的辨識準確率。

## 一、N 需要 N 專屬證據

新增 `src/engines/composition/nitrogenEvidence.ts` 的 `assessNitrogenEvidence`，在 `createReasoningPlan` 中計算一次，結果放在 `ReasoningPlan.nitrogenEvidence` 與 `CompositionInferenceResult.nitrogenEvidence`。

N 專屬證據（任一即可，視窗常數在 `compositionConfig.ts`）：
- IR：一級胺 N–H 雙峰（3300–3550 cm⁻¹ 內兩峰相距 50–120）；C≡N 2210–2260 cm⁻¹；硝基 1500–1570＋1300–1390 兩帶；醯胺 I 1630–1695＋醯胺 II 1510–1580 兩帶。
- ¹³C 105–125 ppm 只在同時有 IR C≡N 帶時才列入腈證據的說明（單獨不算）。
- MS：使用者確認的分子離子，未確認時取排名第一、未被不合理丟失排除的分子離子假設；中性名義質量為奇數即為證據。
- 使用者分子式含 N。

依情境區分（規劃者決定）：
- **EVIDENCE**：有任一專屬證據，行為與 v1.1.5 相同。
- **EVEN_ION_ONLY**：有 MS 但分子離子為偶數名義質量，且沒有其他 N 證據 → N 仍允許（只能成對出現），每個 N 扣 `weights.nitrogenEvenIonOnly`（1.5），並在理由中註明。
- **NONE**：沒有任何 N 證據且沒有可用的 MS → N 完全排除；模糊的 O／N 訊號預設歸 O，只在文字中註記「也可能是 N，但無 N 專屬證據」。

### 檢查過的 N 入口與處理

| 檔案 | 入口 | v1.1.6 處理（NONE 時） |
|---|---|---|
| `scientificEngines/atomicChemicalEnvironment.ts` | 1H 規則 `hetero-ns`（2.1–4 N/S）、`acetal`、`aromatic-h`（C/N）、`exchange-h`、`acid-h`；13C 規則 `n-s-c`、`acetal-c`、`nitrile-c`、`aryl-hetero-c`、`acid-derivative-c` | `inferSignalEnvironments` 新增選填參數 `{nitrogenAllowed}`：為 false 時移除 `nitrile-c`，其餘規則的 N 鄰居改為 O，並在 support 註記。**預設值為 true**，`nmrEngine.ts` 的兩個呼叫（:877、:1760）未改，所以 nmrEngine 與 Mode B 的輸出不變 |
| `reasoning/hypothesisGenerator.ts` | IR 胺家族／醯胺 N–H > 3000 → AMINO；13C `nitrile` 環境 → NITRILE；環境鄰居含 N 時另加 AMINO／NITROGENATED 競爭分支 | 寬 3300 的胺解讀改成 HYDROXYL（附註記）；IR 腈家族不建立假設；環境改用 `nitrogenAllowed:false`；不建立 N 競爭分支 |
| `reasoning/localStructureInference.ts` | AMINO／NITROGENATED → C–N 片段；NITRILE → C≡N 片段 | 不需改：上游不再產生這些假設，所以沒有 N 片段 |
| `reasoning/sixStepAnalysis.ts` `planningSearchHints` | 局部結構含 N 原子或約束官能基含胺／醯胺／腈／硝基時 `nitrogen:true` | NONE 時強制 `nitrogen:false` 並加 `nitrogenForbidden:true` |
| `scientificEngines/deNovoGraphSearch.ts` | 無目標分子式時，`hints.nitrogen` **或只要有 `neutralMass`** 就把 N 放進原子字母表 | 新增 hint `nitrogenForbidden`，為 true 時不放 N（有目標分子式時仍由分子式決定；搜尋演算法與上限未改） |
| `composition/functionalGroupBounds.ts` | 胺 → N≥1；醯胺 → N≥1；腈 → N≥1；硝基 → N≥1、O≥2 | 胺改為 O–H／C–O（O≥1）、醯胺改為羰基、腈與硝基不建立；另把「IR 寬 3200–3600」與「1H 寬可交換峰」作為 O≥1 的兩個模態（兩者都有即為硬下限） |
| `composition/inferComposition.ts` | 有質量路徑 N 上限取 Golden Rule 1；無質量路徑 N 上限＝下限＋2 | NONE 時 N 上限 0，`elementsExcluded` 列出 N；EVEN_ION_ONLY 時允許但扣分 |
| `composition/compositionScoring.ts` | 沒有 N 官能基時每個 N 扣 0.2 | 新增 EVEN_ION_ONLY 扣分；EVIDENCE 時不再扣 0.2 |
| 未改的入口（記錄） | `DeterministicStructureGenerator` 在沒有 `searchResult` 時的同步退路（測試與相容入口才會走到）仍用 `graphSearchHints`，不經 `planningSearchHints`；`chemicalFeatureEngine` 的官能基共識可能含 N 官能基，只影響顯示與舊評分器，不影響候選生成 | — |

## 二、1H＋IR（無質量、無 13C）也推組成

`inferComposition` 新增路徑：沒有使用者分子式、沒有可用質量、沒有 13C，但有 1H 積分時：
- H = k × S（S＝最簡整數比總和）＋ 0–2 個可能缺失的可交換氫，k = 1–3（`h1OnlyMaxMultiple`）。
- C = k × V ＋ 0–4（`h1OnlyInvisibleCarbonMax`），V＝非可交換、非自動溶劑候選的 1H 訊號數；H 與 C 用同一個 k。
- 雜原子下限來自 IR／1H 官能基特徵（含軟證據）；N 依第一節的關卡。
- 每個假設標 `massBasis:'NONE'`、`sizeConfirmed:false` 與「無質量依據，分子大小未確認」；仍輸出 `elementClues`。
- 使用者分子式仍是唯一硬性假設；Seven Golden Rules 規則不變。
- 沒有 1H 積分時維持 `INSUFFICIENT_DATA`。

## 三、對稱單元假設

- `CompositionHypothesis.symmetryMultiple`：總 H 最接近 k × S 的 k（各路徑都有；1H-only 路徑即列舉時的 k）。
- `structureGenerator.ts`：`symmetricUnit`（每個觀測群組取一個代表局部結構，SUPPORTED 優先）與 `replicateUnit`（第 2…k 份加上 `#j` 後綴的 id 與觀測 id，讓生成器能接合每一份）。k ≥ 2 時把 k 份單元（required fragments，數量 = k × 單元片段數）連同原有局部結構傳給 deNovoGraphSearch。
- 搜尋後只**檢查**候選的組裝來源是否用到全部必要片段（`candidatesContainingAllCopies`），不過濾。
- 沒有候選時輸出診斷（`CompositionSearchRun.diagnostic` 與 `compositionSearch.note`）：必要片段的重原子數是否超過分子式、搜尋的狀態數與終止原因、已傳入的片段數；註明舊 beam 搜尋對大分子可能無法完成組裝，完整窮舉留待 v1.1.7。
- beam 搜尋的上限與演算法未改。

## 四、既有測試預期值的變動

只有兩項，都是本人在 P1a 新增、依本版規格必須改變的測試（原始 145 個測試的預期值全部未改）：

| 測試（`tests/composition.test.ts`） | 舊預期 | 新預期 | 原因 |
|---|---|---|---|
| 「marks every hypothesis without a mass as size-unconfirmed」最後一行 | 只有一個有積分的 1H 峰 → `INSUFFICIENT_DATA` | 只有一個**沒有積分**的 1H 峰 → `INSUFFICIENT_DATA` | v1.1.6 起 1H 有積分時會列舉分子式 |
| 「without mass and 13C reports element clues…」 | 有積分的 1H（醛＋芳香）→ `INSUFFICIENT_DATA`、不枚舉、退回無分子式搜尋 | 同一組訊號但**不帶積分** → 同樣的斷言 | 同上；帶積分的情形改由 `tests/v116Nitrogen.test.ts` 驗收 C 測試 |

## 五、新增測試

`tests/v116Nitrogen.test.ts`（13 個，全部使用合成峰表）：驗收 A（無 N 證據時假設、片段、元素線索、組成、搜尋字母表與候選都沒有 N；模糊訊號歸 O；環境規則的預設行為不變）、B（IR 腈、N–H 雙峰、含 N 使用者分子式、MS 奇偶）、C（1H＋IR 的 k 倍數列舉與標註、使用者分子式覆蓋）、D（必要片段數量 = k × 單元、副本 id 不重複、失敗診斷、事後檢查計數）。

## 六、其他

- `package.json` 版本 1.1.6（`/api/health` 自 v1.1.5 起直接讀取 package.json）。
- 新增常數（皆在 `compositionConfig.ts`）：`irAmineDoubletRange`、`irAmineDoubletSeparation`、`irNitrileRange`、`irNitroAsymRange`、`irNitroSymRange`、`irAmideIRange`、`irAmideIIRange`、`c13NitrileEvidenceRange`、`irBroadXHRange`、`h1OnlyMaxMultiple`、`h1OnlyInvisibleCarbonMax`、`weights.nitrogenEvenIonOnly`。

## 已知限制

- **三級胺、吡啶等沒有 IR 專屬證據的含 N 結構，在「無 MS、無使用者分子式」時不會被列舉**；使用者自行輸入含 N 的分子式即可繞過。這個取捨留到 v1.2.0（完整性評分）再評估是否加入「低信心 N 備選」。
- 1H-only 路徑把每個非可交換 1H 訊號當成一個帶 H 的碳環境；重疊的多重峰（例如 5H 芳香 m）會讓碳數偏低，只能靠 0–4 個不可見碳部分補償。
- 對稱單元只複製「每個觀測群組的一個代表局部結構」；競爭解讀（例如對位／間位）不另外複製。
- 舊 beam 搜尋對 17 個重原子左右的分子可能仍無法組裝出候選（本版只輸出診斷）；完整窮舉在 v1.1.7（P1b）。
- 寬 3300 加上可交換 1H 在沒有 N 證據時一律視為 O–H，若實際是 N–H（例如二級胺單峰），需要使用者提供分子式或其他證據。
- 組成結果與診斷仍未顯示在 UI（P1c）。
