import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Argon2 hashing is intentionally slow; give each test room.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // One embedded database per file, no cross-file interference.
    pool: 'forks',
    isolate: true,
  },
});
