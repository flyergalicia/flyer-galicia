import { describe, expect, it } from "vitest";
import { hasComplexityDisable, networkEscapes, specViolations } from "./check-lint-policy.ts";

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

describe("networkEscapes", () => {
  it.each([
    ["route.fetch", "const response = await route.fetch();"],
    ["route.continue", "await route.continue();"],
    ["request context", "await page.request.get(address);"],
    ["request context", "await context.request.post(address, { data });"],
  ])("rejects %s in %s", (name, source) => {
    expect(networkEscapes(source)).toContain(name);
  });

  it("accepts answering a route, or passing it on to the simulated cloud", () => {
    const driver = `
      await page.route(address, async (route) => {
        if (route.request().method() === "GET") await route.fulfill({ json: [] });
        else await route.fallback();
      });
    `;
    expect(networkEscapes(driver)).toEqual([]);
  });
});
