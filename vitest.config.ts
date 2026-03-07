import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/__tests__/**/*.test.ts"],
    globals: true,
    testTimeout: 10_000,
    // Serialize test files through a single fork to eliminate SQLite
    // write contention. analysis-cache.test.ts + mcp-protocol.test.ts
    // both open SQLite connections and fail on parallel vitest worker runs.
    // pool:"forks" + maxWorkers:1 replaces poolOptions.forks.singleFork (removed in Vitest 4).
    pool: "forks",
    maxWorkers: 1,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/__tests__/**",
        "src/cli.ts",
        "src/server.ts",
        "src/index.ts",
      ],
      thresholds: {
        statements: 30,
        branches: 25,
        functions: 25,
        lines: 30,
      },
    },
  },
});
