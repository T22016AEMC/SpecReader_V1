# parse 修正量測（第二十站 A；分支 v1.4.1，本機）

**結論：量測本身全部通過（0 個名次變差、0 個分數降低、候選集合與排序不變、所有 golden 通過）；但有 2 個現有測試的**「期望值」**會因為拆旗標而必須改，依規則我沒有改預設、沒有改任何期望值，等你決定。**

## 做了什麼
- 在 `V12_CONFIG.v140` 加旗標 `parseFix`（**預設 false**），閘函式 `v140ParseFixActive() = parseFix || useV140H1`（`planningGate.ts`），`evidenceLedger.ts` 改讀它。預設與 `useV140H1` 的行為與修改前逐位相同（測試 `tests/v14/v140ParseFix.test.ts`、`v140Bug`、`v140Subflags` 通過）。
- 比較兩個狀態（預設設定，不開 v1.3.x 以外的任何東西）：**base**＝v1.4.0 旗標全關（出貨預設）；**pf**＝只開 `parseFix`（`useV140H1`、`useV141IR` 皆關，v140 其他子旗標維持預設）。pf 狀態在測試內印出確認：`useV140H1=false、useV141IR=false、parseFix=true`。
- 暫存測試在 `notes/v1.4.1/_scratch_src/pf*.ts`（不入 commit），原始輸出 `PF_*.json`、`PF_PROBE.txt`，分析腳本 `pf_an_quick.js`、`pf_an_flow.js`。

## 哪些候選會受影響
`ChemistryEngine.parseStructureInput(<字串>)` 把「只有字母與環數字、沒有分支與雙鍵」的 SMILES 當分子式，丟掉結構（`parseStructureInput(s).smiles === ''`），1H／13C 預測回傳 0 個環境。實測同一批結構在字串形式有 0 個環境、`{smiles}` 形式有 1–6 個。

| 候選 | 環境數（字串→{smiles}） | 1H 分（base→pf） | 總分（base→pf） |
|---|---|---|---|
| 甲醇 CO | 0→2 | 0.0→93.3 | 20.9→68.9 |
| THF C1CCOC1 | 0→2 | 0.0→71.4 | 28.0→68.5 |
| 環戊烷 C1CCCC1 | 0→1 | 0.0→100.0 | 11.0→65.6 |
| 環己烷 | 0→1 | 0.0→100.0 | 11.0→65.6 |
| 環己醇 | 0→5 | 0.0→37.5 | 20.9→43.2 |
| 環己胺 | 0→5 | 0.0→21.9 | 28.0→44.9 |

（每個候選拿「它自己的預測 ¹H 峰表」當輸入，所以數字是自洽性上限，不是任何真實譜圖的準確度。）

## 各組量測
| 項目 | 結果 |
|---|---|
| 43 個排名樣本整套流程（`executeSixStepAnalysis`，step budget，各 2 次） | 目標名次 **0 個改變**（0 變差／0 變好）；候選集合 43／43 相同；3710 個候選的分數 0 個不同；排序 0 個不同。**3710 個候選裡「字串形式會被當分子式」的是 0 個**（pf 與 base 各自統計皆 0）。 |
| 台帳池重算（每樣本前 30 名＋目標，769 次；≥2 候選的樣本 764 次） | 0 次分數變動、0 次降低；池內裸字串候選 0 個。 |
| 55 個真實結構面板（每個結構對自己的預測 ¹H 峰表打分） | 15 個結構受影響（環氧乙烷、環氧丙烷、氧化環己烯、縮水甘油、環氧氯丙烷、縮水甘油甲醚、氧雜環丁烷、THF、1,4-二氧六環、四氫糠醇、2-甲氧基四氫哌喃、1,3-二氧五環、1,3,5-三噁烷、2-羥基四氫呋喃、2-羥基四氫哌喃）：1H 分 0→33–100、總分 27.96→50–84；**0 個降低**；其餘 40 個逐位不變；沒有「變動但不是裸字串」的結構。 |
| 31 個單化合物譜（Fulmer／文獻 ¹H 表） | 5 個受影響（THF 28.0→78.1、1,4-二氧六環 28.0→78.8、甲醇 20.9→67.3、環己烷 11.0→61.8、18-冠-6 28.0→76.9）；**0 個降低**；其餘 26 個不變。 |
| 旗標關閉 golden（預設設定＋parseFix 開）：irNumericGolden、legacyGolden、v132／v131／v130／v123Baseline、v121FlagGolden、evidenceLedger、tests/v14 全部 | 31 檔 502 測試：500 通過、**2 失敗**（見下）。所有 golden 檔全部通過（irNumericGolden 1、legacyGolden 2、v132Baseline 44、v131Baseline 13、v130Baseline 15、v123Baseline 35、v121FlagGolden 13、evidenceLedger 4）。log：`notes/v1.4.1/_pf_golden_parsefix.log`（1867 s；期間機器上另有非本任務的大量 CPU 程序，結果不受牆鐘影響）。 |

沒有任何候選的分數降低，因此沒有「無法解釋的下降」。13C：這幾組輸入都沒有 ¹³C 譜，所以 ¹³C 端沒有被量到（預測器對 ¹³C 同樣丟掉結構，修正對 ¹³C 的影響在有 ¹³C 譜時才會出現）。

## 會失敗的 2 個測試（期望值依賴「修正跟著 useV140H1」）
兩個都不是 golden，而是專門釘住「這項修正只受 `useV140H1` 管」這個舊設計的測試：
1. `tests/v14/v140Bug.test.ts`〈the candidate ledger〉「flag off (v1.3.2): THF and methanol get no 1H support … flag on: they do」：用 `useV140H1` 切「關／開」；預設下修正生效後，「關」那一格的 THF 分數（92.2／89.3）不再低於「開」那一格＋10。
2. `tests/v14/v140Subflags.test.ts`〈the THF / methanol parse fix follows useV140H1 alone〉：期望 `useV140H1` 關時 THF／甲醇是 v1.3.2 的空預測值。

若要把修正預設打開，**這兩個測試的切換方式與期望值必須改**（切換變數改成 `v140.parseFix`、描述改成「修正有自己的旗標」；期望的數值關係不變）。依你的規則（需要改期望值就停下來），我**沒有**把預設改成 true，也沒有改這兩個測試。

## 要打開預設時的最小改動（尚未做）
1. `v12Config.ts`：`parseFix: false` → `true`；`planningGate.ts`：`v140ParseFixActive = () => V12_CONFIG.v140.parseFix`（不依賴 `useV140H1`）。
2. 上面 2 個測試改成用 `parseFix` 切換（期望數值關係不變）。
3. 發布說明草稿第 1 項補「預設下有一項新修正」，並把 1.2、3、7 節的「預設下不生效」改掉。
4. 之後重跑旗標關閉 golden（本次已用 parseFix 開的狀態跑過，結果同上）。

---

# 第二十一站：parseFix 預設改為 true（使用者已決定）

## 改了什麼
1. `v12Config.ts`：`v140.parseFix` 預設 `false` → **`true`**；`planningGate.ts`：`v140ParseFixActive = () => V12_CONFIG.v140.parseFix`（**不再 `|| v140H1Active()`**）。`useV140H1`、`useV141IR`、其他 v140／v141 旗標預設值不變。
2. 兩個你同意要改的測試，只改切換變數（數值關係與其他斷言不變）：
   - `tests/v14/v140Bug.test.ts`〈the candidate ledger〉「flag off (v1.3.2): THF and methanol get no 1H support …」：改前 `V12_CONFIG.useV140H1 = false` 取 off 分、`= true` 取 on 分；改後 `V12_CONFIG.v140.parseFix = false` 取 off 分、`= true` 取 on 分（斷言 `onThf > offThf+10`、`onMe > offMe+10` 不變）。另外兩行：`was` 多記 `pf`、`afterAll` 還原 `parseFix`。
   - `tests/v14/v140Subflags.test.ts`〈the THF / methanol parse fix …〉：改前 `describe('… follows useV140H1 alone')`、`score(m)` 只切 `useV140H1`；改後 `describe('… is switched by v140.parseFix alone')`、`score(m, parseFix)` 多切 `parseFix`：`off = score(M.off, false)`、`offGroupsOff = score([false,false,false], false)`、`fixOnly = score(M.h1OnGroupsOff, true)`、`both = score(M.both, true)`（斷言不變；`was`／`afterAll` 多還原 `parseFix`，檔頭註解一句）。
3. **第三個測試也必須改（我停下來問過，你選「改成斷言新語意」）**：`tests/v14/v140ParseFix.test.ts`〈useV140H1 on gives the fix whatever parseFix says〉（第二十站我新增、釘住 `||`）。改前：`score(true,false)` 的 THF／甲醇 ¹H 分 >10 且等於 `score(true,true)`；改後：`useV140H1` 開而 `parseFix` 關時 THF／甲醇分數等於兩者皆關的值（0），`score(true,true)` 的 THF／甲醇分 >10。同檔另一個 `it`（parseFix 單獨給修正）、第三個 `it`（甲苯不變）不動。

## 重跑量測（預設設定 vs v1.4.0 旗標全關＋parseFix 關）
- 兩個狀態：**base**＝所有 v140／v141 旗標關、`parseFix` 關；**pf**＝來源預設值一個都沒動（`useV140H1=false`、`useV141IR=false`、其他 v140 子旗標維持預設、`parseFix=true`；腳本在載入時讀取來源預設並驗證，輸出 `state` 有記錄）。
- 43 個排名樣本整套流程（各 2 次）：目標名次 **0 個改變**（0 變差／0 變好）；候選集合 0 個不同；3710 個候選的分數 0 個不同；排序 0 個不同；排名清單中裸字串候選 0 個。（輸出 `PF21_FLOW.json`）
- 台帳池重算 769 次：**0 次分數變動、0 次降低**。
- 55 個結構面板：15 個結構受影響，¹H 分 0→33–100、總分 27.96→49.96–83.85，**0 個降低**，其餘 40 個逐位不變。
- 31 個單化合物譜：5 個升（THF 28.0→78.1、1,4-二氧六環 28.0→78.8、甲醇 20.9→67.3、環己烷 11.0→61.8、18-冠-6 28.0→76.9），**0 個降低**。
- 以上與第二十站（只開 parseFix）的結果逐項相同。旗標關閉 golden 與整套的結果見第二十一站 D。
