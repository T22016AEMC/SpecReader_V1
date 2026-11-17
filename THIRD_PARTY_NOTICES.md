# 第三方來源及再散布聲明

- RDKit／`@rdkit/rdkit` 2026.9.1：BSD-3-Clause；完整官方聲明 `docs/licenses/RDKit.txt`，建置時複製到 `/rdkit/LICENSE.txt`。使用官方 npm WASM，沒有重製私有模型或資料庫。
  - RDKit WASM 內嵌的 **Telex Regular 字型**（RDKit 繪製結構圖用）：SIL Open Font License 1.1，Copyright 2011 The Telex Project Authors；OFL 1.1 全文 `docs/licenses/Telex-Regular-OFL-1.1.txt`（取自 RDKit `Release_2026_09_1` 的 `Data/Fonts/telex_font_license.txt`，原文未改），併入部署的 `/THIRD_PARTY_NOTICES.txt`（v1.4.2 第三十四站）。WASM 內其他元件的正式聲明在 `docs/licenses/RDKit-WASM-components.txt`（v1.4.2 第三十五站，併入部署的 `/THIRD_PARTY_NOTICES.txt`，緊接在 Telex 之後）：InChI 1.07.3（MIT）、coordgenlibs 3.0.2（BSD-3）、RingDecomposerLib 1.1.3_rdkit（BSD-3）、**FreeType 2.13.3（選 FreeType License；附 FTL 建議的致謝句「Portions of this software are copyright © 1996-2024 The FreeType Project (www.freetype.org). All rights reserved.」，年份取自 2.13.3 原始碼檔頭）**、zlib 1.3.2（zlib License，已確認靜態連結）、Boost 1.87.0（BSL-1.0）、Emscripten 執行期（MIT／NCSA，**版本未確認**）、libc++abi（Apache-2.0 WITH LLVM-exception）、libc++ 與 compiler-rt（同授權，**可能連結**）、musl（MIT，**可能連結**），各附授權原文與讀取網址。清點過程見 `notes/v1.4.2/THIRD_PARTY_NOTICES_DRAFT.md` 第 2 節。
- `jcampconverter` **9.6.4**：MIT，Copyright (c) 2014 Luc Patiny；完整包內聲明 `docs/licenses/jcampconverter-9.6.4.txt`。固定版本，禁止以新版不同授權取代。
- SheetJS Community Edition 0.20.3：Apache-2.0，官方固定 tarball／lockfile integrity；`docs/licenses/SheetJS-0.20.3.txt`。修原 0.18.5 的 prototype pollution／ReDoS 公告，保留 Excel 功能。四份聲明（RDKit、jcampconverter、SheetJS、Ambit-HNMR）合併供 `/THIRD_PARTY_NOTICES.txt`（v1.4.1 第二十站起含 Ambit-HNMR，見下節）。
- cheminfo `mf-finder` **3.4.25**（devDependency，P1a 起）：MIT，Copyright (c) 2018 cheminfo。**只在 `tests/composition.test.ts` 交叉核對分子式枚舉結果，不被 `src/` 引用、不進入正式建置或 `dist/`**，因此不併入 `/THIRD_PARTY_NOTICES.txt`。其間接依賴：`mf-parser`、`mf-matcher`、`mf-utilities`、`atom-sorter`、`chemical-elements`、`chemical-groups`、`ml-spectra-processing`、`ml-matrix`、`ml-array-max`、`ml-array-min`、`ml-array-rescale`、`ml-xsadd`、`fft.js`、`is-any-array`（皆 MIT）及 `binary-search`（CC0-1.0，公眾領域聲明；僅開發與測試使用，經專案規劃者確認可接受）。P1a 的正式組成推斷（`src/engines/composition/`）依 mf-finder 的枚舉原理與 Kind & Fiehn 2007 Seven Golden Rules 自行實作，沒有複製其程式碼。
- 原 React／Vite／Express／SheetJS／圖形元件及間接依賴的版本見 `pnpm-lock.yaml`，各自 npm 套件中的 LICENSE 保留；本項目公開不變更其著作權。
- Whittaker／AsLS 求解、質量卷積及圖片段程式碼由本輪依數學原理自行實作，没有複製 pybaselines、pyteomics、CFM-ID 或其他未確認許可的程式碼。
- 不包含 SIRIUS／CFM-ID／FullSSPrUCe 權重、未授權譜庫或 NIST 原始實測光譜。公開 JSON 只含來源／雜湊／比較結果，不含波形。
- 資料與文獻來源（用途、引用格式、SDBS 指定致謝句）：`docs/DATA_SOURCES_AND_ACKNOWLEDGEMENTS.md`（第三十五站）。
- 此 Repository 可公開查看；SpecReader 自有原始碼的獨立開源 LICENSE 尚未由擁有人指定。第三方的寬鬆授權不自動授權整個產品；不代替使用者授權作出新的自有軟體許可承諾。


## Ambit-HNMR 知識庫（v1.4.0，`useV140H1` 旗標之下使用）

- **Ambit-HNMR v1.2** 的 `hnmr-knowledgebase.txt`（11,943 位元組，MD5 `98ec944631458e1f3c14c4c29f13074a`）：Nikolay Kochev、Slava Tsoneva、Maria Frenkeva、Nina Jeliazkova。來源 https://zenodo.org/records/4629851 （DOI 10.5281/zenodo.4629851）。授權 **Creative Commons Attribution 4.0 International（CC-BY-4.0）**。
- 署名文字：「1H additive-increment knowledge base from Ambit-HNMR v1.2 (Kochev, Tsoneva, Frenkeva, Jeliazkova), https://doi.org/10.5281/zenodo.4629851, licensed under CC-BY 4.0. The file is used as data without changes; SpecReader reads the numbers by substituent name.」
- 署名與改動聲明另存 `docs/licenses/Ambit-HNMR-1.2.txt`，由 `scripts/prepare-assets.mjs` 併入部署的 `/THIRD_PARTY_NOTICES.txt`。
- 放在 `third_party/ambit-hnmr/`（檔案原樣＋README）；同一份文字原樣嵌入 `src/engines/scientificEngines/ambitHnmrKnowledgeBase.ts`（測試檢查兩者一致）。只下載這一個檔案，未下載 Java 程式或其他資料。

## NMRShiftDB2（v1.4.2 第二十六站，`useV140H1` 的 `v140.oxygen`／`v140.calibration2` 子旗標之下使用，預設關）

- 聲明（授權第 4.3 條範例文字）：「Contains information from nmrshiftdb2 (www.nmrshiftdb.org), which is made available here under the nmrshiftdb2 Database License.」授權條文 URI：https://nmrshiftdb.nmr.uni-koeln.de/nmrshiftdbhtml/nmrshiftdb2datalicense.txt
- 用途：從 nmrshiftdb2 的**實測** CDCl₃ ¹H 譜算出 8 個 ¹H 類別位移（第二十六站 11 個，第二十八站依新採用門檻撤銷或拆開後剩 8 個；環丙烷／環丁烷／吲哚／苯并呋喃的位移另與舊文獻真值合併重擬合）（`V12_CONFIG.v142Nmrshiftdb2.rules`，`src/engines/scientificEngines/h1Nmrshiftdb2.ts`）。程式內只有這 8 個位移值與統計摘要，沒有收錄資料庫的譜圖或結構。
- 真值表：`tests/fixtures/v140/nmrshiftdb2/h1TruthNmrshiftdb2.json`（只含通過採用門檻的類別、102 筆、71 個化合物，每筆附 nmrshiftdb2 編號、譜號與溶劑），旁附授權全文 `nmrshiftdb2datalicense.txt` 與 `README.md`（授權第 4.2 條）。只在測試使用，不進入 `dist/`。原始下載檔 `nmrshiftdb2withsignals.sd` 不在倉庫內。
- 抽取方法：`scripts/nmrshiftdb2/extract_h1.py`（只取實測譜，排除計算譜與自動歸屬）＋`tests/helpers/v142Nmrshiftdb2Study.ts`（授權第 4.7 條 b 的「做法」）。
- **授權第 4.5 條：依賴本資料庫、其衍生資料庫或產出結果運作的軟體，必須以 OSI 核可的開源授權發布（明文包含「使用該資料庫做預測的 NMR 預測軟體」）。** SpecReader 自有原始碼的開源授權尚未由擁有人指定（見上）；**含這些位移值的版本公開發布前，必須先選定 OSI 授權。**
- 部署的 `/THIRD_PARTY_NOTICES.txt` 經 `docs/licenses/Data-Sources.txt` 第 4 節帶有上面的聲明與 URI。v1.4.2 第三十四站起，網站頁尾與 Mode B 的 ¹H 預測區塊也顯示這句聲明（附授權條文連結；`src/ui/Nmrshiftdb2Notice.tsx`，測試 `tests/ui/nmrshiftdb2Notice.test.ts`）。

## 部署的 /THIRD_PARTY_NOTICES.txt 的組成（v1.4.1 第二十一站起）

- `scripts/prepare-assets.mjs`（prebuild）：RDKit、Telex 字型 OFL 1.1（第三十四站起，緊接在 RDKit 之後）、RDKit WASM 元件（第三十五站起，緊接在 Telex 之後）、jcampconverter、SheetJS、Ambit-HNMR 六份聲明，加上 `docs/licenses/Data-Sources.txt`（資料來源一節，**不是授權**：溶劑殘留峰 Gottlieb 1997／Fulmer 2010／Babij 2016、取自 Fulmer 2010 SI Table S1 的校準常數、Pretsch 引用；內容取自程式內的引用登記與註解）。
- `scripts/append-npm-notices.mjs`（`pnpm build` 的最後一步）：附上「實際打包進 dist 的 npm 套件」的授權清單（套件名、版本、授權、版權行、授權全文）。套件清單來自建置本身：`scripts/bundled-packages-plugin.mjs`（掛在 `vite.config.ts` 的 plugin 與 worker plugin）記錄每個輸出 chunk 的模組檔案屬於哪個 npm 套件；授權全文複製自各套件自己的 LICENSE 檔。找不到授權檔的套件在清單中標 MISSING，不補寫（`@rdkit/rdkit` 的 npm 套件沒有授權檔，用倉庫的 `docs/licenses/RDKit.txt`，清單內註明）。
- Ambit-HNMR 署名只列作者姓名（不列單位），並附 CC-BY-4.0 條文連結 https://creativecommons.org/licenses/by/4.0/。
