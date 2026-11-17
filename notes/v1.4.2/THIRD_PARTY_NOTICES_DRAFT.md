# 第三方元件與授權清單（草稿，v1.4.2 第三十三站；第三十四站確認第 2 節）

**這是草稿，不是正式聲明。** 正式的 `THIRD_PARTY_NOTICES.md`／`NOTICE`／`LICENSE` 等專案授權確定後再寫；本檔不改任何授權欄位。
每一項都標了狀態：

- **確定**：直接從套件內的檔案（`package.json`、LICENSE 檔）或二進位檔中讀到的字串確認的。
- **待查**：依上游專案的一般情況判斷，但這次沒有讀到授權原文（例如 npm 包沒附），或沒辦法從二進位檔確認某個元件有沒有被編進去。

資料來源：`node_modules` 內各套件的檔案（2026-11-16）、`pnpm licenses list --json`（第三十二站：正式相依 160 個、全部 261 個）、本站 `corepack pnpm@11.25.0 run build` 產生的打包清單（`dist/THIRD_PARTY_NOTICES.txt`）、`RDKit_minimal.wasm` 的可列印字串掃描。

## 1. 打包進前端 `dist/` 的 npm 套件（15 個，本站建置）

清單由建置過程本身產生（`scripts/bundled-packages-plugin.mjs` → `scripts/append-npm-notices.mjs`），授權全文自動附進 `dist/THIRD_PARTY_NOTICES.txt`。

| 套件 | 版本 | 授權（package.json） | 套件內的授權檔 | 狀態 |
|---|---|---|---|---|
| @rdkit/rdkit | 2026.9.1 | BSD-3-Clause | **沒有**（npm 包只有 3 個 dist 檔＋README；README 寫「license is unchanged. BSD 3-Clause」）；倉庫用 `docs/licenses/RDKit.txt` 補 | 確定（RDKit 本體）；WASM 內含的其他元件見第 2 節 |
| jcampconverter | 9.6.4 | MIT | 有 | 確定 |
| dynamic-typing | 1.0.1 | MIT | 有 | 確定 |
| ensure-string | 1.2.0 | MIT | 有 | 確定 |
| gyromagnetic-ratio | 1.2.1 | MIT | 有 | 確定 |
| is-any-array | 2.0.1 | MIT | 有 | 確定 |
| isutf8 | 4.0.4 | MIT | 有 | 確定 |
| ml-array-median | 1.1.6 | MIT | 有 | 確定 |
| lucide-react | 0.546.0 | ISC | 有 | 確定 |
| react | 19.3.0 | MIT | 有 | 確定 |
| react-dom | 19.3.0 | MIT | 有 | 確定 |
| scheduler | 0.28.0 | MIT | 有 | 確定 |
| xlsx（SheetJS CE） | 0.20.3 | Apache-2.0 | 有 LICENSE；**沒有 NOTICE 檔**（套件根目錄只有 LICENSE、README、CHANGELOG 等） | 確定 |
| rolldown（建置工具的執行期輔助碼） | 1.2.13 | MIT | 有 | 確定 |
| vite（預載輔助碼） | 8.3.4 | MIT | 有（vite 的 LICENSE 另列它打包的相依） | 確定 |

**已移除**：`median-quickselect` 1.0.1（ISC 只有識別字，套件與公開倉庫都沒有授權檔、沒有版權行）。第三十三站以自己的實作 `vendor/median-select/` 取代（`pnpm-workspace.yaml` 的 `overrides` 把 ml-array-median 對它的引用導到本地套件；行為逐位元一致，見 `tests/vendor/medianSelect.test.ts`）。建置清單從 16 個變 15 個，`dist/` 已搜不到這個套件名，也不再有 MISSING 項。`scripts/append-npm-notices.mjs` 裡為它寫的查找說明已在第三十四站刪除（`SEARCH_NOTES` 現在是空的；測試 `v141NpmNotices` 改成釘住「沒有任何套件帶查找說明」）。

## 2. RDKit WASM（`RDKit_minimal.wasm`，7.38 MB）內的第三方元件

**第三十四站：讀了 RDKit 上游倉庫，逐項確認。** 先確認「npm 包是從哪一份原始碼建的」：

- npm `@rdkit/rdkit@2026.9.1` 的 `gitHead` 是 `fece8caa860bdf6c9c82bdb9253f22a0cf87150c`（`npm view @rdkit/rdkit@2026.9.1 gitHead`，有 npm provenance 認證），就是 RDKit 標籤 **`Release_2026_09_1`** 的 commit（`gh api repos/rdkit/rdkit/git/ref/tags/Release_2026_09_1`）。
- 該 commit 的 `.github/workflows/minimallib-publish.yml`：在 GitHub release 時執行 `Code/MinimalLib/scripts/build_rdkitjs.sh`（Docker），再 `npm publish --provenance`。所以 npm 包就是這份倉庫的 Docker 建置食譜產出的。
- 建置食譜（同一 commit）：`Code/MinimalLib/docker/01_deps.Dockerfile` 下載並編譯 **Boost 1.87.0**（只裝 `system`，其餘是標頭檔）、**FreeType 2.13.3**（`VER-2-13-3`，關掉 zlib／bzip2／png／harfbuzz／brotli）、**zlib 1.3.2**，安裝 **Emscripten SDK `latest`**（建置當時的最新版，版本沒有寫死）；`03_build.Dockerfile` 的 cmake 參數：`RDK_BUILD_FREETYPE_SUPPORT=ON`、`RDK_BUILD_INCHI_SUPPORT=ON`、`RDK_BUILD_COORDGEN_SUPPORT=ON`、`RDK_BUILD_MAEPARSER_SUPPORT=OFF`、`RDK_BUILD_CHEMDRAW_SUPPORT=OFF`，並把 `libfreetype.a`、`libz.a` 靜態連結進去。
- 各外部元件的版本由該 commit 的 CMake 檔寫死（含 MD5）：`Code/cmake/Modules/FindInchi.cmake`（InChI **v1.07.3**，`IUPAC-InChI/InChI` 的 release zip）、`External/CoordGen/CMakeLists.txt`（coordgenlibs **v3.0.2**；maeparser 1.3.3 只在 `MAEPARSER_SUPPORT` 開時才用，這裡關掉）、`External/RingFamilies/CMakeLists.txt`（RingDecomposerLib **v1.1.3_rdkit**）。

下表的「授權原文出處」是我實際讀到的檔案（網址＋標籤＋commit），原文副本在倉庫外 `SpecReader/notes/v1.4.2/s34/rdkit_upstream/`（2026-11-16 取得）。「存在」除了建置食譜，也再對 `RDKit_minimal.wasm` 做了字串核對。

| 元件 | 版本（出處） | 存在的證據 | 授權（原文出處） | 版權行 | 散布二進位時的要求 | 狀態 |
|---|---|---|---|---|---|---|
| RDKit 本體 | 2026.9.1＝`Release_2026_09_1` | 路徑字串 141 筆 | BSD-3-Clause：`https://github.com/rdkit/rdkit/blob/fece8caa860bdf6c9c82bdb9253f22a0cf87150c/license.txt` | Copyright (c) 2006-2015, Rational Discovery LLC, Greg Landrum, and Julie Penzotti and others | 附版權行＋條款 | **確定**（倉庫的 `docs/licenses/RDKit.txt` 與上游 `license.txt` 逐字相同） |
| InChI | **1.07.3**（`FindInchi.cmake`；wasm 字串 `InChI version 1, Software 1.07.3`） | 確定 | MIT：`https://github.com/IUPAC-InChI/InChI/blob/v1.07.3/LICENSE`（commit `0b3e941d29289f3e5024c9ecfd45186285319420`） | Copyright (c) 2024 InChI Project | 附版權行＋授權文字 | **確定** |
| coordgenlibs | **3.0.2**（`External/CoordGen/CMakeLists.txt`） | `sketcherMinimizer…` 字串 | BSD-3-Clause：`https://github.com/schrodinger/coordgenlibs/blob/v3.0.2/LICENSE`（commit `c4dd5b0e1f1971c06c7ab85725c185e47211814e`） | Copyright (c) 2017, Schrödinger, Inc. | 附版權行＋條款 | **確定** |
| RingDecomposerLib | **1.1.3_rdkit**（`External/RingFamilies/CMakeLists.txt`） | `RDL_…` 字串 | BSD-3-Clause：`https://github.com/rareylab/RingDecomposerLib/blob/v1.1.3_rdkit/LICENSE`（commit `7b1629781cfb7fda29716d1af14a6110bb553892`） | Copyright (c) 2016 University of Hamburg, ZBH - Center for Bioinformatics, Niek Andresen, Florian Flachsenberg, Matthias Rarey | 附版權行＋條款 | **確定** |
| Boost（標頭檔部分＋`system`） | **1.87.0**（`01_deps.Dockerfile`） | `boost::json`、`property_tree` 等 88 筆 | Boost Software License 1.0：`https://github.com/boostorg/boost/blob/boost-1.87.0/LICENSE_1_0.txt`（commit `c89e6267665516192015a9e40955e154466f4f68`） | （BSL 不要求特定版權行） | 只以機器碼形式散布時**不要求**附聲明 | **確定** |
| FreeType | **2.13.3**（`01_deps.Dockerfile`，`VER-2-13-3`；靜態連結 `libfreetype.a`） | 建置食譜明寫；wasm 有 `truetype`、`sfnt`、`FREETYPE_PROPERTIES` | 二選一：FreeType License（FTL）或 GPLv2。原文：`https://github.com/freetype/freetype/blob/VER-2-13-3/LICENSE.TXT`、`…/docs/FTL.TXT`（commit `42608f77f20749dd6ddc9e0536788eaad70ea4b5`） | FTL：須在文件中致謝，建議句「Portions of this software are copyright © <year> The FreeType Project (www.freetype.org). All rights reserved.」 | 選 FTL（GPLv2 會傳染，不選）：文件中放致謝句 | **確定**（存在、版本、授權）；正式聲明要加 FTL 致謝句 |
| zlib | **1.3.2**（`01_deps.Dockerfile`；靜態連結 `libz.a`） | **確定**：wasm 內有 zlib inflate 自己的錯誤字串（`incorrect header check`、`invalid distance too far back`、`need dictionary`、`unknown compression method`）。版本字串（`inflate 1.3.2 Copyright`）不在 wasm 內，版本只能依建置食譜 | zlib License：`https://github.com/madler/zlib/blob/v1.3.2/LICENSE`（commit `da607da739fa6047df13e66a2af6b8bec7c2a498`） | (C) 1995-2026 Jean-loup Gailly and Mark Adler | 二進位散布**不要求**附聲明（只要求不誤稱原作、改版要標明） | **確定**（第三十三站的「可能沒連結」更正為有連結） |
| Telex Regular 字型 | RDKit `Data/Fonts/Telex-Regular.ttf` | wasm 內有字型 name 表與 `/Data/Fonts/` 路徑 | SIL OFL 1.1：`https://github.com/rdkit/rdkit/blob/fece8caa860bdf6c9c82bdb9253f22a0cf87150c/Data/Fonts/telex_font_license.txt` | Copyright 2011 The Telex Project Authors (info@andrestorresi.com.ar), with Reserved Font Name Telex. | 附版權行＋OFL 全文（可放在字型中繼資料；字型本身已帶） | **確定**；**OFL 1.1 全文已附進正式聲明**：`docs/licenses/Telex-Regular-OFL-1.1.txt`，由 `scripts/prepare-assets.mjs` 併入部署的 `/THIRD_PARTY_NOTICES.txt`（RDKit 聲明之後），測試 `tests/v14/v142TelexOfl.test.ts` |
| Emscripten 執行期與 JS 載入器 | **版本待查**：建置食譜用 `emsdk install latest`，沒有寫死；`RDKit_minimal.js`／`.wasm` 內找不到 Emscripten 版本字串 | JS 內 `emscripten` 30 處 | MIT 或 University of Illinois/NCSA 二選一：`https://github.com/emscripten-core/emscripten/blob/23212b68ad5d48b56db3cd7d3204392a325af1f3/LICENSE`（**main 分支**，2026-11-16；因為不知道建置用的版本，只能取目前版本的原文，這份授權多年未變） | Copyright (c) 2010-2014 Emscripten authors（見原文） | 附版權行＋授權文字 | 授權**確定**；**版本待查**（原因：版本沒有寫死，二進位裡沒有版本字串；要確定得看 GitHub Actions 該次建置的日誌，需要登入且可能已過期，這次沒有查） |
| libc++abi（LLVM，Emscripten 自帶） | 同 Emscripten | `/emsdk/emscripten/system/lib/libcxxabi/src/…` 路徑 2 筆 | Apache-2.0 WITH LLVM-exception：`…/emscripten/blob/23212b68…/system/lib/libcxxabi/LICENSE.TXT` | （見原文） | LLVM exception：以編譯後形式散布**不要求**附聲明 | **確定**（存在、授權）；版本同 Emscripten 待查 |
| libc++、compiler-rt（LLVM，Emscripten 自帶） | 同 Emscripten | wasm 內**沒有**路徑字串 | Apache-2.0 WITH LLVM-exception：`…/system/lib/libcxx/LICENSE.TXT`、`…/system/lib/compiler-rt/LICENSE.TXT`（同 commit） | — | 同上，不要求 | **待查**（原因：二進位沒有直接證據；C++ 程式通常會連結，但無法從檔案確認） |
| musl libc（Emscripten 的 C 標準函式庫） | 同 Emscripten | wasm 內**沒有**路徑或名稱字串 | MIT：`…/emscripten/blob/23212b68…/system/lib/libc/musl/COPYRIGHT` | Copyright © 2005-2020 Rich Felker, et al. | MIT：附版權行＋授權文字（若有連結） | **待查**（原因：Emscripten 編出的 C/C++ 程式一律帶它的 libc，但二進位沒有可核對的字串，連結了哪些部分無法確認；保守起見正式聲明可一併附上） |
| Avalon toolkit | — | 只有 1 筆 `avalon` | — | — | — | **不在**：`RDK_BUILD_AVALON_SUPPORT` 預設 OFF（根 `CMakeLists.txt` 第 38 行），建置食譜沒有打開 |
| maeparser | — | 沒有字串 | — | — | — | **不在**：建置食譜 `RDK_BUILD_MAEPARSER_SUPPORT=OFF` |
| ChemDraw 支援 | — | — | — | — | — | **不在**：`RDK_BUILD_CHEMDRAW_SUPPORT=OFF` |
| YAeHMOP、FreeSASA | — | 沒有字串 | — | — | — | **不在**：兩者預設 OFF，建置食譜沒有打開 |
| PubChem shape（pubchem-align3d） | — | 沒有字串（`pubchem`、`align3d` 0 筆） | — | — | — | **不在**（根 `CMakeLists.txt` 預設 ON，但 MinimalLib 沒有連結它；二進位無字串） |
| Eigen | — | 沒有 `Eigen::` 字串（`eigen` 的 2 筆是 RDKit 自己的 `EigenSolvers`） | （MPL-2.0） | — | — | **不在**（建置映像有裝 `libeigen3-dev`，但二進位沒有 Eigen 的符號） |

**還是「待查」的只有三項**：Emscripten 的版本、libc++／compiler-rt 是否連結、musl 連結了哪些部分。三者的**授權原文都已取得**，只是無法從二進位或建置食譜確認版本／是否在內；沒有繞過任何限制（沒有登入 GitHub Actions 看建置日誌）。

## 3. 後端（`dist/server.mjs`，執行期從 `node_modules` 載入，不打包）

express 4.22（MIT）、dotenv 17（BSD-2-Clause）、@google/genai 2.28（Apache-2.0）及其相依（google-auth-library、gaxios、gcp-metadata、google-logging-utils、ecdsa-sig-formatter、long 等，Apache-2.0／MIT）。**都與 Apache-2.0 相容；狀態：確定（第三十二站 `pnpm licenses`）**。是否需要附聲明取決於發布物是否含 `node_modules`（`git archive` 的 zip 不含）。

## 4. 只在建置／測試使用（不進 `dist/`，不散布）

vite、vitest、typescript（Apache-2.0）、playwright（Apache-2.0）、esbuild、tsx、tailwindcss、autoprefixer、mf-finder 3.4.25（MIT，只在一個測試）、supertest、lightningcss（MPL-2.0，檔案級 copyleft；只作建置工具，沒有散布，無義務）、caniuse-lite（CC-BY-4.0，資料，建置期）、binary-search（CC0）、tslib（0BSD）。`motion`（MIT）在 package.json 但 `src/` 沒有引用。**狀態：確定**。GPL／AGPL／LGPL：0 個；授權欄位不明：0 個（`pnpm` 只列本機平台安裝的套件，其他平台的選用二進位套件沒列，同家族 MIT／MPL）。

## 5. 資料與表值（第三十二站的結論，沒有變動）

| 項目 | 是否嵌入 | 授權 | 狀態 |
|---|---|---|---|
| Ambit-HNMR 1.2 知識庫 | 是（原檔逐字） | CC-BY-4.0，需署名（已有） | 確定 |
| nmrshiftdb2 | 程式內 8 個類別位移；真值表 102 筆在測試夾 | nmrshiftdb2 Database License（聲明句、§4.3 產出物聲明、§4.5 OSI 授權要求） | 確定；第三十三站補了 `extraction_stats.json`（`notice` 欄位）與 `extract_h1.py` 的聲明句；**第三十四站：網站頁尾與 Mode B 的 ¹H 預測區塊已顯示聲明句**（`src/ui/Nmrshiftdb2Notice.tsx`，測試 `tests/ui/nmrshiftdb2Notice.test.ts`） |
| 殘留溶劑／雜質峰表（Gottlieb 1997、Fulmer 2010、Babij 2016） | 是 | 期刊版權 | 待查 |
| Fulmer 2010 SI Table S1／S7 | 是（測試真值，整表轉錄） | 期刊 SI | 待查（去留待決定） |
| Pretsch 增量 | 經 Ambit；另 `AROMATIC_SUBSTITUENT_INCREMENTS` | 書 | 待查 |
| Reich、SDBS、ChemicalBook、RSC SI | 只在測試真值 | 各網站條款 | 待查 |
| Coates（IR） | 少量窗位置 | 書 | 待查是否需註明 |
| NIST WebBook | **沒有嵌入**（只有 ID／URL／雜湊） | NIST SRD 69 | 確定不入庫 |

## 6. 正式聲明要寫的東西（整理成清單，待專案授權確定後動筆）

1. RDKit：BSD-3 全文（已有）＋第 2 節已確認的 InChI 1.07.3（MIT）、coordgenlibs 3.0.2（BSD-3）、RingDecomposerLib 1.1.3_rdkit（BSD-3）、FreeType 2.13.3（FTL 致謝句）、Emscripten（MIT／NCSA；版本待查）、musl（MIT；待查，保守附上）的版權行與授權文字；Boost 1.87.0、zlib 1.3.2、libc++abi 依授權不要求附聲明，可列名致謝。**Telex 字型 OFL 1.1 全文已附（第三十四站）。**
2. 第 1 節的 npm 套件：由建置自動產生（已運作）。
3. Ambit-HNMR 署名句（已有）、nmrshiftdb2 聲明句與授權連結（已有；網站頁尾與 ¹H 區塊已顯示，第三十四站）。
4. 資料來源一節（`docs/licenses/Data-Sources.txt`，依第 5 節待查結果改寫）。
5. 後端相依（若發布物含 `node_modules`）。
6. 專案自己的 LICENSE／NOTICE：等你決定（本站依指示沒有建立）。
