# v1.4.2 第二十七站：IR 誤殺率與雜原子驗證面板（結果摘要）

> **第二十九站更新（見 `IR_STOP29_REPORT.md`）**：JCAMP 的 µm 軸已在讀取時換算（本檔第 2 節「發現的限制」已解除，60 張峰表用新讀取重建後逐位元相同）；本檔第 3、4 節的六筆誤殺中四筆已被負向證據修正解除（腈門檻 3%、炔 O–H 豁免），剩兩筆是 B 表截斷；二甲碸退步已修；新的留出樣本把凝相樣本數補到腈 12、硝基 11（末端炔仍 6）。**另更正**：本檔第 3(a) 節寫「丙腈 A、B 的 2266 都有標記」，B 表（最強 8 峰）其實沒有 2266。以下為第二十七站當時的內容，不改。

> **第三十四站更新（面板口徑）**：本檔的池內名次改以「**平手算輸**」為主（與目標同分的其他候選都排在目標前面），當時用的「平手算贏」（樂觀名次）只放在括號內作參考。數字由第二十七站既有的輸出檔 `SpecReader/notes/v1.4.2/s27/S27_POOL.json`（每列的 `poolRank.{OFF,ON,NEG}.rank` 與 `.tied`；平手算輸＝rank＋tied）重算，**沒有重跑量測**；重算腳本與完整輸出在倉庫外 `s34/an_panel_tielose.js`、`s34/S34_PANEL_TIELOSE.txt`。改動的只有第 3(a)、3(b)、3(c) 與結尾的池內名次；整套流程排名（`rankedCandidates` 的位置，沒有平手）與 IR 分數不受影響。

分支 v1.4.2，本機，未推送、未升版、未打包、未部署。這一站**沒有改 src 規則**（第一部分 0.2a 的 `strictRange` 是 0.2 指定的小修，另一個 commit f489348）、沒有改任何期望值。
**本檔不含 NIST 譜圖或峰表**（NIST 資料只在倉庫外 `SpecReader/data/nist_ir/`，腳本與原始輸出在倉庫外 `SpecReader/notes/v1.4.2/s27/`）。以下 NIST ID、狀態是中繼資料；誤扣案例列了「最接近的峰位」，是為了說明原因，不是譜圖資料。

## 0. NIST WebBook 使用條款（讀過的頁面與重點）
讀了 WebBook 首頁頁尾與備註、`nist.gov/copyrights-disclaimers`、`nist.gov/srd/public-law`，以及每個 JCAMP 檔頭。
- WebBook 是 NIST Standard Reference Database 69；頁尾：「© 2026 by the U.S. Secretary of Commerce on behalf of the United States of America. All rights reserved. Copyright for NIST Standard Reference Data is governed by the Standard Reference Data Act.」
- SRD 頁：SRD 是商務部長代表美國的版權物，**未經事先許可不得重製、存入檢索系統或以任何形式傳送**；NIST 一般網頁「標明版權的資料除外才算公共資訊」，WebBook 標明版權，所以不適用那條寬鬆規定。
- 每個 JCAMP：`Collection (C) 2018 copyright by the U.S. Secretary of Commerce … All rights reserved`；Coblentz 譜另有 `OWNER=COBLENTZ SOCIETY`。資料免責：NIST 不保證資料無誤。
- 做法：只在本機驗證用、檔案放倉庫外、不入庫不散布；報告只放結論與中繼資料。若之後要在倉庫或發布物放任何 NIST 譜，要先取得許可。
- 抓取：自訂簡短 User-Agent、每次請求間隔 1.5 秒、約 350 次請求，沒有被擋或限流（無 403／429／5xx）。

## 1. 取得的譜（60／63 個化合物；NIST 名稱搜尋，分子式與頁面名稱核對）
選譜規則（固定）：Coblentz 區塊中**第一個凝相**（液膜、溶液、糊、KBr 等）；沒有則 IARPA 液相；再沒有則氣相（Coblentz 氣相、NIST MSDC 氣相、QUANT-IR 第一個）。身分核對：頁面分子式＝預期分子式，且頁面名稱或別名＝我給的名稱之一；**沒有任何化合物因身分不符被跳過**。
跳過 3 個：丁腈（NIST 只有硬拷貝掃描圖、沒有數位化 JCAMP）、4-甲氧基苯甲腈與 4-乙炔基甲苯（NIST 頁面沒有 IR）。苯甲醯胺的名稱搜尋回兩個同名條目，手選 C55210（CAS 55-21-0）。

| 檔 | 類 | 化合物（NIST 名稱） | NIST ID | 相 | 狀態 |
|---|---|---|---|---|---|
| nitrile01 | 腈 | Acetonitrile | C75058 | 凝相 | LIQUID (NEAT) |
| nitrile05 | 腈 | Benzonitrile | C100470 | 凝相 | LIQUID |
| nitrile06 | 腈 | Benzonitrile, 4-methyl- | C104858 | 凝相 | SOLUTION (10% IN CCl4 FOR 3800-1330 CM^-^1, 10% IN CS2 FOR 1 |
| nitrile08 | 腈 | 2-Propenenitrile | C107131 | 凝相 | SOLUTION (10% IN CCl4 FOR 3800-1300, 10% IN CS2 FOR 1300-650 |
| nitrile09 | 腈 | Hexanedinitrile | C111693 | 凝相 | LIQUID (NEAT) |
| nitrile10 | 腈 | Benzyl nitrile | C140294 | 凝相 | SOLUTION (10% IN CCl4 FOR 3800-1300, 10% IN CS2 FOR 1300-650 |
| nitrile13 | 腈 | Propanedinitrile | C109773 | 凝相 | LIQUID |
| nitro01 | 硝基 | Methane, nitro- | C75525 | 氣相 | GAS (20 mmHg, N2 ADDED, TOTAL PRESSURE 600 mmHg) |
| nitro02 | 硝基 | Ethane, nitro- | C79243 | 凝相 | SOLUTION (10% IN CCl4 FOR 3800-1300, 10.1% IN CS2 FOR 1300-6 |
| nitro04 | 硝基 | Propane, 2-nitro- | C79469 | 氣相 | GAS (20 mmHg, N2 ADDED, TOTAL PRESSURE 600 mmHg) |
| nitro06 | 硝基 | Benzene, nitro- | C98953 | 凝相 | SOLUTION (10% IN CCl4 FOR 4000-1330 CM^-^1, 10% IN CS2 FOR 1 |
| nitro07 | 硝基 | Benzene, 1-methyl-4-nitro- | C99990 | 凝相 | SOLUTION (10% CCl4 FOR 3800-1300, 10% CS2 FOR 1300-400) |
| nitro08 | 硝基 | Benzene, 1,3-dinitro- | C99650 | 凝相 | SOLID (MINERAL OIL MULL) |
| alkyne_t01 | 末端炔 | 1-Hexyne | C693027 | 氣相 | gas |
| alkyne_t02 | 末端炔 | 1-Heptyne | C628717 | 凝相 | SOLUTION (10% CCl4 FOR 3800-1333, 10% CS2 FOR 1333-450 CM^-^ |
| alkyne_t03 | 末端炔 | 1-Octyne | C629050 | 凝相 | SOLUTION (10% CCl4 FOR 3800-1330, 10% CS2 FOR 1330-450 CM^-^ |
| alkyne_t04 | 末端炔 | Phenylethyne | C536743 | 凝相 | SOLUTION (10% CCl4 FOR 2.5-7.5, 10% CS2 FOR 7.5-15 MICRON) |
| alkyne_t05 | 末端炔 | Propargyl alcohol | C107197 | 凝相 | （Coblentz，未標） |
| alkyne_t08 | 末端炔 | Cyclohexanol, 1-ethynyl- | C78273 | 凝相 | SOLID (MELT) |
| alkyne_i03 | 內炔對照 | Diphenylacetylene | C501655 | 凝相 | SOLID (SPLIT MULL), FLUOROLUBE FOR 3800-1330 CM^-^1, NUJOL F |
| amide01 | 醯胺 | Acetamide | C60355 | 凝相 | SOLID (SPLIT MULL, FLUOROLUBE FOR 3800-1340 AND NUJOL FOR 13 |
| amide03 | 醯胺 | N,N-Dimethylacetamide | C127195 | 凝相 | （Coblentz，未標） |
| amide05 | 醯胺 | Acetamide, N-phenyl- | C103844 | 凝相 | SOLID (KBr PELLET) |
| amine01 | 胺 | 1-Butanamine | C109739 | 凝相 | LIQUID (NEAT) |
| amine03 | 胺 | Triethylamine | C121448 | 凝相 | SOLUTION (10% IN CCl4 FOR 3800-1300, 10% IN CS2 FOR 1300-650 |
| amine04 | 胺 | Aniline | C62533 | 凝相 | LIQUID (NEAT) |
| amine05 | 胺 | Aniline, N-methyl- | C100618 | 凝相 | LIQUID (NEAT) |
| acid01 | 羧酸 | Acetic acid | C64197 | 凝相 | SOLUTION (10% IN CCl4 FOR 3800-1300, 10% IN CS2 FOR 1300-650 |
| acid03 | 羧酸 | Benzoic acid | C65850 | 凝相 | SOLID (SPLIT MULL) |
| sulfur01 | 含硫 | Dimethyl Sulfoxide | C67685 | 凝相 | LIQUID (NEAT) |
| sulfur02 | 含硫 | Dimethyl sulfone | C67710 | 凝相 | SOLID (SPLIT MULL, FLUOROLUBE FOR 3800-1333 AND NUJOL FOR 13 |
| sulfur03 | 含硫 | Sulfone, methyl phenyl | C3112854 | 凝相 | SOLID (SPLIT MULL), FLUOROLUBE FOR 3800-1330 CM^-^1, NUJOL F |
| sulfur05 | 含硫 | Benzenesulfonamide, 4-methyl- | C70553 | 凝相 | SOLID (SPLIT MULL) |
| sulfur07 | 含硫 | Benzenethiol | C108985 | 氣相 | gas |
| other01 | 磷與其他 | Phosphoric acid, trimethyl ester | C512561 | 凝相 | SOLUTION (SALTED IN CCl4 FOR 3800-1340, SALTED IN CS2 FOR 13 |
| other02 | 磷與其他 | Triethyl phosphate | C78400 | 凝相 | LIQUID (NEAT) |
| other03 | 磷與其他 | Methane, isothiocyanato- | C556616 | 凝相 | SOLID (MINERAL OIL MULL) |
| other04 | 磷與其他 | Methane, isocyanato- | C624839 | 氣相 | GAS (6 mmHg DILUTED WITH N2) |
| other05 | 磷與其他 | Urethane | C51796 | 凝相 | SOLID (SPLIT MULL) |
| other06 | 磷與其他 | Urea | C57136 | 凝相 | SOLID (SPLIT MULL, FLUOROLUBE FOR 3800-1333 AND NUJOL FOR 13 |
| nitrile02 | 腈 | Propanenitrile | C107120 | 氣相 | gas |
| nitrile03 | 腈 | butanenitrile | — | 跳過 | NIST has only a hard-copy scan of the Coblentz spectrum (no digitised JCAMP) |
| nitrile04 | 腈 | Hexanenitrile | C628739 | 凝相 | LIQUID |
| nitrile07 | 腈 | benzonitrile, 4-methoxy- | — | 跳過 | NIST page has no IR spectrum |
| nitrile11 | 腈 | Cyclohexanecarbonitrile | C766052 | 氣相 | gas |
| nitrile12 | 腈 | Isobutyronitrile | C78820 | 氣相 | gas |
| nitro03 | 硝基 | Propane, 1-nitro- | C108032 | 氣相 | gas |
| nitro05 | 硝基 | Cyclohexane, nitro- | C1122607 | 氣相 | gas |
| nitro09 | 硝基 | Benzene, 1-methoxy-4-nitro- | C100174 | 氣相 | gas |
| nitro10 | 硝基 | Benzene, (2-nitroethenyl)- | C102965 | 凝相 | SOLID (PELLET) |
| alkyne_t06 | 末端炔 | 3-Butyn-1-ol | C927742 | 氣相 | gas |
| alkyne_t07 | 末端炔 | 3-Butyn-2-ol, 2-methyl- | C115195 | 凝相 | LIQUID (NEAT) |
| alkyne_t09 | 末端炔 | 2-Propynoic acid, methyl ester | C922678 | 氣相 | gas |
| alkyne_t10 | 末端炔 | benzene, 1-ethynyl-4-methyl- | — | 跳過 | NIST page has no IR spectrum |
| alkyne_i01 | 內炔對照 | 2-Hexyne | C764352 | 氣相 | gas |
| alkyne_i02 | 內炔對照 | 3-Hexyne | C928494 | 氣相 | gas |
| amide02 | 醯胺 | Acetamide, N-methyl- | C79163 | 氣相 | gas |
| amine02 | 胺 | Ethanamine, N-ethyl- | C109897 | 氣相 | gas |
| acid02 | 羧酸 | Propanoic acid | C79094 | 氣相 | gas |
| sulfur04 | 含硫 | Benzenesulfonamide | C98102 | 凝相 | SOLID (SPLIT MULL) |
| sulfur06 | 含硫 | 1-Butanethiol | C109795 | 氣相 | gas |
| sulfur08 | 含硫 | Diethyl sulfide | C352932 | 氣相 | gas |
| amide04 | 醯胺 | Benzamide | C55210 | 凝相 | SOLID (NUJOL MULL) |

凝相／氣相筆數（NIST，每化合物一譜）：腈 8／3、硝基 5／5、末端炔 6／3、內炔對照 1／2、醯胺 4／1、胺 4／1、羧酸 2／1、含硫 5／3、磷與其他 5／1。凝相裡有溶液（CCl₄／CS₂）、純液、礦物油糊、KBr、熔體等，沒有再細分。
**樣本數沒有達到「腈、硝基、末端炔各 ≥10 個凝相」**：腈 8、硝基 5、末端炔 6。

## 2. 峰表做法（固定，所有譜同一組參數）
- 讀取與尋峰：`SpectrumParser.parseTextSpectrum('IR', …)`（SpecReader 自己的 JCAMP 讀取＋`processIRSeries` 尋峰，預設參數，沒有調參）。cm⁻¹ 的檔我另外跑了自我檢查，結果與 parser 的峰位逐一相同。
- **發現的限制：SpecReader 的 JCAMP 讀取不換算 x 軸單位**。11 個 Coblentz 檔 `XUNITS=MICROMETERS`，讀進來是 2–15「cm⁻¹」（苯甲腈等）。這 11 個我只做一件事：x 換成 10000／x 後，再丟進同一個尋峰函式（不重取樣）；因為點在 cm⁻¹ 上不等距，尋峰器對它們用常數基線而不是不對稱基線，所以這 11 個的峰與其他不完全可比。
- A＝全部可辨峰；B＝「最強」前 8 個（以 SpecReader 處理後的基線校正相對強度排序）。峰表以「使用者已確認完整、沒有自動峰」的形式進分析（每峰 `manualPeak`、`CONFIRMED_COMPLETE`），用既有的 `fixtureSpectra` 疏鬆基線做法；y 寫成 0.99×%T（吸光度檔先換 %T），使 100 %T 基線對上 helper 的 99 基線。
- C＝文獻式 5 筆，手輸、未給強度，兩種：**C**＝強度未知（`intensityKnown=false`，只有兩個端點）；**C2**＝同一批峰位給相同高度（假設使用者也輸入了高度，僅供比較）。結構依名稱：2-苯基丁腈、2,6-二甲基環己烷甲腈、硝基乙醛二乙縮醛、2-甲基-4'-硝基聯苯、苯硫基乙炔。C 與 NIST 名單不重複，兩種來源分開統計。
- 氣相不修正位移，分開統計。**峰數不足 6 的 NIST 譜（不補）**：環己烷甲腈（氣相，3 峰）、2-己炔與 3-己炔（氣相，各 5 峰）；文獻表：2,6-二甲基環己烷甲腈（5 峰）、苯硫基乙炔（3 峰）。這些的負向證據資料閘會因 TOO_FEW_PEAKS 關閉。
- 旗標三組：**全關**（`useV141IR`、`useV142IR` 皆 false）；**ON**＝ir141（四子旗標）＋ir2（`useV142IR`、`alkeneOOP`，負向證據關）；**NEG**＝ON＋`negativeEvidence`（＝`?exp=ir,ir2neg` 的實際狀態：`useV142IR` 開、`alkeneOOP` 維持開、`negativeEvidence` 開）。只有全開組出現 1 個 IR 分下降，所以只對這一個補跑了單開 ir141／單開 ir2。其餘旗標沿用既有池腳本的設定（v1.4.0 全開、v1.3.2 閘門開）。分析是 IR 單獨（沒有 ¹H），總分＝IR 分。
- 候選池：沿用既有建法——整套流程（`executeSixStepAnalysis`，輸入分子式＋該峰表，步數預算）的前 30＋目標；另外補（標為 `list`）清單中同分子式的其他化合物結構，讓異構物對照有意義。池內排名用 IR 分；名次以平手算輸為主（第三十四站改寫；當時是並列取樂觀名次，現列在括號內）。共 125 組（60×2＋5 筆 C），無逾時。

## 3. 結果
### (a) 負向證據的誤殺率（NEG 組；目標含該基團，且資料閘開）
| 類／相／表 | 含基團目標數 | 閘開 | **被扣（誤殺）** | 閘關原因 |
|---|---|---|---|---|
| 腈 凝相 A | 8 | 8 | **0** | — |
| 腈 凝相 B（前 8 峰） | 8 | 8 | **1**（苯乙腈） | — |
| 腈 氣相 A／B | 3／3 | 2／2 | **2／2**（丙腈、異丁腈） | 環己烷甲腈 TOO_FEW_PEAKS |
| 硝基 凝相 A／B | 5／5 | 5／1 | 0／0 | B：4 個 MISSING_STATUS（前 8 峰在羰基區一側沒有峰） |
| 硝基 氣相 A／B | 5／5 | 5／3 | 0／0 | B：2 個 MISSING_STATUS |
| 末端炔 凝相 A／B | 6／6 | 6／4 | **1／0**（炔丙醇，A） | B：2 個 MISSING_STATUS |
| 末端炔 氣相 A／B | 3／3 | 3／3 | 0／0 | — |
| 文獻 C（強度未知） | 5 | 0 | 0 | 全部 MISSING_STATUS（強度未知，資料閘關） |
| 文獻 C2（等高，假設） | 5 | 3 | 0 | 2 個 TOO_FEW_PEAKS、1 個單側峰 |

共 6 筆誤殺（凝相 2 個化合物：苯乙腈 B、炔丙醇 A；氣相 2 個化合物 4 筆）。逐筆：
1. **苯乙腈（B 表，凝相）**：B＝最強前 8 峰，C≡N 帶不在其中；最接近的峰在 1499 cm⁻¹（離窗 700）。原因＝**我做的 B 表本身不完整**，閘門無法知道表被截斷；A 表（完整）不扣。
2. **炔丙醇（A 表，凝相，µm 檔）**：沒有 3260–3340 的標記；最接近的是 3183（寬 O–H 帶的標記，離窗 77），而 3200–3400 的「遮蓋窗」不含 3183。原因＝**≡C–H 與 O–H 重疊，尋峰器把寬 O–H 的標記放在 3183**，遮蓋窗邊界不夠寬。
3. **丙腈（氣相，A、B）**：2266 有標記（在窗內），但只有最強帶的 6.9%，低於腈 10% 的「存在」門檻。**異丁腈（氣相，A、B）**：2254 有標記，4.5%。原因＝**氣相腈帶相對 C–H 帶很弱，相對門檻 10% 太高**。
**這 6 筆都不是峰位偏離規則窗**（腈帶都標在窗內，炔丙醇是 O–H 遮蓋；氣相位移沒有造成誤殺；我沒有另外量其他未被扣目標的峰位偏離）；**不是文獻沒列**（C 表因強度未知全被資料閘擋下，C2 的 3 個閘開案例沒有誤殺）。
被扣的目標 IR 分：丙腈 A 39.4→34.2、異丁腈 41.0→35.6、苯乙腈 B 63.1→54.9（池內名次 8→9；平手算贏 5→8）。

### (b) 規則效用（池內非目標候選；NEG 對 ON）
- 含基團的非目標候選：**目標本身沒有該基團時**（內炔、酯、胺基甲酸酯等），A 表 50 個含基團候選中 **28 個被扣（56%）**，B 表 61 個中 2 個（3%，B 閘多半關）。典型：二苯乙炔 A 的 30 個末端炔異構物全被扣，目標名次 31→5（平手算贏 14→4；ON 時目標與 17 個候選同分）；胺基甲酸乙酯 A 的 1-／2-硝基丙烷（清單補入）被扣。
- 目標有該基團時，含**另一種**基團的候選（腈目標池裡的炔、胺異構物）A 195 個中 48 個被扣（25%）。
- 沒有該基團的候選被扣：0／615（A）、0／622（B）（規則設計上就不會）。
- 目標名次 ON→NEG（兩種口徑的好／同／差相同）：A 好 1／同 59／差 0；B 好 1／同 57／差 2（差的兩個＝苯乙腈 B 8→9、丙腈 B 8→9，平手算贏時 5→8、6→9；都是誤殺造成）。文獻 C 全不變。
- **候選產生器的限制**：22 個硝基組中**目標本身都沒被整套流程產生**（流程的候選集不含硝基結構）；腈 24 組中 13 個沒產生目標。池裡的硝基候選只有目標和 `list` 補入的。這使硝基規則的效用在流程內量不到。
- 整套流程排名（目標有被產生的 64 組）：OFF→ON 好 7／同 54／差 3；ON→NEG 全同。

### (c) 退步檢查（ir141＋ir2 開，目標 IR 分，130 個峰表）
- **下降 1／130**（上升 103、不變 26）：**二甲碸 A 表 23.04→20.35**，只在 ir141 開時發生（單開 ir2 不變）。原因：ir141 的 sp²C–H 子規則把脂肪 C–H 帶（2850–3000）的上緣不確定度由 ±20 縮成 ±8，而 CH₃–SO₂ 的 C–H 伸縮在 3017、3026.4（高於 3000 約 17–26），相容度 0.61→0.09、0.37→0.004。ir2 沒有造成任何下降。
- 另外要記：目標 IR 分沒降、但**池內名次變差**的有 **4／125**（OFF→ON，平手算輸；A 2 個、B 2 個：硝基乙烷 A 2→4、苯甲酸 A 1→2、DMSO B 2→4、3-丁炔-1-醇 B 4→6），好的 **22 個**（A 12、B 10）——新帶讓錯誤候選也多拿分，但平手算輸時好的遠多於差的。（參考，平手算贏：差 9（A 5、B 4，如硝基乙烷 A 1→3、丙二腈 A 3→4、苯甲酸 A 1→2、二苯乙炔 B 2→21、DMSO B 2→4）、好 9；丙二腈 A 在平手算輸時是 5→4 變好，二苯乙炔 B 是 31→31 不變。）
- 文獻 C／C2：ON 腈上升、硝基與炔不變，0 下降。

### 新類別的 IR 規則缺口（特徵帶是否被目標解釋；A 表、ON、特徵窗內最強標記 ≥10%）
| 缺口（按影響排序） | 數字 |
|---|---|
| 1. **指紋區（600–1400）強峰多半無帶可解釋**：B 表強峰（≥30%）相容度 <0.3 的比例：羧酸 12/24、磷與其他 22/41、腈 24/67、醯胺 11/35、含硫 15/48、末端炔 17/58、硝基 13/70、胺 7/38；影響最大的窗是 1000–1100（腈、硝基、醯胺、羧酸）、900–1000、600–700（末端炔 ≡C–H 彎曲）、500–600（芳基磺醯胺／碸）。第二十四站已決定不做芳香取代型態與 1375 分裂，這一欄是它們的實證面積。 | 見 `S27_GAPS.txt` |
| 2. **磷酸酯 P=O（1240–1300）與 P–O–C（990–1060）完全沒帶** | 0／2、0／2 |
| 3. **異氰酸酯 N=C=O（2240–2290）、異硫氰酸酯 N=C=S（2000–2200）沒帶**（也沒進 IR:coverage 2100–2300 的觸發） | 0／1、0／1 |
| 4. **磺醯胺 N–H（3200–3400）不被解釋**（醯胺 N–H 帶只給醯胺候選） | 0／2 |
| 5. 羧酸 O–H 寬帶在 2835 的標記相容度 0.2（只有 2／3 被解釋）；DMSO S=O 與氣相硫醇 S–H 該窗沒有 ≥10% 標記 | — |
已解釋良好：腈 C≡N 6／6（有標記者）、硝基不對稱 5／5、末端炔 ≡C–H 8／8、醯胺 I 4／4、碸 S=O 3／3、尿素與胺基甲酸酯 1／1。細表：`S27_CHAR_BANDS.txt`。

## 4. 判斷
**負向證據可不可以預設開：證據不足，建議維持預設關。**
1. 樣本數不到標準（凝相腈 8、硝基 5、末端炔 6，都 <10）；
2. 誤殺不是 0：凝相 2 個化合物（苯乙腈 B 表、炔丙醇 A 表）、氣相 2 個化合物（丙腈、異丁腈）。若限定「完整 A 表＋凝相」，誤殺 1／19 個含基團目標（炔丙醇），仍不是 0。
3. 文獻式表（強度未知）全被資料閘擋下，所以這一批也沒給出安全證據；C2 的 3 筆閘開案例 0 誤殺但樣本太少。

**修正方向（這一站不改，且這些修正是看了本批資料才想出來的，上線前需要新的留出資料再驗）：**
- 腈「存在」門檻：氣相腈只有最強帶的 4.5–6.9%；門檻改成 ≤3%，或像炔一樣窗內任何標記都算存在（待另驗）。
- 炔的遮蓋窗：擴到 3100–3500，或候選同時含 O–H／N–H 時不扣（炔丙醇 3183）。
- 資料閘：沒有辦法偵測「表被截斷（只取最強 8 峰）」與「氣相譜」；可考慮要求使用者宣告相別，氣相不啟用。這是產品面的決定。
- 閘門 G1 在 B 表常關（硝基 B 6／10 閘關），表示閘門多半只在較完整的表上啟用，符合設計。

**IR 規則退步：** ir2 在新類別上 0 降；ir141 在二甲碸降 1（sp²C–H 子規則的脂肪 C–H 上緣 ±8 太窄，CH₃–SO₂、電子吸引基旁的 CH₃ 在 3010–3030）。建議在決定 ir141 預設前處理。另外新帶讓 4／125 的池內名次變差（平手算輸；平手算贏時 9／125），同時 22／125 變好；要和 ir141 在整套流程的效益（7 好）一起看。

**待你決定：** ① 負向證據維持預設關？是否補真實凝相樣本到各 ≥10（NIST 缺的化合物要換）；② 上述三個修正方向要不要做；③ SpecReader JCAMP 讀取不換算 µm 軸（產品缺陷，列入 1.5.0？）；④ 二甲碸的 sp²C–H 上緣；⑤ 候選產生器不產生硝基（流程內無法評規則效用）；⑥ 缺口 2–4 要不要補帶（磷酸酯、N=C=O／N=C=S、磺醯胺 N–H）。

## 5. 原始輸出（倉庫外 `SpecReader/notes/v1.4.2/s27/`）
`S27_NIST_MANIFEST.json`、`S27_TABLES.json`（含峰表，**僅本機**）、`S27_TARGETS.json`／`S27_TARGETS_SUMMARY.txt`、`S27_POOL.json`／`S27_POOL_SUMMARY.txt`、`S27_GAPS.txt`、`S27_CHAR_BANDS.txt`、`S27_CLASSES.txt`、`S27_MB910.txt`（第一部分 0.2 的逐帶量測）；腳本 `compounds.py`、`fetch_nist.py`、`s27*.test.ts`、`an_*.py`。沒有跑全套與 E2E，沒有重跑 43 樣本／55 面板／31 張單一譜。
