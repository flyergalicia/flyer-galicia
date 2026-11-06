// Replaces pruebas/t15_estudio_prototipo_pestana.cjs.
import { activeFile, addDesign, textChange } from "../../support/cloud/designs.ts";
import { expect, test } from "../../support/test.ts";

const DESIGN_NAME = "MVP 4.0";
const FLYER = "Combustible";
const OPTION = 9;

test.describe("a design opened with Usar", () => {
  test.beforeEach(({ cloud }) => {
    addDesign(cloud, {
      id: "d700-0000-4000-8000-000000000000",
      nombre: DESIGN_NAME,
      empresa: "Farmacias del Sur",
      datos: { v: 1, cambios: [textChange("Lunes")], subidos: {} },
    });
  });

  test(
    "has its own tab beside the flyer until the page reloads",
    { tag: "@react" },
    async ({ openApp }) => {
      const app = await openApp({ user: "asesor" });
      const sections = app.flyerSections;
      const tabs = async () =>
        (await sections.tabs()).map(({ label, active }) => ({ label, active }));

      expect.soft(await tabs(), "with one flyer there is no bar").toEqual([]);

      await app.studio.open();
      await app.studio.use();
      expect.soft(await tabs(), "the tab has the name of the design and is chosen").toEqual([
        { label: FLYER, active: false },
        { label: DESIGN_NAME, active: true },
      ]);

      // Going back to the original
      await sections.selectFlyerTab(OPTION);
      const original = await sections.openWorkReading();
      expect.soft(original.texts, "touching the original shows no changes").toEqual([]);
      expect.soft(original.openId, "and no design is open").toBeNull();
      expect.soft(await tabs(), "the original is the chosen tab").toEqual([
        { label: FLYER, active: true },
        { label: DESIGN_NAME, active: false },
      ]);

      // Going back to the design
      await sections.selectOpenTab(0);
      expect
        .soft((await sections.openWorkReading()).texts, "touching its tab applies it again")
        .toHaveLength(1);

      // An unsaved change is remembered when going and coming back
      await app.logoEditor.shiftFirstChange(40);
      await sections.selectFlyerTab(OPTION);
      await sections.selectOpenTab(0);
      const [moved] = await app.logoEditor.placements();
      expect
        .soft(Math.round(moved?.box?.x ?? 0), "what was changed without saving is remembered")
        .toBe(736);

      expect
        .soft(
          await app.logoEditor.changesInDownload(),
          "a download from the tab carries the design",
        )
        .toBe(1);

      // Closing it
      await sections.closeOpenTab(0);
      expect.soft(await tabs(), "the × takes the tab away").toEqual([]);
      expect
        .soft((await sections.openWorkReading()).texts, "and goes back to the original")
        .toEqual([]);

      // Reloading: the tab is gone but the design is still in Estudio
      await app.studio.open();
      await app.studio.use();
      await app.session.reload();
      expect.soft(await tabs(), "after reloading the tab is gone").toEqual([]);
      await app.studio.open();
      expect.soft(await app.studio.cards(), "the design is still in Estudio").toHaveLength(1);

      // Restaurar with a design open
      await app.studio.use();
      await app.flyerEditor.restoreDefaults();
      const restored = await sections.openWorkReading();
      expect.soft(restored.openId, "Restaurar goes back to the original").toBeNull();
      expect.soft(restored.texts, "with no changes").toEqual([]);
      expect
        .soft(
          (await tabs()).map(({ label }) => label),
          "and leaves the tab to open it again",
        )
        .toContain(DESIGN_NAME);
      expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
    },
  );
});

test(
  "Desactivar a flyer asks first and cancelling leaves it",
  { tag: "@react" },
  async ({ cloud, openApp }) => {
    const admin = await openApp({ user: "admin" });
    const before = activeFile(cloud, OPTION);

    const question = await admin.studio.askToDeactivateFlyer(OPTION);
    expect.soft(question, "it asks").toBe(`¿Desactivar el flyer de «${FLYER}»?`);
    await admin.session.answerConfirmation(false);

    expect.soft(activeFile(cloud, OPTION), "cancelling does not deactivate it").toEqual(before);
    expect.soft(admin.pageErrors(), "no JavaScript errors").toEqual([]);
  },
);
