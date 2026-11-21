// Protects what only text checks guarded: Gestiones comes on demand, its switch, its repetitions.
import { commercialTables, openAsTeamMember } from "../../support/commercial-team.ts";
import { expect, test } from "../../support/test.ts";

const FAR_DATE = "2027-03-01";
/** The file of the old app, or the piece of the build of the other one. */
const CODE_OF_THE_MODULE = /gestiones\.js|\/fg-commercial-actions-[^/]*\.js/;

test.describe("the module of Gestiones", () => {
  test("its code arrives only when it is opened", async ({ cloud, openApp }) => {
    cloud.seedCommercialActions();
    const asked: string[] = [];
    const app = await openApp({
      user: "officer",
      commercialActions: true,
      waitUntilReady: false,
      beforeNavigation: (page) => {
        page.on("request", (request) => {
          if (CODE_OF_THE_MODULE.test(request.url())) asked.push(request.url());
        });
        return Promise.resolve();
      },
    });
    await app.session.waitForCommercialActions();
    await app.session.chooseHeaderTab("Promociones").catch(() => undefined);
    expect.soft(asked, "not on entering").toEqual([]);

    await app.commercialActions.open();

    expect.soft(asked.length, "once on opening").toBe(1);
  });

  test("with the switch off it does not exist for anybody", async ({ cloud, openApp }) => {
    cloud.seedCommercialActions();
    commercialTables(cloud).flag = "off";
    const app = await openApp({
      user: "officer",
      commercialActions: true,
      waitUntilReady: false,
    });
    await app.session.waitUntilSignedIn();

    await expect.poll(async () => (await app.session.headerTabs()).length).toBeGreaterThan(0);
    expect.soft((await app.session.headerTabs()).join(" ")).not.toMatch(/Gestiones/);
  });

  test("on trial only the administrator sees it, whatever the matrix says", async ({
    cloud,
    openApp,
  }) => {
    cloud.seedCommercialActions();
    commercialTables(cloud).flag = "prueba";
    cloud.setPermissions("pro", { gestiones: true });

    const officer = await openApp({
      user: "officer",
      commercialActions: true,
      waitUntilReady: false,
    });
    await officer.session.waitUntilSignedIn();
    await officer.page.waitForTimeout(400);
    expect
      .soft((await officer.session.headerTabs()).join(" "), "not an officer")
      .not.toMatch(/Gestiones/);

    const admin = await openApp({ user: "admin", commercialActions: true });
    await expect
      .poll(async () => (await admin.session.headerTabs()).join(" "))
      .toMatch(/Gestiones/);
  });

  test("a test account can try the other profiles from its menu, through the server", async ({
    cloud,
    openApp,
  }) => {
    cloud.isTestAccount = true;
    const app = await openApp();
    const asked: unknown[] = [];
    app.page.on("request", (request) => {
      if (request.url().includes("/rpc/prueba_cambiar_rol")) asked.push(request.postDataJSON());
    });
    await app.session.openUserMenu();

    await app.page.getByRole("button", { name: "Hunter", exact: true }).first().click();

    await expect.poll(() => asked.length).toBe(1);
    expect.soft(asked[0]).toEqual({ p_role: "hunter" });
  });

  test("new things show as a number on the tab", async ({ cloud, openApp }) => {
    cloud.seedCommercialActions();
    const app = await openApp({ user: "hunter", commercialActions: true, waitUntilReady: false });
    await app.session.waitForCommercialActions();

    await expect
      .poll(() => app.session.headerTabBadge("Gestiones"), { timeout: 8000 })
      .toMatch(/^\d+\+?$/);
  });

  test("the administrator sees his own by default and can look at the team", async ({
    cloud,
    openApp,
  }) => {
    cloud.seedCommercialActions();
    const app = await openApp({ user: "admin", commercialActions: true });
    const asked: unknown[] = [];
    app.page.on("request", (request) => {
      if (request.url().includes("/rpc/gestiones_lista")) asked.push(request.postDataJSON());
    });
    await app.commercialActions.open();
    await expect.poll(() => asked.length).toBeGreaterThan(0);
    expect.soft(asked.at(-1), "only his").toEqual(expect.objectContaining({ p_solo_mio: true }));

    await app.page.getByRole("button", { name: "Ver todo" }).click();

    await expect.poll(() => asked.at(-1)).toEqual(expect.objectContaining({ p_solo_mio: false }));
    await expect(app.page.getByRole("button", { name: "Sólo lo mío" })).toBeVisible();
  });
});

test.describe("the form of an action", () => {
  test("offers its types, and no old Visita", async ({ cloud, openApp }) => {
    cloud.seedCommercialActions();
    const { commercialActions: actions } = await openAsTeamMember(openApp, "officer");

    await actions.startForwarding("TEXTIL ARGENTA SA");

    const types = await actions.actionTypeChoices();
    expect.soft(types.join(" ")).toMatch(/Acci.n/);
    expect.soft(types.join(" ")).toMatch(/Feria/);
    expect.soft(types.join(" ")).not.toMatch(/Visita/);
  });

  test("every N days with a number of times creates all the dates, in a single series", async ({
    cloud,
    openApp,
  }) => {
    cloud.seedCommercialActions();
    const tables = commercialTables(cloud);
    const before = tables.actions.length;
    const { commercialActions: actions, page } = await openAsTeamMember(openApp, "officer");

    await actions.startForwarding("TEXTIL ARGENTA SA");
    await actions.chooseHunter("Sofía Paz");
    await actions.setDate(FAR_DATE);
    await actions.setTimes("10:00", "12:00");
    await page.getByRole("button", { name: "Se repite" }).click();
    await page.getByLabel("Cada cuántos días").fill("7");
    await page.getByLabel("Cantidad de veces").fill("3");
    await actions.confirmForwarding();

    await expect.poll(() => tables.actions.length).toBe(before + 3);
    const created = tables.actions.slice(before);
    expect
      .soft(created.map(({ fecha }) => fecha).toSorted())
      .toEqual(["2027-03-01", "2027-03-08", "2027-03-15"]);
    expect.soft(new Set(created.map(({ serie_id: series }) => series)).size, "one series").toBe(1);
  });
});
