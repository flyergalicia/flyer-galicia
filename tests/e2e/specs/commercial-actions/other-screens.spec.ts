// What Gestiones and the other screens ask of each other: "Registrar gestión" of the screen of the
// Hunter, and "Ver su flyer" of an action. Nothing tested these on the old app.
import { type Page } from "@playwright/test";
import { PEOPLE } from "../../support/cloud/commercial-actions/model.ts";
import { commercialTables, openAsTeamMember } from "../../support/commercial-team.ts";
import { type OpenedApp } from "../../support/open-app.ts";
import { expect, test } from "../../support/test.ts";

const COMPANY = "TEXTIL ARGENTA SA";

/**
 * The window asks what this hunter already has planned for that company. No spec went through there
 * when the contract was recorded, so it is answered here: what it does with an answer is in
 * RegisterActionWindow.test. When the contract is recorded again, this can go.
 */
async function nothingPlanned(page: Page): Promise<void> {
  await page.route("**/rest/v1/gestiones*", (route) =>
    route.request().url().includes("empresa_key=")
      ? route.fulfill({
          json: [],
          headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" },
        })
      : route.fallback(),
  );
}

async function goToTheHunterScreen(app: OpenedApp): Promise<void> {
  await app.session.waitForCommercialActions();
  await app.session.chooseHeaderTab("Buscar flyer");
  await app.hunter.waitForList();
}

async function chooseCompany(app: OpenedApp): Promise<void> {
  await goToTheHunterScreen(app);
  await app.hunter.search(COMPANY);
  await app.hunter.choose(COMPANY);
  await app.hunter.waitForPreview();
}

test.describe("Registrar gestión", () => {
  test("a hunter registers what they did, for its officer, and lands on it", async ({
    cloud,
    openApp,
  }) => {
    cloud.seedCommercialActions();
    const tables = commercialTables(cloud);
    const app = await openApp({
      user: "hunter",
      commercialActions: true,
      waitUntilReady: false,
      beforeNavigation: nothingPlanned,
    });
    await chooseCompany(app);

    await app.page.getByRole("button", { name: "Registrar gestión" }).click();

    await expect.soft(app.page.getByText(/Cedida por/), "it says who ceded it").toBeVisible();
    await expect
      .soft(app.page.getByText(/Mariana Costa/).first(), "the officer, by themselves")
      .toBeVisible();
    await app.page.getByRole("button", { name: "Guardar y cargar prospectos" }).click();

    await expect
      .soft(app.page.getByText(/Ahora cargá los prospectos/), "it says what follows")
      .toBeVisible();
    expect
      .soft(await app.commercialActions.waitForScreenText(/Prospectos/), "it lands on the action")
      .toMatch(new RegExp(COMPANY));
    const saved = tables.actions.find(
      ({ empresa, hunter_id: hunter, origen }) =>
        empresa === COMPANY && hunter === PEOPLE.hunter.id && origen === "propia",
    );
    expect.soft(saved?.dueno_id, "with the officer as owner").toBe(PEOPLE.officer.id);
    expect.soft(saved?.estado, "and done").toBe("realizada");
  });

  test("Alt+G does the same, and a company has to be chosen", async ({ cloud, openApp }) => {
    cloud.seedCommercialActions();
    const app = await openApp({
      user: "hunter",
      commercialActions: true,
      waitUntilReady: false,
      beforeNavigation: nothingPlanned,
    });
    await goToTheHunterScreen(app);

    await app.page.keyboard.press("Alt+g");
    await expect
      .soft(app.page.getByText("Elegí primero una empresa de la lista."), "with none chosen")
      .toBeVisible();

    await app.hunter.search(COMPANY);
    await app.hunter.choose(COMPANY);
    await app.hunter.waitForPreview();
    await app.page.keyboard.press("Alt+g");

    await expect
      .soft(app.page.getByText(/Cedida por/), "the window of that company opens")
      .toBeVisible();
  });

  test("with Gestiones off the screen has no such button", async ({ cloud, openApp }) => {
    cloud.seedCommercialActions();
    commercialTables(cloud).flag = "off";
    const app = await openApp({ user: "hunter", commercialActions: true, waitUntilReady: false });
    await app.session.waitUntilSignedIn();
    await app.session.chooseHeaderTab("Buscar flyer");
    await app.hunter.waitForList();
    await app.hunter.search(COMPANY);
    await app.hunter.choose(COMPANY);
    await app.hunter.waitForPreview();

    await expect(app.page.getByRole("button", { name: "Registrar gestión" })).toBeHidden();
  });
});

test.describe("Ver su flyer", () => {
  test("takes a hunter to their screen, with that company chosen", async ({ cloud, openApp }) => {
    const { forwardedWithQuestion } = cloud.seedCommercialActions();
    const app = await openAsTeamMember(openApp, "hunter");
    await app.commercialActions.openAction(forwardedWithQuestion.id);

    await app.page.getByRole("button", { name: "Ver su flyer" }).click();

    await app.hunter.waitForList();
    await expect
      .poll(async () => (await app.hunter.waitForPreview()).shown, "its flyer is on screen")
      .toBe(true);
    expect
      .soft((await app.hunter.drawnTexts()).join(" "), "of that company")
      .toContain(forwardedWithQuestion.empresa);
  });

  test("takes an officer to the flyer editor, with that company loaded", async ({
    cloud,
    openApp,
  }) => {
    const { forwardedWithQuestion } = cloud.seedCommercialActions();
    cloud.setPermissions("vip", { padron_buscar: true });
    const app = await openAsTeamMember(openApp, "officer");
    await app.commercialActions.openAction(forwardedWithQuestion.id);

    await app.page.getByRole("button", { name: "Ver su flyer" }).click();

    await expect
      .soft(
        app.page.getByText(`Listo: ${forwardedWithQuestion.empresa} cargada en el armador.`),
        "it says so",
      )
      .toBeVisible();
    expect.soft(await app.session.isShowing("flyer-editor"), "the editor is on screen").toBe(true);
  });

  test("a leader, who makes no flyers, has no such button", async ({ cloud, openApp }) => {
    const { forwardedWithQuestion } = cloud.seedCommercialActions();
    const { commercialActions: actions } = await openAsTeamMember(openApp, "leader");
    await actions.goToTab("actions");
    await actions.openAction(forwardedWithQuestion.id);

    expect(await actions.actionCommands()).not.toContain("Ver su flyer");
  });
});
