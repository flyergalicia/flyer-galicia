// Replaces pruebas/t82_recorte_sigue_editable.cjs.
import { expect, test } from "../../support/test.ts";

test(
  "a cropped flyer stays loaded: it can be edited and downloaded",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    cloud.addFlyerOption({
      option: 11,
      name: "Once",
      image: "flyer_t7.jpg?v=11",
      legal: "Legal 11",
    });
    cloud.setPermissions("admin", { opcion_11: true });
    const app = await openApp({ user: "admin" });

    // As the owner does: enters Cambiar logos, crops and presses Listo
    await app.logoEditor.enter();
    await app.flyerSections.removeBand(700, 320);
    await app.page.waitForTimeout(400);
    expect.soft((await app.flyerSections.cropStatus()).active, "the crop is applied").toBe(true);
    expect
      .soft(await app.flyerEditor.downloadBlockReason(), 'it does not read as "loading"')
      .toBe("");
    expect
      .soft(await app.flyerEditor.hasLoadProblem(), "no notice of a flyer not loaded")
      .toBe(false);
    await app.logoEditor.enter();

    // Back to Cambiar logos
    await app.logoEditor.enter();
    expect
      .soft(await app.logoEditor.isEditing(), "it can go back to Cambiar logos cropped")
      .toBe(true);
    await app.logoEditor.enter();

    // And the cropped PDF comes down
    expect
      .soft(await app.flyerSections.downloadPdf(), "the PDF of the cropped flyer comes down")
      .toHaveLength(1);

    // The control still stops a flyer that really did not load
    expect
      .soft(
        await app.flyerSections.downloadBlockWithFailedFlyer(),
        "a flyer that did not load is still stopped",
      )
      .toMatch(/No se pudo cargar/);
    expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
  },
);

test("on a cropped flyer Guardar en Estudio appears", async ({ openApp }) => {
  const app = await openApp({ user: "admin" });
  await app.logoEditor.enter();
  await app.flyerSections.removeBand(700, 320);
  await app.page.waitForTimeout(400);
  expect.soft((await app.studio.saveButton()).visible, '"Guardar en Estudio" appears').toBe(true);
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});
