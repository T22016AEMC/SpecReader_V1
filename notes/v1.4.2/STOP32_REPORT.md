# 第三十二站報告（倉庫內摘要版）：發布前整理之二

分支 v1.4.2，本機。沒有升版、標籤、Release、打包、部署、LICENSE 檔，沒有推送。本機 commit：測試 7ccef6f；文件 commit 見最後。原始輸出與腳本：`SpecReader/notes/v1.4.2/s32/`（進度紀錄 `STOP32_CHECKPOINT.md`）。這是倉庫內的摘要版：不含 NIST 資料，也不含個資／歷史作者的位置細節（完整版在倉庫外 SpecReader/notes/v1.4.2/STOP32_REPORT.md）。

## 先講最重要的三件事
1. **GitHub 倉庫是公開的**（`gh repo view`：PUBLIC，沒有授權檔），第三十一站推的 v1.4.2 分支也在上面。沒有改任何設定。
2. **「產品狀態」的量測結果**：把 IR 設成「未確認完整」（產品唯一的狀態）後，數字與舊量測（IR 已確認完整）差得不大，但**不是零**：最大的差距是流程樣本 Q3（目標從名次 3 變成沒有被產生；開 ¹H 新規則時從第 1 變成沒有被產生）。見 A 節。
3. **負向證據在產品狀態下觸發 0 次**（三種量測都是），與關閉時逐位元相同；在舊的「完整」假設下則會誤扣 3 個腈的 B 表目標。

## A. 以產品實際狀態重跑量測

### A.0 做法
- 腳本放倉庫外（`s32State.test.ts`，副本在 `tests/_scratch/`，該目錄被 git 排除）。旗標用真正的 `applyExperiments()`（與 `?exp=` 同一個函式），每組之前先把 `V12_CONFIG` 還原成載入時的初值；兩次全關的重跑逐位元相同（無殘留狀態）。
- 「未確認」＝去掉 IR 的 `observationCoverage`（產品預設補 `PARTIAL_MARKERS`）；「完整」＝舊腳本的 `fixtureSpectra`（IR 設 `CONFIRMED_COMPLETE`）。**¹H 在兩種狀態下都是未確認**（`fixtureSpectra` 從不設 ¹H）。MS 不在這些量測裡。
- 9 個旗標組合：全關（現行預設）、`h1`（useV140H1＋全部子旗標，含 round3、parseFix）、`ir`（useV141IR）、`ir2`（單獨）、`ir+ir2`、`ir+ir2+neg`（?exp=ir2neg）、`h1+ir`、`h1+ir+ir2`、`h1+ir+ir2+neg`。
- 三組量測：**pool 769**（43 個樣本的 769 個候選重新評分，目標在池內 38 個）、**43 流程樣本**（整條 `executeSixStepAnalysis`）、**IR 面板**（194 張表：60 張 stop-27 NIST 譜×A/B 表、stop-29 新增的 32 張×A/B、5 筆文獻表×C/C2；其中 189 張有候選池，池＝流程候選＋目標＋同分子式同伴）。NIST 資料只在倉庫外。
- **¹H 真值（Fulmer tier 1／tier 2／tier 3）**：這些真值只由結構預測位移算誤差，不含觀測物件，所以與「完整／未確認」無關（程式碼確認；`s32H1Truth.test.ts` 也跑了，全關兩次相同）。全關→`?exp=h1`：tier 1（n=104）MAE 0.220→0.152；tier 2（343→339 筆）0.459→0.182；tier 3（n=45）0.689→0.272。**這些真值大多是校準用的，數字是樣本內，不是留出驗證。**
- 沒有「¹H 與 IR 合併」的獨立量測可比較；`h1+ir…` 組合就是合併狀態。

### A.1 流程 43 樣本（名次；n＝目標有被產生者）
| 狀態 | 組合 | 目標沒產生 | top1 | top3 | top5 | 名次和 | 與全關比：變好／變差／不變 |
|---|---|---|---|---|---|---|---|
| 未確認 | 全關 | 8 | 25 | 31 | 32 | 92 | — |
| 未確認 | h1 | 6 | 30 | 37 | 37 | 47 | 10／3／24 |
| 未確認 | ir | 8 | 27 | 31 | 32 | 87 | 4／0／31 |
| 未確認 | ir2 | 8 | 25 | 32 | 33 | 77 | 3／0／32 |
| 未確認 | ir+ir2 | 8 | 27 | 32 | 33 | 73 | 5／0／30 |
| 未確認 | ir+ir2+neg | 8 | 27 | 32 | 33 | 73 | 5／0／30（與 ir+ir2 逐筆相同） |
| 未確認 | h1+ir | 6 | 30 | 37 | 37 | 47 | 10／3／24 |
| 未確認 | h1+ir+ir2 | 6 | 32 | 37 | 37 | 45 | 10／3／24 |
| 未確認 | h1+ir+ir2+neg | 6 | 32 | 37 | 37 | 45 | 同上 |
| 完整 | 全關 | 7 | 24 | 32 | 33 | 96 | — |
| 完整 | h1 | 5 | 31 | 37 | 38 | 49 | 11／3／24 |
| 完整 | ir | 7 | 26 | 32 | 33 | 91 | 4／0／32 |
| 完整 | ir2 | 7 | 24 | 33 | 34 | 81 | 3／0／33 |
| 完整 | ir+ir2 | 7 | 26 | 33 | 34 | 77 | 5／0／31 |
| 完整 | h1+ir+ir2 | 5 | 33 | 37 | 38 | 47 | 11／3／24 |
（完整狀態的 ir+ir2+neg、h1+ir、h1+ir+ir2+neg 與各自無 neg 的列相同。名次和只含有被產生的目標，且目標沒產生的數量不同，不能跨列直接比。）

**變差案例（逐一列出）**：全部是同一組——`B1`、`v121/S2`、`v121/S3`（雙酚 A 型目標，第 1→3；完整狀態的 S3 是第 2→4），只出現在含 `h1` 的組合。原因：二芳基丁烯同分異構物 `CC(=C(C)c1ccc(O)cc1)c1ccc(O)cc1` 的 ¹H 分數（95.5）比目標（91.3）高，`h1` 把它的總分抬到 79–84，超過目標 77。這就是第二十五站記的「雙酚 A 與其二芳基丁烯異構物在 IR 分不開、答案在 ¹³C」。`ir`／`ir2`／`ir+ir2`／`neg` 在 43 流程沒有任何變差。
**變好**：h1：M6 7→1、M7 5→1、Q1 2→1、G3 3→1、CYHEX_A／B 2→1、ALK1*、ALK0* 16／26→1，ALK0／ALK1（沒打公式）從沒產生變成第 2（單開 h1）或第 1（h1+ir+ir2）。ir：Q1、G3、ALK0*／ALK1* 各進一兩名。ir2：M6 7→3、ALK0*／ALK1* 26→17／16→14。

**兩種狀態的差距（流程）**：每個組合都只有 3 個樣本不同：
- **Q3**：完整時第 3（全關）或第 1（h1），**未確認時目標沒有被產生**（候選數 153→95）。這是本站最大的差距。我沒有追根因（這站是只讀）；推測與 STOP31 第 4、5 項一致（IR 涵蓋判斷恆 false，酯羰基狀態恆 UNKNOWN，使「無羰基證據不給酯次甲基解讀」的分支不走），**這是推測，沒驗證**。Q3 是 v1.2.3 為這個分支專門寫的樣本。
- **M7**：名次不變，但候選數 51→158（h1：36→125），搜尋空間大得多。
- **v121/S3**：全關 2→1、h1 4→3，候選數 11→15。

### A.2 pool 769（38 個目標在池內；名次＝池內總分嚴格高於目標的候選數＋1，平手不算輸）
| 狀態 | 組合 | top1 | top3 | top5 | 名次和 | 變好／變差／不變 |
|---|---|---|---|---|---|---|
| 未確認 | 全關 | 27 | 35 | 36 | 106 | — |
| 未確認 | h1 | 31 | 37 | 38 | 50 | 8／3／27 |
| 未確認 | ir | 28 | 35 | 36 | 106 | 2／2／34 |
| 未確認 | ir2 | 27 | 36 | 36 | 75 | 3／0／35 |
| 未確認 | ir+ir2（＝加 neg） | 28 | 36 | 36 | 71 | 5／0／33 |
| 未確認 | h1+ir | 31 | 37 | 38 | 50 | 8／3／27 |
| 未確認 | h1+ir+ir2（＝加 neg） | 33 | 37 | 38 | 48 | 8／3／27 |
| 完整 | 全關 | 27 | 35 | 36 | 106 | — |
| 完整 | ir／ir2／ir+ir2 | 28／27／28 | 35／36／36 | 36／36／36 | 107／75／72 | 1／2、3／0、4／0 |
| 完整 | h1…（各組） | 與未確認相同（31／33） | | | 50／48 | 8／3／27 |
變差：h1 系 3 個＝同上的 B1／S2／S3；`ir` 的 2 個＝v130/ALK0、ALK1（目標 IR 59.7→75.9，但最好的對手也升到 75.9，名次 28→29、27→29）。
**兩狀態差距**：目標總分差（未確認−完整）平均 0.10、最大 0.78（只有 12 個樣本有差，未確認較高）；名次不同的只有 `v131/CR2`（ir 系列，完整 3→未確認 2）。

### A.3 IR 面板（194 張表；189 張有池）
**口徑（第三十三站起）**：面板名次以「**平手算輸**」為主要口徑（名次＝總分高於或等於目標的其他候選數＋1）；「平手算贏」只列作參考。以下數字沒有重跑，只換寫法；變好／變差數是第三十三站從同一批輸出檔重算的（`s32/S33_PANEL_TIELOSE_COUNTS.txt`）。
- **主要口徑（平手算輸）**：未確認 全關 top1 51／top3 89／top5 115，名次和 1722；`ir` 54／91／114，1626（變好 28、變差 6）；`ir2` 53／90／117，1700（2／1）；`ir+ir2` 56／93／116，1603（30／6）；`ir+ir2+neg` 與 `ir+ir2` 相同；`h1` 與全關逐位元相同（面板沒有 ¹H）。完整狀態：全關 52／91／116，1711；`ir` 54／92／116，1619（28／7）；`ir2` 54／92／118，1689（2／1）；`ir+ir2` 56／94／118，1596（30／7）；`ir+ir2+neg` 57／94／119，1541（33／6）。
- 參考（平手算贏，舊腳本的算法；全關時有 105 張表目標與別的候選平手，其中 80 張是「第 1 名但有平手」）：未確認 全關 top1 131／top3 147／top5 151；`ir` 126／139／146（變好 14、變差 16）；`ir2` 130／147／151（0／2）；`ir+ir2` 126／139／146（14／17）。完整狀態全關 132／149／152，其餘同方向。
- 解讀：主要口徑（平手算輸）下 `ir` 系列是淨變好（28 好 6 壞）。參考口徑（平手算贏）下 `ir` 看起來變差，**16 個變差案例中 12 個是原本與目標平手、現在對手得分更高**（`ir` 加的帶對對手也成立）；兩種口徑方向相反，這裡以平手算輸為準。
- 目標 IR 分降低的：`ir` 系列 1 張（B 表，腈，36.5→34.1）；完整狀態的 `neg` 另加 1 張（nitrile25 的 B 表 66.9→64.8）。
- **負向證據（IR:neg）觸發**：未確認：全部組合 0；完整：`ir+ir2+neg` 3 張（都是腈的 B 表，B 表＝我做的前 8 強峰表，腈帶不在其中；即第二十七站記的「B 表截斷」類誤扣）。完整狀態下 `neg` 使 top1（平手算輸）56→57、名次和 1603→1541（對手被扣得比目標多），同時有那 3 筆誤扣。
- **兩狀態差距最大的案例**：全關下 78 張表的 IR 分不同（未確認較高，因為不做「伴隨帶缺失」輕扣）：文獻表 litC5 +4.33、amide05|B +2.47、nitrile06|B +2.23；`ir+ir2+neg` 下 nitrile25|B +9.72（完整被 neg 扣）、nitrile10|B +8.23（名次 8→5）、nitrile02|B +5.22（9→6）。名次不同的表 3 張（全關）／11 張（含 neg）。

### A.4 結論：依「未確認」狀態的數字，每個旗標是否有理由預設開
（只依這站的數字，不談授權與發布決策；這些樣本都是合成或公開資料，我沒有也不宣稱真實化合物的準確率。）
- **¹H 新規則（`h1`）**：**有數字上的理由預設開**：流程 top1 25→30、pool 27→31、¹H 真值 MAE 下降，未確認狀態不削弱這個效果（與完整狀態的數字幾乎相同）。**不能直接開的理由**：(1) 3 個雙酚 A 型樣本會變差（目標被 ¹H 分數更高的異構物超過），這是已知限制，不是新發現；(2) 真值多半是校準用的，樣本內改善不等於留出改善；(3) 含 nmrshiftdb2 的類別位移，授權第 4.5 條要求先選定 OSI 授權、頁尾聲明待定（見 D）；(4) 使用者尚未用真實化合物驗證；(5) 未確認狀態下 Q3 這類樣本目標根本沒被產生，`h1` 救不回來（Q3：1→沒有）。
- **IR 第一輪（`ir`）**：未確認下流程 4 個變好 0 個變差，pool 2 好 2 壞，面板（平手算輸）淨變好（28 好 6 壞；參考口徑平手算贏則 14 好 16 壞）。**理由偏弱**：改善都是 1–2 名的小幅度，且結論隨平手的算法翻轉；沒有不能開的硬理由，也沒有強理由。
- **IR 第二輪（`ir2`，烯烴面外彎曲）**：流程 3 好 0 壞（單開時 top1 不變，只改善名次內部），pool 3 好 0 壞，面板（平手算輸）2 好 1 壞（參考口徑平手算贏 0 好 2 壞，都是平手被打破）。**沒有造成目標變差的流程樣本**；不能說有大幅效益，改善依賴使用者的峰表標出 722–725 等位置（第二十五站已記）。
- **負向證據（`ir2neg`）**：**沒有理由預設開，也沒有傷害**：未確認狀態下三組量測都觸發 0 次，結果與不開逐位元相同——產品中它是死碼（STOP31 第 6 項）。若改成能由使用者確認完整，則完整狀態下會誤扣 3 張 B 表腈（目標），須先設計與重新評估。

## B. MS 的 M+2 缺席分支測試（完成）
- 新檔 `tests/v14/msM2AbsentCoverage.test.ts`（6 個；commit 7ccef6f；**不改任何行為**）。
- 固定現行行為：圖譜未確認完整（未設、`PARTIAL_MARKERS`、`CONTINUOUS_TRACE` 三種）時，缺席的 M+2 是 `NOT_MARKED`：每個分子離子假設都有「M+2/M 未標記；不當作不存在」，沒有「未檢出（完整峰表）」，`elementsExcluded` 不含 Cl／Br，Cl／Br 仍在 `elementsConsidered`，含 Cl／Br 的分子式仍被列舉，沒有「Cl／Br 只在下列離子假設中被 M+2 排除」的限制說明。附一個確認產品預設狀態是 `PARTIAL_MARKERS` 的測試。
- 手動設 `CONFIRMED_COMPLETE`（意圖測試，測試檔頭註明產品今天沒有這條路）：缺席的 M+2 成為「確定缺席」，Cl／Br 被排除，分子離子的假設沒有含 Cl／Br 者，且同位素行計分（「M+2/M 觀測 未檢出（完整峰表）」）。再加一個「標了 M+2 的 C6H5Cl 在兩種狀態下都得第一」的對照。
- 驗證：改壞原始碼（`coverageComplete` 恆 true／恆 false）各讓對應組失敗後已 `git checkout` 還原；本站範圍測試：新測試＋`tests/composition.test.ts` 共 36 個全過；`tsc --noEmit` 乾淨。全套與 E2E 沒跑（留最後一站）。

## C. 公開前稽核（摘要；細節在完整版）
- 倉庫可見度：**公開**（已即時回報，沒有後續動作）。掃描範圍：HEAD＋全部 192 個 commit 的 705 個歷史路徑。
- NIST WebBook：沒有 JCAMP 內容、逐點數值或整張峰表；只有 ID／URL／雜湊／檔頭行與少數說明用的峰位。
- 金鑰／token：全歷史 0 命中；沒有 .env。
- 他人資料：有一張期刊 SI 表的整表轉錄（見 D 的資料表）與數個以數字＋標籤保存的文獻真值；條款待查，**等使用者決定**。
- 個人資料（本機路徑、提交作者資訊、部署服務 ID）：有，位置與處理方式只寫在完整版，**等使用者決定**。
- NMRShiftDB2 衍生檔：大多已帶聲明句與授權連結；缺的是 2 個檔（統計檔、抽取腳本），建議補。
- 使用者真實測試譜：倉庫與歷史中沒有真實譜檔，只有合成 fixture。

## D. 授權相容性（只讀，沒有建立 LICENSE、沒有改授權欄位）
候選：Apache-2.0（程式碼）；¹H 真值表與其衍生資料依 NMRShiftDB2（ODbL 系）。資料來源：`pnpm licenses list --json`（prod 160 個、全部 261 個）＋2026-11-13 建置的 `dist/THIRD_PARTY_NOTICES.txt`（package.json／lockfile 自那時起沒變）。

**總結**：沒有 GPL／AGPL／LGPL 授權欄位，也沒有授權欄位不明的套件。pnpm 只列本機平台安裝的套件，其他平台的選用二進位套件沒列（同家族 MIT／MPL）。分布：MIT 215、Apache-2.0 15、BSD-3 14、ISC 11、MPL-2.0 2、BSD-2 1、0BSD 1、CC0 1、CC-BY-4.0 1。

**實際打包進前端 dist 的 16 個套件**
| 套件 | 授權 | 與 Apache-2.0 | 備註 |
|---|---|---|---|
| @rdkit/rdkit 2026.9.1 | BSD-3-Clause | 相容；**需附聲明** | npm 包沒有授權檔，倉庫用 `docs/licenses/RDKit.txt`；WASM 內靜態連結的第三方元件**待查** |
| jcampconverter 9.6.4 | MIT | 相容；需附聲明 | 固定版本 |
| dynamic-typing、ensure-string、gyromagnetic-ratio、is-any-array、isutf8、ml-array-median | MIT | 相容；需附聲明 | jcampconverter 的相依 |
| median-quickselect 1.0.1 | ISC（只有 package.json 欄位） | 相容；**聲明不全** | 套件與其公開倉庫都沒有授權檔、沒有版權行；build 照實標 MISSING，沒有補寫 |
| lucide-react 0.546.0 | ISC | 相容；需附聲明 | |
| react、react-dom 19.3.0、scheduler 0.28.0 | MIT | 相容；需附聲明 | |
| xlsx（SheetJS CE）0.20.3 | Apache-2.0 | 相容；需附授權全文，若有 NOTICE 要附 | 從 cdn.sheetjs.com 取 tarball，lockfile 固定 integrity |
| rolldown、vite 輔助碼 | MIT（vite 的 LICENSE 還含它打包的相依清單） | 相容；需附聲明 | 建置工具的 helper 被打進去 |
**後端（`dist/server.mjs` 用 `--packages=external`，執行期從 node_modules 載入）**：express 4.22（MIT）、dotenv 17（BSD-2-Clause）、@google/genai 2.28（Apache-2.0）及其 Apache-2.0 相依（google-auth-library、gaxios、gcp-metadata、google-logging-utils、ecdsa-sig-formatter、long…）。都與 Apache-2.0 相容；是否需要附聲明取決於發布物是否包含 node_modules（git archive 的 zip 不含）。
**只在建置／測試的**（不進 dist）：vite、vitest、typescript（Apache-2.0）、playwright／@playwright/test（Apache-2.0）、esbuild、tsx、tailwindcss、autoprefixer、mf-finder 3.4.25（MIT，只在一個測試）、supertest；**lightningcss（MPL-2.0，檔案級 copyleft；只作建置工具，沒有被散布，無義務）**、caniuse-lite（CC-BY-4.0，資料，建置期）、binary-search（CC0）、tslib（0BSD）。`motion`（MIT）在 package.json 但 `src/` 沒有 import（未使用）。
**標出的特殊項**：GPL／AGPL／LGPL：無；不明授權：無；聲明不全：median-quickselect；待查：RDKit WASM 的第三方元件。

**資料與表值（是否直接嵌入、出處、可用性）**
| 項目 | 是否嵌入 | 出處 | 可用性 |
|---|---|---|---|
| Ambit-HNMR 1.2 知識庫 | 是，原檔逐字嵌入 `ambitHnmrKnowledgeBase.ts` | Kochev 等，Zenodo 4629851 | **CC-BY-4.0**，需署名（已有）；資料檔保持自己的授權，不能改成 Apache-2.0 |
| nmrshiftdb2 | 程式內只有 8 個類別位移與統計；真值表 102 筆在測試夾 | nmrshiftdb2 實測 CDCl₃ ¹H | **nmrshiftdb2 Database License（ODbL 系）**：§4.2 衍生資料庫須附授權／URI；§4.3 公開使用的產出物須附聲明句；§4.4 相同方式分享；**§4.5 依賴該資料庫運作的軟體須 OSI 授權（含預測軟體）**；§4.7 須提供衍生資料庫或「做法」（`extract_h1.py`） |
| 殘留溶劑／雜質峰表 | 是，`TRACE_IMPURITY_SHIFT_TABLE` | Gottlieb 1997、Fulmer 2010、Babij 2016 | **待查**（期刊版權；實驗位移是事實，但整表編排的使用條件我沒查） |
| Fulmer 2010 SI Table S1／S7 | 是，測試真值 `h1Truth1.json`、`h1Stop7Spectra.ts`；並由它算出溶劑位移類別常數 | Organometallics 2010, 29, 2176, SI | **待查**，且是整表轉錄（見完整版 C.2） |
| Pretsch 增量 | 兩處：(1) 經 Ambit（它自稱建在 Pretsch 加成法上）；(2) `AROMATIC_SUBSTITUENT_INCREMENTS` 登記為 Pretsch 5th ed. | Springer，2020 | **待查**：逐值是否抄自書沒有記錄；個別增量是通用教科書數值 |
| Reich | 只在 `h1Truth2.json`／`h1Truth3.json`（手讀數字） | organicchemistrydata.org | **待查** |
| SDBS／ChemicalBook／RSC SI | 只在 `h1Truth2.json`（使用者查的數字＋標籤） | 各網站／期刊 | **待查**（SDBS 條款尤其要看） |
| Coates（IR） | 少量窗位置，非整表 | Interpretation of Infrared Spectra: A Practical Approach | 待查是否需註明 |
| NIST WebBook | **沒有嵌入**（只有 ID／URL／雜湊） | NIST SRD 69，版權 © 美國商務部長 | 不得重製；僅倉庫外本機驗證 |

**要寫進 NOTICE／THIRD_PARTY_NOTICES 與網站頁尾的聲明清單**
1. RDKit（BSD-3 全文；已有）。2. jcampconverter 及其 MIT 相依、lucide-react（ISC）、react 系列（MIT）、rolldown／vite（MIT）、SheetJS（Apache-2.0＋NOTICE 若有）——build 的 `append-npm-notices` 已自動產生。3. median-quickselect：如實寫「只有 ISC 識別字，無版權行」。4. Ambit-HNMR 的 CC-BY-4.0 署名句（已有）。5. **nmrshiftdb2 聲明句＋授權連結**：THIRD_PARTY_NOTICES 已有，**網站頁尾／結果頁沒有**（授權 §4.3 對公開使用的產出物要求）。6. 資料來源一節（Gottlieb／Fulmer／Babij／Pretsch，已在 Data-Sources.txt；若待查項目結論是需要授權，這節要改寫）。7. @google/genai 與 Apache-2.0 系列（若發布物含後端相依）。8. 專案自己的 LICENSE（Apache-2.0）與 NOTICE：**尚未建立，等你拍板**；另需決定 nmrshiftdb2 真值檔夾是否另放 LICENSE／保留其授權。

## E. 驗證與提交
- 驗證範圍：B 新測試＋`tests/composition.test.ts`（36 個）全過；`tsc --noEmit` 乾淨。全套與 E2E 沒跑。
- 提交：測試 commit 7ccef6f；文件 commit 見 git log（倉庫內摘要 `notes/v1.4.2/STOP32_REPORT.md`）。**都沒有推送。**
- 倉庫外：`tests/_scratch/` 另有 `s32State.test.ts`、`s32H1Truth.test.ts`（被 git 排除，副本在 `s32/`）。

## 需要我決定的事
見完整版（倉庫外）。摘要：倉庫公開狀態與歷史處理；整表轉錄的去留；SDBS／Reich／Pretsch／Coates 條款查證；nmrshiftdb2 頁尾聲明與兩檔補聲明；Apache-2.0 與 median-quickselect、RDKit WASM；個資改寫；旗標預設（依本站數字 h1 最有理由，但有 3 個雙酚 A 型變差、真值是樣本內、授權未定）；Q3 根因；面板平手算法。
