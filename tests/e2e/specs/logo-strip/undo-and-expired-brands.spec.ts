// Replaces pruebas/t67_franja_deshacer_vencidas.cjs.
import { expect, test } from "../../support/test.ts";

const LOGOS_STRIP = { x: 140, y: 2650, width: 1000, height: 230 };
const PLACES = [
  { x: 140, y: 2650, width: 300, height: 110 },
  { x: 520, y: 2650, width: 300, height: 110 },
  { x: 900, y: 2650, width: 200, height: 110 },
];
const RED = /217, 45, 32/;

test("the window of the strip can undo and redo", { tag: "@react" }, async ({ openApp }) => {
  const app = await openApp();
  const strip = app.logoStrip;
  const { keyboard } = app.page;
  await app.logoEditor.enter();
  await strip.waitForCatalog();
  await strip.open(LOGOS_STRIP, { province: "" });

  const count = async (): Promise<number> => (await strip.state()).brands.length;
  expect.soft((await strip.undoRedoEnabled()).undo, "on opening, Deshacer is off").toBe(false);

  await strip.tickNext(3);
  await strip.waitForHistoryStep();
  expect.soft(await count(), "3 brands were ticked").toBe(3);
  expect.soft((await strip.undoRedoEnabled()).undo, "now Deshacer is on").toBe(true);

  await strip.blurFocus();
  await keyboard.press("Control+z");
  expect.soft(await count(), "Ctrl+Z undoes the 3 together, as one step").toBe(0);
  expect.soft((await strip.undoRedoEnabled()).redo, "Rehacer stays on").toBe(true);
  await keyboard.press("Control+y");
  expect.soft(await count(), "Ctrl+Y puts them back").toBe(3);

  await strip.clickBrandRow(0);
  await strip.blurFocus();
  await keyboard.press("+");
  await strip.waitForHistoryStep();
  expect
    .soft((await strip.state()).brands[0]?.size, "the + key grows the logo")
    .toBeCloseTo(1.1, 3);
  await strip.pressUndo();
  expect
    .soft((await strip.state()).brands[0]?.size, "the button undoes the size")
    .toBeCloseTo(1, 3);

  const logosInOrder = async (): Promise<string[]> =>
    (await strip.state()).brands.map(({ logo }) => logo);
  const order = await logosInOrder();
  await strip.moveBrandDown(0);
  await strip.moveBrandDown(1);
  await strip.waitForHistoryStep();
  await strip.pressUndo();
  expect.soft(await logosInOrder(), "undo brings the order back too").toEqual(order);

  const before = await count();
  await strip.focusSearch();
  await keyboard.press("Control+z");
  expect.soft(await count(), "with the focus on the search box, Ctrl+Z is not ours").toBe(before);
  await strip.close();
});

test(
  "a brand whose promotion expired is marked in red while editing",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp();
    const strip = app.logoStrip;
    await app.logoEditor.enter();
    await strip.waitForCatalog();

    const [allExpired, expiredWithUpcoming, valid] = await strip.placeBrandsOn(PLACES);
    if (!allExpired || !expiredWithUpcoming || !valid) throw new Error("Brands were not placed");
    await strip.releaseLogos();
    expect
      .soft(
        (await strip.flyerMarks()).filter(({ expired }) => expired),
        "with all of them valid nothing is marked",
      )
      .toEqual([]);

    await strip.changeBrandValidity([
      { logo: allExpired, expiresInDays: -3 },
      { logo: expiredWithUpcoming, expiresInDays: -3, upcomingEndingInDays: 40 },
      { logo: valid, expiresInDays: 20 },
    ]);

    const marks = await strip.flyerMarks();
    expect.soft(marks[0]?.expired, "the brand with its promotion expired is marked").toBe(true);
    expect.soft(marks[1]?.expired, "not if another one of that brand is upcoming").toBe(false);
    expect.soft(marks[2]?.expired, "a valid one is not marked").toBe(false);
    expect.soft(marks[0]?.label, 'the label says "Vencida"').toMatch(/Vencida/);
    expect.soft(marks[0]?.borderColor, "the border is red").toMatch(RED);
    expect.soft(await strip.lastNotice(), "a notice says so").toMatch(/1 marca vencida/);

    await strip.setCleanView(true);
    expect.soft(await strip.marksLayerVisible(), "the clean view shows no mark").toBe(false);
    await strip.setCleanView(false);
  },
);
