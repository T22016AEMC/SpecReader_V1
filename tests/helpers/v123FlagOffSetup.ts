import {V12_CONFIG} from '../../src/engines/constraints/v12Config';

// Setup file of vitest.flagoff.config.ts: runs every test file with the v1.2.3 total flag off, which must give exactly the 1.2.2 results (a60ddc0).
V12_CONFIG.useV123 = false;
