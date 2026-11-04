// Replaces pruebas/t27_franja_elegir_en_buscar.cjs.
import { expect, test } from "../../support/test.ts";

const LOGOS_STRIP = { x: 140, y: 2650, width: 1000, height: 230 };
const PASTED = ["Freddo", "Starbucks", "Puppis", "La Anonima", "Marca que no existe"];

test(
  "brands validated on Buscar can be chosen for the strip",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp();
    const strip = app.logoStrip;
    await app.logoEditor.enter();
    await strip.open(LOGOS_STRIP, { province: "NEUQUEN" });
    await strip.chooseAtFullScreen();
    await strip.waitForChooserRows();

    await strip.chooserGoToSearch();
    expect.soft(await strip.chooserBarVisible(), "the bar stays on Buscar").toBe(true);

    await strip.validateBrands(PASTED);
    await app.page.waitForTimeout(1500);
    const rows = await strip.chooserRows();
    expect
      .soft(
        rows.map(({ brand, status, add }) => ({ brand, status, add })),
        "each brand pasted has its row, with a + only if it can go on the flyer",
      )
      .toEqual([
        { brand: "Freddo", status: "Fuera de la provincia", add: "disabled" },
        { brand: "Starbucks", status: "Vigente", add: "enabled" },
        { brand: "Puppis", status: "Fuera de la provincia", add: "disabled" },
        { brand: "La Anonima", status: "Vence este mes", add: "enabled" },
        { brand: "Marca que no existe", status: "No encontrada", add: "absent" },
      ]);

    const before = (await strip.chosenTitles()).length;
    const enabled = rows.filter(({ add, chosenAs }) => add === "enabled" && chosenAs === 0).length;
    expect.soft(enabled, "some row can be chosen").toBeGreaterThan(0);
    for (let pressed = 0; pressed < enabled; pressed += 1) await strip.chooserAdd(0);
    const chosen = await strip.chosenTitles();
    expect.soft(chosen.length, "the + of Buscar choose them").toBe(before + enabled);

    const disabled = rows.filter(({ add }) => add === "disabled");
    disabled.forEach(({ reason }) => {
      expect.soft(reason, "a + that is off says why").toMatch(/no se puede poner en la franja/);
    });
    expect
      .soft(await strip.forcePressDisabledAdd(), "there is a brand that cannot be chosen")
      .toBe(true);
    expect
      .soft((await strip.chosenTitles()).length, "not even forcing the click chooses it")
      .toBe(chosen.length);

    await strip.chooserBack();
    await strip.waitForWindow();
    expect
      .soft(
        (await strip.state()).brands.map(({ title }) => title),
        "back on the window, it brings what was chosen on Buscar",
      )
      .toEqual(chosen);

    await strip.cancel();
    await strip.openPromotions();
    await app.page.waitForTimeout(300);
    expect.soft(await strip.chooserAddButtons(), 'without choosing, no "+"').toBe(0);
    expect
      .soft(await strip.excludeBoxes(), "without choosing, the table has its exclude box")
      .toBeGreaterThan(0);
  },
);
