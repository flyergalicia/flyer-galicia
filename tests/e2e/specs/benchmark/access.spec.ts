// Replaces pruebas/t92_benchmark.cjs (who sees it and when its code and data are requested).
import { expect, test } from "../../support/test.ts";
import { seedCards, seedComparison } from "./benchmark-data.ts";

test.beforeEach(({ cloud }) => {
  seedComparison(cloud);
  seedCards(cloud);
});

test("an advisor without the faculty does not see it and nothing is requested", async ({
  cloud,
  openApp,
}) => {
  const { benchmark } = await openApp();

  const access = await benchmark.access();
  expect.soft(access.allowed, "an advisor does not have the faculty").toBe(false);
  expect.soft(access.tabShown, "an advisor does not see the tab").toBe(false);
  for (const role of ["asesor", "vip", "hunter"]) {
    expect
      .soft(await benchmark.startsAllowedFor(role), `the faculty starts off for ${role}`)
      .toBe(false);
  }
  expect.soft(access.codeLoaded, "its code is not downloaded").toBe(false);
  expect.soft(cloud.benchmarkRequests, "no table is requested").toEqual([]);
});

test("the administrator sees it, and code and data arrive only when it is opened", async ({
  cloud,
  openApp,
}) => {
  const { benchmark } = await openApp({ user: "admin" });

  const access = await benchmark.access();
  expect.soft(access.tabShown, "the administrator sees the tab").toBe(true);
  expect.soft(access.codeLoaded, "before opening it there is no code").toBe(false);
  expect.soft(cloud.benchmarkRequests, "and no data was requested").toEqual([]);

  await benchmark.open();

  expect
    .soft(cloud.benchmarkRequests.join(), "the tables are requested when it is opened")
    .toMatch(/promos_bench_cache/);
});
