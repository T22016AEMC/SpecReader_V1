import { defineConfig } from 'vitest/config';
// v1.3.0: the whole suite with the total flag useV130 = false (npx vitest run -c vitest.flagoff130.config.ts). The flag-off guarantee is "same results as v1.2.3 (aeef61b)".
// (vitest.flagoff.config.ts, useV123 = false, also gives v1.2.2 because the v1.3.0 gate needs the v1.2.3 gate.)
export default defineConfig({ test: {
  environment: 'node',
  include: ['src/engines/__tests__/**/*.test.ts', 'tests/**/*.test.ts'],
  setupFiles: ['tests/helpers/v130FlagOffSetup.ts'],
  testTimeout: 30000,
} });
