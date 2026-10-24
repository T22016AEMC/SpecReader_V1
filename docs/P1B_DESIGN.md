# P1b（v1.1.7）設計：片段組裝式窮舉器

狀態：**階段 1（核心窮舉器，純模組，尚未接線）已完成**。階段 2–4 尚未開始；本文件其餘章節會隨各階段補上。
事實基礎：`docs/P1B_FACTS.md`。所有可調常數：`src/engines/enumeration/enumerationConfig.ts`。

用語：本文件與程式輸出中的 **COMPLETE 只代表「在這次請求的分子式、片段與禁止規則下，所有分支都走完、沒有碰到任何上限」**。任何地方都不得說成「列出所有可能的結構」。

---

## 1. 檔案（階段 1）

| 檔案 | 內容 |
|---|---|
| `src/engines/enumeration/types.ts` | 請求／結果型別（見第 2 節） |
| `src/engines/enumeration/enumerationConfig.ts` | 價數表、預算預設、讓出事件迴圈的時間片、應變設定檔等所有常數 |
| `src/engines/enumeration/problem.ts` | 分子式解析、片段驗證、把請求變成「組裝問題」（原子、固定鍵、新鍵需要的鍵階單位數）；所有可明確回報的錯誤都在這裡 |
| `src/engines/enumeration/search.ts` | 核心回溯搜尋（`Searcher`）：可暫停、可取消、確定性 |
| `src/engines/enumeration/enumerate.ts` | 驅動：交替集合、預算、讓出事件迴圈、RDKit 規範化與去重、禁止規則、結果彙整 |
| `src/engines/enumeration/molBlock.ts`、`strain.ts` | mol block 產生；選用的環／鍵應變規則 |
| `tests/enumeration/*` | T1–T6、獨立暴力法、通用合成片段 |

## 2. 介面

```ts
enumerateStructures(req: EnumerationRequest): Promise<EnumerationResult>

EnumerationRequest {
  formula: string | Record<string, number>        // 例 "C3H8O" 或 {C:3,H:8,O:1}（含 H）
  alternatives?: FragmentAlternativeSet[]          // 省略／空 = 純分子式列舉（單一空集合）
  forbid?: { plausibility?: PlausibilityEvidence;  // 既有 structurePlausibility 規則與證據例外；省略 = 關
             strain?: 'SURGE_INSPIRED' | profile | null }  // 選用；省略 = 關
  budget?: { timeMs, maxStates, maxCandidates, shouldCancel, onProgress }
}
FragmentAlternativeSet { id; fragments: FragmentSpec[] }       // 一種對光譜的解讀；各集合各自執行，結果聯集
FragmentSpec { id; atoms: {element, fixedH?, charge?, open?}[]; bonds: {a,b,order(1–3),aromatic?}[]; count? }
EnumerationResult {
  status: 'COMPLETE' | 'INCOMPLETE' | 'INVALID_REQUEST'
  incompleteReasons: ('TIME_BUDGET'|'STATE_BUDGET'|'CANDIDATE_LIMIT'|'CANCELLED'|'INVALID_ALTERNATIVE_SET'|'ALTERNATIVE_SET_NOT_RUN')[]
  candidates: {smiles /* RDKit canonical，不含立體 */, alternativeSetIds}[]   // 依 smiles 排序
  errors, sets /* 每個集合的 complete / error / visited / leaves / newCandidates */, stats /* visited, leaves, elapsedMs, rejected */
}
```

語意（與規格一致）：
- **closed** 原子不得再接新鍵；價數未飽和（價數 − 鍵階和 − 固定 H ≠ 0）是錯誤 `CLOSED_ATOM_UNSATURATED`，明確回報。
- **open** 原子的剩餘價 = 價數 − 已有鍵階和 − 固定 H，必須全部由新鍵補滿，不補隱含 H。
- **自由原子** = 分子式 − 所有片段原子（count 已乘入）；自由原子的 H = 價數 − 鍵階和，總 H 必須等於「分子式 H − 片段固定 H」。
- 價數：C 4、N 3、O 2、F/Cl/Br/I 1、S 2（S 的 4／6 價未支援，`allowHypervalentS=true` 會被拒絕而不是被忽略）。帶電原子的價數查 `chargedValence`（N⁺ 4、N⁻ 2、O⁺ 3、O⁻ 1、…）；**自由原子永遠不帶電荷**，硝基等帶電基團由片段提供（帶電原子可以是 open，例如硝基以 N⁺ 接上）。
- 鍵階 1–3；最終分子必須單一連通。
- 錯誤不丟例外，而是 `errors`：`INVALID_FORMULA`、`UNSUPPORTED_ELEMENT`、`UNSUPPORTED_CONFIG`、`EMPTY_MOLECULE`、`TOO_MANY_ATOMS`、`DUPLICATE_FRAGMENT_ID`、`INVALID_FRAGMENT`、`INVALID_BOND`、`FRAGMENT_OVERVALENT`、`CLOSED_ATOM_UNSATURATED`、`FORMULA_ELEMENT_SHORTAGE`、`FORMULA_HYDROGEN_SHORTAGE`、`FORMULA_HYDROGEN_EXCESS`、`VALENCE_PARITY`、`RDKIT_UNAVAILABLE`。某個替代集合無法表達時，其他集合照常執行，總狀態為 INCOMPLETE（原因 `INVALID_ALTERNATIVE_SET`）；全部都無法表達才是 `INVALID_REQUEST`。
- `aromatic` 旗標只是資訊：鍵階以 Kekulé 階數給定，芳香性由 RDKit 消毒時判定（沒有用它做化學判斷）。

## 3. 演算法

### 3.1 把問題化成「新鍵矩陣」
原子 = 片段原子（每份複製各一組）＋自由原子（依元素分組，同元素連續）。固定鍵 = 片段內的鍵。要決定的是**新鍵**：一個對稱矩陣 N，`N[i][j] ∈ {0,…,3}`（i<j）。每個原子的新鍵度 `d_i = Σ_j N[i][j]`：
- open 原子：`d_i = 剩餘價`（必須補滿）；closed 與剩餘價 0 的原子：`d_i = 0`；
- 自由原子：`d_i ≤ 價數`，其餘由隱含 H 補；
- 總鍵階單位數 `U = Σ_{i<j} N[i][j]` 必須等於 `B = (Σ_open 剩餘價 + Σ_free 價數 − H_free) / 2`（`H_free` = 分子式 H − 片段固定 H）；B 不是非負整數時回報 `VALENCE_PARITY`／`FORMULA_HYDROGEN_EXCESS`。這一條同時保證自由原子的 H 總數等於分子式剩餘 H。
- 整個圖（固定鍵 ＋ 新鍵）必須連通；片段內已經有鍵的原子對不得再放新鍵。

### 3.2 搜尋
`Searcher`（`search.ts`）依列優先順序（上三角）逐一為每個「還能放鍵的原子對」選 0–3，是**迭代式回溯**（明確的堆疊，不用遞迴），所以可以在任何一步暫停，由驅動程式檢查時間／取消並把事件迴圈讓出（`setTimeout(0)`，沿用既有做法）。每一步固定順序（值由小到大、原子對依索引），所以同輸入走同一條路徑。記憶體只有與原子數成正比的陣列、鍵堆疊、以及已找到的候選集合（上限 `maxCandidates`）。

只剪掉「必然不可能成為葉」的分支（每條都是任何合法完整矩陣的必要條件）：
1. `U ≤ B`；剩餘單位數 `rem = B − U` 需滿足 `2·rem ≤ 剩餘總容量` 且 `2·rem ≥ 剩餘 open 需求`（每放 1 單位用掉 2 個容量，最多滿足 2 個 open 需求）。
2. open 原子：這一列做完時 `d_i` 必須等於剩餘價；做列中途，剩餘需求不得超過右邊還能提供的容量。
3. **連通性**：用可回復的 union-find 維護元件數 c，需要 `c − 1 ≤ rem`；一列做完後，若某元件的原子全部已完成（索引 ≤ 該列）而且不是整個分子，必死。
4. 已完成列的自由原子上固定的 H 總和不得超過 `H_free`。
5. 提早的禁止規則（只用「單調」規則，見第 4 節）。
葉：所有原子對都決定，`U = B`、連通、通過下面的「複製片段互換」檢查 → 組 mol block → RDKit。

### 3.3 對稱：避免同一分子被重複產生（lex-leader）
問題本身的對稱群 G 由兩種置換生成：**同元素相鄰自由原子互換**，以及**相鄰兩份相同片段複製整份互換**（count>1）。對任一排列矩陣 x 定義鍵 `key(x) = (各原子新鍵度向量, 上三角矩陣依列優先)`，並在 G 的每個生成元 σ 上要求 `key(x) ≤ key(σx)`。
- 這是 lex-leader 約束：在 x 所屬軌道中 key 最小的那個元素滿足所有這些約束，所以**每個軌道至少留下一個代表**（軌道 = 彼此只差原子重新編號的矩陣），只用生成元（而非整個群）也成立，只是去重比較不徹底。
- 自由原子互換 (a, a+1)：列 a+1 做完時就能判定（度數先比；度數相同再逐欄比第 a、a+1 欄，欄序由小到大跳過 a、a+1，第一個不同處要求 `M[k][a] < M[k][a+1]`），所以在搜尋中途即可剪枝。
- 複製片段互換：只在葉檢查（用完整的鍵比較）。片段本身的自同構（例如對位苯環兩個 open 位置互換）**沒有**用來剪枝；這些重複由 RDKit 規範 SMILES 去重處理（正確性不受影響，只是多做幾次 RDKit 呼叫）。
- 不同軌道仍可能是同一個分子（例如不同的片段放法）→ 由 RDKit canonical SMILES 去重，並記錄是哪些替代集合產生的。

### 3.4 為什麼相對約束是完整的
設 M 為任一符合下列條件的分子：連通、鍵階 1–3、符合價數、H 總數等於分子式、含有每個片段（依指定位置與鍵）。把 M 的原子依問題的編號對應過去，M 的新鍵矩陣 x 滿足 3.1 的所有條件。
1. 3.2 的剪枝每一條都是 x 滿足的必要條件，因此 x 的整條路徑不會被剪掉，除非被 3.3 的約束剪掉。
2. 對 x 所在的 G 軌道取 key 最小者 x*：x* 也是合法解（只是重新編號，仍是同一個分子），且滿足所有 lex-leader 約束，所以 x* 會被搜尋走到並成為葉。
3. 同構的分子在 RDKit 下有相同的 canonical SMILES（RDKit 的規範化對圖同構不變），所以葉的 canonical SMILES 集合 ＝ 所有合法分子的 canonical SMILES 集合。
前提（誠實列出）：(a) RDKit 規範化是同構不變的；(b) RDKit 消毒失敗的候選被丟棄（計入 `rejected.sanitizeFailed`）——所以結果是「RDKit 能消毒的那些」；(c) 完整性只對「約束」而言，與真實化合物是否合理無關。
這個論證由測試印證，不取代測試：T1（公開計數）、T2（手算）、T3/T4（與獨立暴力法逐 SMILES 比對）。

### 3.5 預算與狀態
- `INCOMPLETE` 的原因：`STATE_BUDGET`（步數用完）、`TIME_BUDGET`、`CANDIDATE_LIMIT`（再出現第 `maxCandidates+1` 個**不同**候選時才停；剛好用滿且搜尋結束仍是 COMPLETE）、`CANCELLED`、`INVALID_ALTERNATIVE_SET`、`ALTERNATIVE_SET_NOT_RUN`（預算已用完，後面的集合沒有執行）。
- 預算（時間、步數、候選數）由所有替代集合共用。
- 確定性：同一輸入、同一步數預算 → 位元相同的輸出（含被步數預算截斷時）。以**時間**截斷時，截斷點取決於機器速度，所以不保證相同——這是時間預算的本質。
- 輸出依 canonical SMILES 排序；被 `CANDIDATE_LIMIT` 截斷時，留下哪些候選由搜尋順序決定（確定性）。

## 4. 禁止規則

- 預設全部關閉（供計數測試）。
- **`forbid.plausibility`**：傳入既有 `PlausibilityEvidence`，語意與 `structurePlausibility.ts` 完全相同（含證據例外）。做法：葉上對 canonical SMILES 呼叫既有的 `plausibilityViolations()`（權威判定），並記錄被拒的規則。為了早剪枝，另外只實作**單調**的規則（鍵一旦放下就不會消失、且與 `plausibilityViolations()` 逐字等價的條件）：沒有使用者分子式時不放 O–O 鍵（PEROXIDE）；沒有 N–O 證據時不放 N–O 鍵（N_O_N／N_DI_OH／N_O_LINK 都需要 N–O 鍵，所以一併排除）。其他規則（GEM_DIOL、ENOL、AMINAL 看氫與環；KETENE、CUMULATED_N 牽涉芳香鍵階的判讀）不是單調或可能與 Kekulé 階數判讀不一致，**只在葉判定**。測試 `forbid.plausibility equals "all candidates minus plausibilityViolations()"` 用既有函式當對照，證明早剪枝沒有多剪（C2H6O2、CH5NO、C2H7NO、C3H6O2，三組證據）。片段本身若已含被早剪枝的鍵，問題回報零候選（COMPLETE），不會去搜。
- **`forbid.strain`（選用的環／鍵應變設定檔）**：參考 Surge 論文（McKay、Yirik、Steinbeck，J Cheminform 2022，PMC9034616）與 README 對預設「避免集合」的描述。**我只讀了描述文字，沒有看或複製任何 Surge／nauty 原始碼，也沒有宣稱與 Surge 的 `-B` 集合等價。** 我實際實作了三條自己的規則（`ENUMERATION_CONFIG.strainProfiles.SURGE_INSPIRED`）：
  1. `TRIPLE_BOND_IN_SMALL_RING`：三鍵位在大小 ≤ 7 的環內（README 描述「no triple bonds in rings up to length 7」）；
  2. `CUMULATED_CENTRE`：原子有兩條雙鍵、其餘鄰居只有 H（論文 Table 2 對 `-B5` 的描述「No atom has two double bonds and otherwise only hydrogen neighbours」）；標芳香旗標的鍵不算雙鍵；
  3. `MULTIPLE_SMALL_RINGS`：任一原子在超過 1 個大小為 3 或 4 的環上（論文對 `-B9` 的描述「No atom lies on more than one cycle of length 3 or 4」）。
  Surge 的其他避免集合（Bredt 規則變體、K33／K24、A=A=A 的其他形式等）、使用者自訂的禁止子結構、平面性、五員環數限制：**本版沒有實作**。這些規則在葉判定。

## 5. 去重與規範化
RDKit canonical SMILES，不含立體（mol block 的座標全為 0，RDKit 不建立構象，不感知立體；另有安全網：若輸出仍含 `/ \ @`，移除後重新規範化）。Kekulé 形式經消毒自然合併。無法消毒的候選丟棄並計數。已拒絕的 SMILES 最多記 `maxTrackedRejected` 個，超過時 `rejected.approximate = true`（各規則的計數可能重複計算同一結構）。

## 6. 規則 7 的調查：既有 LocalStructure／GraphSearchHints 有沒有「開放價」資訊（影響階段 2 轉接器）

事實（`src/engines/reasoning/types.ts:20-26`、`localStructureInference.ts:9`）：
- `LocalStructureHypothesis.atoms` 只有 `{element}`——**沒有固定 H 數、沒有電荷、沒有芳香旗標**。
- `ports:{atom, availableValence}[]` 是機械算出的「價數 − 鍵階和」，對每個原子都列出（只要大於 0）。它的語意在 `unknown` 欄位寫得很清楚：「開放價數可由 H 或未知取代基滿足」——也就是**可選的**開放價，不是「必須接新鍵」。
- 例：`ALKYL`＝單一 C，ports=4；`CARBONYL`＝C=O，C 的 ports=2、O 的 ports=0；`ETHYL`＝C–C，兩個 C 的 ports 各 3。這些片段的真實 H 數與「哪些價必須接其他片段」光譜沒有給。
- 舊搜尋（`deNovoGraphSearch.ts:94`）把 port 當成「可以接一個新原子或片段」的位置，沒有「必須補滿」的概念，剩餘價最後由隱含 H 補上。

對階段 2 的含意（現在只記錄，不做決定）：階段 1 的 `FragmentSpec` 需要每個原子的 `fixedH` 與 `open`；既有 `LocalStructureHypothesis` 不含這兩項。轉接器必須對每種片段種類自己規定 H 與 open 的解讀（例如 `ALKYL` 的 C 可能是 CH3、CH2 或 CH），而這些解讀是推論，不是光譜直接給的。這一點在階段 2 開始前需要與你確認（見階段 1 回報的未確認事項）。

## 7. 階段 1 測試結果（只含工程 pass/fail 與量測）

（數字在本機、Node 24.22.0、單次執行；T6 只量測不設斷言。）

| 項目 | 結果 |
|---|---|
| T1 烷烴 CnH2n+2，n=1..10 = 1, 1, 1, 2, 3, 5, 9, 18, 35, 75（OEIS A000602，已連線核對：a(0..10) = 1,1,1,1,2,3,5,9,18,35,75） | pass |
| T1 附加：飽和無環 CnH2n+2O，n=1..7 的醇數 = 1,1,2,4,8,17,39（OEIS A000598，烷基自由基數，等於烷醇數）；其餘皆為醚 | pass |
| T2 C2H6O=2、C3H8O=3、C4H10O=7、C3H6=2、C3H4=3、C2H4O=3、C4H8=5（手算推導寫在測試註解；C3H4 與 C4H8 另核對實際結構） | pass，與我的推導一致 |
| T3 與獨立暴力法逐 SMILES 比對：CH5N、C3H9N、C3H7N、C4H9N、C2H5NO、C3H5NO、C3H6O2、C5H10O、C4H8O2 | pass（9 個分子式；最大 6 個重原子） |
| T4(i) 2 苯基＋2 CH3＋1 自由 C = C15H16：輸出恰為 2,2-二苯基丙烷，且與暴力法相同 | pass |
| T4(ii) 對位二取代苯片段＋自由 C2O（C8H10O）；對位苯＋CH3＋硝基（C7H7NO2）；苯基＋CH3＋自由 C2N；兩份相同苯基＋自由 C2O2 | pass（皆與暴力法相同） |
| T5 錯誤與邊界（分子式與片段不一致、closed 未飽和、過價、重複 id、無效鍵、不支援元素、無效／空分子式、替代集合聯集與來源、預算耗盡、取消、確定性、讓出事件迴圈與進度） | pass |
| 禁止規則：plausibility 早剪枝與「全部候選減去 plausibilityViolations()」逐 SMILES 相同；strain profile 效果 | pass |

**T6 量測（本機，單次）**

| 案例 | 候選數 | 步數 | 耗時 | 記憶體增量（heap／rss） |
|---|---|---|---|---|
| C6H14 | 5 | 4,794 | 120 ms（含第一次呼叫暖機） | 約 1 MB／2 MB |
| C8H18 | 18 | 227,872 | 78 ms | 2 MB／3 MB |
| C10H22 | 75 | 14,035,256 | 2,235 ms | 約 0／2 MB |
| 只有分子式 C5H10O | 74 | 17,030 | 39 ms | 1 MB／4 MB |
| 只有分子式 C7H16O | 72 | 189,762 | 79 ms | 1 MB／−5 MB |
| T4(i) | 1 | 63 | 2 ms | 0 |
| RDKit 規範化 10000 個 SMILES（357 種重複使用） | — | — | 1,425 ms（0.14 ms／次） | — |

觀察（事實，不是結論）：烴類的步數約每多 1 個重原子乘 7–8 倍（C8 → C10：約 62 倍）；候選數 C10H22 只有 75，所以葉（196 個）和 RDKit 呼叫不是成本，剪枝前的搜尋步數是。有片段時（T4(i)）搜尋空間小得多。

## 8. 已知限制（階段 1）
- S(IV)/S(VI)、自由原子帶電荷、P、Si、不支援的元素：未實作（以明確錯誤回報）。
- 沒有立體化學。`aromatic` 旗標只是資訊。
- 純分子式（沒有片段）的列舉成本隨重原子數指數成長（見 T6）；`maxAtoms` 預設 40 只是防止誤用，不代表能在時限內走完。
- 複製片段的互換只在葉檢查；片段內部的自同構未用於剪枝（靠 RDKit 去重）。
- 時間預算截斷點不保證確定。
- 只有三條自己的應變規則；Surge 的其他避免集合未實作。
- 本模組只在測試中被呼叫，尚未接到分析流程。
