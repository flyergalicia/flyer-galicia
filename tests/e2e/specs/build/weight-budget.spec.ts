import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type StartupWeight, watchStartupWeight } from "../../support/startup-weight.ts";
import { expect, test } from "../../support/test.ts";

const BASELINE = fileURLToPath(
  new URL("../../../fixtures/performance-baseline.json", import.meta.url),
);
const FLYER_EDITOR_SLICE = "web/src/slices/flyer-editor";

interface Baseline {
  startup: StartupWeight;
}

function baselineWeight(): StartupWeight {
  const baseline: Baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
  return baseline.startup;
}

test("starting the app weighs no more than the app it replaces", async ({ openApp, baseURL }) => {
  test.skip(
    !existsSync(FLYER_EDITOR_SLICE),
    "The React app has no flyer editor yet: its start-up cannot be compared with the old one.",
  );
  const watching: { read?: () => Promise<StartupWeight> } = {};
  await openApp({
    beforeNavigation: (page) => {
      watching.read = watchStartupWeight(page, baseURL ?? "");
      return Promise.resolve();
    },
  });

  const weight = await watching.read?.();
  if (!weight) throw new Error("The page was never watched");

  const budget = baselineWeight();
  expect
    .soft(weight.javascript.gzip, "JavaScript, gzip")
    .toBeLessThanOrEqual(budget.javascript.gzip);
  expect.soft(weight.css.gzip, "CSS, gzip").toBeLessThanOrEqual(budget.css.gzip);
});
