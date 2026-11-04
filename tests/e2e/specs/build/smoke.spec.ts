import { expect, test } from "@playwright/test";

test(
  "the published page renders under the Pages path without errors",
  { tag: "@react" },
  async ({ page, baseURL }) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(message.text());
    });

    const externalRequests: string[] = [];
    page.on("request", (request) => {
      if (!request.url().startsWith(new URL(baseURL ?? "").origin)) {
        externalRequests.push(request.url());
      }
    });

    await page.goto("./");

    await expect(page.getByRole("heading", { name: "Flyer Galicia", level: 1 })).toBeVisible();
    expect(problems).toEqual([]);
    expect(externalRequests).toEqual([]);
  },
);

test("the version manifest is served", { tag: "@react" }, async ({ request }) => {
  const response = await request.get("version.json");

  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ v: expect.stringMatching(/^[0-9a-f]{10}$/) });
});
