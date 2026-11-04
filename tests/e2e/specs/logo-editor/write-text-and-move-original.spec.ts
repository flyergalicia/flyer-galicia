// Replaces pruebas/t06_logos_texto.cjs.
import { expect, test } from "../../support/test.ts";
import { adjustBar, boxOf, button, placedAt } from "./editor-toolbars.ts";

const DAYS_TEXT = { x: 730, y: 1395 };
const KIDDO_LOGO = { x: 205, y: 2708 };
const SUPERMARKETS_REGION = { x: 0, y: 1240, width: 1240, height: 220 };
const BRANDS_REGION = { x: 0, y: 2620, width: 1240, height: 240 };

test(
  "a text can take the place of another and be edited",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp();
    const original = await app.flyerEditor.downloadRegionDigest(SUPERMARKETS_REGION);
    await app.flyerEditor.setZoom(1.6);
    await app.logoEditor.enter();

    // Change the text "Martes y jueves", under Jumbo
    await app.logoEditor.touch(DAYS_TEXT);
    await button(app.page, "Escribir un texto").click();
    const textBox = app.page.getByRole("textbox", { name: /^Texto/ });
    await textBox.fill("Lunes y\nmiércoles");
    const form = await app.logoEditor.textForm();
    expect.soft(form.size, "it suggests a size").toBeGreaterThan(0);
    expect.soft(form.colors[0], "the first color is the original one").toBe("Como estaba");
    expect
      .soft(form.colors.slice(1), "then the usual colors")
      .toEqual(["Negro", "Gris", "Naranja", "Azul", "Blanco"]);
    await button(app.page, "Poner el texto").click();
    await app.logoEditor.waitForPickerClosed();

    const written = await placedAt(app, 0);
    expect.soft(written.kind, "the text is put").toBe("text");
    expect.soft(written.text, "as written, in two lines").toBe("Lunes y\nmiércoles");
    expect.soft(written.fontSize, "with the size suggested").toBe(form.size);
    expect.soft(written.color, "in the color of the text it replaces").toBe("#040404");
    expect.soft(written.weight, "not bold").toBe(500);
    expect.soft(boxOf(written).width, "it is drawn").toBeGreaterThan(0);
    expect.soft((await app.logoEditor.selection()).main, "and stays chosen").toBe(0);

    // Bigger
    await adjustBar(app.page).getByRole("button", { name: "Más grande" }).click();
    const grown = await placedAt(app, 0);
    expect.soft(grown.sizePercent, "+ makes it 10% bigger").toBe(110);
    expect.soft(grown.fontSize, "which means its letter").toBeCloseTo(form.size * 1.1, 5);
    const editText = adjustBar(app.page).getByRole("button", { name: "Editar texto" });
    await expect.soft(editText, 'the button says "Editar texto"').toBeVisible();

    // Edit it from the bar
    await editText.click();
    await expect.soft(textBox, "editing brings the text").toHaveValue("Lunes y\nmiércoles");
    await textBox.fill("Lunes");
    await button(app.page, "Poner el texto").click();
    await app.logoEditor.waitForPickerClosed();
    expect.soft((await placedAt(app, 0)).text, "the text is the new one").toBe("Lunes");
    expect.soft(await app.logoEditor.placements(), "it stays one change").toHaveLength(1);

    expect
      .soft(await app.flyerEditor.downloadRegionDigest(SUPERMARKETS_REGION), "the download has it")
      .not.toBe(original);
  },
);

test("a logo printed on the flyer can be moved", { tag: "@react" }, async ({ openApp }) => {
  const app = await openApp();
  const original = await app.flyerEditor.downloadRegionDigest(BRANDS_REGION);
  await app.flyerEditor.setZoom(1.6);
  await app.logoEditor.enter();

  await app.logoEditor.touch(KIDDO_LOGO);
  await button(app.page, "Mover o agrandar lo que hay").click();
  const lifted = await placedAt(app, 0);
  expect.soft(lifted.title, "the logo of the flyer becomes a change").toBe("Logo del flyer");
  expect.soft(lifted.box, "in the very same place").toEqual(lifted.place);

  const from = await app.logoEditor.placedOnScreen(0);
  const { scale } = await app.logoEditor.screenPoint(KIDDO_LOGO);
  await app.page.mouse.move(from.x, from.y);
  await app.page.mouse.down();
  await app.page.mouse.move(from.x + 15 * scale, from.y, { steps: 3 });
  await app.page.mouse.move(from.x + 30 * scale, from.y, { steps: 3 });
  await app.page.mouse.up();
  await app.logoEditor.waitUntilSettled();
  const moved = boxOf(await placedAt(app, 0));
  expect.soft(Math.round(moved.x - boxOf(lifted).x), "it moved 30 pixels").toBe(30);
  expect.soft(moved.y, "only sideways").toBe(boxOf(lifted).y);

  expect
    .soft(await app.flyerEditor.downloadRegionDigest(BRANDS_REGION), "the download has it")
    .not.toBe(original);
});
