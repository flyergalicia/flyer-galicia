// Replaces pruebas/t24_franja_elegir_en_activas.cjs.
import { expect, test } from "../../support/test.ts";

const LOGOS_STRIP = { x: 140, y: 2650, width: 1000, height: 230 };

test("brands chosen at full screen on Activas come back to the window", async ({ openApp }) => {
  const app = await openApp();
  const strip = app.logoStrip;
  await app.logoEditor.enter();
  await strip.open(LOGOS_STRIP);
  await strip.setProvince("NEUQUEN");

  await strip.tickBySearch("anonima");
  await strip.tickBySearch("open sports");
  await strip.search("");
  expect.soft(await strip.offersFullScreen(), '"Elegir en pantalla completa" appears').toBe(true);
  const fromWindow = (await strip.state()).brands.map(({ title }) => title);

  await strip.chooseAtFullScreen();
  await strip.waitForChooserRows();
  expect.soft(await strip.promotionsVisible(), "Promociones opens at full screen").toBe(true);
  expect.soft(await strip.isOpen(), "and the window goes away").toBe(false);
  expect
    .soft(await strip.chooserFilters(), "with the filters of the window")
    .toEqual({ province: "NEUQUEN", oneBrand: true });
  const barText = await strip.chooserBarText();
  expect.soft(barText, "the bar says how many are chosen").toMatch(/2 marcas elegidas/);
  expect.soft(barText, "the bar offers to go back").toMatch(/Volver a la franja \(2\)/);
  expect
    .soft(
      (await strip.chooserChosenNumbers()).toSorted(),
      "the ones already chosen show their number on the table",
    )
    .toEqual(["1", "2"]);

  for (let added = 0; added < 3; added += 1) await strip.chooserAdd(added * 2);
  const chosen = await strip.chosenTitles();
  expect.soft(chosen.length, "the ones chosen on Activas add up").toBe(5);
  expect.soft(chosen.slice(0, 2), "after the ones of the window").toEqual(fromWindow);

  await strip.chooserRemove(0);
  expect.soft((await strip.chosenTitles()).length, "touching one again takes it out").toBe(4);

  await strip.chooserBack();
  await strip.waitForWindow();
  await strip.waitForPreviewLogos();
  const backInWindow = (await strip.state()).brands.map(({ title }) => title);
  expect.soft(backInWindow.length, '"Volver a la franja" brings the chosen ones').toBe(4);
  expect.soft(await strip.chooserBarVisible(), "and takes the bar away").toBe(false);

  await strip.dragBrandRow(3, 0);
  const dragged = (await strip.state()).brands.map(({ title }) => title);
  expect.soft(dragged.length, "dragging keeps all of them").toBe(4);
  expect.soft(dragged[0], "dragging the last one to the top puts it first").toBe(backInWindow[3]);

  await strip.moveBrandUp(1);
  const afterArrow = (await strip.state()).brands.map(({ title }) => title);
  expect.soft(afterArrow[0], "the arrows still work").toBe(dragged[1]);
  expect.soft(afterArrow[1], "they just swap neighbours").toBe(dragged[0]);

  await strip.dragBrandRowWithFinger(0, 3);
  const afterFinger = (await strip.state()).brands.map(({ title }) => title);
  expect.soft(afterFinger[3], "with a finger on the handle it reorders too").toBe(afterArrow[0]);

  await strip.put();
  const placed = (await strip.changes()).filter(
    ({ strip: id, isCover, kind }) => id !== null && !isCover && kind !== "text",
  );
  expect
    .soft(
      placed.map(({ title }) => title),
      "the strip comes out in that order",
    )
    .toEqual(afterFinger);
});

test("Cancelar on Activas takes the bar and the buttons away", async ({ openApp }) => {
  const app = await openApp();
  const strip = app.logoStrip;
  await app.logoEditor.enter();
  await strip.open(LOGOS_STRIP);

  await strip.chooseAtFullScreen();
  await strip.chooserCancel();
  await app.page.waitForTimeout(200);

  expect.soft(await strip.chooserBarVisible(), "no bar").toBe(false);
  expect.soft(await strip.chooserAddButtons(), 'no "+" on the table').toBe(0);
});
