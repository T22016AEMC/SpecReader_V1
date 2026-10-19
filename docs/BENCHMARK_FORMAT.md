# SpecReader 基準評測：案例格式與使用方式

這份說明同時放在倉庫的 `docs/BENCHMARK_FORMAT.md` 與 benchmark 資料夾的 `README.md`，內容相同。

評測工具量測的是**目前的 Mode A**，它不修改任何分析邏輯。每個案例都經過與 UI 相同的正式入口 `executeSixStepAnalysis`，輸入形狀與 UI 傳給 `modeA.worker.ts` 的一致。

**光譜原始資料不進 Git。** benchmark 資料夾在倉庫外（預設 `..\benchmark`）。倉庫內只會有匯總（案例 id、名稱、答案 SMILES、指標），不含任何光譜數值。

## 資料夾結構

```
SpecReader\
├─ SpecReader_V1\      倉庫
├─ benchmark\          測試圖譜與答案（Git 外）
│  ├─ README.md        本說明
│  └─ cases\
│     └─ <case_id>\    例如 0001_ethyl_benzoate
│        ├─ case.json
│        └─ （光譜檔，檔名自訂，由 case.json 指定）
├─ releases\           每版壓縮檔
└─ notes\              各版驗收報告與完整評測結果
```

## case.json

```json
{
  "id": "0001_ethyl_benzoate",
  "name": "Ethyl benzoate",
  "answerSmiles": "CCOC(=O)c1ccccc1",
  "formula": "C9H10O2",
  "source": {"name": "資料來源名稱", "url": "網址", "notes": "授權或取得方式備註"},
  "tags": [],
  "spectra": {
    "IR":      {"file": "ir.jdx"},
    "1H_NMR":  {"file": "h1.json", "solvent": "CDCl3", "frequencyMHz": 400},
    "13C_NMR": {"file": "c13.json", "solvent": "CDCl3", "dept": null},
    "MS":      {"file": "ms.csv", "ionization": "EI", "adduct": "[M]+•", "ionAssignmentConfirmed": true, "highResolution": false}
  }
}
```

- 必填：`id`、`answerSmiles`、`spectra`（至少一個模態，每個都要有 `file`）。`name` 缺少時用 `id`。
- `spectra` 中任何模態都可以省略。目前支援 `IR`、`1H_NMR`、`13C_NMR`、`MS`；其他鍵（例如 `MS/MS`、`ToF-SIMS`）會被列為「無法對應」並略過。
- `formula` 只在 `withFormula` 條件使用；沒有 `formula` 的案例只跑 `noFormula`。`formula` 與 `answerSmiles` 算出的分子式不一致時，報告會警告；「正確分子式」指標一律以 `answerSmiles` 為準。
- `id` 建議與資料夾同名，不同名時報告會警告。
- `tags` 含 `synthetic`（或 `id` 以 `synthetic_` 開頭）的案例仍會執行，但**不計入準確率**。這是給程式內建冒煙測試用的，真實案例不要使用。

## 光譜檔

依副檔名判斷：

| 類型 | 副檔名 | 處理 |
|---|---|---|
| 數值光譜 | `.csv` `.txt` `.tsv` `.jdx` `.dx` `.jcm` `.jcamp` `.xls` `.xlsx` | 呼叫 `SpectrumParser.parseUploadedFile`（與 UI 上傳同一條路徑，自動尋峰開啟） |
| 峰表 JSON | `.json` | 見下節，以人工標峰的語意進入系統 |
| 圖片 | `.png` `.jpg` `.jpeg` `.webp` `.gif` `.bmp` `.tif` `.tiff` `.pdf` | 無法無頭評測：列為「需人工轉成峰表」並略過該光譜，不會中止。案例若還有其他可評測的光譜就用其餘光譜執行（並依實際使用的模態分組）；一個都沒有則整個案例略過 |
| 其他副檔名 | — | 略過該光譜並在報告註明 |

檔案路徑必須在案例資料夾內。

### 峰表 JSON

給只有峰值表的公開資料使用。格式是陣列：

```json
[
  {"x": 8.05, "y": 60, "integration": 2, "multiplicity": "d", "j": [8.0]},
  {"x": 1.38, "y": 100, "integration": 3, "multiplicity": "t", "j": [7.1]}
]
```

轉成 `ExperimentalSpectrumData` 的方式比照 `tests/fixtures.ts`，每個峰標記 `manualPeak: true`、`detectionSource: "MANUAL"`。

| 欄位 | 對應 | 備註 |
|---|---|---|
| `x` | `SpectralPeak.x` | 必填；IR 為 cm⁻¹、NMR 為 ppm、MS 為 m/z |
| `y` | `SpectralPeak.y` | 選填。沒有時設為 100 並標記 `intensityKnown: false`（¹³C 峰表通常沒有強度） |
| `integration`、`integral` | 同名 | 相對積分；沒有就省略，不要填 0 |
| `multiplicity` | 同名 | `s d t q dd dt dq td tt ddd AA'BB' m br "br s" sept sext quint multiplet unresolved` |
| `j` 或 `jValues` | `SpectralPeak.jValues` | Hz 陣列 |
| `width`、`shape`、`isBroad`、`irIntensity`、`assignment`、`deptType`、`intensityKnown` | 同名 | 直接帶入 |

不在表內的欄位**不會被靜默忽略**，會列在報告的「無法對應」清單。

**峰表請不要包含殘餘溶劑峰與 TMS 參考峰。** Mode A 目前會把所有標記的峰當成分析物（`observationSpectrum` 會重設 UI 的溶劑標記，詳見 `docs/MODE_A_PATH_MAP.md` 第 2 節發現 4）。數值光譜的自動尋峰結果同樣不會排除溶劑峰，這是現況，評測量到的就是這個現況。

## 欄位如何對應到既有解析器／資料結構

`SpectrumParser.parseUploadedFile(file, modality, msParams?, options?)` 只接受檔案、模態與（MS/MS、ToF-SIMS 用的）`msParams`；溶劑、頻率等條件是 UI 在載入之後另外寫進光譜物件的。評測工具照 UI 的做法：

| case.json 欄位 | 寫入位置 | UI 對應操作 |
|---|---|---|
| `1H_NMR.solvent`、`13C_NMR.solvent` | `WorkbenchOrchestrator.applyNmrSolventTagging(spec, solvent)` → `spec.nmrSolvent` | 氘代溶劑下拉選單 |
| `frequencyMHz` | `spec.spectrometerFrequencyMHz` | 儀器頻率下拉選單 |
| `13C_NMR.dept` | `spec.c13ExperimentMode` | 「實驗型態」下拉選單 |
| `MS.ionization` | `spec.msParams.ionization` | 「MS 離子化方法」 |
| `MS.adduct` | `spec.msParams.adductType` | 「MS 加合離子」 |
| `MS.ionAssignmentConfirmed` | `spec.msParams.ionAssignmentConfirmed` | 「分子離子／加合及電荷已由實驗確認」 |
| `MS.highResolution` | `spec.msParams.isHighResolution` | 「HRMS」 |
| `MS.chargeState`（選填，格式擴充） | `spec.msParams.chargeState` | 「MS 電荷」 |

允許的值：

- `solvent`：`CDCl3`、`DMSO-d6`、`CD3OD`、`D2O`、`Acetone-d6`、`CD3CN`、`C6D6`、`THF-d8`、`CD2Cl2`、`Toluene-d8`、`Unknown`
- `dept`：`DEPT_135`、`DEPT_90`、`APT`、`BROADBAND_DECOUPLED`、`1D_PROTON_DECOUPLED`、`UNKNOWN`（大小寫不拘，`DEPT-135` 的連字號也接受）；`null` 或省略 = 不設定
- `ionization`：`EI`、`ESI+`、`ESI-`、`APCI`、`SIMS / ToF-SIMS`、`ToF-SIMS+`、`ToF-SIMS-`、`Other`、`Auto / Unknown`
- `adduct`：`Auto`、`[M]+•`、`[M+H]+`、`[M+Na]+`、`[M+NH4]+`、`[M-H]-`

注意事項：

- UI 要先填電荷與具體加合離子，才允許勾選「離子歸屬已確認」。`ionAssignmentConfirmed: true` 但 case.json 沒有 `chargeState` 時，工具設 `chargeState = 1`（上述加合都是單電荷）並在報告備註；沒有具體 `adduct` 時此旗標會被忽略並列為「無法對應」。
- `MS.polarity`、溫度、MS 之外的實驗條件，case.json 沒有欄位，也沒有送進引擎。
- 值不在允許清單、型別錯誤，或鍵名不認得（例如 `1H_NMR.temperatureK`）時，該項會列在完整報告的「案例資料備註」，不會靜默忽略。

## 評測條件與預算

每個案例跑兩個條件：

- `noFormula`：不提供分子式（**主要指標**）。
- `withFormula`：以 `extraInput.molecularFormula` 提供 case.json 的 `formula`（App.tsx 的 `extraChemicalInput` 使用的同一個欄位）。

可重現性：搜尋預算以狀態數為準，傳入 `maxStates = 120000`、`timeMs = 600000`（只當安全上限），避免結果隨電腦速度改變；實際耗時照常記錄。`--ui-budget` 改用正式 UI 的 12 秒預算，供對照。

`executeSixStepAnalysis` 另有寫死的 `maxResults = 48`、`beamWidth = 64`、`maxFrontier = 4096`，無法由呼叫端調整。實測搜尋通常先撞到輸出上限（`OUTPUT_BUDGET`），所以名次最多只會看到前 48 名。

## 判定方式與指標

- **正確結構**：用 RDKit 把答案與每個候選都轉成「去除立體資訊的 canonical SMILES」後比對。名次是候選在 `rankedCandidates` 中的位置（1 起算）；沒有找到記為 `null`（報告中顯示 —）。
- **正確分子式名次**：第一個分子式與答案相同的候選的名次（分子式經 `ChemistryEngine` 正規化後比較）。這是下一階段組成推斷的指標。
- 每案例每條件記錄：名次、候選數、正確分子式名次、搜尋終止原因（`termination`）、展開狀態數、搜尋耗時、總耗時、引擎實際看到的分子式、`generationStatus.code`、錯誤訊息。
- 匯總：top-1、top-5、top-10、找到率、正確分子式找到率；依條件分開，並依**實際使用的模態組合**分組。分母只含實際執行該條件的非 synthetic 案例；引擎執行錯誤計為未找到並另列錯誤數；略過的案例與無法讀取的案例不進分母。
- 單一案例出錯時記錄錯誤並繼續下一個。

## 執行

在倉庫目錄（`SpecReader_V1`）：

```powershell
pnpm benchmark                       # 可重現預算
pnpm benchmark --ui-budget           # 正式 UI 的 12 秒預算（對照用）
pnpm benchmark --case 0001_ethyl_benzoate   # 只跑指定案例，可重複使用
```

環境變數：

- `BENCHMARK_DIR`：benchmark 資料夾，預設 `..\benchmark`（相對於倉庫）。
- `NOTES_DIR`：報告輸出資料夾，預設 `..\notes`。

`cases\` 底下沒有任何含 `case.json` 的資料夾時，工具會顯示「尚無案例」並正常結束，不寫任何檔案。

輸出：

- 完整結果：`<NOTES_DIR>\v<版本>\benchmark-<日期時間>.json` 與 `.md`（含逐案例表格與案例資料備註）。
- 倉庫內匯總：`validation/benchmark/summary-v<版本>.md`（案例 id、名稱、答案 SMILES、指標；沒有光譜數值）。`--ui-budget` 的匯總寫到 `summary-v<版本>-ui-budget.md`，不會覆蓋可重現預算的匯總；用 `--case` 只跑部分案例時不寫倉庫匯總（只寫 notes 的完整結果並標示為局部結果）。
- `case.json` 與峰表 JSON 可以帶 UTF-8 BOM（Windows PowerShell 5.1 的 `Set-Content -Encoding utf8` 與記事本都會寫入）。

## 程式內建冒煙測試

`tests/benchmarkHarness.test.ts` 用程式內建、標記為 synthetic 的小案例（手寫峰表）驗證格式讀取、條件切換、SMILES 比對與報告產生。這些案例只寫在系統暫存資料夾，不會出現在 `benchmark\cases`，也不計入任何準確率。
