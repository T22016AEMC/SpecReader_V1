# nmrshiftdb2 1H truth values (v1.4.2 stop 26, re-filtered in stop 28)

Contains information from nmrshiftdb2 (www.nmrshiftdb.org), which is made available here under the
[nmrshiftdb2 Database License](https://nmrshiftdb.nmr.uni-koeln.de/nmrshiftdbhtml/nmrshiftdb2datalicense.txt).

The full license text is the file `nmrshiftdb2datalicense.txt` in this folder (unchanged copy of the file
distributed with the database; SHA-256 `00322cc450c2e53e305c082e1ab7454f108b7df51c0dbee0a07932666b245516`).
Its URI: https://nmrshiftdb.nmr.uni-koeln.de/nmrshiftdbhtml/nmrshiftdb2datalicense.txt

## Files

| File | What it is |
|---|---|
| `h1TruthNmrshiftdb2.json` | 102 measured CDCl3 1H values (71 compounds) of the 8 classes that passed the adoption gate of stop 28 (OCH_ETHER_RING_ALPHA_QUAT, OCH_ETHER_RING_NO_QUAT, ACETAL_CH_RING, OCH2O_ARYL, CYCLOPROPANE_CH, CYCLOBUTANE_CH, INDOLE_H2, BENZOFURAN_H2), plus 1 record excluded as a confirmed assignment error (kept with its reason). The entries of the classes revoked in stop 28 (ester O-CH chain, aryl ether O-CH chain, O-CH2-O aliphatic, epoxide C-H, 1-alkene =CH, open-chain acetal) were removed. Each entry: nmrshiftdb2 ID, spectrum number, solvent as deposited, RDKit canonical SMILES, class, atom indices, shift (ppm). |
| `nmrshiftdb2datalicense.txt` | The nmrshiftdb2 Database License (full text). |
| `extraction_stats.json` | Counts of the extraction: 1H spectra, how many were excluded as computed (and by which program), solvent distribution. Counts only; no shift values. Carries the notice sentence in its `notice` field (stop 33). |

## Source and method

- Source file: `nmrshiftdb2withsignals.sd` (158,569,118 bytes, SHA-256 `0e86688360e23c88ccf0eb82a1251315fa57ec6f5b376dc8886f3311793a0afe`), downloaded by the repository owner on 2026-11-14. The SD file is **not** in this repository.
- Extraction: `scripts/nmrshiftdb2/extract_h1.py` keeps MEASURED 1H spectra only. A spectrum is treated as computed and dropped when its spectrum number appears in Program / NMRProgram / NMRMethod / NMRBasisSet / NMRLocalis / NMRStandard / GeomMethod / GeomBasisSet (177 spectra: Spartan 174, Quantum ESPRESSO 3). Spectra without a solvent entry and "nmrshiftdb2 auto assignment" spectra are dropped too.
- Selection: `tests/helpers/v142Nmrshiftdb2Study.ts` keeps solvent "Chloroform-D1 (CDCl3)" / "CDCL3,TMS" only, one spectrum per stereo-free canonical SMILES, unambiguous signals only (no exchangeable H, no diastereotopic pair, no value shared by different environments), and removes the records whose assignment was confirmed wrong.
- No value is changed. Only the signals of the adopted classes are kept here (not the whole extraction), as the license's section 6.2 asks for restraint with repeated extraction.

These values are a separate source ("NMRShiftDB2"), not tier 1 / tier 2 of stops 10-22. They are literature-type values deposited in a public database, not spectra of the SpecReader user.
