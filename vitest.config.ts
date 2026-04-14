import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["src/generated/**"],
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
        perFile: true,
      },
    },
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
