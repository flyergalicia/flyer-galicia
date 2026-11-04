// Replaces pruebas/t66_tecla_v_vista_previa.cjs.
import { expect, test } from "../../support/test.ts";
import { button, picker } from "./editor-toolbars.ts";

const LETTERS = ["v", "r", "f", "n"];
const NOTHING_ON = { cleanPreview: false, trimming: false, markingStrip: false };

test("V, R, F and N work only while editing logos, with no field or window in the way", async ({
  openApp,
}) => {
  const app = await openApp();
  const pressAll = async () => {
    for (const letter of LETTERS) await app.page.keyboard.press(letter);
  };
  const press = (key: string) => app.page.keyboard.press(key);
  const modes = () => app.logoEditor.modes();

  await pressAll();
  expect.soft(await modes(), "outside edit mode they do nothing").toMatchObject(NOTHING_ON);

  await app.logoEditor.enter();
  await app.logoEditor.waitForBrandCatalog();
  await app.logoEditor.leaveFields();

  // V
  await press("v");
  expect.soft((await modes()).cleanPreview, "V turns the preview on").toBe(true);
  await expect
    .soft(button(app.page, "Seguir editando"), 'the button becomes "Seguir editando"')
    .toBeVisible();
  await press("r");
  await press("f");
  expect
    .soft(await modes(), "in the preview R and F do nothing")
    .toMatchObject({ cleanPreview: true, trimming: false, markingStrip: false });
  await press("V");
  expect.soft((await modes()).cleanPreview, "V again goes back to editing").toBe(false);

  // R
  await press("r");
  expect
    .soft(await modes(), "R turns Recortar on")
    .toMatchObject({ trimming: true, markingStrip: false });
  await expect
    .soft(button(app.page, "Cancelar recorte"), 'the button says "Cancelar recorte"')
    .toBeVisible();
  await press("r");
  expect.soft((await modes()).trimming, "R again cancels it").toBe(false);

  // F
  await press("f");
  expect
    .soft(await modes(), "F turns Armar franja on")
    .toMatchObject({ trimming: false, markingStrip: true });
  await press("f");
  expect.soft((await modes()).markingStrip, "F again cancels it").toBe(false);

  // From one mode to the other
  await press("r");
  await press("f");
  expect
    .soft(await modes(), "from Recortar to Armar franja with F")
    .toMatchObject({ trimming: false, markingStrip: true });
  await press("f");

  // N: new draft
  const drafts = await app.logoEditor.draftCount();
  await press("n");
  await expect
    .configure({ soft: true })
    .poll(() => app.logoEditor.draftCount(), { message: "N opens a new draft" })
    .toBe(drafts + 1);
  await press("v");
  const withNew = await app.logoEditor.draftCount();
  await press("n");
  expect.soft(await app.logoEditor.draftCount(), "in the preview N does nothing").toBe(withNew);
  await press("v");
  await press("r");
  await press("n");
  expect.soft(await app.logoEditor.draftCount(), "while trimming N does nothing").toBe(withNew);
  await press("r");

  // Writing in a field: no
  await app.logoEditor.focusCompanyField();
  await pressAll();
  expect
    .soft(await modes(), "with the focus on a text field they do nothing")
    .toMatchObject(NOTHING_ON);
  expect.soft(await app.logoEditor.draftCount(), "not even N").toBe(withNew);
  await app.logoEditor.clearCompanyField();
  await app.logoEditor.leaveFields();

  // With a window open: no
  await app.logoEditor.drawBox({ x: 600, y: 2650, width: 300, height: 110 });
  await app.logoEditor.waitForPicker();
  await pressAll();
  expect
    .soft(await modes(), "with the window of a logo open they do nothing")
    .toMatchObject(NOTHING_ON);
  await picker(app.page).getByRole("button", { name: "Cerrar" }).click();

  await press("Control+v");
  expect
    .soft((await modes()).cleanPreview, "Ctrl+V (paste) does not turn the preview on")
    .toBe(false);
});

test("I opens the section picker, only while editing logos", async ({ openApp }) => {
  const app = await openApp({ user: "admin" });
  const { flyerSections, logoEditor, page } = app;

  await page.keyboard.press("i");
  expect.soft(await flyerSections.insertPickerOpen(), "not outside the editing mode").toBe(false);

  await logoEditor.enter();
  await page.keyboard.press("i");
  expect.soft(await flyerSections.insertPickerOpen(), "it opens").toBe(true);
});
