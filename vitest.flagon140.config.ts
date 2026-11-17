import { defineConfig } from 'vitest/config';
// v1.4.0 stop 14: the whole suite with useV140H1 and all seven v140 sub-flags on (npx vitest run -c vitest.flagon140.config.ts).
// v1.4.1 stop 18: the setup file also switches useV141IR and its four groups on, so this is the "everything on" run of the version-closing check.
export default defineConfig({ test: {
  environment: 'node',
  include: ['src/engines/__tests__/**/*.test.ts', 'tests/**/*.test.ts'],
  setupFiles: ['tests/helpers/v140FlagOnSetup.ts'],
  testTimeout: 30000,
} });
