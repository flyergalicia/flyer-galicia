// Replaces pruebas/t92_benchmark.cjs (Tarjetas y salas VIP).
import { expect, test } from "../../support/test.ts";
import { seedCards, seedComparison, today } from "./benchmark-data.ts";

const softly = expect.configure({ soft: true });
const NEW_CARD = "Visa Infinite";

test.beforeEach(({ cloud }) => {
  seedComparison(cloud);
  seedCards(cloud);
});

test(
  "the tab summarizes the passes and warns of announced changes",
  { tag: "@react" },
  async ({ openApp }) => {
    const { benchmark } = await openApp({ user: "admin" });
    await benchmark.open();

    await benchmark.showView("cards");

    expect.soft(await benchmark.tabs(), "the tab is there").toContain("Tarjetas y salas VIP");
    expect.soft(await benchmark.tableRows(), "with the 4 cards").toHaveLength(4);
    const text = await benchmark.screenText();
    expect
      .soft(text, "the summary sorts by passes")
      .toMatch(
        /Los que más dan: BBVA Black\+ All \(20\), Macro Selecta \(10\), Galicia Éminent \(4\)/,
      );
    expect
      .soft(text, "and says which one of Galicia")
      .toMatch(/La de Galicia con más pases es Visa Signature \(4\)/);
    expect.soft(text, "announced changes").toMatch(/Cambios anunciados/);
    expect
      .soft(text, "the one of Macro on 18/11/2026")
      .toMatch(/Macro · Visa Signature: cambia el 18\/11\/2026/);

    const links = await benchmark.tableLinks();
    expect.soft(links, 'only https addresses are linked: "javascript:" is not').toHaveLength(2);
    for (const link of links) expect.soft(link, "an https link").toMatch(/^https:\/\//);

    expect.soft(await benchmark.hasInjectedImage(), "text with HTML does not run").toBe(false);
    expect.soft(text, "it shows as text").toContain("<img src=x onerror=alert(2)>");
    expect.soft(text, 'a card with no passes says "sin dato"').toMatch(/sin dato/);
    expect.soft(text, 'and "Sin dato firme"').toMatch(/Sin dato firme/);

    const buttons = await benchmark.buttons();
    expect.soft(buttons, "the admin sees + Agregar tarjeta").toContain("+ Agregar tarjeta");
    expect
      .soft(
        buttons.filter((label) => label === "Editar"),
        "and Editar on each row",
      )
      .toHaveLength(4);
  },
);

test(
  "editing a card saves it as reviewed today and refreshes the screen",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    const { benchmark } = await openApp({ user: "admin" });
    await benchmark.open();
    await benchmark.showView("cards");

    await benchmark.editCard("Galicia", "Visa Signature");
    await benchmark.fillCard({ passesPerYear: "6", cost: "Bonificada 6 meses." });
    await benchmark.saveEditor();
    await benchmark.waitForEditorClosed();

    const row = cloud.benchmarkCards.find(({ id }) => id === "tg1");
    expect.soft(row?.pases_anio, "the passes are saved").toBe(6);
    expect.soft(row?.costo, "the cost is saved").toBe("Bonificada 6 meses.");
    expect.soft(row?.revisada, "the row stays as reviewed today").toBe(today());
    await softly
      .poll(() => benchmark.screenText(), "the screen updates by itself after saving")
      .toMatch(/La de Galicia con más pases es Visa Signature \(6\)/);

    await benchmark.editCard("Galicia", "Visa Signature");
    await benchmark.fillCard({ sourceUrl: "http://sitio-inseguro.com" });
    await benchmark.saveEditor();
    expect
      .soft(await benchmark.editorIsOpen(), "an address without https:// keeps the window open")
      .toBe(true);
  },
);

test(
  "a card can be added and removed, asking first",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    const { benchmark } = await openApp({ user: "admin" });
    await benchmark.open();
    await benchmark.showView("cards");
    const saved = () => cloud.benchmarkCards.filter(({ tarjeta }) => tarjeta === NEW_CARD);

    await benchmark.startNewCard();
    await benchmark.fillCard({ card: NEW_CARD, bank: "santander" });
    await benchmark.saveEditor();
    await benchmark.waitForEditorClosed();
    expect
      .soft(saved(), "+ Agregar tarjeta creates the row")
      .toMatchObject([{ banco: "santander" }]);
    await softly.poll(() => benchmark.screenText(), "and it shows up").toContain(NEW_CARD);

    await benchmark.removeCard("Santander", NEW_CARD);

    await softly.poll(() => saved().length, "Quitar asks and deletes the row").toBe(0);
  },
);

test("somebody else sees no editing buttons", { tag: "@react" }, async ({ cloud, openApp }) => {
  cloud.setPermissions("asesor", { benchmark: true });
  const { benchmark } = await openApp();
  await benchmark.open();

  await benchmark.showView("cards");

  const buttons = await benchmark.buttons();
  expect.soft(await benchmark.tableRows(), "the cards are listed").toHaveLength(4);
  for (const label of ["Editar", "Quitar", "+ Agregar tarjeta"]) {
    expect.soft(buttons, `not an admin: no ${label}`).not.toContain(label);
  }
});

test(
  "without the table of cards, that tab explains it and the rest works",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    cloud.benchmarkCardsMissing = true;
    const { benchmark } = await openApp({ user: "admin" });
    await benchmark.open();

    await benchmark.showView("cards");
    expect.soft(await benchmark.screenText(), "it asks for the migration").toMatch(/migración 042/);

    await benchmark.showView("rubro");
    expect.soft(await benchmark.tableCount(), "the rest of the tab goes on").toBe(1);
  },
);
