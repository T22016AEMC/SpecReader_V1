import {V12_CONFIG} from '../../src/engines/constraints/v12Config';

/**
 * v1.4.0 stop 15: the v1.3.2 rules run only while the whole gate chain is open (v132Active = v131Active && useV132, ... down to useV123).
 * vitest.flagoff.config.ts sets useV123 = false for the whole suite, so a test that sets only `useV132 = true` gets the v1.3.1 behaviour there and its own v1.3.2 expectation fails.
 * A test that needs the v1.3.2 rules names the chain it needs: this opens useV123 / useV130 / useV131 / useV132 and returns the function that puts the four flags back.
 */
export function openV132Gates(): () => void {
  const was = {v123: V12_CONFIG.useV123, v130: V12_CONFIG.useV130, v131: V12_CONFIG.useV131, v132: V12_CONFIG.useV132};
  V12_CONFIG.useV123 = true; V12_CONFIG.useV130 = true; V12_CONFIG.useV131 = true; V12_CONFIG.useV132 = true;
  return () => { V12_CONFIG.useV123 = was.v123; V12_CONFIG.useV130 = was.v130; V12_CONFIG.useV131 = was.v131; V12_CONFIG.useV132 = was.v132; };
}
