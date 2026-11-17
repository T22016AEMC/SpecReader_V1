import { defineConfig } from 'vitest/config';
// v1.3.2: the whole suite with the total flag useV132 = false (npx vitest run -c vitest.flagoff132.config.ts). The flag-off guarantee is "same results as v1.3.1 (4267039)" for the strong-C=O rules;
// the auto-mark / deleted-peak fixes of v1.3.2 are bug fixes without a flag, so the tests that pin the old image-IR behaviour are changed for every flag state.
// (vitest.flagoff131.config.ts, useV131 = false, gives v1.3.0; flagoff130 gives v1.2.3; flagoff gives v1.2.2: each gate needs the one before it.)
export default defineConfig({ test: {
  environment: 'node',
  include: ['src/engines/__tests__/**/*.test.ts', 'tests/**/*.test.ts'],
  setupFiles: ['tests/helpers/v132FlagOffSetup.ts'],
  testTimeout: 30000,
} });
