import type {ObservedEvidence} from '../reasoning/types';
import {strongIrBands} from './requiredSubstructures';
import type {H1Signal, IrAldehydeContext} from './shiftClasses';
import {V12_CONFIG} from './v12Config';

/** What the v1.2 constraint layer needs from the analysis, assembled once by the caller (the pipeline or a test). */
export interface V12Evidence {
  observations: ObservedEvidence[];
  /** The IR coverage includes 1680–1740 cm-1 (the pipeline uses irRangeCovered). */
  irCoversAldehydeRegion: boolean;
  /** N-specific evidence exists (nitrogen gating of v1.1.6). */
  nitrogenAllowed: boolean;
}

/** 1H observations → inventory signals. The solvent is the one the 1H spectrum states ("Unknown" when missing). */
export function h1SignalsFromObservations(observations: ObservedEvidence[]): {signals: H1Signal[]; solvent: string; coverageComplete: boolean} {
  const h = observations.filter(o => o.modality === '1H_NMR');
  const signals: H1Signal[] = h.map(o => ({
    observationId: o.id, shiftPpm: o.value, relativeIntegral: o.relativeIntegral, multiplicity: o.multiplicity, broad: o.shape === 'BROAD',
    optional: Boolean(o.optional), ...(o.exchangeable ? {exchangeable: true} : {}),
  }));
  const counted = h.filter(o => !o.optional);
  return {signals, solvent: h.find(o => o.metadata.solvent)?.metadata.solvent ?? 'Unknown', coverageComplete: counted.length > 0 && counted.every(o => o.coverage === 'CONFIRMED_COMPLETE')};
}

/** D5: IR facts for the aldehyde reading. strongCarbonyl is null when the intensities are unknown. */
export function irAldehydeContext(observations: ObservedEvidence[], coversRegion: boolean): IrAldehydeContext {
  const ir = observations.filter(o => o.modality === 'IR' && !o.optional);
  if (!ir.length) return {present: false, coversAldehydeRegion: false, strongCarbonyl: null};
  const known = ir.some(o => o.relativeIntensity !== null && o.relativeIntensity > 0);
  const c = V12_CONFIG.aldehydeIr;
  return {present: true, coversAldehydeRegion: coversRegion, strongCarbonyl: known ? strongIrBands(observations, c.rangeCm1, c.strongRelativeIntensity).length > 0 : null};
}
