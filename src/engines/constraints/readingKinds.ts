import type {InventoryAlternative, AtomInventoryResult} from './atomInventory';

/**
 * v1.2.1 (A4/A5): which readings of the 1H inventory belong to round 1. Round 1 runs the readings without an alkene CH ("plain", template readings).
 * Exception: a formula with no plain reading at all AND a signal that only the alkene-CH class explains (e.g. 5.8 ppm, outside the aromatic window)
 * runs the alkene readings in round 1 under the same step cap, because without them the signal would have no reading in round 1.
 */
export interface ReadingKinds {
  plain: InventoryAlternative[];
  vinylOnlySignal: boolean;
  vinylException: boolean;
  /** Alkene readings exist that round 1 does not run (they wait for round 2). */
  vinylPending: boolean;
}
export function readingKinds(inv: AtomInventoryResult): ReadingKinds {
  const plain = inv.alternatives.filter(a => !a.hasVinyl);
  const vinylOnlySignal = inv.signals.some(x => x.classes.length > 0 && x.classes.every(c => c === 'VINYL_CH'));
  const vinylException = plain.length === 0 && inv.alternatives.length > 0 && vinylOnlySignal;
  return {plain, vinylOnlySignal, vinylException, vinylPending: plain.length > 0 && inv.alternatives.some(a => a.hasVinyl)};
}
