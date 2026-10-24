# P1b（v1.1.7）設計：片段組裝式窮舉器

狀態：階段 1（核心窮舉器）、階段 2（接到既有流程）、階段 3（面板設計，已審核）、階段 4（面板實作與交付，版本 1.1.7）皆已完成。
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

**決定（使用者審核，方案 A「彈性原子」）與轉接器規則**
1. 窮舉器新增第三種原子模式 **flex**（與 closed、open 並列）：剩餘價（價數 − 片段內鍵階和，帶電時依帶電價數）可由隱含 H 或新鍵補滿，H 數不固定，與自由原子相同；所有隱含 H 的總和必須等於「分子式 H − 片段固定 H」。flex 不可同時設 `fixedH`／`open`。
2. 轉接器把既有 `LocalStructureHypothesis` 的原子**一律轉成 flex**，不自行規定任何片段的 H 數（例如不把 ALKYL 當成 CH3）。片段內部既有的鍵與骨架保留不變。
3. **固定 H 的欄位入口**：`adaptLocalStructures({fixedHydrogens})`，型別 `FixedHydrogenInfo = Record<localId, (number|null|undefined)[]>`（每個原子一個值）。若日後局部結構帶有明確的 H 數資訊（預計在 v1.4.0 由 1H 推得），該原子改為 **open 並固定 H**；沒有這種資訊時一律 flex。**本版沒有任何地方會提供這種資訊**，所以本版所有原子都是 flex；這個入口只由測試使用。
4. **需要電荷才能正確表示的基團**：轉成固定的帶電 closed 形式，只保留與骨架相接的位置（open）。轉換表（`CHARGED_GROUPS`）：
   - 硝基：`R–[N+](=O)[O-]`，N⁺ 為 open（1 個價）、兩個 O 為 closed。依據：硝基只有這一種中性閉殼層寫法。
   - 胺 N-氧化物：`R3N⁺–O⁻`，N⁺ 為 open（3 個價）、O⁻ 為 closed。依據：同上。
   觸發方式：局部結構種類為 NITROGENATED／AMINO，且 `description` 含「硝基／nitro」或「N-氧化物／N-oxide」。**目前 `inferLocalStructures` 產生的 14 種局部結構類型（見下）沒有任何一種會觸發這個轉換**（沒有硝基或 N-氧化物的局部結構類型），所以實際上本版沒有轉換過任何帶電類型；轉換表已實作並以合成的局部結構測試（F3），供日後新增的類型使用。
5. **芳香環**：局部結構只有鍵階時，轉成 Kekulé 形式（六個環原子必須是三條雙鍵、三條單鍵的明確交替，並設 `aromatic` 旗標）；否則（無法判定鍵階或芳香性）該請求改走舊 beam 搜尋，診斷記錄原因，不猜。
6. **無法轉換**的局部結構（類型沒有轉換規則：ION、FRAGMENT、SURFACE；不支援的元素；無效的鍵或鍵階；非明確 Kekulé 的環；讀法數超過上限）：該請求改走舊 beam 搜尋並記錄原因；整體不因此失敗。

本版實際轉換的類型（由 `inferLocalStructures` 產生，每一種都有轉換測試）：

| 類型 | 原子（全部 flex） | 鍵 |
|---|---|---|
| AROMATIC、ARYL_PARA、ARYL_META、ARYL_ORTHO | 6 個 C | 環的 Kekulé 交替鍵（aromatic 旗標）；ARYL_* 的 `substitutionSites` **不當作約束**（見下） |
| ALKENE | C、C | 雙鍵 |
| ALKYNE | C、C | 三鍵 |
| NITRILE | C、N | 三鍵 |
| ALKYL | C | 無 |
| OXYGENATED | C、O | 單鍵 |
| NITROGENATED、AMINO | C、N | 單鍵 |
| HYDROXYL | O（單原子）；或與 AROMATIC 合成的「酚型」7 原子（6 C ＋ O，7 條鍵） | 無；或環加 C–O 單鍵 |
| CARBONYL | C、O | 雙鍵 |
| ETHYL | C、C | 單鍵 |

- `substitutionSites`（ARYL_* 的取代位置）：預設不當作約束。設定 `adapter.useSubstitutionSitesAsOpen = true` 時，取代位置的環碳改為 open 且 H = 0（帶取代基的芳香碳沒有 H）；預設關閉，因為這是從取代位置推出的 H 數，使用者要求不得自行規定片段的 H。
- **單一 flex 原子且沒有鍵的片段（ALKYL、單獨的 HYDROXYL）是空洞約束**：它只說「這個元素存在」，而分子式已經保證（轉接器先檢查元素數量），所以不放進片段集合。這不改變結果，只省掉搜尋對稱成本（F4 實測 flex 版 4.0 s → 1.3 s）。
- **讀法（alternative set）的定義**：每一個觀測由「一個含有它的局部結構」解釋；一個讀法的片段 = 所選局部結構的聯集。同一觀測的不同解釋（例如芳香環、烯、炔都能解釋同一個 1H 訊號）是互相替代的；不同觀測的假設必須同時成立。（以「共享觀測的局部結構」為連通分量的做法會把所有局部結構連成一組，只得到單片段讀法，已改掉。）
- **元素不夠的局部結構**不納入任何讀法（例如分子式沒有 O 時的 HYDROXYL），其觀測保持未解釋，並在診斷註明。
- 對稱單元：每個片段 `count = k`（相同複製可互換）。

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
- （階段 1 當時）本模組只在測試中被呼叫；階段 2 已接到分析流程，見第 9 節。

## 9. 階段 2：接到既有流程

### 9.1 接線
- `src/engines/enumeration/exhaustiveGenerator.ts`：`createExhaustiveGenerator(legacy)` 實作既有 `StructureGenerator` 介面（`structureGenerator.ts:13`）；`structureGenerator.ts` 匯出 `exhaustiveStructureGenerator = createExhaustiveGenerator(deNovoStructureGenerator)`。`generateForCompositions` 在沒有注入 generator 且 `useExhaustiveEnumerator` 為 true 時使用它；注入 generator 的測試路徑與旗標為 false 時，程式路徑與 1.1.7-hotfix.2 相同（見 9.6 的證明）。
- 無分子式（`NO_FORMULA` 模式）、無法轉換的局部結構、沒有片段而重原子數 > `adapter.maxHeavyAtomsWithoutFragments`（10）、窮舉器無法表達（所有讀法都不能表達）時：改走舊 beam 搜尋，原因記在 `search.enumeration.runs[].fallbackReason`（也出現在該分子式的 `diagnostic`）。
- 分子式來源：使用者分子式；或組成假設依相對信心排序，最多 `maxFormulasToEnumerate`（8）個；預算在分子式之間平均分配、沒用完的順延（`generateForCompositions` 的既有做法，窮舉用自己的一組累計值）。每個分子式內，各讀法也平均分配剩餘的時間、步數與候選數（一個讀法用完自己的份額後其他讀法照常執行；只有全域上限、取消或候選總數用滿才會讓後面的讀法「未執行」）。
- **讀法過多**：讀法數超過 `adapter.maxAlternativeSets`（64）時，只列舉前 64 組，結果標為 INCOMPLETE，原因 `READINGS_TRUNCATED`（診斷與面板都會顯示「讀法過多被截斷（只列舉前 64 組）」）；不再因此退回舊搜尋。
- 候選上限：窮舉路徑不再使用 48；改為 `analysis.maxCandidatesPerFormula`（20000，列舉上限）與 `analysis.maxScoredCandidates`（300，進入完整評分的數量）。

### 9.2 評分前的預排序（超過 maxScoredCandidates 時）
**這是篩選啟發式，不是評分**：它只決定「列舉出來的候選超過上限時，哪些先進入完整評分」；不刪除任何候選，沒有任何數字進入任何分數。規則與權重都在 `ENUMERATION_CONFIG.prefilter`（`requireH1Classes`、`requireC13Classes`、`closenessWeightH1`、`closenessWeightC13`、`plausibleFirst`），可調。
`prefilter.ts`：
- 候選的拓樸氫環境數（含氫原子的等價類數）不得少於觀測到的非溶劑 1H 訊號數；碳等價類數不得少於觀測到的 13C 訊號數；不符者排在後面，**不刪除、不評分，並在診斷記錄數量與前 200 個樣本**（`enumeration.deferred`）。
- 通過者之間，環境數最接近觀測訊號數的排前面（環境數比訊號數多代表有未觀測或重疊的訊號）；其次依列舉順序。這一條是規格之外的細化，原因：只取「不得少於」時，前 300 個會是依字母排序的任意候選，實測中 2,2-二苯基丙烷被排到評分範圍之外。
- 沒有被既有合理性閘門接受的連接（過氧、N–O 等，有證據時依證據例外）排在最後。
- 等價類用顏色細化（1-WL）算出（原子顏色 = 元素、電荷、H 數、芳香旗標，逐輪加入鄰居的（鍵階、顏色））。**RDKit.js 這個版本沒有公開「不打破平手的規範原子排序」，所以沒有用 RDKit 的排序**；顏色細化把圖對稱下等價的原子歸成同一類，類數是真實對稱類數的下界。沒有新增套件。
- 完整的對稱與積分配對評分留到 v1.2.0，本版不做。

### 9.3 與規格不同或規格沒寫、需要你確認的決定
1. **窮舉器在分析流程中預設不做早剪枝的合理性規則**（`pipelineEarlyPlausibilityPrune = false`）。原因：既有的 hotfix.1 測試 E 要求「搜尋提出的過氧、偶二醇等，由既有閘門剔除並記錄在 `rejectedCandidates`」；若在搜尋裡提早剪枝，這些候選不會被產生，該測試的前提（`reasons.length > 0`）不成立。預設改由既有下游閘門做唯一的過濾與紀錄，窮舉器只在評分上限生效時把這類候選排到最後。階段 1 的窮舉器參數 `forbid.plausibility` 仍可用且有測試；把旗標改成 true 就恢復階段 1 規格的做法（O–O 與 N–O 在搜尋內剪枝），但需要同時更新測試 E 的前提。
2. **窮舉器未完成（時間或步數預算）時，補跑有界的舊 beam 搜尋並聯集**（`legacySupplementWhenIncomplete`，每個分子式最多 500 ms／10000 步）。結果仍標記 INCOMPLETE。原因：(a) 純靠單原子或小片段的讀法，在 12 個重原子以上就窮舉不完，DFS 的前幾個候選有偏（依字母／搜尋順序）；(b) 既有的 hotfix.1 測試 A（要求有最終候選）與 E 在小預算下需要舊搜尋的多樣性。窮舉成功完成（COMPLETE）時不補跑。
3. **所有讀法都完整走完卻沒有任何分子時**（片段與分子式矛盾，例如 C2H6O 配「C=O」讀法）：放寬成只依分子式窮舉（重原子 ≤ 10），診斷標明 `relaxedToFormulaOnly`；更大的分子改用舊搜尋。原因：既有的 `explicit-analysis` E2E 要求有候選；使用者給了分子式時，公式相容的候選比空結果有用，評分會處理與證據的矛盾。
4. **`useSubstitutionSitesAsOpen` 預設關閉**（見第 6 節）。
5. **預算預設值**（9.5）是依本機量測定的工程預設。

### 9.4 完整性狀態的定義（診斷）
- 每個分子式一筆 `EnumerationRunDiagnostic`：是否使用窮舉器、`complete`、原因、各讀法的狀態與候選數、與分子式不相容的讀法數、列舉數、步數、耗時、被拒絕的統計、轉換紀錄與備註。
- **complete** = 所有能放進分子式的讀法都走完而且沒碰到時間／步數／候選上限；**元素不夠或價數不相容的讀法不算未完成**（它們不可能含有這個分子式的分子）。有其他錯誤的讀法、窮舉被預算截斷、取消，都是未完成。
- 整個分析的 `search.complete` = 所有窮舉執行都 complete；任何一個分子式改用舊搜尋或補跑舊搜尋 → 不是 complete。

### 9.5 預算預設值的依據（`enumerationConfig.ts`）
- 量測（本機，單次）：搜尋約每秒 6.4M 步（C10H22：14,035,256 步 2.2 s）；RDKit 規範化 0.14 ms／次；對 300 個候選的完整評分約 2.4 s（H1 單獨輸入的剖析：第 5 步到第 6 步 2.26 s）；舊 beam 補跑每個分子式約 1 s。
- 設定：`analysis.timeMs` 15 s、`analysis.maxStates` 1e8、`maxCandidatesPerFormula` 20000、`maxScoredCandidates` 300、補跑 500 ms／10000 步。典型案例的剖析（H1 單獨輸入、無分子式，8 個分子式，全部預算用盡）：約 25.6 s，其中窮舉＋補跑 23.2 s、評分 2.3 s；有使用者分子式與緊的片段（2,2-二苯基丙烷型）：約 4.7 s。最壞情況約 15 s ＋ 8 個補跑（約 8 s）＋ 評分數秒，遠低於 `analysisSession` 的 120 秒保護逾時（餘裕約 4 倍）。
- 一開始設 40 s：全預算用盡時整個分析約 52 s，既有 E2E（等待 45 s）剛好卡在邊界，所以降到 15 s；多出來的時間只會多列舉候選，而進入評分的只有 300 個。

### 9.6 階段 2 測試結果（只含工程 pass/fail 與量測）
| 項目 | 結果 |
|---|---|
| typecheck；vitest 全部 | pass；既有 250 個沒有改動，累計 355 個 |
| build；E2E | pass；19/19（既有 15 ＋ hotfix.2 新增 4，沒有改動） |
| F1 flex 與獨立暴力法逐 SMILES 相同：(a) C=O 骨架 C4H8O、(b) 芳香骨架 C8H10、(b2) C7H8O、(c) 兩份相同 flex 片段 C4H10O、(c2) 兩份 C=O C4H6O2、(d) flex 混 open C3H6O、(d2) open 苯基＋flex C=O C8H8O | pass（7 個案例；暴力法不與核心共用邏輯） |
| F2 同一骨架固定 H 並改為 open，輸出是 flex 輸出的子集：C–C 骨架 H=(2,3)、(1,3)、(2,2)、(0,3)、(1,2)、(0,2)；flex 嚴格大於單一固定 H 的讀法 | pass |
| F3 轉接器：14 種既有局部結構類型各一個轉換測試（原子數、鍵、模式、電荷）＋酚型合併結構＋帶電基團（硝基、N-氧化物）＋對稱單元＋讀法定義＋元素不足＋固定 H 入口＋取代位置旗標＋「無法轉換 → 舊路徑並記錄原因」（ION、FRAGMENT、SURFACE、不支援元素、非 Kekulé 環、無效鍵／鍵階、讀法過多） | pass（30 個） |
| 流程 (i) 合成「2,2-二苯基丙烷型」1H＋IR 峰表＋使用者分子式 C15H16：最終候選包含 2,2-二苯基丙烷、`enumeration.complete = true`、狀態 CANDIDATES_FOUND、列舉數 > 48 | pass |
| 流程 (ii) 同資料不給分子式：跑完並明確輸出（模式、狀態碼、每個分子式的 complete／原因或退回舊搜尋的原因） | pass |
| 流程 (iii) `useExhaustiveEnumerator = false`：4 個情境的候選、runs、狀態、termination 與修改前 1.1.7-hotfix.2 的紀錄完全相同（golden 在修改前擷取） | pass |
| 流程 (iv) 分析中取消：約 1.3 s 結束，狀態 CANCELLED，六階段 | pass |
| 流程 (v) v1.1.6／hotfix.1 的 N 關卡與合理性測試（`v116Nitrogen`、`hotfix117*`）在新路徑 | pass，未改動 |

**F4 效能量測**（T4(i) 等級案例，C15H16，本機單次）：

| 版本 | 候選數 | 步數 | 耗時 |
|---|---|---|---|
| open（2 苯基 ＋ 2 CH3 ＋ 1 自由 C，H 固定） | 1 | 63 | 約 2–45 ms（含暖機） |
| flex（2 環 ＋ 2 單原子 flex ＋ 1 自由 C） | 74 | 1,549,263 | 3,998 ms |
| flex（2 環 ＋ 3 自由 C，等價於上一列但單原子 flex 不另佔片段位置） | 74 | 1,549,263 | 1,283 ms |

說明：flex 讓候選從 1 個增為 74 個（骨架上的取代位置不再被固定），步數約為 open 的 24,600 倍；耗時仍在數秒內。第二列比第三列多出的時間，來自單原子 flex 片段不是可互換的自由原子（葉 16,575 個對 5,604 個），所以轉接器把這種空洞片段拿掉（9.1）；管線實際走的是第三列的形式。

**效能問題與影響範圍（依指示列出，沒有改變完整性）**：
- flex 對「小片段＋大分子式」的影響很大：只有一個小片段或單原子的讀法，等於純分子式窮舉。C10H14O2（12 個重原子）的 HYDROXYL 單原子讀法在 3000 萬步內找不到任何完整結構；C10H14O 同一讀法 3000 萬步只找到約 2.4 萬個候選仍未走完。這類請求在預算內會是 INCOMPLETE，結果偏向 DFS 先走到的區域，所以才有 9.3 的補跑與預排序。
- 緊的片段（環＋多份複製）依然在數秒內完成並標為 COMPLETE（流程 (i)：1.5M 步、約 4 s）。
- 片段內部的自同構（例如環的 12 個自同構）仍未用於剪枝；影響只是效率（flex 環案例的葉有 12 倍冗餘），沒有影響完整性。

### 9.7 本階段會改變的使用者可見文字（階段 4 的 CHANGELOG 會逐項列出）
`generationStatus.limits`（顯示於 `generation-status`）：
- 舊：「中性 C/N/O/F/Cl/Br 的有界圖擴展（非稠合芳環／鏈／有限閉環）；正式Worker採12秒／120000狀態、4096前沿、48輸出，可取消；同步相容入口仍採短預算；沒有產品級重原子數拒絕條件，非完整異構物搜尋。」
- 新（窮舉器有被使用時）：「片段組裝窮舉（中性 C/N/O/S/F/Cl/Br/I，鍵階 1–3，S 僅二價；不含立體化學）：每次分析時間 15 秒、100,000,000 步、每個分子式 20,000 個候選上限，超過 300 個候選時其餘保留但不進入完整評分，可取消。COMPLETE 只代表在目前分子式與片段約束下所有分支都走完，不代表列出所有可能結構；INCOMPLETE 會列出原因。舊 beam 搜尋保留為無法窮舉時的退路。」（數字取自 config）
`generationStatus.message`（有候選時）新增一段：「在目前約束下的窮舉完整走完（COMPLETE）／未完整（INCOMPLETE：原因；部分分子式改用舊搜尋：原因），共列舉 N 個，M 個超過評分上限而未評分；」。

## 10. 階段 3／4：組成推斷面板與候選來源標籤（版本 1.1.7）

### 10.1 實作
- `src/engines/enumeration/compositionPanelModel.ts`：純函式模型（輸入分析結果，輸出列、徽章與文字；元件只呈現）。`src/components/CompositionPanel.tsx`：唯讀、可收合的面板，放在第 3 頁 `generation-status` 區塊之後。徽章文字、相對信心的提示文字、補充句、候選來源標籤文字都在 `ENUMERATION_CONFIG.ui`（不寫死在元件裡）。
- 依審核決定：外層預設收合（分子式假設表與限制預設展開）；相對信心不顯示百分比，只顯示名次與相對長條，數值只在滑鼠停留提示（「各假設間的相對比較，不是機率，也沒有以實測準確度校準：<數值>」）；各讀法點列展開；「未納入任何讀法的局部結構」列在各讀法下方，格式「未納入任何讀法：<id／種類>（原因：<原因>）」；窮舉總覽之後固定加「未評分的候選沒有被排除，只是沒有進入完整評分。」。
- 三種琥珀色徽章（固定文字）：「約束已放寬（只依分子式）」（`relaxedToFormulaOnly`）、「含舊搜尋補充」（`legacySupplement`）、「未完整」（窮舉結果不是 complete，包含退回舊搜尋與讀法被截斷）。徽章出現在該分子式的窮舉結果格；任一分子式有任一徽章，收合時的摘要列也附上對應徽章，同種只顯示一次，順序固定。
- 候選來源：窮舉器在結果中記錄每個進入評分的候選的來源（`enumeration.origins`：`ENUMERATOR`、`LEGACY_SUPPLEMENT`、`LEGACY`，以及是否 `relaxed`）。候選卡片的「來源」那一行在有這項資訊時加上「｜候選來源：窮舉器」、「｜候選來源：舊 beam 搜尋（補充）」或（整個請求退回舊搜尋時）「｜候選來源：舊 beam 搜尋（退回）」；約束已放寬時再加「｜約束已放寬」。`useExhaustiveEnumerator = false` 時沒有這項資訊，卡片文字與 1.1.7-hotfix.2 相同。**「退回」是我加的第三個標籤（審核只指定了「窮舉器」與「舊 beam 搜尋（補充）」）。**
- 未納入任何讀法的局部結構：轉接器回報 `excluded`（元素不足，或其觀測在每個讀法中都已被其他局部結構解釋）；讀法被截斷時不宣稱某個結構「不在任何讀法中」。

### 10.2 審核決定（階段 2 與面板設計）
- 階段 2 我自行加入的 9 項行為全部接受（早剪枝預設關、預算耗盡補跑 ≤500 ms 舊搜尋、讀法全不相容時放寬為純分子式、每個觀測一種局部結構取聯集、丟棄無鍵單一 flex 原子、預排序、`substitutionSites` 預設不當約束、預算 15 s／1e8 步／每式 20000 候選／評分 300、帶電基團表）。條件：預排序的規則與權重在 `enumerationConfig.ts` 可調並寫明是篩選啟發式（9.2）；「讀法過多被截斷」標 INCOMPLETE 並記錄原因（9.1）。
- 面板設計五題：預設收合照設計（摘要列要有警示徽章）；相對信心用名次＋長條；各讀法點列展開；列出未納入任何讀法的局部結構；放寬、補跑與未完整用琥珀色徽章。補充 A（候選來源標籤）、補充 B（未評分候選的說明句）。

### 10.3 階段 4 測試
- vitest：`compositionPanelModel`（相對信心沒有百分比與提示文字、三種徽章的條件與摘要列彙總不重複、未納入讀法的列表、補充 B 的文字、各狀態與窮舉結果文字、候選來源標籤）；預排序規則與權重可由 config 調整；讀法被截斷 → INCOMPLETE 與原因；真實結果上的候選來源與面板（完整、放寬、補跑舊搜尋、旗標關閉）。
- E2E：面板預設收合、展開後有固定文字（未校準、完整（COMPLETE）、只相對於目前分子式與片段約束、限制、補充 B）、資料變更後標示舊結果；放寬時收合狀態下摘要列可見琥珀色徽章，候選卡片標示「候選來源：窮舉器｜約束已放寬」。
- 全部：typecheck、vitest 374/374（既有 355 個沒有改動，新增 19）、build、E2E 21/21（既有 19 個沒有改動，新增 2）。
