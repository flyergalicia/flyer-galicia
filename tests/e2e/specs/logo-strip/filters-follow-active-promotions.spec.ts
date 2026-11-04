// Replaces pruebas/t58_filtros_activas_en_ventanas.cjs.
import { expect, test } from "../../support/test.ts";

const LOGOS_STRIP = { x: 140, y: 2650, width: 1000, height: 230 };
const ONE_LOGO = { x: 140, y: 2650, width: 300, height: 110 };
const CATEGORY = "Supermercados";

test(
  "the filters of Activas reach both windows, and come back from them",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp();
    const strip = app.logoStrip;
    await app.logoEditor.enter();
    await strip.waitForCatalog();
    await strip.setActivePromotionsFilters({ hideOnline: true, category: CATEGORY });

    await strip.open(LOGOS_STRIP, { province: "" });
    const ofStrip = await strip.filters();
    expect.soft(ofStrip.hideOnline, 'Armar franja starts with "sin las online"').toBe(true);
    expect.soft(ofStrip.hideOnlineTicked, "ticked").toBe(true);
    expect
      .soft(ofStrip.category, "Armar franja starts with the category of Activas")
      .toBe(CATEGORY);
    await strip.close();

    await strip.openPickerOn(ONE_LOGO);
    const ofPicker = await strip.pickerFilters();
    expect.soft(ofPicker.hideOnline, "the window of one logo too").toBe(true);
    expect.soft(ofPicker.hideOnlineTicked, "ticked too").toBe(true);
    expect.soft(ofPicker.category, "with the category too").toBe(CATEGORY);
    const categories = await strip.pickerListedCategories();
    expect.soft(categories.length, "the list has brands").toBeGreaterThan(0);
    expect
      .soft(
        categories.filter((category) => category !== CATEGORY),
        "the list shows only supermarkets",
      )
      .toEqual([]);

    await strip.pickerSetHideOnline(false);
    expect
      .soft(await strip.activePromotionsHideOnline(), "unticking it there unticks it on Activas")
      .toBe(false);
    await strip.closePicker();
  },
);
