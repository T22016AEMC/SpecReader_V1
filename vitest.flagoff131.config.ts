import { defineConfig } from 'vitest/config';
// v1.3.1: the whole suite with the total flag useV131 = false (npx vitest run -c vitest.flagoff131.config.ts). The flag-off guarantee is "same results as v1.3.0 (5559f2a)".
// (vitest.flagoff130.config.ts, useV130 = false, gives v1.2.3 and vitest.flagoff.config.ts, useV123 = false, gives v1.2.2: the v1.3.1 gate needs the v1.3.0 gate, which needs the v1.2.3 gate.)
export default defineConfig({ test: {
  environment: 'node',
  include: ['src/engines/__tests__/**/*.test.ts', 'tests/**/*.test.ts'],
  setupFiles: ['tests/helpers/v131FlagOffSetup.ts'],
  testTimeout: 30000,
} });
