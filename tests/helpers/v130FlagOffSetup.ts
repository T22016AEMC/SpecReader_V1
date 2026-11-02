import {V12_CONFIG} from '../../src/engines/constraints/v12Config';

// Setup file of vitest.flagoff130.config.ts: runs every test file with the v1.3.0 total flag off, which must give exactly the v1.2.3 results (aeef61b).
V12_CONFIG.useV130 = false;
