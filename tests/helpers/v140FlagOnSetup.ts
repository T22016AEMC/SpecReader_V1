import {V12_CONFIG} from '../../src/engines/constraints/v12Config';

// Setup file of vitest.flagon140.config.ts: runs every test file with useV140H1 and every v140 sub-flag on (alkene, oxygen, matching, plausibility, coverage, solvent, calibration2, round3 (since v1.4.1 stop 22) and parseFix (default true since stop 21; set explicitly here since stop 23)), on top of the v1.3.2 defaults.
// v1.4.1 stop 18: the full-on set now also contains useV141IR and its four groups (alkylBend, esterCO, ringCarbonyl, sp2CH). Tests that pin the v1.4.0 state set useV141IR = false themselves (tests/v14/v140FlagOnSnapshot.test.ts).
// Tests that pin the flag-off behaviour are expected to differ; each failure is classified in notes/v1.4.0/STOP14_*.
// stop 23 (E): FLAGON_EXCEPT=round3 / ir141 (comma list) switches that part off again, to tell which failures a newly opened flag causes (default: everything on).
// v1.4.2 stop 25 (4): the full-on set also contains useV142IR with BOTH sub-flags (alkeneOOP and negativeEvidence; negativeEvidence is off by default in the product, it is on here to check the full-on behaviour).
// FLAGON_EXCEPT=ir2 switches the whole parent off again, ir2oop the alkene-OOP sub-flag only, ir2neg the negative-evidence sub-flag only. Tests that pin the v1.4.1 or v1.4.0 state set useV142IR = false themselves.
const except = (process.env.FLAGON_EXCEPT ?? '').split(',').map(x => x.trim()).filter(Boolean);
V12_CONFIG.useV140H1 = true;
Object.assign(V12_CONFIG.v140, {alkene: true, oxygen: true, matching: true, plausibility: true, coverage: true, solvent: true, calibration2: true, round3: !except.includes('round3'), parseFix: true});
V12_CONFIG.useV141IR = !except.includes('ir141');
Object.assign(V12_CONFIG.v141IR, {alkylBend: true, esterCO: true, ringCarbonyl: true, sp2CH: true});
V12_CONFIG.useV142IR = !except.includes('ir2');
Object.assign(V12_CONFIG.v142IR, {alkeneOOP: !except.includes('ir2oop'), negativeEvidence: !except.includes('ir2neg')});
