import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { sourceAlias } from "./scripts/vite/source-alias.ts";

const CORE_COVERAGE = { functions: 100, lines: 90, branches: 85, perFile: true };
const DEFAULT_COVERAGE = { functions: 90, lines: 85, branches: 80, perFile: true };

export default defineConfig({
  plugins: [react()],
  resolve: { alias: sourceAlias },
  define: { SHEET_LIBRARY_HASH: '""' },
  // Discovered in the middle of a run, the server would prepare it again under the feet of the tests.
  optimizeDeps: { include: ["pdfjs-dist/legacy/build/pdf.mjs"] },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["web/src/**/*.test.ts", "scripts/**/*.test.ts", "tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          include: ["web/src/**/*.test.tsx"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
            screenshotFailures: false,
          },
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["web/src/**/*.{ts,tsx}"],
      exclude: ["web/src/main.tsx", "web/src/**/*.stories.tsx", "web/src/**/*.test.{ts,tsx}"],
      reporter: ["text", "html"],
      thresholds: {
        "web/src/**": DEFAULT_COVERAGE,
        "web/src/shared/ui/**": CORE_COVERAGE,
        "web/src/shared/domain/**": CORE_COVERAGE,
        "web/src/shared/flyer-engine/**": CORE_COVERAGE,
      },
    },
  },
});
