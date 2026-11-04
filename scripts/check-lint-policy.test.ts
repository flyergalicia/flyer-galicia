import { describe, expect, it } from "vitest";
import { hasComplexityDisable, specViolations } from "./check-lint-policy.ts";

describe("hasComplexityDisable", () => {
  it.each([
    "// oxlint-disable-next-line complexity",
    "/* oxlint-disable complexity */",
    "// eslint-disable-line complexity",
  ])("rejects %s", (comment) => {
    expect(hasComplexityDisable(comment)).toBe(true);
  });

  it("accepts disabling other rules", () => {
    expect(hasComplexityDisable("// oxlint-disable-next-line no-console")).toBe(false);
  });
});

describe("specViolations", () => {
  it.each([
    ["page.evaluate", "await page.evaluate(() => 1);"],
    ["page.evaluate", "const run = app.page.evaluate;"],
    ["evaluate", "await locator.evaluate((node) => node.id);"],
    ["evaluate", "await page.$eval('a', (node) => node.id);"],
    ["waitForFunction", "await page.waitForFunction(() => true);"],
    ["legacy global", "const list = _fgLg.list;"],
    ["legacy global", "await app.page.click(_padEditor);"],
    ["#id selector", "await page.locator('#fg-lg-btn').click();"],
    ["#id selector", 'await page.click("div #name");'],
  ])("rejects %s in %s", (name, source) => {
    expect(specViolations(source)).toContain(name);
  });

  it("accepts a spec that talks through the driver and through visible text", () => {
    const spec = `
      const app = await openApp();
      await app.logoEditor.enter();
      await expect(app.page.getByRole("button", { name: "Reintentar" })).toBeVisible();
    `;
    expect(specViolations(spec)).toEqual([]);
  });
});
