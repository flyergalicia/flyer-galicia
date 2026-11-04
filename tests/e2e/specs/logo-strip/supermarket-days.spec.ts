// Replaces pruebas/t64_dias_franja_dobleclic.cjs.
import { type AppDriver } from "../../support/driver/app-driver.ts";
import { expect, test } from "../../support/test.ts";

const SUPERMARKET_GRID = { x: 640, y: 1250, width: 560, height: 450 };
const SUPERMARKETS = ["coto", "jumbo", "vea"];
const CATEGORY = "Supermercados";
const ALIGNED_PX = 2;

async function buildSupermarketStrip(
  { logoStrip }: AppDriver,
  daysBelow: boolean,
): Promise<boolean | null> {
  await logoStrip.removeAllChanges();
  await logoStrip.open(SUPERMARKET_GRID, { province: "", daysBelow });
  const ticked = await logoStrip.daysBelowTicked();
  await logoStrip.chooseExactBrands(SUPERMARKETS, CATEGORY);
  await logoStrip.put();
  return ticked;
}

test(
  "a strip of supermarkets puts their days below each logo",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp();
    const strip = app.logoStrip;
    await app.logoEditor.enter();
    await strip.waitForCatalog();

    const ticked = await buildSupermarketStrip(app, true);
    expect.soft(ticked, "Armar franja has the tick of the days, ticked").toBe(true);
    const changes = await strip.changes();
    const texts = changes.filter(({ kind, strip: id }) => kind === "text" && id !== null);
    const logos = changes.filter(({ kind, strip: id }) => kind === "brand" && id !== null);
    expect.soft(logos.length, "3 logos").toBe(3);
    expect.soft(texts.length, "and 3 texts of days").toBe(3);
    expect
      .soft(
        texts.map(({ text }) => text),
        'Coto has its days of discount ("Martes")',
      )
      .toContain("Martes");
    expect
      .soft(new Set(texts.map(({ fontSize }) => fontSize)).size, "all with the same letter size")
      .toBe(1);
    const notBelow = texts.filter(({ box: text }) =>
      logos.every(({ box: logo }) => {
        if (!text || !logo) return true;
        const centered = Math.abs(logo.x + logo.width / 2 - (text.x + text.width / 2)) < ALIGNED_PX;
        return !(centered && text.y >= logo.y + logo.height - ALIGNED_PX);
      }),
    );
    expect.soft(notBelow, "each text is centered below its logo").toEqual([]);

    await strip.open(SUPERMARKET_GRID);
    await strip.put();
    expect
      .soft(
        (await strip.changes()).filter(({ kind }) => kind === "text").length,
        "resuming the strip does not duplicate the days",
      )
      .toBe(3);

    await buildSupermarketStrip(app, false);
    const withoutDays = await strip.changes();
    expect
      .soft(
        withoutDays.filter(({ kind, strip: id }) => kind === "brand" && id !== null).length,
        "without the tick, the logos",
      )
      .toBe(3);
    expect.soft(withoutDays.filter(({ kind }) => kind === "text").length, "and no days").toBe(0);
  },
);

test(
  "double click on a logo of a strip opens its window with the tick of days",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp();
    const strip = app.logoStrip;
    await app.logoEditor.enter();
    await strip.waitForCatalog();
    await buildSupermarketStrip(app, true);

    const logo = (await strip.changes()).find(({ kind, strip: id }) => kind === "brand" && id)?.box;
    if (!logo) throw new Error("The strip has no logos");
    await strip.doubleClickFlyer({ x: logo.x + logo.width / 2, y: logo.y + logo.height / 2 });
    await strip.waitForPicker();

    expect.soft(await strip.isPickerOpen(), "double click opens the window").toBe(true);
    expect.soft(await strip.pickerTitle(), "to change that logo").toMatch(/Cambiar/);
    expect.soft(await strip.pickerOffersDays(), "with the tick of the days").toBe(true);
    await strip.closePicker();
  },
);

test(
  "Shift + drag moves together two logos never touched",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp();
    const strip = app.logoStrip;
    await app.logoEditor.enter();
    await strip.waitForCatalog();
    const first = await strip.detectLogoPlace({ x: 730, y: 1310 });
    const second = await strip.detectLogoPlace({ x: 905, y: 1310 });
    const centerOf = (place: typeof first) => ({
      x: place.x + place.width / 2,
      y: place.y + place.height / 2,
    });

    await strip.shiftClickFlyer(centerOf(first));
    await strip.shiftClickFlyer(centerOf(second));
    expect.soft(await strip.changes(), "choosing them changes nothing yet").toEqual([]);
    await strip.dragOnFlyer(centerOf(first), { x: 30, y: 20 });
    await app.page.waitForTimeout(300);

    const moved = (await strip.changes()).filter(({ isMovedOriginal }) => isMovedOriginal);
    const offsets = moved.map(({ box, origin }) => ({
      x: Math.round((box?.x ?? 0) - (origin?.x ?? 0)),
      y: Math.round((box?.y ?? 0) - (origin?.y ?? 0)),
    }));
    expect.soft(offsets.length, "both of them moved").toBe(2);
    expect.soft(offsets[1], "by the same distance").toEqual(offsets[0]);
    expect
      .soft(Math.abs(offsets[0]?.x ?? 0) + Math.abs(offsets[0]?.y ?? 0), "they did move")
      .toBeGreaterThan(0);
  },
);
