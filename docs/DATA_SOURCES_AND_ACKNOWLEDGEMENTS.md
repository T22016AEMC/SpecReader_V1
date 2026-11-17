# 資料來源與致謝

本頁列出 SpecReader 倉庫**實際用到**的外部資料與文獻：每個來源用在哪裡、倉庫裡放了什麼、以及引用格式。只列倉庫裡有數值、有程式依據或有測試用到的來源；只在討論中提過、沒有用到的不列。

- 這不是授權文件。程式元件的授權見 `THIRD_PARTY_NOTICES.md` 與 `docs/licenses/`（部署時合併成 `/THIRD_PARTY_NOTICES.txt`）。
- 「本機專用」＝依來源條款不放進公開倉庫的檔案（`tests/fixtures/local-only/`，已列入 `.gitignore`）。需要這些檔案的測試在檔案不存在時會自動略過並印出一句說明。
- 標 ＊ 的引用：倉庫原本只記了作者、題目或書名，卷、頁、出版者與年份是第三十五站依公開書目補上的。倉庫完全沒有記錄文章細節的來源，照實寫「沒有記錄」，不猜。

## 1. 溶劑殘留峰與微量雜質位移

| 來源 | 用途 | 倉庫裡放了什麼 |
|---|---|---|
| Fulmer 等 2010 | 辨認 ¹H 譜中的溶劑、水與常見雜質峰；v1.4.0 起的溶劑位移修正常數；¹H 預測器的第一級真值（只在測試） | 程式內的峰位表（`src/engines/scientificEngines/nmrAtomicEnvironmentModel.ts` 的 `TRACE_IMPURITY_SHIFT_TABLE`）；由 Table S1 算出的類別平均修正值（`h1SolventRules.ts`）；測試用的衍生檔（Table S1 的 677 個數值與 Table S7 的 31 個譜）自 1.4.2 起**不在公開倉庫內**，只放在本機專用的 `tests/fixtures/local-only/fulmer2010/`（已列入 .gitignore；沒有這些檔時相關測試自動略過）；原表的編排也不在倉庫內 |
| Gottlieb 等 1997 | 同上（溶劑殘留峰、TMS、HDO） | 程式內的峰位表 |
| Babij 等 2016 | 同上（製程與綠色化學溶劑） | 程式內的峰位表 |

引用格式：

- Fulmer, G. R.; Miller, A. J. M.; Sherden, N. H.; Gottlieb, H. E.; Nudelman, A.; Stoltz, B. M.; Bercaw, J. E.; Goldberg, K. I. NMR Chemical Shifts of Trace Impurities: Common Laboratory Solvents, Organics, and Gases in Deuterated Solvents Relevant to the Organometallic Chemist. *Organometallics* **2010**, *29*, 2176–2179. https://doi.org/10.1021/om100106e
- Gottlieb, H. E.; Kotlyar, V.; Nudelman, A. NMR Chemical Shifts of Common Laboratory Solvents as Trace Impurities. *J. Org. Chem.* **1997**, *62*, 7512–7515. https://doi.org/10.1021/jo971176v ＊
- Babij, N. R.; McCusker, E. O.; Whiteker, G. T.; Canturk, B.; Choy, N.; Creemer, L. C.; De Amicis, C. V.; Hewlett, N. M.; Johnson, P. L.; Knobelsdorf, J. A.; Li, F.; Lorsbach, B. A.; Nugent, B. M.; Ryan, S. J.; Smith, M. R.; Yang, Q. NMR Chemical Shifts of Trace Impurities: Industrially Preferred Solvents Used in Process and Green Chemistry. *Org. Process Res. Dev.* **2016**, *20*, 661–667. https://doi.org/10.1021/acs.oprd.5b00417 ＊

## 2. ¹H 位移增量與知識庫

| 來源 | 用途 | 倉庫裡放了什麼 |
|---|---|---|
| Ambit-HNMR v1.2 知識庫 | v1.4.0 的 ¹H 加成規則（`useV140H1` 旗標下） | 原檔逐字（`third_party/ambit-hnmr/`），CC-BY-4.0，署名見 `docs/licenses/Ambit-HNMR-1.2.txt` |
| nmrshiftdb2 | 8 個 ¹H 類別位移（`V12_CONFIG.v142Nmrshiftdb2`，預設關）；測試真值 | 程式內只有 8 個位移值與統計摘要；測試真值 102 筆（`tests/fixtures/v140/nmrshiftdb2/`，附授權全文） |
| Pretsch 等 | 芳香取代基增量與脂肪族加成規則的出處登記（`PRETSCH_EMPIRICAL_TABLES`）；一筆測試真值 | 程式內的增量數值與引用標記 |

引用格式：

- Kochev, N.; Tsoneva, S.; Frenkeva, M.; Jeliazkova, N. Ambit-HNMR v1.2, 1H additive-increment knowledge base. Zenodo. https://doi.org/10.5281/zenodo.4629851 （CC-BY-4.0）
- nmrshiftdb2 — 必須附的聲明（授權第 4.3 條）：**Contains information from nmrshiftdb2 (www.nmrshiftdb.org), which is made available here under the nmrshiftdb2 Database License.** 授權條文：https://nmrshiftdb.nmr.uni-koeln.de/nmrshiftdbhtml/nmrshiftdb2datalicense.txt 。網站頁尾、Mode B 的 ¹H 預測區塊、Mode A 顯示 ¹H 預測結果的候選卡片都會顯示這句。
- Pretsch, E.; Bühlmann, P.; Badertscher, M. *Structure Determination of Organic Compounds: Tables of Spectral Data*, 5th ed.; Springer, 2020.

## 3. 文獻與網站上的單點數值（只在測試真值與校準）

| 來源 | 用途 | 倉庫裡放了什麼 |
|---|---|---|
| Hans Reich's Collection | ¹H 第二、三級真值（只用來驗證，部分用於 v1.4.0 的類別校準）；苯取代基增量（只檢查趨勢） | 從圖上手讀的單點位移（`tests/fixtures/v140/h1Truth2.json`、`h1Truth3.json`），每筆附來源標記；程式註解中引用的校準點 |
| SDBS | 使用者查閱的 ¹H 位移（第二級真值 A 類），曾用於 v1.4.0 的類別校準 | **公開倉庫不收錄這些數值**：A 類條目放在本機專用檔；程式只保留由它們算出的校準常數（`V12_CONFIG.v140Calibration2`） |
| ChemicalBook | 同上（A 類，與 SDBS 一起標示；另一筆第二輪條目） | 同上，公開倉庫不收錄 |
| RSC 期刊補充資料、*Chem. Sci.* 2020 補充資料 | 第二級真值中「第一級品質」的少數數值（T1g） | 單點位移與來源標記（倉庫沒有記錄文章細節） |
| 期刊數值（v1.4.0 第十三站清單 F 部分） | 第二級真值 J 類（候選第一級） | 單點位移與來源標記（倉庫沒有記錄文章細節） |

引用格式：

- **Hans Reich's Collection**（Hans J. Reich, NMR Spectroscopy collection, https://organicchemistrydata.org/）
- SDBS 指定的致謝句：**SDBS : https://sdbs.db.aist.go.jp/ , National Institute of Advanced Industrial Science and Technology, 存取日期 2026-11**（存取日期由規劃者指定為 2026-11）
- ChemicalBook, https://www.chemicalbook.com/ （存取日期同上）
- acetalCH2（−0.88）來自單一 SDBS 測量值，已依 SDBS 致謝；發布後將以非 A 級來源重新校準。

## 4. 紅外光譜

| 來源 | 用途 | 倉庫裡放了什麼 |
|---|---|---|
| Coates | IR 帶的窗位置（硝基、羰基各類、醛 C–H 等）的核對依據 | 程式自己的窗（多為規劃者放寬的工程判斷）與引用 |
| Socrates | 矽氧烷帶的經驗知識 | 一條帶的規則與引用 |
| Koshelev（*Applied Spectroscopy*） | 脂肪族硝基帶的強弱 | 引用（倉庫沒有記錄文章細節） |
| NIST Chemistry WebBook（NIST SRD 69） | 驗證用的實測 IR 譜 | **只有**編號、網址與檔案雜湊（`validation/measured-ir-manifest.json`），譜檔本身不在倉庫 |

引用格式：

- Coates, J. Interpretation of Infrared Spectra, A Practical Approach. In *Encyclopedia of Analytical Chemistry*; Meyers, R. A., Ed.; John Wiley & Sons, 2000. ＊
- Socrates, G. *Infrared and Raman Characteristic Group Frequencies: Tables and Charts*, 3rd ed.; John Wiley & Sons, 2001. ＊
- Linstrom, P. J.; Mallard, W. G., Eds. *NIST Chemistry WebBook, NIST Standard Reference Database Number 69*; National Institute of Standards and Technology: Gaithersburg, MD. https://doi.org/10.18434/T4D303 ＊

## 5. 分子式篩選規則

| 來源 | 用途 | 倉庫裡放了什麼 |
|---|---|---|
| Kind & Fiehn 2007 | 組成推斷的元素上限與比例規則（Seven Golden Rules） | 依論文自行實作的規則與門檻 |

- Kind, T.; Fiehn, O. Seven Golden Rules for heuristic filtering of molecular formulas obtained by accurate mass spectrometry. *BMC Bioinformatics* **2007**, *8*, 105. https://doi.org/10.1186/1471-2105-8-105

---

v1.4.2 第三十五站整理。來源有增減時，請一併更新本頁與 `docs/licenses/Data-Sources.txt`。
