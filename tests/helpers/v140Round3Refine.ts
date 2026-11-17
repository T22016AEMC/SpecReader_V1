import {V12_CONFIG} from '../../src/engines/constraints/v12Config';
import type {Round3Rule} from '../../src/engines/scientificEngines/h1Round3';
import {clearEnvCache} from './v140Truth';
import type {Round3Decision} from './v140Round3Study';

/**
 * v1.4.1 stop 23 (A): runs a function with the round-3 rule table swapped for another one (the cyclopropane-methine refinement), then puts the deployed table back.
 * Used by the decision test and by the measurements of the refinement scenario; the source tree is not touched.
 */
export function withRound3Rules<T>(replacement: Record<string, Round3Rule>, drop: string[], fn: () => T): T {
  const table = V12_CONFIG.v140Round3.rules as Record<string, Round3Rule>;
  const saved = {...table};
  for (const k of Object.keys(table)) delete table[k];
  Object.assign(table, Object.fromEntries(Object.entries(saved).filter(([k]) => !drop.includes(k))), replacement);
  clearEnvCache();
  try { return fn(); } finally { for (const k of Object.keys(table)) delete table[k]; Object.assign(table, saved); clearEnvCache(); }
}

/** The rule table entries of the declared refinement of one class (the deployed shape of a level-1 rule), taken from a decision's refined fits. */
export function refinedRules(d: Round3Decision): Record<string, Round3Rule> {
  const out: Record<string, Round3Rule> = {};
  for (const f of d.refined) if (f.status === 'calibrate') out[f.key] = {deltaPpm: Number(f.delta.toFixed(3)), level: 1, compounds: f.perCompound.map(p => p.name), maeBefore: f.maeBefore, maeLeaveOneOut: f.maeLoo};
  return out;
}
