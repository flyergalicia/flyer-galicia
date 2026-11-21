// What shared asks of the cloud is the contract the old app recorded: the rewrite asks the same.
import {
  normalized,
  openHarness,
  recordedContract,
  REPLAY_STORY,
  SESSION_STORY,
} from "../../support/design-system/cloud-harness.ts";
import { expect, test } from "../../support/test.ts";

const PROFILES = "/rest/v1/profiles";
const ENTRY_COLUMNS = [
  "celular_asesor",
  "email_asesor",
  "es_prueba",
  "facultades",
  "flyer_fav",
  "full_name",
  "lider_id",
  "nombre_asesor",
  "role",
  "status",
];
// supabase-js repeats by itself a read with no answer for 7 seconds, as in the old app.
const DROPPED_CONNECTION_SHOWS_MS = 15_000;

/** Must stay empty: an entry that cannot go through the public API of shared is a hole in it. */
const CANNOT_BE_REPLAYED: readonly string[] = [];

/**
 * The simulated cloud never answers this one on purpose: the app reloads when it does. The request
 * is what counts here.
 */
const NEVER_ANSWERED = ["/auth/v<n>/verify"];

test("every entry of the contract goes through shared, and nothing else is asked", async ({
  browser,
  cloud,
  storybookUrl,
}) => {
  const contract = recordedContract();
  const harness = await openHarness({
    browser,
    cloud,
    storybookUrl,
    story: REPLAY_STORY,
    user: cloud.users.asesor!,
  });

  const outcomes = await harness.replay(contract);

  expect
    .soft(outcomes.filter(({ outcome }) => outcome === "cannot be replayed"))
    .toEqual(CANNOT_BE_REPLAYED);
  expect
    .soft(
      outcomes
        .filter(({ outcome }) => outcome === "no answer")
        .map(({ entry }) => ("path" in entry ? entry.path : JSON.stringify(entry))),
    )
    .toEqual(NEVER_ANSWERED);
  expect(normalized(cloud.contractEntries())).toEqual(normalized(contract));
  await harness.context.close();
});

test.describe("the session against the simulated cloud", () => {
  test("a saved session reads the profile and enters, with one write", async ({
    browser,
    cloud,
    storybookUrl,
  }) => {
    const { page, requestsTo, context } = await openHarness({
      browser,
      cloud,
      storybookUrl,
      story: SESSION_STORY,
      user: cloud.users.asesor!,
    });

    await expect(page.getByTestId("session-status")).toHaveText("signed-in");
    await expect(page.getByTestId("permissions-status")).toHaveText("ready");
    await expect.poll(() => requestsTo(PROFILES, "PATCH").length).toBe(1);

    const asked = cloud.contractEntries();
    expect.soft(asked).toContainEqual({
      kind: "table",
      method: "GET",
      table: "profiles",
      select: ENTRY_COLUMNS,
      filters: ["id"],
    });
    expect.soft(asked).toContainEqual({
      kind: "table",
      method: "PATCH",
      table: "profiles",
      select: [],
      filters: ["id"],
    });
    expect.soft(requestsTo(PROFILES, "PATCH")[0]?.postDataJSON()).toEqual({
      last_login: expect.any(String),
    });
    await page.waitForTimeout(300);
    expect.soft(requestsTo(PROFILES, "PATCH"), "and no more").toHaveLength(1);
    expect.soft(cloud.signOuts).toBe(0);
    await context.close();
  });

  test("a dropped connection keeps the session, and Reintentar enters", async ({
    browser,
    cloud,
    storybookUrl,
  }) => {
    let isOffline = true;
    const { page, requestsTo, hasStoredSession, context } = await openHarness({
      browser,
      cloud,
      storybookUrl,
      story: SESSION_STORY,
      user: cloud.users.asesor!,
      beforeOpening: async (opening) => {
        await opening.route(`**${PROFILES}*`, async (route) => {
          if (isOffline) await route.abort("connectionreset");
          else await route.fallback();
        });
      },
    });

    await expect(page.getByTestId("session-status")).toHaveText("unreachable", {
      timeout: DROPPED_CONNECTION_SHOWS_MS,
    });
    expect.soft(cloud.signOuts, "the session is not closed").toBe(0);
    expect.soft(await hasStoredSession(), "it stays in the browser").toBe(true);
    expect.soft(requestsTo(PROFILES, "PATCH"), "nothing is written").toEqual([]);

    isOffline = false;
    await page.getByRole("button", { name: "Reintentar" }).click();

    await expect(page.getByTestId("session-status")).toHaveText("signed-in");
    await expect.poll(() => requestsTo(PROFILES, "PATCH").length).toBe(1);
    expect.soft(cloud.signOuts).toBe(0);
    await context.close();
  });

  test("an inactive account is taken out, and its session closed once", async ({
    browser,
    cloud,
    storybookUrl,
  }) => {
    cloud.ownProfileStatus = "inactive";
    const { page, requestsTo, hasStoredSession, context } = await openHarness({
      browser,
      cloud,
      storybookUrl,
      story: SESSION_STORY,
      user: cloud.users.asesor!,
    });

    await expect(page.getByTestId("session-status")).toHaveText("rejected");
    await expect(page.getByTestId("session-message")).toHaveText(
      "Cuenta inactiva. Contactá al administrador.",
    );
    await expect.poll(() => cloud.signOuts).toBe(1);
    await expect.poll(hasStoredSession).toBe(false);
    expect.soft(requestsTo(PROFILES, "PATCH")).toEqual([]);
    await context.close();
  });
});
