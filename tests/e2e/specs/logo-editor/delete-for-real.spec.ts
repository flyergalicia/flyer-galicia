// Replaces pruebas/t60_borrar_de_verdad.cjs.
import { expect, test } from "../../support/test.ts";
import { adjustBar, button } from "./editor-toolbars.ts";

const PLACE = { x: 140, y: 2650, width: 300, height: 110 };

test.describe("deleting a logo", { tag: "@react" }, () => {
  test("Supr leaves the place empty, which then only offers adding", async ({ openApp }) => {
    const app = await openApp();
    await app.logoEditor.enter();
    await app.logoEditor.placeBrands([PLACE], { keepLastChosen: true });

    await app.page.keyboard.press("Delete");
    const [left, ...others] = await app.logoEditor.placements();
    expect.soft(others, "Supr keeps that one change").toEqual([]);
    expect.soft(left?.kind, "the place stays empty").toBe("empty");
    expect.soft(left?.coversFlyer, "and covered: the original logo does not come back").toBe(true);

    await app.logoEditor.drawBox(PLACE);
    const window = app.page.getByRole("dialog", { name: "Agregar acá" });
    await expect.soft(window, 'touching the deleted place: "Agregar acá"').toBeVisible();
    await expect
      .soft(button(app.page, "Mover o agrandar lo que hay"), 'without "Mover lo que hay"')
      .toBeHidden();
    await expect
      .soft(button(app.page, "Dejar el lugar vacío"), 'and without "Dejar el lugar vacío"')
      .toBeHidden();
  });

  test("a copy goes away for good and Original brings the original back", async ({ openApp }) => {
    const app = await openApp();
    await app.logoEditor.enter();
    await app.logoEditor.placeBrands([PLACE], { keepLastChosen: true });

    // The copy stays chosen
    await app.page.keyboard.press("Control+c");
    await app.page.keyboard.press("Control+v");
    await app.page.keyboard.press("Delete");
    expect
      .soft(await app.logoEditor.placements(), "deleting a copy takes it out completely")
      .toHaveLength(1);

    await app.logoEditor.touchPlaced(0);
    const trash = adjustBar(app.page).getByRole("button", { name: "Borrar" });
    await expect.soft(trash, 'the trash can says "Borrar"').toHaveAttribute("title", /Borrar/);
    await adjustBar(app.page).getByRole("button", { name: "Original" }).click();
    expect.soft(await app.logoEditor.placements(), '"Original" brings the original').toEqual([]);
  });
});
