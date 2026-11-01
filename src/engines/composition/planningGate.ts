import {V12_CONFIG} from '../constraints/v12Config';
import {ENUMERATION_CONFIG} from '../enumeration/enumerationConfig';

/**
 * v1.2.1: the A class (S rule, O floor, k round-robin, two rounds) is part of the exhaustive 1H-constrained pipeline. It is on only when its own flag,
 * the v1.2 constraint layer and the exhaustive enumerator are all on, so useV12Constraints = false and useExhaustiveEnumerator = false keep reproducing
 * v1.1.8 / 1.1.7-hotfix.2 exactly (their goldens), and useV121Planning = false reproduces v1.2.0.
 */
export const planningActive = (): boolean => V12_CONFIG.useV121Planning && V12_CONFIG.useV12Constraints && ENUMERATION_CONFIG.useExhaustiveEnumerator;

/** v1.2.1 B class sub-switches: each rule set runs only while the gate above is open and its own sub-switch is on. */
export const forbiddenFragmentsActive = (): boolean => planningActive() && V12_CONFIG.planning.forbiddenFragments;
export const vinylWindowsActive = (): boolean => planningActive() && V12_CONFIG.planning.vinylWindows;
export const carbonylBandActive = (): boolean => planningActive() && V12_CONFIG.planning.carbonylBand;
