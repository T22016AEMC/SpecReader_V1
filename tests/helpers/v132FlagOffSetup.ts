import {V12_CONFIG} from '../../src/engines/constraints/v12Config';

// Setup file of vitest.flagoff132.config.ts: runs every test file with the v1.3.2 total flag off, which must give exactly the v1.3.1 results (4267039) for the strong-C=O rules.
V12_CONFIG.useV132 = false;
