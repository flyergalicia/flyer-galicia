// Replaces pruebas/t71_reintentar_red.cjs.
import { type Cloud, type CloudUser } from "../../support/cloud/index.ts";
import { type OpenAppOptions, type OpenedApp } from "../../support/open-app.ts";
import { expect, test } from "../../support/test.ts";

const COMPANIES = [
  {
    empresa: "ACME SA",
    cuits: ["30711111111"],
    config: "BAU",
    asesores: [{ nombre: "Ana Perez", celular: "11 4444 5555", email: "ana@bancogalicia.com.ar" }],
  },
  {
    empresa: "BETA SRL",
    cuits: ["30722222222"],
    config: "BAU",
    asesores: [
      { nombre: "Luis Gomez", celular: "11 4444 6666", email: "luis@bancogalicia.com.ar" },
    ],
  },
];
const HUNTER: CloudUser = {
  id: "00000000-0000-4000-8000-0000000000cc",
  email: "hunter.prueba@bancogalicia.com.ar",
  name: "Hunter Prueba",
  role: "hunter",
};
const COULD_NOT_CONNECT = /No se pudo conectar/;
const NOTHING_LOADED_YET = /Todav[ií]a no cargaste/;

async function expectSessionIntact(app: OpenedApp): Promise<void> {
  const status = await app.session.status();
  expect.soft(status.signedIn, "the session stays open").toBe(true);
  expect.soft(status.loginScreenVisible, "no login screen").toBe(false);
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
}

async function openAsHunter(
  cloud: Cloud,
  openApp: (options?: OpenAppOptions) => Promise<OpenedApp>,
): Promise<OpenedApp> {
  cloud.setPermissions("hunter", { opcion_9: true });
  const app = await openApp({ user: HUNTER, waitUntilReady: false });
  await app.session.waitUntilSignedIn();
  await app.hunter.waitForList();
  return app;
}

function companiesAvailable(cloud: Cloud, available: boolean): void {
  cloud.companies = COMPANIES;
  cloud.companiesUnreachable = !available;
}

test.describe("a cut in the network is not an empty list", () => {
  test("the search says it could not connect, and Reintentar brings the companies", async ({
    cloud,
    openApp,
  }) => {
    const app = await openApp({ user: "admin" });
    const { companyRegistry } = app;
    companiesAvailable(cloud, false);

    await companyRegistry.forgetCompanies();
    await companyRegistry.openSearch();
    await companyRegistry.waitForConnectionProblem();

    const list = await companyRegistry.searchList();
    expect.soft(list.text, 'the search says "No se pudo conectar"').toMatch(COULD_NOT_CONNECT);
    expect.soft(list.hasRetry, "and offers Reintentar").toBe(true);
    expect
      .soft(list.text, 'the search does not say "Todavía no cargaste empresas"')
      .not.toMatch(NOTHING_LOADED_YET);
    expect
      .soft(await app.flyerEditor.latestNotice(), "the notice has no technical English")
      .not.toMatch(/Failed to fetch|TypeError/i);

    companiesAvailable(cloud, true);
    await companyRegistry.retrySearch();
    await companyRegistry.waitForCompaniesLoaded(COMPANIES.length);

    expect
      .soft((await companyRegistry.searchList()).companies, "after Reintentar it lists both")
      .toHaveLength(COMPANIES.length);
    await expectSessionIntact(app);
  });

  test("the suggestions retry by themselves when typing", async ({ cloud, openApp }) => {
    const app = await openApp({ user: "admin" });
    const { companyRegistry } = app;
    companiesAvailable(cloud, false);

    await companyRegistry.forgetCompanies();
    await companyRegistry.loadCompanies();
    await companyRegistry.waitForConnectionProblem();
    companiesAvailable(cloud, true);
    await companyRegistry.typeCompanyName("acm");
    await companyRegistry.waitForCompaniesLoaded(COMPANIES.length);

    const suggestions = await companyRegistry.suggestions();
    expect.soft(suggestions.visible, "it retried by itself and shows suggestions").toBe(true);
    expect.soft(suggestions.count, "suggesting ACME").toBeGreaterThanOrEqual(1);
    await expectSessionIntact(app);
  });

  test("Generar flyers says it could not connect, and Reintentar brings the companies", async ({
    cloud,
    openApp,
  }) => {
    const app = await openApp({ user: "admin" });
    const { companyRegistry } = app;
    companiesAvailable(cloud, false);

    await companyRegistry.forgetCompanies();
    await companyRegistry.showGeneratorAndLoad();
    await companyRegistry.waitForConnectionProblem();

    const text = await companyRegistry.generatorText();
    expect.soft(text, 'Generar flyers: "No se pudo conectar"').toMatch(COULD_NOT_CONNECT);
    expect.soft(text, 'Generar flyers: not "Todavía no cargaste"').not.toMatch(NOTHING_LOADED_YET);

    companiesAvailable(cloud, true);
    await companyRegistry.retryConnection();
    await companyRegistry.waitForCompaniesLoaded(COMPANIES.length);

    expect
      .soft(await companyRegistry.generatorRowCount(), "after Reintentar both companies appear")
      .toBe(COMPANIES.length);
    await expectSessionIntact(app);
  });

  test("the Hunter list says it could not connect and does not keep it as empty", async ({
    cloud,
    openApp,
  }) => {
    const app = await openAsHunter(cloud, openApp);
    const { companyRegistry } = app;
    companiesAvailable(cloud, false);

    await companyRegistry.loadHunterList();
    await companyRegistry.waitForHunterConnectionProblem();

    const failed = await companyRegistry.hunterList();
    expect.soft(failed.text, "Hunter: a connection notice").toMatch(COULD_NOT_CONNECT);
    expect
      .soft(failed.text, 'Hunter: not "no hay ninguna empresa"')
      .not.toMatch(/Todav[ií]a no hay ninguna empresa/);
    expect.soft(failed.loadedCompanies, "Hunter: the failure is not kept as a list").toBeNull();

    companiesAvailable(cloud, true);
    await companyRegistry.retryHunterList();
    await companyRegistry.waitForHunterCompanies(COMPANIES.length);

    const loaded = await companyRegistry.hunterList();
    expect.soft(loaded.failed, "Hunter: after Reintentar there is no failure").toBe(false);
    expect.soft(loaded.emptyNotices, "Hunter: and the companies appear").toBe(0);
    await expectSessionIntact(app);
  });

  test("an option that could not be asked is not written down as having no flyer", async ({
    cloud,
    openApp,
  }) => {
    const app = await openAsHunter(cloud, openApp);
    const { companyRegistry } = app;
    const dropped = cloud.dropBucketFile("_active9.json");

    const cut = await companyRegistry.checkHunterFlyers();
    expect.soft(cut.failed, "Hunter: it knows the check failed").toBe(true);
    expect
      .soft(cut.hasFlyer, 'Hunter: option 9 is not noted as "no flyer"')
      .not.toHaveProperty("9");

    dropped.restore();
    const back = await companyRegistry.checkHunterFlyers();
    expect.soft(back.failed, "Hunter: retrying succeeds").toBe(false);
    expect.soft(back.hasFlyer["9"], "Hunter: and learns option 9 has a flyer").toBe(true);
    await expectSessionIntact(app);
  });
});
