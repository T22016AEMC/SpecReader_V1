import {V12_CONFIG} from '../../src/engines/constraints/v12Config';

/**
 * v1.4.2 stop 26: the nmrshiftdb2 class shifts have no flag of their own (they sit under v140.oxygen / v140.calibration2). A test that pins the state of an EARLIER layer with those sub-flags on
 * (stop 2 / 11 values, the stop-13 and stop-22 fits, the stop-25 IR tie samples) switches the stop-26 rules off with this; the combined state is pinned in tests/v14/v142Nmrshiftdb2.test.ts and the flag-on snapshots.
 * Returns the function that puts the deployed rules back.
 */
export function s26RulesOff(): () => void {
  const cfg = V12_CONFIG.v142Nmrshiftdb2 as {rules: Record<string, unknown>};
  const saved = cfg.rules;
  cfg.rules = {};
  return () => { cfg.rules = saved; };
}
