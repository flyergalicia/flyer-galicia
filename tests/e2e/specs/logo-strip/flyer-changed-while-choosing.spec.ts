// Replaces pruebas/t26_franja_volver_de_activas.cjs.
import { expect, test } from "../../support/test.ts";

const LOGOS_STRIP = { x: 140, y: 2650, width: 1000, height: 230 };

test(
  "if the flyer changed while choosing, the chosen brands wait for a new strip",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    cloud.addFlyerOption({
      option: 11,
      name: "Once",
      image: "flyer_t7.jpg?v=11",
      legal: "Legal 11",
    });
    cloud.setPermissions("asesor", { opcion_11: true });
    const app = await openApp();
    const strip = app.logoStrip;
    await app.logoEditor.enter();
    await strip.open(LOGOS_STRIP, { province: "NEUQUEN" });

    await strip.chooseAtFullScreen();
    await strip.waitForChooserRows();
    await strip.chooserPress(0);
    await strip.chooserPress(3);

    await app.flyerEditor.selectOption(11);
    await app.flyerEditor.waitForOptionShown(11);
    await strip.chooserBack();
    await app.page.waitForTimeout(500);

    expect.soft(await strip.isMarking(), 'it stays on "marcá la franja"').toBe(true);
    expect.soft(await strip.isOpen(), "with no window yet").toBe(false);
    expect
      .soft(await strip.lastNotice(), "it says the 2 brands are still chosen")
      .toMatch(/tus 2 marcas siguen elegidas/);

    await strip.open(LOGOS_STRIP);
    expect
      .soft((await strip.state()).brands.length, "marking the new strip opens with those brands")
      .toBe(2);
    await strip.cancel();

    // Nothing stays pending for the next strip.
    await strip.open(LOGOS_STRIP);
    expect.soft((await strip.state()).brands, "they were used up by that strip").toEqual([]);
  },
);
