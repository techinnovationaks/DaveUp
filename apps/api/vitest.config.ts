import { defineConfig } from "vitest/config";

// Each test file resets the shared daveup_test database, so files run one at a time.
export default defineConfig({ test: { fileParallelism: false, testTimeout: 30_000, hookTimeout: 60_000 } });
