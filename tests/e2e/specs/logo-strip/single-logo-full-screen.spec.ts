// Replaces pruebas/t62_un_logo_pantalla_completa.cjs.
import { expect, test } from "../../support/test.ts";

const ONE_LOGO = { x: 140, y: 2650, width: 300, height: 110 };
const ANOTHER_LOGO = { x: 600, y: 2650, width: 300, height: 110 };

test(
  "choosing a single logo at full screen comes back to the flyer with it",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp();
    const strip = app.logoStrip;
    await app.logoEditor.enter();
    await strip.waitForCatalog();

    await strip.openPickerOn(ONE_LOGO, { province: "NEUQUEN" });
    await strip.pickerChooseAtFullScreen();
    const bar = await strip.chooserBarText();
    expect.soft(bar, 'Activas shows the bar "Cambiar un logo"').toMatch(/Cambiar un logo/);
    expect.soft(bar, "with the way back to the logo").toMatch(/Volver al logo/);

    await strip.waitForChooserRows();
    const logo = await strip.chooseFirstForOneLogo();
    await app.page.waitForTimeout(800);

    expect
      .soft(
        (await strip.changes()).map((change) => change.logo),
        "pressing + puts the brand on the flyer",
      )
      .toContain(logo);
    expect
      .soft(await strip.chooserBarVisible(), "and it comes back alone, without the bar")
      .toBe(false);
    expect.soft(await strip.isChoosing(), "and it is not choosing any more").toBe(false);

    const before = (await strip.changes()).length;
    await strip.openPickerOn(ANOTHER_LOGO);
    await strip.pickerChooseAtFullScreen();
    await strip.chooserCancel();
    expect.soft((await strip.changes()).length, "Cancelar changes nothing").toBe(before);
  },
);
