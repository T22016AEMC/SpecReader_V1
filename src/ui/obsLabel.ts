import {fmtShift13C, fmtShift1H, fmtWavenumber} from './format';

/**
 * Observation id → short label for the result page (v1.2.2, DESIGN_REPORT B1.6).
 * Ids look like `IR:synthetic-fixture.csv:3350`, `1H_NMR:file:6.99`, `13C_NMR:file:65.2`, `MS:file:105.03`, or the aggregate ids `1H:environment-count`, `1H:integral-total`.
 * The `observations` map of the reasoning trace is consulted first (it carries modality, value and unit); the id itself is parsed second; the original string is the last resort.
 */
export interface ObservationLike {id: string; modality: string; value: number; unit?: string}

const AGGREGATE_LABEL: Record<string, string> = {
  '1H:environment-count': '¹H 環境數',
  '1H:integral-total': '¹H 氫總數',
  '13C:environment-count': '¹³C 環境數',
};
const MODALITY_ALIAS: Record<string, string> = {IR: 'IR', '1H_NMR': '1H_NMR', '1H': '1H_NMR', '13C_NMR': '13C_NMR', '13C': '13C_NMR', MS: 'MS', 'MS/MS': 'MS/MS', MSMS: 'MS/MS', 'ToF-SIMS': 'ToF-SIMS', TOF_SIMS: 'ToF-SIMS', TOF: 'ToF-SIMS'};

function labelOf(modality: string, value: number, unit?: string): string | null {
  switch (MODALITY_ALIAS[modality]) {
    case 'IR': return `IR ${fmtWavenumber(value)} cm⁻¹`;
    case '1H_NMR': return `¹H ${fmtShift1H(value)} ppm`;
    case '13C_NMR': return `¹³C ${fmtShift13C(value)} ppm`;
    case 'MS': return `MS m/z ${Number(value.toFixed(4))}`;
    case 'MS/MS': return `MS/MS m/z ${Number(value.toFixed(4))}`;
    case 'ToF-SIMS': return `ToF-SIMS m/z ${Number(value.toFixed(4))}`;
    default: return unit ? `${modality} ${value} ${unit}` : null;
  }
}

export function obsLabel(id: string, observations?: readonly ObservationLike[] | ReadonlyMap<string, ObservationLike>): string {
  if (AGGREGATE_LABEL[id]) return AGGREGATE_LABEL[id];
  const known = observations instanceof Map ? observations.get(id) : (observations as readonly ObservationLike[] | undefined)?.find(o => o.id === id);
  if (known && Number.isFinite(known.value)) {
    const l = labelOf(known.modality, known.value, known.unit);
    if (l) return l;
  }
  const parts = id.split(':');
  if (parts.length >= 2) {
    const value = Number(parts[parts.length - 1]);
    if (Number.isFinite(value)) {
      const l = labelOf(parts[0], value);
      if (l) return l;
    }
  }
  return id;
}

/** Several ids, joined with 「、」; duplicates removed. */
export function obsLabels(ids: readonly string[], observations?: readonly ObservationLike[]): string {
  const map = observations ? new Map(observations.map(o => [o.id, o])) : undefined;
  return [...new Set(ids.map(id => obsLabel(id, map)))].join('、');
}
