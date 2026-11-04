// The two ways of filling the agenda from a company of the database: Asignar and Pegar desde Excel.
import { commercialTables, openAsTeamMember } from "../../support/commercial-team.ts";
import { type Cloud } from "../../support/cloud/index.ts";
import { type OpenAppOptions, type OpenedApp } from "../../support/open-app.ts";
import { gate } from "../../support/settled.ts";
import { expect, test } from "../../support/test.ts";

const DAY = "2027-03-01";
const NEXT_DAY = "2027-03-02";
const COMPANY_RPC = "**/rest/v1/rpc/gestiones_empresas";
const TEXTIL = "TEXTIL ARGENTA SA";
const LOGISTICA = "LOGISTICA ANDINA SRL";
const OTHER_OFFICER_COMPANY = "TRANSPORTES RIO SA";

type OpenApp = (options?: OpenAppOptions) => Promise<OpenedApp>;

async function openAgenda(openApp: OpenApp, person: "officer" | "leader" | "hunter") {
  const app = await openAsTeamMember(openApp, person);
  await app.commercialActions.goToTab("agenda");
  return app;
}

function searchesOf(app: OpenedApp): unknown[] {
  const asked: unknown[] = [];
  app.page.on("request", (request) => {
    if (request.url().includes("/rpc/gestiones_empresas")) asked.push(request.postDataJSON());
  });
  return asked;
}

function idOf(cloud: Cloud, person: string): string {
  return cloud.users[person]?.id ?? "";
}

test.describe("Asignar from the agenda", () => {
  test("the company is searched in the database, chosen and goes with its officer", async ({
    cloud,
    openApp,
  }) => {
    cloud.seedCommercialActions();
    const tables = commercialTables(cloud);
    const before = tables.actions.length;
    const app = await openAgenda(openApp, "officer");
    const { commercialActions: actions, flyerEditor } = app;
    const asked = searchesOf(app);
    await actions.startScheduling();

    await actions.searchCompanyToAssign("T");
    await app.page.waitForTimeout(400);
    expect.soft(asked, "one letter asks nothing").toEqual([]);

    await actions.searchCompanyToAssign("TEX");
    await actions.searchCompanyToAssign("TEXTIL");
    await expect.poll(() => actions.companySearchResults()).toContain(TEXTIL);
    expect.soft(asked, "only what was left written").toEqual([{ p_q: "TEXTIL", p_limit: 20 }]);
    expect
      .soft(await actions.companySearchResults(), "with its tax id, and it is one's own")
      .toMatch(/30-90000511-3 · Vos/);

    await actions.confirmAgendaAction();
    await expect.poll(() => flyerEditor.latestNotice()).toBe("Elegí la empresa de la lista.");
    expect.soft(tables.actions.length, "without a company nothing is saved").toBe(before);

    await actions.chooseCompanyFound(TEXTIL);
    expect.soft(await actions.companySearchResults(), "the chip").toMatch(/CUIT 30-90000511-3/);
    await actions.chooseHunter("Sofía Paz");
    await actions.setDate(DAY);
    await actions.setTimes("10:00", "12:00");
    await actions.confirmAgendaAction();

    await expect.poll(() => tables.actions.length).toBe(before + 1);
    expect.soft(tables.actions.at(-1)).toMatchObject({
      empresa: TEXTIL,
      dueno_id: idOf(cloud, "officer"),
      hunter_id: idOf(cloud, "hunter"),
      origen: "derivada",
      tipo: "posicion",
      fecha: DAY,
      hora_desde: "10:00:00",
      hora_hasta: "12:00:00",
      estado: "planificada",
    });
    expect.soft(await actions.waitForDialogToClose()).toBe(true);
    await expect.poll(() => flyerEditor.latestNotice()).toMatch(/Asignada/);
  });

  test("writing again lets go of the company chosen", async ({ cloud, openApp }) => {
    cloud.seedCommercialActions();
    const { commercialActions: actions, flyerEditor } = await openAgenda(openApp, "officer");
    await actions.startScheduling();
    await actions.searchCompanyToAssign("TEXTIL");
    await expect.poll(() => actions.companySearchResults()).toContain(TEXTIL);
    await actions.chooseCompanyFound(TEXTIL);

    await actions.searchCompanyToAssign("TEXTIL OTRA");

    await expect.poll(() => actions.companySearchResults()).toMatch(/Ninguna empresa de la base/);
    await actions.confirmAgendaAction();
    await expect.poll(() => flyerEditor.latestNotice()).toBe("Elegí la empresa de la lista.");
  });

  test("an officer does not find the companies of another officer", async ({ cloud, openApp }) => {
    cloud.seedCommercialActions();
    const { commercialActions: actions } = await openAgenda(openApp, "officer");
    await actions.startScheduling();

    await actions.searchCompanyToAssign(OTHER_OFFICER_COMPANY);

    await expect.poll(() => actions.companySearchResults()).toMatch(/Ninguna empresa de la base/);
  });

  test("a leader finds those of the team, and the action stays with its officer", async ({
    cloud,
    openApp,
  }) => {
    cloud.seedCommercialActions();
    const tables = commercialTables(cloud);
    const before = tables.actions.length;
    const { commercialActions: actions } = await openAgenda(openApp, "leader");
    await actions.startScheduling();

    await actions.searchCompanyToAssign(OTHER_OFFICER_COMPANY);
    await expect.poll(() => actions.companySearchResults()).toMatch(/Diego Ruiz/);
    await actions.chooseCompanyFound(OTHER_OFFICER_COMPANY);
    await actions.chooseHunter("Sofía Paz");
    await actions.setDate(DAY);
    await actions.setTimes("10:00", "12:00");
    await actions.confirmAgendaAction();

    await expect.poll(() => tables.actions.length).toBe(before + 1);
    expect.soft(tables.actions.at(-1)).toMatchObject({
      empresa: OTHER_OFFICER_COMPANY,
      dueno_id: idOf(cloud, "officer2"),
      hunter_id: idOf(cloud, "hunter"),
    });
  });

  test("a hunter schedules it for themselves, as their own", async ({ cloud, openApp }) => {
    cloud.seedCommercialActions();
    const tables = commercialTables(cloud);
    const before = tables.actions.length;
    const { commercialActions: actions } = await openAgenda(openApp, "hunter");
    await actions.startScheduling();
    expect.soft(await actions.dialogText()).toMatch(/Agendar/);

    await actions.searchCompanyToAssign(TEXTIL);
    await expect.poll(() => actions.companySearchResults()).toContain(TEXTIL);
    await actions.chooseCompanyFound(TEXTIL);
    await actions.setDate(DAY);
    await actions.setTimes("10:00", "12:00");
    await actions.confirmAgendaAction();

    await expect.poll(() => tables.actions.length).toBe(before + 1);
    expect.soft(tables.actions.at(-1)).toMatchObject({
      empresa: TEXTIL,
      dueno_id: idOf(cloud, "officer"),
      hunter_id: idOf(cloud, "hunter"),
      origen: "propia",
    });
  });

  test("an answer that arrives late does not replace the search of now", async ({
    cloud,
    openApp,
  }) => {
    cloud.seedCommercialActions();
    const app = await openAgenda(openApp, "officer");
    const { commercialActions: actions, page } = app;
    await actions.startScheduling();
    const hold = gate();
    await page.route(COMPANY_RPC, async (route) => {
      const search = JSON.stringify(route.request().postDataJSON());
      if (search.includes("TEXTIL")) await hold.promise;
      await route.fallback();
    });

    await actions.searchCompanyToAssign("TEXTIL");
    await page.waitForTimeout(400);
    await actions.searchCompanyToAssign("LOGISTICA");
    await expect.poll(() => actions.companySearchResults()).toContain(LOGISTICA);
    hold.open();
    await page.waitForTimeout(300);

    expect.soft(await actions.companySearchResults()).not.toContain(TEXTIL);
  });

  test("a search that fails says so", async ({ cloud, openApp }) => {
    cloud.seedCommercialActions();
    const { commercialActions: actions, page } = await openAgenda(openApp, "officer");
    await actions.startScheduling();
    await page.route(COMPANY_RPC, async (route) => {
      await route.fulfill({ status: 500, json: { message: "se cortó", code: "XX000" } });
    });

    await actions.searchCompanyToAssign("TEXTIL");

    await expect.poll(() => actions.companySearchResults()).toMatch(/No se pudo buscar: se cortó/);
  });
});

test.describe("Pegar desde Excel", () => {
  const TWO_GOOD = [
    `${DAY}\t10 a 12\t${TEXTIL}\tSofía\tPiso 3`,
    `Feria\t${DAY}\t14 a 15\tTomás Ríos\t${LOGISTICA}`,
  ].join("\n");

  test("a hunter is not offered it", async ({ cloud, openApp }) => {
    cloud.seedCommercialActions();
    const { commercialActions: actions } = await openAgenda(openApp, "hunter");

    expect.soft(await actions.agendaPasteOffered()).toBe(false);
  });

  test("reviews each line against the database and adds those that are ready", async ({
    cloud,
    openApp,
  }) => {
    cloud.seedCommercialActions();
    const tables = commercialTables(cloud);
    const before = tables.actions.length;
    const app = await openAgenda(openApp, "officer");
    const { commercialActions: actions, flyerEditor } = app;
    const asked = searchesOf(app);
    await actions.openAgendaPaste();

    await actions.pasteAgenda(TWO_GOOD);
    const review = await actions.waitForAgendaReview();

    expect.soft(review.summary).toMatch(/2 listas/);
    expect.soft(review.addButton).toEqual({ text: "Agregar 2 a la agenda", locked: false });
    expect.soft(review.rows[0]).toMatchObject({
      time: "10:00–12:00",
      company: TEXTIL,
      hunter: "Sofía Paz",
      place: "Piso 3",
      status: "Lista",
    });
    expect.soft(review.rows[1], "columns in another order").toMatchObject({
      company: LOGISTICA,
      hunter: "Tomás Ríos",
      status: "Lista",
    });
    expect.soft(asked, "each company is looked for once, by its whole name").toEqual([
      { p_q: TEXTIL, p_limit: 20 },
      { p_q: LOGISTICA, p_limit: 20 },
    ]);
    expect.soft(tables.actions.length, "nothing is saved yet").toBe(before);

    await actions.addPastedAgenda();

    await expect.poll(() => tables.actions.length).toBe(before + 2);
    const [first, second] = tables.actions.slice(before);
    expect.soft(first).toMatchObject({
      empresa: TEXTIL,
      dueno_id: idOf(cloud, "officer"),
      hunter_id: idOf(cloud, "hunter"),
      origen: "derivada",
      tipo: "posicion",
      modalidad: "presencial",
      frecuencia: "unica",
      fecha: DAY,
      hora_desde: "10:00:00",
      hora_hasta: "12:00:00",
      lugar: "Piso 3",
      estado: "planificada",
    });
    expect.soft(second).toMatchObject({
      empresa: LOGISTICA,
      hunter_id: idOf(cloud, "hunter2"),
      tipo: "feria",
    });
    expect.soft(await actions.waitForDialogToClose()).toBe(true);
    await expect.poll(() => flyerEditor.latestNotice()).toBe("2 posiciones agregadas a la agenda.");
    await expect.poll(() => actions.agendaDayShown().then(({ date }) => date)).toBe(DAY);
  });

  test("says what is wrong with each line, and only those that are ready are added", async ({
    cloud,
    openApp,
  }) => {
    cloud.seedCommercialActions();
    const tables = commercialTables(cloud);
    const before = tables.actions.length;
    const { commercialActions: actions } = await openAgenda(openApp, "officer");
    await actions.openAgendaPaste();

    await actions.pasteAgenda(
      [
        "fecha\thorario\tempresa\thunter",
        `${DAY}\t10 a 12\t${TEXTIL}\tSofía`,
        `10 a 12\t${TEXTIL}\tSofía`,
        `${NEXT_DAY}\t10 a 12\tSofía`,
        `${NEXT_DAY}\t10 a 12\t${TEXTIL}\tNadie Existe`,
        `${NEXT_DAY}\t${TEXTIL}\tSofía`,
        `${NEXT_DAY}\t10 a 12\tINVENTADA SA\tSofía`,
        `${NEXT_DAY}\t10 a 12\tTEXTIL\tSofía`,
      ].join("\n"),
    );
    const { rows, summary, addButton } = await actions.waitForAgendaReview();

    expect.soft(rows.length, "the line of titles is left out").toBe(7);
    expect
      .soft(rows.map(({ status }) => status))
      .toEqual([
        "Lista",
        "sin fecha",
        "sin empresa",
        "no se reconoce el hunter",
        "sin horario",
        "la empresa no está en la base",
        "la empresa no está en la base",
      ]);
    expect.soft(summary).toMatch(/1 listas/);
    expect.soft(summary).toMatch(/6 con problemas/);
    expect.soft(addButton.text).toBe("Agregar 1 a la agenda");

    await actions.addPastedAgenda();
    await expect.poll(() => tables.actions.length).toBe(before + 1);
  });

  test("an officer cannot add what overlaps, with the agenda or within the list", async ({
    cloud,
    openApp,
  }) => {
    cloud.seedCommercialActions();
    const tables = commercialTables(cloud);
    const leader = await openApp({
      user: "leader",
      commercialActions: true,
      waitUntilReady: false,
    });
    await leader.commercialActions.open();
    const taken = await leader.commercialActions.insertActionBehindTheScreen({
      empresa: OTHER_OFFICER_COMPANY,
      dueno_id: idOf(cloud, "officer2"),
      hunter_id: idOf(cloud, "hunter"),
      origen: "derivada",
      tipo: "accion",
      fecha: NEXT_DAY,
      hora_desde: "10:00",
      hora_hasta: "12:00",
      estado: "planificada",
    });
    expect.soft(taken, "the agenda has something that day").toBeNull();
    const before = tables.actions.length;
    const { commercialActions: actions } = await openAgenda(openApp, "officer");
    await actions.openAgendaPaste();

    await actions.pasteAgenda(
      [
        `${DAY}\t10 a 12\t${TEXTIL}\tSofía`,
        `${DAY}\t11 a 13\t${LOGISTICA}\tSofía`,
        `${NEXT_DAY}\t11 a 13\t${TEXTIL}\tSofía`,
      ].join("\n"),
    );
    const { rows, addButton } = await actions.waitForAgendaReview();

    expect.soft(rows[0]?.status).toBe("Lista");
    expect
      .soft(rows[1]?.status, "within the list")
      .toMatch(/se pisa con 10:00–12:00.*de esta lista/);
    expect.soft(rows[2]?.status, "with the agenda").toMatch(/se pisa con 10:00–12:00/);
    expect.soft(addButton.text).toBe("Agregar 1 a la agenda");
    await actions.addPastedAgenda();
    await expect.poll(() => tables.actions.length).toBe(before + 1);
  });

  test("a leader is warned about what overlaps and adds it anyway", async ({ cloud, openApp }) => {
    cloud.seedCommercialActions();
    const tables = commercialTables(cloud);
    const before = tables.actions.length;
    const { commercialActions: actions } = await openAgenda(openApp, "leader");
    await actions.openAgendaPaste();

    await actions.pasteAgenda(
      [`${DAY}\t10 a 12\t${TEXTIL}\tSofía`, `${DAY}\t11 a 13\t${LOGISTICA}\tSofía`].join("\n"),
    );
    const { rows, summary, addButton } = await actions.waitForAgendaReview();

    expect.soft(rows[1]?.status).toMatch(/se pisa con/);
    expect.soft(summary).toMatch(/1 se pisan con otra \(se agregan igual\)/);
    expect.soft(addButton.text).toBe("Agregar 2 a la agenda");
    await actions.addPastedAgenda();
    await expect.poll(() => tables.actions.length).toBe(before + 2);
  });

  function shareWithAnotherOfficer(cloud: Cloud, other: string): void {
    const { companies } = commercialTables(cloud);
    const original = companies.find(({ empresa }) => empresa === TEXTIL);
    if (original) {
      companies.push({ ...original, id: companies.length + 1, user_id: idOf(cloud, other) });
    }
  }

  test("a company of two officers has to be loaded one by one", async ({ cloud, openApp }) => {
    cloud.seedCommercialActions();
    shareWithAnotherOfficer(cloud, "officer2");
    const { commercialActions: actions } = await openAgenda(openApp, "leader");
    await actions.openAgendaPaste();

    await actions.pasteAgenda(`${DAY}\t10 a 12\t${TEXTIL}\tSofía`);

    const { rows, addButton } = await actions.waitForAgendaReview();
    expect.soft(rows[0]?.status).toBe("la tienen 2 oficiales: cargala de a una");
    expect.soft(addButton.locked).toBe(true);
  });

  test("a company that is also one's own goes as one's own", async ({ cloud, openApp }) => {
    cloud.seedCommercialActions();
    shareWithAnotherOfficer(cloud, "leader");
    const tables = commercialTables(cloud);
    const before = tables.actions.length;
    const { commercialActions: actions } = await openAgenda(openApp, "leader");
    await actions.openAgendaPaste();

    await actions.pasteAgenda(`${DAY}\t10 a 12\t${TEXTIL}\tSofía`);
    expect.soft((await actions.waitForAgendaReview()).rows[0]?.status).toBe("Lista");
    await actions.addPastedAgenda();

    await expect.poll(() => tables.actions.length).toBe(before + 1);
    expect.soft(tables.actions.at(-1)?.dueno_id).toBe(idOf(cloud, "leader"));
  });

  test("what the database refuses says so, adds nothing and can be tried again", async ({
    cloud,
    openApp,
  }) => {
    cloud.seedCommercialActions();
    const tables = commercialTables(cloud);
    const { commercialActions: actions, flyerEditor } = await openAgenda(openApp, "officer");
    await actions.openAgendaPaste();
    await actions.pasteAgenda(TWO_GOOD);
    await actions.waitForAgendaReview();

    const leader = await openApp({
      user: "leader",
      commercialActions: true,
      waitUntilReady: false,
    });
    await leader.commercialActions.open();
    const taken = await leader.commercialActions.insertActionBehindTheScreen({
      empresa: OTHER_OFFICER_COMPANY,
      dueno_id: idOf(cloud, "officer2"),
      hunter_id: idOf(cloud, "hunter"),
      origen: "derivada",
      tipo: "accion",
      fecha: DAY,
      hora_desde: "11:00",
      hora_hasta: "13:00",
      estado: "planificada",
    });
    expect.soft(taken).toBeNull();
    const before = tables.actions.length;

    await actions.addPastedAgenda();

    await expect.poll(() => flyerEditor.latestNotice()).toMatch(/No se pudo agregar/);
    expect.soft(tables.actions.length, "none of the two").toBe(before);
    expect.soft(await actions.dialogIsOpen(), "the window stays").toBe(true);
    expect.soft((await actions.waitForAgendaReview()).addButton).toEqual({
      text: "Agregar 2 a la agenda",
      locked: false,
    });
  });

  test("a review that arrives late does not paint over the one on its way", async ({
    cloud,
    openApp,
  }) => {
    cloud.seedCommercialActions();
    const { commercialActions: actions, page } = await openAgenda(openApp, "officer");
    await actions.openAgendaPaste();
    const first = gate();
    const second = gate();
    await page.route(COMPANY_RPC, async (route) => {
      const search = JSON.stringify(route.request().postDataJSON());
      await (search.includes("TEXTIL") ? first.promise : second.promise);
      await route.fallback();
    });

    await actions.pasteAgenda(`${DAY}\t10 a 12\t${TEXTIL}\tSofía`);
    await page.waitForTimeout(600);
    await actions.pasteAgenda(`${DAY}\t10 a 12\t${LOGISTICA}\tSofía`);
    await page.waitForTimeout(600);
    first.open();
    await page.waitForTimeout(300);

    expect
      .soft(await actions.agendaPreviewText(), "the second is still at it")
      .toMatch(/Revisando/);
    second.open();
    const { rows, addButton } = await actions.waitForAgendaReview();
    expect
      .soft(rows.map(({ company, status }) => [company, status]))
      .toEqual([[LOGISTICA, "Lista"]]);
    expect.soft(addButton.text).toBe("Agregar 1 a la agenda");
  });

  test("Cancelar adds nothing", async ({ cloud, openApp }) => {
    cloud.seedCommercialActions();
    const tables = commercialTables(cloud);
    const before = tables.actions.length;
    const { commercialActions: actions } = await openAgenda(openApp, "officer");
    await actions.openAgendaPaste();
    await actions.pasteAgenda(TWO_GOOD);
    await actions.waitForAgendaReview();

    await actions.dismissDialog();

    expect.soft(await actions.dialogIsOpen()).toBe(false);
    expect.soft(tables.actions.length).toBe(before);
  });
});
