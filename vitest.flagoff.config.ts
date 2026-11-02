import { defineConfig } from 'vitest/config';
// v1.2.3: the whole suite with the total flag useV123 = false (npx vitest run -c vitest.flagoff.config.ts). The flag-off guarantee is "same results as a60ddc0".
export default defineConfig({ test: {
  environment: 'node',
  include: ['src/engines/__tests__/**/*.test.ts', 'tests/**/*.test.ts'],
  setupFiles: ['tests/helpers/v123FlagOffSetup.ts'],
  testTimeout: 30000,
} });
