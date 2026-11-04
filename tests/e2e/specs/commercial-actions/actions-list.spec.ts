// Replaces pruebas/t93_gestiones_v2.cjs: the list of actions and what is left unread.
import { commercialTables, openAsTeamMember } from "../../support/commercial-team.ts";
import { type ActionRow } from "../../support/driver/commercial-actions.ts";
import { expect, test } from "../../support/test.ts";

const WAITING_MS = 15_000;
const textOfRows = (rows: readonly ActionRow[]) => rows.map(({ text }) => text).join("\n");
const hasAlimentos = ({ text }: ActionRow) => text.includes("ALIMENTOS DEL SUR");
const of = (rows: readonly ActionRow[], company: string) =>
  rows.find(({ text }) => text.includes(company))?.text ?? "";

test("the officer sees the CUIT, what waits on someone and how a data list goes", async ({
  cloud,
  openApp,
}) => {
  cloud.seedCommercialActions();
  const { commercialActions: actions } = await openAsTeamMember(openApp, "officer");

  expect
    .soft(await actions.waitForScreenText(/30-90000111-8/), "Mis empresas shows each CUIT")
    .toMatch(/30-90000111-8/);

  await actions.goToTab("actions");
  const rows = await actions.waitForActionRows((found) => found.some(hasAlimentos));
  const list = textOfRows(rows);
  expect.soft(rows.some(hasAlimentos), "the list loads").toBe(true);
  expect.soft(list, "the list shows the CUIT").toMatch(/CUIT 30-90000111-8/);
  expect.soft(list, 'it shows "Por asignar"').toMatch(/Por asignar/);
  expect
    .soft(list, 'it shows "Pidió que se la pasen a otro"')
    .toMatch(/Pidió que se la pasen a otro/);
  expect.soft(list, 'a question of the hunter warns "1 mensaje nuevo"').toMatch(/1 mensaje nuevo/);
  expect.soft(list, "a data list is told apart").toMatch(/Base de datos/);
  expect.soft(list, "and says how many were contacted").toMatch(/de 15 contactados/);

  await actions.searchActions("9000011");
  const found = textOfRows(await actions.actionRows());
  expect.soft(found, "part of the CUIT finds the company").toMatch(/ALIMENTOS DEL SUR/);
  expect.soft(found, "and only that one").not.toMatch(/TEXTIL/);
});

test("each action shows its type and the list filters by type and date", async ({
  cloud,
  openApp,
}) => {
  cloud.seedCommercialActions();
  const { commercialActions: actions } = await openAsTeamMember(openApp, "officer");
  await actions.goToTab("actions");
  const all = await actions.waitForActionRows((rows) => rows.length > 0);

  expect
    .soft(
      all.every(({ type }) => type !== ""),
      "each action of the list shows its type",
    )
    .toBe(true);
  expect
    .soft(
      all.map(({ type }) => type),
      "one of them is a data list",
    )
    .toContain("Base de datos");

  await actions.filterActionsByType("Base de datos");
  const dataLists = await actions.actionRows();
  expect.soft(dataLists.length, "the filter by type leaves some").toBeGreaterThan(0);
  expect.soft(dataLists.length, "and not all").toBeLessThan(all.length);
  expect
    .soft(
      dataLists.every(({ text }) => text.includes("Base de datos")),
      "only the data lists",
    )
    .toBe(true);

  await actions.filterActionsByType("Todos los tipos");
  await actions.filterActionsFrom("2099-01-01");
  expect.soft(await actions.actionRows(), "the filter by date cuts the list").toHaveLength(0);

  await actions.clearActionFilters();
  const cleared = await actions.waitForActionRows((rows) => rows.length === all.length);
  expect.soft(cleared.length, '"Limpiar filtros" shows them all again').toBe(all.length);
});

test('"Limpiar filtros" comes and goes with any filter, and nothing else moves', async ({
  cloud,
  openApp,
}) => {
  cloud.seedCommercialActions();
  const { commercialActions: actions, page } = await openAsTeamMember(openApp, "officer");
  await actions.goToTab("actions");
  const all = await actions.waitForActionRows((rows) => rows.length > 0);
  expect.soft(await actions.clearFiltersOffered(), "with no filter it is not there").toBe(false);

  const filters: readonly [string, () => Promise<void>][] = [
    ["the search", () => actions.searchActions("TEXTIL")],
    ["the state", () => actions.filterActionsByStatus("Realizada")],
    ["the type", () => actions.filterActionsByType("Feria")],
    ["the hunter", () => actions.filterActionsByHunter("Sin asignar")],
    ["the first date", () => actions.filterActionsFrom("2099-01-01")],
    ["the last date", () => actions.filterActionsUntil("2000-01-01")],
  ];
  for (const [name, choose] of filters) {
    await choose();
    await expect.poll(() => actions.clearFiltersOffered(), `it shows after ${name}`).toBe(true);
    await actions.clearActionFilters();
    await expect.poll(() => actions.clearFiltersOffered(), `it leaves after ${name}`).toBe(false);
    await actions.waitForActionRows((rows) => rows.length === all.length);
  }

  const search = page.getByPlaceholder("Buscar empresa, CUIT o persona");
  await search.click();
  await search.pressSequentially("TEX");
  await expect.soft(search, "what is written stays").toHaveValue("TEX");
  await expect.soft(search, "and so does the cursor").toBeFocused();
  expect.soft(await actions.clearFiltersOffered()).toBe(true);
  await search.press("Backspace");
  await search.press("Backspace");
  await search.press("Backspace");
  await expect.soft(search).toBeFocused();
  expect.soft(await actions.clearFiltersOffered(), "emptying it is no filter").toBe(false);

  const type = page.getByLabel("Filtrar por tipo de acción");
  await type.focus();
  await actions.filterActionsByType("Feria");
  await expect.soft(type, "the field chosen is not painted again").toBeFocused();
  await expect.soft(type, "and keeps what was chosen").toHaveValue("feria");
  expect.soft(await actions.clearFiltersOffered()).toBe(true);
});

test("a hunter reads whose company each action is", async ({ cloud, openApp }) => {
  const { doneWithSignups } = cloud.seedCommercialActions();
  const own = "EMPRESA PROPIA DEL HUNTER SA";
  commercialTables(cloud).actions.push({
    ...doneWithSignups,
    id: "00000000-0000-4000-8000-0000000000f1",
    empresa: own,
    dueno_id: cloud.users.hunter?.id ?? "",
  });
  const { commercialActions: actions } = await openAsTeamMember(openApp, "hunter");

  await actions.goToTab("actions");
  const rows = await actions.waitForActionRows((found) => of(found, own) !== "");

  expect.soft(of(rows, own), "one's own").toMatch(/Tu empresa/);
  expect.soft(textOfRows(rows), "never in the third person").not.toMatch(/Empresa de Vos/);
  expect
    .soft(of(rows, doneWithSignups.empresa), "somebody else's has their name")
    .toMatch(/Empresa de Mariana Costa/);
});

test("an action can be left unread, and all of them marked as read", async ({ cloud, openApp }) => {
  const { forwardedWithQuestion } = cloud.seedCommercialActions();
  const { commercialActions: actions, page } = await openAsTeamMember(openApp, "officer");
  const markAllRead = page.getByRole("button", { name: /Marcar todas como le/ });

  await actions.openAction(forwardedWithQuestion.id);
  await actions.markActionUnread();

  await expect
    .soft(
      page.getByRole("tab", { name: "Gestiones", selected: true }),
      '"Dejar sin leer" goes back',
    )
    .toBeVisible({ timeout: WAITING_MS });
  const rows = await actions.waitForActionRows((found) =>
    found.some((row) => hasAlimentos(row) && row.flagged),
  );
  expect.soft(rows.find(hasAlimentos)?.flagged, "and the action is marked again").toBe(true);
  await expect
    .soft(markAllRead, 'with something marked, "Marcar todas como leídas" shows')
    .toBeVisible({ timeout: WAITING_MS });

  await markAllRead.click();

  await expect
    .soft(markAllRead, '"Marcar todas como leídas" goes away')
    .toHaveCount(0, { timeout: WAITING_MS });
  const afterwards = await actions.waitForActionRows(
    (found) => found.length > 0 && found.every(({ flagged }) => !flagged),
  );
  expect
    .soft(
      afterwards.filter(({ flagged }) => flagged),
      "and it takes every mark away",
    )
    .toEqual([]);
  expect.soft(afterwards.length, "with the list on screen").toBeGreaterThan(0);
});
