import {afterAll} from 'vitest';
import {V12_CONFIG} from '../../src/engines/constraints/v12Config';

/**
 * v1.4.2 stop 36 (E): the planner switched the new rule sets on by default (useV140H1 with every v140 sub-flag, useV141IR, useV142IR with alkeneOOP; the negative evidence of
 * ir2 stays off). A test file that pins a result recorded under the defaults BEFORE 1.4.2 (a v1.2.x / v1.3.x baseline or golden, a rank table of that state) calls
 * usePreV142Defaults() right after its imports: it sets those flags to the values they had before 1.4.2 for the whole file and puts the current values back after it.
 * No expected value is changed by this; the values are written out here (not read from the configuration) so that the old state stays explicit.
 */
export const PRE_V142_DEFAULTS = {
  useV140H1: false,
  v140: {alkene: true, oxygen: true, matching: false, plausibility: false, coverage: false, solvent: false, calibration2: false, round3: false, parseFix: true},
  useV141IR: false,
  useV142IR: false,
} as const;

export function usePreV142Defaults(): void {
  const c = V12_CONFIG as unknown as {useV140H1: boolean; useV141IR: boolean; useV142IR: boolean; v140: Record<string, boolean>};
  const was = {useV140H1: c.useV140H1, useV141IR: c.useV141IR, useV142IR: c.useV142IR, v140: {...c.v140}};
  c.useV140H1 = PRE_V142_DEFAULTS.useV140H1; c.useV141IR = PRE_V142_DEFAULTS.useV141IR; c.useV142IR = PRE_V142_DEFAULTS.useV142IR;
  Object.assign(c.v140, PRE_V142_DEFAULTS.v140);
  afterAll(() => { c.useV140H1 = was.useV140H1; c.useV141IR = was.useV141IR; c.useV142IR = was.useV142IR; Object.assign(c.v140, was.v140); });
}
