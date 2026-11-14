import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // Next.js enforces "server-only" at build time; in tests it is a no-op.
      "server-only": path.resolve(import.meta.dirname, "tests/support/server-only.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    // Integration tests share one database; run files serially.
    fileParallelism: false,
    testTimeout: 30000,
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "warn",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://fito_app:fito_app_local@localhost:5432/fito_test",
      TEST_DATABASE_ADMIN_URL: process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://postgres@localhost:5432/fito_test",
      APP_URL: "http://localhost:3000",
      SIGNUP_ACCESS_CODE: "",
      ANTHROPIC_API_KEY: "",
    },
    hookTimeout: 60000,
  },
});
