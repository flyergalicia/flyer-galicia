// Replaces pruebas/t93_gestiones_v2.cjs: what an officer forwards to a hunter.
import { dayFromToday, PEOPLE, today } from "../../support/cloud/commercial-actions/model.ts";
import { type ProspectRow } from "../../support/cloud/commercial-actions/rows.ts";
import { type Cloud } from "../../support/cloud/index.ts";
import { commercialTables, openAsTeamMember } from "../../support/commercial-team.ts";
import { type CommercialActionsDriver } from "../../support/driver/commercial-actions.ts";
import { expect, test } from "../../support/test.ts";

const PEOPLE_TO_PASTE =
  "Nombre\tTeléfono\tCUIL o referencia\nLucía Pérez\t11 4444-1111\t27-11111111-7\nRamón Díaz\tramon.diaz@mail.com\tLegajo 55\nSin Nombre 123\t\t\n\t11 2222-3333\tSector B";
const ROWS_ABOVE_ONE_PAGE = 1100;
const ALREADY_CONTACTED = 10;

function bigListOfPeople(actionId: string): ProspectRow[] {
  return Array.from({ length: ROWS_ABOVE_ONE_PAGE }, (_, index) => ({
    id: `pp${String(index).padStart(5, "0")}`,
    gestion_id: actionId,
    nombre: `Persona ${String(index)}`,
    estado: index < ALREADY_CONTACTED ? "prospecto" : "a_contactar",
    cuil: null,
    paquete: null,
    contacto: null,
    referencia: null,
    motivo: null,
    proximo: null,
    fecha_alta: null,
    renta: null,
    creado_por: PEOPLE.officer.id,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }));
}

async function forwardADataListAndReadItWhole(
  cloud: Cloud,
  actions: CommercialActionsDriver,
): Promise<void> {
  const tables = commercialTables(cloud);

  await actions.startForwarding("SUPERMERCADOS DEL VALLE SA");
  await actions.chooseActionType("data-list");

  const sections = await actions.formSections();
  expect.soft(sections.schedule, "a data list hides time and place").toBe(false);
  expect.soft(sections.peopleList, "and shows the list").toBe(true);

  await actions.chooseHunter("Julia Sosa");
  const preview = await actions.pastePeople(PEOPLE_TO_PASTE);
  expect.soft(preview, "the preview says how many are ready").toMatch(/3 personas listas/);
  expect.soft(preview, "and how many have problems").toMatch(/1 con problemas/);

  await actions.confirmForwarding();
  expect.soft(await actions.waitForDialogToClose(), "the data list is forwarded").toBe(true);

  const dataList = tables.actions.find(
    ({ tipo, empresa }) => tipo === "datos" && empresa.includes("SUPERMERCADOS"),
  );
  if (!dataList) throw new Error("The data list was not saved");
  const people = tables.prospects.filter(({ gestion_id: action }) => action === dataList.id);
  expect.soft(dataList.hunter_id, "it stays for Julia").toBe(PEOPLE.hunter3.id);
  expect.soft(dataList.hora_desde, "with no time").toBeNull();
  expect.soft(dataList.cuit, "with the CUIT copied from the registry").toBe("30900006110");
  expect.soft(people, "with the people ready").toHaveLength(3);
  expect
    .soft(
      people.every(({ estado }) => estado === "a_contactar"),
      'all of them "A contactar"',
    )
    .toBe(true);
  expect
    .soft(
      people.some(({ cuil }) => cuil === "27111111117"),
      "with their CUIL",
    )
    .toBe(true);
  expect
    .soft(
      people.some(
        ({ contacto, referencia }) =>
          contacto === "ramon.diaz@mail.com" && referencia === "Legajo 55",
      ),
      "or their contact and reference",
    )
    .toBe(true);

  // Supabase cuts at 1000 rows.
  tables.prospects.push(...bigListOfPeople(dataList.id));
  await actions.openAction(dataList.id);
  const allPeople = await actions.waitForPeople((found) => found.length === 1103);
  expect.soft(allPeople, "the action of a list of 1103 brings them all").toHaveLength(1103);
}

test(
  "forwarding a data list pastes its people, and a huge one is read whole",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    cloud.seedCommercialActions();
    const { commercialActions: actions } = await openAsTeamMember(openApp, "officer");

    await forwardADataListAndReadItWhole(cloud, actions);
  },
);

test(
  "the agenda counts all the people of a huge data list",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    cloud.seedCommercialActions();
    const { commercialActions: actions } = await openAsTeamMember(openApp, "officer");

    await forwardADataListAndReadItWhole(cloud, actions);

    await actions.goToTab("agenda");
    expect
      .soft(
        await actions.waitForScreenText(/de 1103 contactados/),
        "the agenda counts the 1103 people of the list",
      )
      .toMatch(/de 1103 contactados/);
  },
);

test(
  "when the list cannot be saved it stays pasted on the action to try again",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    cloud.seedCommercialActions();
    const { commercialActions: actions, page } = await openAsTeamMember(openApp, "officer");
    const peopleTable = "**/rest/v1/gestion_prospectos**";
    await page.route(peopleTable, (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status: 500,
            body: JSON.stringify({ message: "simulated failure" }),
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          })
        : route.fallback(),
    );

    await actions.startForwarding("CLINICA DEL PARQUE SA");
    await actions.chooseActionType("data-list");
    await actions.chooseHunter("Julia Sosa");
    await actions.pastePeople("Mario Paz\t11 4444-0001\nNora Gil\t11 4444-0002");
    await actions.confirmForwarding();

    const pasted = await actions.waitForPastedList();
    expect.soft(pasted.text, "the action opens with the list pasted").toMatch(/Mario Paz/);
    expect.soft(pasted.sectionOpen, "ready to try again").toBe(true);

    await page.unroute(peopleTable);
    await actions.addPastedList();

    const people = await actions.waitForPeople((found) => found.length === 2);
    expect.soft(people, "one touch loads the two people").toHaveLength(2);
    expect
      .soft(
        people.every(({ status }) => status === "a_contactar"),
        '"A contactar"',
      )
      .toBe(true);
  },
);

test(
  "an officer cannot overlap the time of a hunter, and sees who is free",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    cloud.seedCommercialActions();
    const tables = commercialTables(cloud);
    const { commercialActions: actions, page } = await openAsTeamMember(openApp, "officer");

    await actions.startForwarding("TEXTIL ARGENTA SA");
    await actions.chooseHunter("Sofía Paz");
    await actions.setDate(today());
    await actions.setTimes("16:00", "18:00");

    const notice = await actions.waitForOverlapNotice();
    expect.soft(notice.text, "it shows who is free at that time").toMatch(/Libres a esa hora/);
    expect
      .soft(notice.text, "the officer cannot save like this")
      .toMatch(/Así no se puede guardar/);
    expect.soft(notice.freeHunters, "Tomás shows as free").toContain("Tomás Ríos");
    expect.soft(notice.freeHunters, "and Sofía does not").not.toContain("Sofía Paz");

    const actionsBefore = tables.actions.length;
    await actions.confirmForwarding();
    await expect
      .soft(page.getByText(/ya tiene algo a esa hora/).first(), "saving says what it overlaps")
      .toBeVisible();
    expect.soft(tables.actions, "saving stops").toHaveLength(actionsBefore);
    expect.soft(await actions.dialogIsOpen(), "and the window stays open").toBe(true);

    await actions.chooseFreeHunter("Tomás Ríos");
    await actions.confirmForwarding();
    expect
      .soft(await actions.waitForDialogToClose(), "with Tomás, who is free, it goes")
      .toBe(true);
    expect
      .soft(
        tables.actions.some(
          ({ empresa, hunter_id: hunter, hora_desde: from }) =>
            empresa.includes("TEXTIL") && hunter === PEOPLE.hunter2.id && from === "16:00:00",
        ),
        "it stays for Tomás from 16 to 18",
      )
      .toBe(true);

    const refusal = await actions.insertActionBehindTheScreen({
      empresa: "TEXTIL ARGENTA SA",
      origen: "derivada",
      hunter_id: PEOPLE.hunter.id,
      tipo: "accion",
      estado: "planificada",
      fecha: today(),
      hora_desde: "16:30",
      hora_hasta: "17:00",
    });
    expect
      .soft(refusal, "the database refuses the overlap even skipping the screen")
      .toMatch(/GES_PISA/);
  },
);

test(
  "the officer can leave an action for the leader to assign",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    cloud.seedCommercialActions();
    const tables = commercialTables(cloud);
    const { commercialActions: actions } = await openAsTeamMember(openApp, "officer");

    await actions.startForwarding("METALURGICA NORTE SA");
    expect
      .soft(await actions.hunterChoices(), 'the officer can choose "Que la asigne el líder"')
      .toContain("Que la asigne el líder");

    await actions.leaveToLeader();
    await actions.setDate(dayFromToday(5));

    expect.soft((await actions.formSections()).leader, "the leader field shows").toBe(true);
    const leaders = await actions.leaderChoices();
    expect.soft(leaders.join(), "with the leader").toMatch(/Laura Méndez/);

    await actions.confirmForwarding();

    expect.soft(await actions.waitForDialogToClose(), "it goes to the team").toBe(true);
    expect
      .soft(
        tables.actions.filter(
          ({ hunter_id: hunter, lider_id: leader }) => !hunter && leader === PEOPLE.leader.id,
        ),
        "with no hunter, for Laura",
      )
      .toHaveLength(2);
  },
);
