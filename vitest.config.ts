import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import react from "@vitejs/plugin-react";
import { defineConfig, defineProject } from "vitest/config";

// Two projects in one run:
// - worker: inside the real Workers runtime (Miniflare) with a fresh, migrated
//   D1 per test file.
// - ui: React in jsdom.
// Coverage is istanbul for both: workerd cannot do v8 coverage, and vitest
// allows only one provider per run.
export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    test: {
      projects: [
        defineProject({
          plugins: [
            cloudflareTest({
              wrangler: { configPath: "./wrangler.jsonc" },
              miniflare: {
                bindings: {
                  TEST_MIGRATIONS: migrations,
                  // A dummy key: tests stub the z.ai fetch, never call the real API.
                  ZAI_API_KEY: "test-key",
                  // The stand-in AI stays off, whatever .dev.vars on this machine says.
                  ZAI_FAKE: "",
                },
              },
            }),
          ],
          test: {
            name: "worker",
            include: ["test/**/*.test.ts"],
            setupFiles: ["./test/setup.ts"],
          },
        }),
        defineProject({
          plugins: [react()],
          test: {
            name: "ui",
            environment: "jsdom",
            include: ["src/**/*.test.{ts,tsx}"],
            setupFiles: ["./src/test/setup.ts"],
            // CSS is empty in tests, except the theme files: themes.test.ts reads them.
            css: { include: [/src\/themes\/.+\.css/] },
          },
        }),
      ],
      coverage: {
        provider: "istanbul" as const,
        include: ["worker/**/*.ts", "src/**/*.{ts,tsx}"],
        exclude: ["**/*.test.*", "src/test/**", "src/main.tsx"],
        reporter: ["text-summary", "lcovonly"],
        reportsDirectory: "coverage",
        thresholds: { lines: 95 },
      },
    },
  };
});
