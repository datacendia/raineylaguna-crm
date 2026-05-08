import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Vitest config for raineylaguna-crm.
 *
 * Mirrors the path-aliasing in tsconfig.json so tests can `import from
 * '@/lib/...'` exactly like application code. Coverage is opt-in via
 * `npm run test -- --coverage` to keep the default test loop fast.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/*.test.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
