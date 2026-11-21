import { expect, test } from "@playwright/test";

// The font of the design, the same one and from the same place as the old app. Nothing else
// leaves the page: without web/.env.local it must not talk to any backend.
const ALLOWED_ORIGINS = new Set(["https://fonts.googleapis.com", "https://fonts.gstatic.com"]);

test("the published page renders under the Pages path without errors", async ({
  page,
  baseURL,
}) => {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });

  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const { origin } = new URL(request.url());
    if (origin !== new URL(baseURL ?? "").origin && !ALLOWED_ORIGINS.has(origin)) {
      externalRequests.push(request.url());
    }
  });

  await page.goto("./");

  await expect(page.getByRole("heading", { name: "Flyer Galicia", level: 1 })).toBeVisible();
  expect(problems).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test("the version manifest is served", async ({ request }) => {
  const response = await request.get("version.json");

  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ v: expect.stringMatching(/^[0-9a-f]{10}$/) });
});
