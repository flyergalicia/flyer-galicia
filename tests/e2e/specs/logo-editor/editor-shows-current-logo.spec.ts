// Replaces pruebas/t69_editor_muestra_logo_actual.cjs.
import { expect, test } from "../../support/test.ts";
import { adjustBar, button, picker } from "./editor-toolbars.ts";

// A logo much wider than the place of the flyer it goes to, and a much taller one.
const WIDE_BRAND = "scienza";
const TALL_BRAND = "farmacia del pueblo";
const JUMBO_LOGO = { x: 730, y: 1310 };
const NEIGHBOR_LOGO = { x: 905, y: 1310 };

const proportion = ({ width, height }: { width: number; height: number }) => width / height;

test.describe("the thumbnail of the window for changing a logo", () => {
  test("shows the logo of now, not the one printed on the flyer", async ({ openApp }) => {
    const app = await openApp();
    await app.logoEditor.enter();
    await app.logoEditor.waitForBrandCatalog();
    const closeWindow = () => picker(app.page).getByRole("button", { name: "Cerrar" }).click();
    const change = adjustBar(app.page).getByRole("button", { name: "Cambiar", exact: true });
    const printed = await app.logoEditor.flyerLogoAt(JUMBO_LOGO);

    // 1) A place not touched: the original
    await app.logoEditor.touch(JUMBO_LOGO);
    await app.logoEditor.waitForBrandList();
    const untouched = await app.logoEditor.thumbnail();
    expect.soft(untouched.hidden, "a place not touched shows a logo").toBe(false);
    expect
      .soft(Math.abs(proportion(untouched) - proportion(printed)), "which is the original logo")
      .toBeLessThan(0.1);
    await closeWindow();

    // 2) Changed for another logo: that logo
    await app.logoEditor.replaceWithBrand(JUMBO_LOGO, WIDE_BRAND);
    const wide = proportion(await app.logoEditor.placedImageSize(0));
    await change.click();
    await expect.soft(picker(app.page), "the window opens on the change").toBeVisible();
    const changed = await app.logoEditor.thumbnail();
    expect.soft(changed.hidden, "a logo already changed shows a logo").toBe(false);
    expect
      .soft(Math.abs(proportion(changed) - wide), "the logo of now, not the one of the flyer")
      .toBeLessThan(0.15);
    expect.soft(changed.ink, "and it is not blank").toBeGreaterThan(0);
    await closeWindow();

    // 3) With a text: there is no logo to show
    await app.logoEditor.touch(NEIGHBOR_LOGO);
    await button(app.page, "Escribir un texto").click();
    await app.page.getByRole("textbox", { name: /^Texto/ }).fill("Martes");
    await button(app.page, "Poner el texto").click();
    await app.logoEditor.waitForPickerClosed();
    await adjustBar(app.page).getByRole("button", { name: "Editar texto" }).click();
    expect.soft((await app.logoEditor.thumbnail()).hidden, "a text shows no logo").toBe(true);
    await closeWindow();
  });

  test("on a copy that overlaps its original, Cambiar opens the copy", async ({ openApp }) => {
    const app = await openApp();
    await app.logoEditor.enter();
    await app.logoEditor.waitForBrandCatalog();
    const change = adjustBar(app.page).getByRole("button", { name: "Cambiar", exact: true });

    await app.logoEditor.replaceWithBrand(JUMBO_LOGO, WIDE_BRAND);
    await app.page.keyboard.press("Control+c");
    await app.page.keyboard.press("Control+v");
    const copy = (await app.logoEditor.selection()).main;
    expect.soft(copy, "the copy is the one chosen").toBe(1);

    // The copy gets another logo
    await change.click();
    await app.logoEditor.waitForBrandList();
    await app.logoEditor.searchBrands(TALL_BRAND);
    await app.logoEditor.pickFirstBrand();
    const wide = proportion(await app.logoEditor.placedImageSize(0));
    const tall = proportion(await app.logoEditor.placedImageSize(copy));
    expect.soft(Math.abs(tall - wide), "the two logos look different").toBeGreaterThan(1.5);

    await change.click();
    await app.logoEditor.waitForPicker();
    expect
      .soft(await app.logoEditor.pickerTargetIndex(), '"Cambiar" on a copy opens the copy')
      .toBe(copy);
    expect
      .soft(
        Math.abs(proportion(await app.logoEditor.thumbnail()) - tall),
        "and the thumbnail is the logo of the copy",
      )
      .toBeLessThan(0.15);
  });
});
