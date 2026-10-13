import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
  environment: 'node',
  include: ['src/engines/__tests__/**/*.test.ts', 'tests/**/*.test.ts'],
  testTimeout: 30000,
} });
