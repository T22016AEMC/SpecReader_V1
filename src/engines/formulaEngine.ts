import { IonizationMode, MolecularFormulaCandidate } from "../types/spectrum";

const EXACT_MASS = {
  C: 12.0,
  H: 1.007825,
  N: 14.003074,
  O: 15.994915,
  S: 31.972071,
  Si: 27.976927,
  Cl: 34.968853,
  Br: 78.918338,
};

export interface FormulaSearchInput {
  observedIonMz: number;
  ionization: IonizationMode;
  adductPreference?:
    | "Auto"
    | "[M]+•"
    | "[M+H]+"
    | "[M+Na]+"
    | "[M+NH4]+"
    | "[M-H]-";
  massToleranceDa?: number;
  isHighResolution?: boolean;
  hasBromine?: boolean;
  hasChlorine?: boolean;
  hasSulfurOrSilicon?: boolean;
  estimatedCarbonCount?: number | null;
}

export class MolecularFormulaCandidateEngine {
  static generateCandidates(
    input: FormulaSearchInput
  ): MolecularFormulaCandidate[] {
    const {
      observedIonMz,
      ionization,
      adductPreference = "Auto",
      isHighResolution = false,
      hasBromine = false,
      hasChlorine = false,
      hasSulfurOrSilicon = false,
      estimatedCarbonCount = null,
    } = input;

    if (!observedIonMz || observedIonMz <= 15) return [];

    const tolDa = input.massToleranceDa ?? (isHighResolution ? 0.015 : 0.65);

    const adductsToTest: { label: string; deltaMass: number }[] = [];
    if (adductPreference !== "Auto") {
      const map: Record<string, number> = {
        "[M]+•": 0,
        "[M+H]+": 1.007276,
        "[M+Na]+": 22.98922,
        "[M+NH4]+": 18.03383,
        "[M-H]-": -1.007276,
      };
      adductsToTest.push({
        label: adductPreference,
        deltaMass: map[adductPreference] ?? 0,
      });
    } else if (ionization === "ESI+" || ionization === "APCI") {
      adductsToTest.push(
        { label: "[M+H]+", deltaMass: 1.007276 },
        { label: "[M+Na]+", deltaMass: 22.98922 },
        { label: "[M+NH4]+", deltaMass: 18.03383 }
      );
    } else if (ionization === "ESI-") {
      adductsToTest.push({ label: "[M-H]-", deltaMass: -1.007276 });
    } else {
      adductsToTest.push({ label: "[M]+•", deltaMass: 0 });
      if (ionization === "Auto / Unknown") {
        adductsToTest.push({ label: "[M+H]+", deltaMass: 1.007276 });
      }
    }

    const candidates: MolecularFormulaCandidate[] = [];

    const brList = hasBromine ? [1] : [0];
    const clList = hasChlorine ? [1] : [0];
    const siList = hasSulfurOrSilicon ? [0, 2, 3] : [0];
    const sList = hasSulfurOrSilicon ? [0, 1] : [0];

    for (const adduct of adductsToTest) {
      const targetNeutralMass = observedIonMz - adduct.deltaMass;
      if (targetNeutralMass < 16 || targetNeutralMass > 600) continue;

      const nominalNeutralMass = Math.round(targetNeutralMass);

      for (const br of brList) {
        for (const cl of clList) {
          for (const si of siList) {
            for (const s of sList) {
              if (si > 0 && s > 0) continue;
              const massHalSiS =
                br * EXACT_MASS.Br +
                cl * EXACT_MASS.Cl +
                si * EXACT_MASS.Si +
                s * EXACT_MASS.S;

              if (massHalSiS > targetNeutralMass) continue;

              const maxN = Math.min(
                3,
                Math.floor((targetNeutralMass - massHalSiS) / 14)
              );
              const maxO = Math.min(
                5,
                Math.floor((targetNeutralMass - massHalSiS) / 16)
              );

              for (let n = 0; n <= maxN; n++) {
                const nParityOk = nominalNeutralMass % 2 === n % 2;
                if (!nParityOk) continue;

                for (let o = 0; o <= maxO; o++) {
                  const massNO = n * EXACT_MASS.N + o * EXACT_MASS.O;
                  const remForCH = targetNeutralMass - massHalSiS - massNO;
                  if (remForCH < 12) continue;

                  const minC = Math.max(1, Math.floor(remForCH / 16));
                  const maxC = Math.min(25, Math.floor(remForCH / 12));

                  for (let c = minC; c <= maxC; c++) {
                    const remForH = remForCH - c * EXACT_MASS.C;
                    const h = Math.round(remForH / EXACT_MASS.H);
                    if (h < 1) continue;

                    const halogens = cl + br;
                    if (h + halogens > 2 * (c + si) + n + 2) continue;

                    const rawDbe = c + si - (h + halogens) / 2 + n / 2 + 1;
                    if (
                      rawDbe < 0 ||
                      Math.abs(rawDbe - Math.round(rawDbe)) > 0.01
                    ) {
                      continue;
                    }
                    const dbe = Math.round(rawDbe);

                    if (si === 0 && (h / c < 0.35 || h / c > 2.6)) continue;

                    const neutralExactMass =
                      c * EXACT_MASS.C +
                      h * EXACT_MASS.H +
                      n * EXACT_MASS.N +
                      o * EXACT_MASS.O +
                      s * EXACT_MASS.S +
                      si * EXACT_MASS.Si +
                      cl * EXACT_MASS.Cl +
                      br * EXACT_MASS.Br;

                    const theoreticalIonMz =
                      neutralExactMass + adduct.deltaMass;
                    const massErrorDa = Math.abs(
                      observedIonMz - theoreticalIonMz
                    );
                    if (massErrorDa > tolDa) continue;

                    const massErrorPpm = Number(
                      (
                        (massErrorDa / Math.max(1, theoreticalIonMz)) *
                        1e6
                      ).toFixed(1)
                    );

                    const formulaParts = [
                      `C${c === 1 ? "" : c}`,
                      `H${h === 1 ? "" : h}`,
                    ];
                    if (br > 0) formulaParts.push(`Br${br === 1 ? "" : br}`);
                    if (cl > 0) formulaParts.push(`Cl${cl === 1 ? "" : cl}`);
                    if (n > 0) formulaParts.push(`N${n === 1 ? "" : n}`);
                    if (o > 0) formulaParts.push(`O${o === 1 ? "" : o}`);
                    if (s > 0) formulaParts.push(`S${s === 1 ? "" : s}`);
                    if (si > 0) formulaParts.push(`Si${si === 1 ? "" : si}`);
                    const formulaStr = formulaParts.join("");

                    let score = 78;
                    if (
                      isHighResolution
                        ? massErrorDa < 0.015
                        : massErrorDa < 0.12
                    )
                      score += 10;
                    if (estimatedCarbonCount !== null) {
                      const cDiff = Math.abs(c - estimatedCarbonCount);
                      if (cDiff === 0) score += 8;
                      else if (cDiff === 1) score += 4;
                      else score -= Math.min(12, cDiff * 3);
                    }
                    if (o >= 1 && o <= 3 && n === 0) score += 6;
                    else if (o >= 1 && o <= 3 && n <= 1) score += 4;
                    if (dbe >= 4 && dbe <= 7 && c >= 6) score += 4;
                    if (adduct.label === "[M]+•" || adduct.label === "[M+H]+")
                      score += 3;

                    score = Math.min(92, Math.max(35, score));

                    const halogenMatch = hasBromine
                      ? "符合 ⁷⁹Br/⁸¹Br (1:1) M/M+2 同位素特徵"
                      : hasChlorine
                        ? "符合 ³⁵Cl/³⁷Cl (3:1) M/M+2 同位素特徵"
                        : hasSulfurOrSilicon
                          ? "符合 Si / S M+1/M+2 同位素封包"
                          : "符合無鹵素標準 C/H/N/O 同位素分佈";

                    candidates.push({
                      formula: formulaStr,
                      neutralExactMass: Number(neutralExactMass.toFixed(4)),
                      theoreticalIonMz: Number(theoreticalIonMz.toFixed(4)),
                      observedIonMz: Number(observedIonMz.toFixed(4)),
                      adductLabel: adduct.label,
                      massErrorDa: Number(massErrorDa.toFixed(4)),
                      massErrorPpm,
                      dbe,
                      nitrogenRuleValid: true,
                      isotopeCompatibility: score >= 80 ? "High" : "Moderate",
                      halogenSignatureMatch: halogenMatch,
                      score,
                      notes: `中性單同位素質量 ${neutralExactMass.toFixed(4)} Da · 不飽和度 DBE = ${dbe} · 符合氮規則`,
                    });
                  }
                }
              }
            }
          }
        }
      }
    }

    const uniqueMap = new Map<string, MolecularFormulaCandidate>();
    for (const cand of candidates) {
      const key = `${cand.formula}_${cand.adductLabel}`;
      const existing = uniqueMap.get(key);
      if (!existing || cand.score > existing.score) {
        uniqueMap.set(key, cand);
      }
    }

    return Array.from(uniqueMap.values())
      .sort((a, b) => b.score - a.score || a.massErrorDa - b.massErrorDa)
      .slice(0, 6);
  }
}
