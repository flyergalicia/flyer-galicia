// Replaces pruebas/t34_deshacer_ver_limpio.cjs.
import { expect, test } from "../../support/test.ts";
import { adjustBar, button, cleanPreviewButton, picker } from "./editor-toolbars.ts";

const MEGATLON_LOGO = { x: 668, y: 2708 };
const ANOTHER_LOGO = { x: 1012, y: 2720 };
const STRIP = { x: 140, y: 2650, width: 1000, height: 230 };

test("each change is one step of Deshacer, and Vista previa hides everything", async ({
  openApp,
}) => {
  const app = await openApp();
  const undo = button(app.page, "Deshacer");
  const redo = button(app.page, "Rehacer");
  const snapshot = () => app.logoEditor.downloadSnapshot();
  await app.flyerEditor.setZoom(1.3);
  await app.logoEditor.enter();

  await expect.soft(undo, "on entering Deshacer shows, off").toBeDisabled();
  await expect.soft(redo, "and Rehacer too").toBeDisabled();
  const steps = [await snapshot()];

  // 1) Change Megatlon for Puppis
  await app.logoEditor.replaceWithBrand(MEGATLON_LOGO, "puppis");
  await app.logoEditor.waitUntilSettled();
  steps.push(await snapshot());
  await expect.soft(undo, "after the first change, Deshacer turns on").toBeEnabled();
  await expect.soft(undo, "and tells what it undoes").toHaveAttribute("title", /^Deshacer: /);

  // 2) Drag the logo, resting halfway
  const from = await app.logoEditor.placedOnScreen(0);
  await app.page.mouse.move(from.x, from.y);
  await app.page.mouse.down();
  await app.page.mouse.move(from.x + 20, from.y + 5, { steps: 4 });
  await app.page.waitForTimeout(700);
  await app.page.mouse.move(from.x + 40, from.y + 10, { steps: 4 });
  await app.page.mouse.up();
  await app.logoEditor.waitUntilSettled();
  steps.push(await snapshot());

  // 3) Three "+" in a row are one step
  const bigger = adjustBar(app.page).getByRole("button", { name: "Más grande" });
  for (let times = 0; times < 3; times += 1) await bigger.click();
  await app.logoEditor.waitUntilSettled();
  steps.push(await snapshot());

  // 4) A text on another logo
  await app.logoEditor.touch(ANOTHER_LOGO);
  await button(app.page, "Escribir un texto").click();
  await app.page.getByRole("textbox", { name: /^Texto/ }).fill("Lunes");
  await button(app.page, "Poner el texto").click();
  await app.logoEditor.waitForPickerClosed();
  await app.logoEditor.waitUntilSettled();
  steps.push(await snapshot());

  // 5) A strip
  await app.logoStrip.open(STRIP);
  await app.logoStrip.tickBySearch("farmacia del pueblo");
  await app.logoStrip.tickBySearch("freddo");
  await app.logoStrip.put();
  await app.logoEditor.waitUntilSettled();
  steps.push(await snapshot());

  expect
    .soft(await app.logoEditor.undoSteps(), "the base + 5 changes: a drag and a run of + are one")
    .toHaveLength(6);
  expect.soft(new Set(steps).size, "the 6 steps are all different").toBe(6);

  // Undo one by one down to the original
  for (let step = 5; step >= 1; step -= 1) {
    await undo.click();
    expect.soft(await snapshot(), `Deshacer goes back to step ${step - 1}`).toBe(steps[step - 1]);
  }
  await expect.soft(undo, "at the beginning: Deshacer is off").toBeDisabled();
  await expect.soft(redo, "and Rehacer is on").toBeEnabled();

  // Redo with the keyboard
  await app.page.mouse.click(5, 5);
  for (let step = 1; step <= 5; step += 1) {
    await app.page.keyboard.press(step % 2 === 1 ? "Control+y" : "Control+Shift+z");
    expect.soft(await snapshot(), `Ctrl+Y / Ctrl+Shift+Z redo step ${step}`).toBe(steps[step]);
  }
  await app.page.keyboard.press("Control+z");
  expect.soft(await snapshot(), "Ctrl+Z undoes (the strip comes back)").toBe(steps[4]);

  // A new change wipes what could be redone
  await app.logoEditor.touchPlaced(0);
  await app.page.keyboard.press("Shift+ArrowRight");
  await app.logoEditor.waitUntilSettled();
  await expect.soft(redo, "a new change after undoing turns Rehacer off").toBeDisabled();

  // With a design open, undoing everything does not let it go
  await app.logoEditor.treatAsOpenDesign("Mi diseño");
  for (let times = 0; times < 8; times += 1) await app.page.keyboard.press("Control+z");
  expect.soft(await app.logoEditor.placements(), "with everything undone").toEqual([]);
  expect.soft(await app.logoEditor.openDesignName(), "the open design stays open").not.toBeNull();
  for (let times = 0; times < 3; times += 1) await app.page.keyboard.press("Control+y");

  // Vista previa
  await cleanPreviewButton(app.page).click();
  const clean = await app.logoEditor.modes();
  expect.soft(clean.marksVisible, '"Vista previa" hides the boxes').toBe(false);
  await expect.soft(button(app.page, "Armar franja"), "and the buttons").toBeHidden();
  await expect
    .soft(button(app.page, "Seguir editando"), 'and the button says "Seguir editando"')
    .toBeVisible();
  await app.logoEditor.touch(ANOTHER_LOGO);
  expect
    .soft(
      await app.logoEditor.pickerStaysClosed(),
      "in Vista previa touching the flyer opens nothing",
    )
    .toBe(true);
  await expect.soft(picker(app.page), "no window at all").toBeHidden();

  await app.page.keyboard.press("Escape");
  expect.soft(await app.logoEditor.modes(), "Escape goes back to editing").toMatchObject({
    cleanPreview: false,
    marksVisible: true,
  });

  await cleanPreviewButton(app.page).click();
  await button(app.page, "Listo").click();
  expect.soft((await app.logoEditor.modes()).cleanPreview, '"Listo" also leaves it').toBe(false);
});
