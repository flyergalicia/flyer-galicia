// Replaces pruebas/t37_shift_varios.cjs.
import { type OpenedApp } from "../../support/open-app.ts";
import { expect, test } from "../../support/test.ts";
import { adjustBar, boxOf, nth, picker, stripWindow } from "./editor-toolbars.ts";

const LOGOS = [
  { x: 300, y: 2690, width: 140, height: 60 },
  { x: 600, y: 2690, width: 140, height: 60 },
  { x: 900, y: 2690, width: 140, height: 60 },
];
const STRIP = { x: 140, y: 2650, width: 1000, height: 230 };

async function positions(app: OpenedApp) {
  return (await app.logoEditor.placements()).map((placed) => {
    const { x, y, width } = boxOf(placed);
    return { x: Math.round(x), y: Math.round(y), width: Math.round(width) };
  });
}

test.describe("Shift chooses several logos", () => {
  test("on the flyer they move and grow together", { tag: "@react" }, async ({ openApp }) => {
    const app = await openApp();
    const chosen = async () => (await app.logoEditor.selection()).chosen;
    await app.flyerEditor.setZoom(1.3);
    await app.logoEditor.enter();
    await app.logoEditor.placeBrands(LOGOS);
    await app.logoEditor.bringIntoView({ x: 0, y: 2720 });

    let first = await app.logoEditor.placedOnScreen(0);
    let second = await app.logoEditor.placedOnScreen(1);
    const shiftClick = async ({ x, y }: { x: number; y: number }) => {
      await app.page.keyboard.down("Shift");
      await app.page.mouse.click(x, y);
      await app.page.keyboard.up("Shift");
    };

    await app.page.mouse.click(first.x, first.y);
    await shiftClick(second);
    expect.soft(await chosen(), "click + Shift-click choose 2 logos").toHaveLength(2);
    expect
      .soft(
        (await app.logoEditor.markers()).filter(({ inGroup }) => inGroup),
        "the 2 show marked",
      )
      .toHaveLength(2);
    await expect.soft(adjustBar(app.page), 'the bar says "2 elegidos"').toContainText("2 elegidos");
    await expect
      .soft(adjustBar(app.page).getByRole("button", { name: "Cambiar", exact: true }), "no Cambiar")
      .toBeHidden();

    // Dragging one moves the two
    const before = await positions(app);
    await app.page.mouse.move(first.x, first.y);
    await app.page.mouse.down();
    await app.page.mouse.move(first.x + 30, first.y + 10, { steps: 5 });
    await app.page.mouse.up();
    await app.logoEditor.waitUntilSettled();
    const dragged = await positions(app);
    const shift = (index: number) => ({
      x: nth(dragged, index).x - nth(before, index).x,
      y: nth(dragged, index).y - nth(before, index).y,
    });
    expect.soft(shift(0).x, "dragging one moves it").toBeGreaterThan(5);
    expect.soft(shift(1), "and the other one just the same").toEqual(shift(0));
    expect.soft(dragged[2]?.x, "but not the third").toBe(before[2]?.x);
    expect.soft(await chosen(), "after dragging the 2 stay chosen").toHaveLength(2);

    // "+" grows the two
    await adjustBar(app.page).getByRole("button", { name: "Más grande" }).click();
    await app.logoEditor.waitUntilSettled();
    const grown = await positions(app);
    expect.soft(grown[0]?.width, '"+" grows the first').toBeGreaterThan(nth(dragged, 0).width);
    expect.soft(grown[1]?.width, "and the second").toBeGreaterThan(nth(dragged, 1).width);
    expect.soft(grown[2]?.width, "not the third").toBe(dragged[2]?.width);

    // An arrow moves the two
    await app.page.keyboard.press("ArrowRight");
    await app.logoEditor.waitUntilSettled();
    const nudged = await positions(app);
    expect.soft(nudged[0]?.x, "the arrow moves the first").toBe(nth(grown, 0).x + 1);
    expect.soft(nudged[1]?.x, "and the second").toBe(nth(grown, 1).x + 1);

    // Undo: moving a group is one step
    await app.page.keyboard.press("Control+z");
    expect.soft(await positions(app), "Ctrl+Z undoes the arrow of the two at once").toEqual(grown);

    // The × lets all go
    first = await app.logoEditor.placedOnScreen(0);
    second = await app.logoEditor.placedOnScreen(1);
    await app.page.mouse.click(first.x, first.y);
    await shiftClick(second);
    await adjustBar(app.page).getByRole("button", { name: "Listo con este" }).click();
    expect.soft(await chosen(), "the × lets them all go").toEqual([]);

    // Shift + box
    first = await app.logoEditor.placedOnScreen(0);
    const third = await app.logoEditor.placedOnScreen(2);
    await app.page.keyboard.down("Shift");
    await app.page.mouse.move(first.x - 120, first.y - 70);
    await app.page.mouse.down();
    await app.page.mouse.move(third.x + 80, third.y + 60, { steps: 6 });
    await app.page.mouse.up();
    await app.page.keyboard.up("Shift");
    expect.soft(await chosen(), "Shift + box chooses the 3").toHaveLength(3);
    await expect.soft(picker(app.page), "without opening the window").toBeHidden();

    // A click without Shift: only that one
    await app.page.keyboard.press("Escape");
    second = await app.logoEditor.placedOnScreen(1);
    await app.page.mouse.click(second.x, second.y);
    expect.soft(await chosen(), "a click without Shift chooses only one").toEqual([1]);
  });

  test(
    "on the preview of a strip they move and grow together",
    { tag: "@react" },
    async ({ openApp }) => {
      const app = await openApp();
      await app.flyerEditor.setZoom(1.3);
      await app.logoEditor.enter();
      await app.logoStrip.open(STRIP);
      await app.logoStrip.tickNext(5);
      await app.logoStrip.waitForPreviewLogos();

      await app.logoStrip.clickPreviewLogo(0);
      await app.logoStrip.shiftClickPreviewLogo(2);
      expect
        .soft(await app.logoStrip.chosenInPreview(), "Shift-click chooses the 1st and 3rd")
        .toEqual([0, 2]);
      expect
        .soft(
          (await app.logoStrip.selectionRows()).filter(({ highlighted }) => highlighted),
          "the 2 rows are highlighted",
        )
        .toHaveLength(2);
      expect
        .soft(await app.logoStrip.adjustmentsText(), 'the controls say "2 elegidos"')
        .toContain("2 elegidos");

      await app.logoStrip.dragPreviewLogo(2, [{ x: 15, y: 8 }]);
      const moved = (await app.logoStrip.state()).brands.map((brand) => brand.moved);
      expect.soft(moved[0], "dragging one moves the other too").toEqual(moved[2]);
      expect.soft(moved[0]?.x, "for real").not.toBe(0);
      expect.soft(moved[1]?.x, "but not the one in the middle").toBe(0);

      await stripWindow(app.page).getByRole("button", { name: "Más grande" }).click();
      const sizes = (await app.logoStrip.state()).brands.map((brand) => brand.size);
      expect.soft(sizes[0], '"+" grows the first').toBeGreaterThan(1);
      expect.soft(sizes[2], "and the third").toBeGreaterThan(1);
      expect.soft(sizes[1], "not the one in the middle").toBe(1);
    },
  );
});
