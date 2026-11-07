// Replaces pruebas/t17_franja_armar.cjs.
import { expect, test } from "../../support/test.ts";

const LOGOS_STRIP = { x: 140, y: 2650, width: 1000, height: 230 };
const SAME_STRIP_AGAIN = { x: 150, y: 2660, width: 980, height: 210 };
const BRANDS = [
  "farmacia del pueblo",
  "puppis",
  "freddo",
  "nike",
  "starbucks",
  "uber",
  "megatlon",
  "cabify",
];

function moveUp(order: string[], index: number): string[] {
  const moved = [...order];
  const [current, previous] = [moved[index], moved[index - 1]];
  if (current !== undefined && previous !== undefined) {
    moved[index - 1] = current;
    moved[index] = previous;
  }
  return moved;
}

test("a strip is marked with the mouse, filled in order and put on the flyer", async ({
  openApp,
}) => {
  const app = await openApp();
  const strip = app.logoStrip;

  expect.soft(await strip.detectLogos(LOGOS_STRIP), "it reads the logos of the strip").toEqual({
    logos: 13,
    rows: [6, 7],
    perRow: 7,
  });

  await app.flyerEditor.setZoom(1.3);
  await app.logoEditor.enter();
  expect.soft(await strip.markButtonVisible(), 'the "Armar franja" button appears').toBe(true);

  await strip.startMarking();
  expect
    .soft(await strip.editingHelp(), "the bar says to drag a box around the strip")
    .toMatch(/toda la franja/);

  await strip.clickFlyer({ x: 600, y: 2760 });
  await app.page.waitForTimeout(200);
  expect.soft(await strip.isOpen(), "a click without dragging opens nothing").toBe(false);

  await strip.markRegionByDragging(LOGOS_STRIP);
  await strip.waitForWindow();
  expect
    .soft(await strip.intro(), "the window says what it found")
    .toMatch(/13 logos en 2 filas \(7 por fila\)/);

  for (const brand of BRANDS) await strip.tickBySearch(brand);
  await strip.search("");
  const ticked = (await strip.state()).brands.map(({ title }) => title);
  expect.soft(ticked, "every brand searched for was ticked").toHaveLength(BRANDS.length);
  ticked.forEach((title, index) => {
    const firstWord = BRANDS[index]?.split(" ")[0] ?? "";
    expect.soft(title.toLowerCase(), "in the order they were ticked").toContain(firstWord);
  });

  // The arrow takes the last one up a place, and then takes that last place to the top.
  let expected = ticked;
  const last = ticked.length - 1;
  for (let times = 0; times < last; times += 1) {
    await strip.moveBrandUp(last);
    expected = moveUp(expected, last);
  }
  for (let index = last; index > 0; index -= 1) {
    await strip.moveBrandUp(index);
    expected = moveUp(expected, index);
  }
  const order = (await strip.state()).brands.map(({ title }) => title);
  expect.soft(order, "the arrows change the order").toEqual(expected);
  expect.soft(await strip.putLabel(), "the button counts the logos").toBe("Poner 8 logos");

  await strip.put();
  const changes = await strip.changes();
  const logos = changes.filter(({ strip: id, isCover }) => id !== null && !isCover);
  expect.soft(changes.filter(({ isCover }) => isCover).length, "the strip is covered once").toBe(1);
  expect
    .soft(
      logos.map(({ title }) => title),
      "the logos go in the order chosen",
    )
    .toEqual(order);

  const third = logos[2]?.box;
  if (!third) throw new Error("The third logo of the strip was not placed");
  await strip.clickFlyer({ x: third.x + third.width / 2, y: third.y + third.height / 2 });
  await app.page.waitForTimeout(200);
  expect.soft(await strip.logoToolbarVisible(), "a logo of the strip can be adjusted").toBe(true);

  await strip.startMarking();
  await strip.markRegionByDragging(SAME_STRIP_AGAIN);
  await strip.waitForWindow();
  expect
    .soft(
      (await strip.state()).brands.map(({ title }) => title),
      "marking the same place again resumes the selection",
    )
    .toEqual(order);

  await strip.setPerRow(4);
  await strip.restoreOriginal();
  await app.page.waitForTimeout(300);
  expect
    .soft(
      (await strip.changes()).filter(({ strip: id }) => id !== null),
      '"Volver la franja al original" takes it out',
    )
    .toEqual([]);
});
