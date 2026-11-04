// Replaces pruebas/t65_teclas_mas_menos.cjs.
import { expect, test } from "../../support/test.ts";
import { adjustBar, picker } from "./editor-toolbars.ts";

const LOGOS = [
  { x: 140, y: 2650, width: 300, height: 110 },
  { x: 600, y: 2650, width: 300, height: 110 },
];
const TEXT_PLACE = { x: 140, y: 2800, width: 300, height: 60 };
const STRIP = { x: 140, y: 2650, width: 1000, height: 230 };

test.describe("the + and − keys", () => {
  test("resize what is chosen on the flyer", { tag: "@react" }, async ({ openApp }) => {
    const app = await openApp();
    const percent = async (index: number) =>
      (await app.logoEditor.placements())[index]?.sizePercent;
    const press = (key: string) => app.page.keyboard.press(key);
    await app.logoEditor.enter();
    await app.logoEditor.placeBrands(LOGOS);
    await app.logoEditor.placeText(TEXT_PLACE, {
      text: "Martes",
      color: "#111",
      weight: 500,
      fontSize: 30,
    });

    // One logo chosen
    await app.logoEditor.touchPlaced(0);
    const start = (await percent(0)) ?? 0;
    await press("+");
    expect.soft(await percent(0), "+ grows it 10%").toBe(start + 10);
    await press("-");
    await press("-");
    expect.soft(await percent(0), "− shrinks it 10% each").toBe(start - 10);
    await press("Shift++");
    expect.soft(await percent(0), "Shift + + grows it 25%").toBe(start - 10 + 25);
    for (let times = 0; times < 30; times += 1) await press("+");
    expect.soft(await percent(0), "the ceiling is 250%").toBe(250);
    for (let times = 0; times < 40; times += 1) await press("-");
    expect.soft(await percent(0), "the floor is 30%").toBe(30);

    // A group of 2 logos: both in the same proportion
    const slider = adjustBar(app.page).getByRole("slider", { name: "Tamaño del logo" });
    await slider.fill("100");
    await app.logoEditor.touchPlaced(1);
    await slider.fill("100");
    await app.logoEditor.touchPlaced(0);
    await app.logoEditor.touchPlaced(1, { withShift: true });
    await press("+");
    expect.soft(await percent(0), "with 2 chosen the first grows").toBe(110);
    expect.soft(await percent(1), "and the second").toBe(110);

    // A text
    await app.logoEditor.touchPlaced(2);
    const textBefore = (await app.logoEditor.placements())[2]?.fontSize ?? 0;
    await press("+");
    expect
      .soft((await app.logoEditor.placements())[2]?.fontSize, "a chosen text grows its letter")
      .toBeGreaterThan(textBefore);

    // Nothing with the window of a logo open
    const sizes = async () =>
      (await app.logoEditor.placements()).map(({ sizePercent }) => sizePercent);
    const before = await sizes();
    await app.logoEditor.doubleClickPlaced(1);
    await app.logoEditor.waitForPicker();
    await press("+");
    expect.soft(await sizes(), "with the window of a logo open it does nothing").toEqual(before);
    await picker(app.page).getByRole("button", { name: "Cerrar" }).click();
  });

  test("do nothing with the focus on a text field", async ({ openApp }) => {
    const app = await openApp();
    const sizes = async () =>
      (await app.logoEditor.placements()).map(({ sizePercent }) => sizePercent);
    await app.logoEditor.enter();
    await app.logoEditor.placeBrands(LOGOS);
    await app.logoEditor.touchPlaced(0);
    const before = await sizes();

    await app.logoEditor.focusCompanyField();
    await app.page.keyboard.press("+");
    expect.soft(await sizes(), "with the focus on a text field it does nothing").toEqual(before);
    await app.logoEditor.clearCompanyField();
    await app.logoEditor.leaveFields();
  });

  test("resize what is chosen on Armar franja", { tag: "@react" }, async ({ openApp }) => {
    const app = await openApp();
    const press = (key: string) => app.page.keyboard.press(key);
    const firstSize = async () => (await app.logoStrip.state()).brands[0]?.size ?? 0;
    await app.logoEditor.enter();
    await app.logoEditor.waitForBrandCatalog();
    await app.logoStrip.open(STRIP);
    await app.logoStrip.tickNext(3);
    await app.logoStrip.waitForPreviewLogos();
    await app.logoStrip.clickPreviewLogo(0);
    await app.logoStrip.blurFocus();

    await press("+");
    expect
      .soft(Math.abs((await firstSize()) - 1.1), "+ grows the logo chosen in Armar franja")
      .toBeLessThan(0.001);
    await press("Shift+-");
    expect
      .soft(Math.abs((await firstSize()) - 0.85), "Shift + − shrinks it 25%")
      .toBeLessThan(0.001);
    expect
      .soft(await app.logoEditor.placements(), "and nothing on the flyer is touched meanwhile")
      .toEqual([]);

    await app.logoStrip.clickPreviewCorner();
    await press("+");
    expect
      .soft(
        Math.abs((await app.logoStrip.state()).sizeOfAll - 1.05),
        'with nothing chosen it changes "Tamaño de todos"',
      )
      .toBeLessThan(0.001);
  });
});
