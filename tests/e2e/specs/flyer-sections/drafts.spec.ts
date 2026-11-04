// Replaces pruebas/t41_borradores.cjs.
import { expect, test } from "../../support/test.ts";

const CUT = { y: 669, height: 340 };
const LOGO_ONE = { x: 600, y: 2350, width: 140, height: 60 };
const LOGO_TWO = { x: 300, y: 2350, width: 140, height: 60 };
const WHOLE_DOWNLOAD = 6369;
const COMPANY = {
  empresa: "ACME S.A.",
  config: "",
  asesores: [{ nombre: "Ana Pérez", celular: "11 5555 5555" }],
  rubro: "",
};

test(
  "changes go to draft tabs and the original stays clean",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp({ user: "asesor" });
    const sections = app.flyerSections;
    const tabs = async () =>
      (await sections.tabs()).map(({ label, active }) => (active ? `*${label}` : label));
    const drafts = async () => (await tabs()).filter((label) => /Borrador/.test(label));
    const artworkHeight = async () => (await sections.cropStatus()).artworkHeight;
    const wholeHeight = await artworkHeight();
    await app.logoEditor.enter();
    await app.logoEditor.waitForBrandCatalog();

    // 1) The first crop on the original makes "Borrador 1"
    await sections.removeBand(CUT.y, CUT.height);
    await app.page.waitForTimeout(300);
    expect
      .soft(await tabs(), 'the first crop makes "Borrador 1", active')
      .toEqual(["Combustible", "*Borrador 1"]);
    expect.soft(await artworkHeight(), "and cropped").toBe(wholeHeight - CUT.height);
    expect.soft((await sections.openWork())?.isDraft, "the draft stays open").toBe(true);

    // One more logo in the same draft does not make another one
    await app.logoEditor.placeBrands([LOGO_ONE]);
    await app.page.waitForTimeout(600);
    expect.soft(await drafts(), "another change in the same draft makes no other").toHaveLength(1);

    // 2) The original is clean
    await sections.selectFlyerTab();
    expect.soft(await artworkHeight(), "the original is whole").toBe(wholeHeight);
    expect.soft((await sections.openWorkReading()).texts, "and has no logos").toEqual([]);

    // And coming back
    await sections.selectOpenTab(0);
    expect
      .soft(await artworkHeight(), 'going back to "Borrador 1" brings it cropped')
      .toBe(wholeHeight - CUT.height);
    expect.soft((await sections.openWork())?.changes, "with its logo").toBe(1);

    // 3) Nuevo borrador
    await sections.newDraft();
    expect
      .soft(await tabs(), '"Nuevo borrador" opens "Borrador 2"')
      .toEqual(["Combustible", "Borrador 1", "*Borrador 2"]);
    expect.soft(await artworkHeight(), "whole").toBe(wholeHeight);
    expect.soft((await sections.openWork())?.changes, "and clean").toBe(0);

    // A logo in the second one stays in it and makes no third
    await app.logoEditor.placeBrands([LOGO_TWO]);
    await app.page.waitForTimeout(600);
    expect.soft(await drafts(), 'the change stays in "Borrador 2"').toHaveLength(2);
    await sections.selectOpenTab(0);
    expect
      .soft(await artworkHeight(), "each draft keeps its own when coming and going")
      .toBe(wholeHeight - CUT.height);
    expect.soft((await sections.openWork())?.changes, "its one logo").toBe(1);
    expect
      .soft(Math.round((await app.logoEditor.placements())[0]?.place?.x ?? 0), "in its place")
      .toBe(LOGO_ONE.x);

    // 5) Restaurar inside the draft
    await app.flyerEditor.restoreDefaults();
    await app.page.waitForTimeout(500);
    expect.soft(await artworkHeight(), "Restaurar leaves the original clean").toBe(wholeHeight);
    expect.soft((await sections.openWorkReading()).openId, "with no draft open").toBeNull();
    await sections.selectOpenTab(0);
    expect
      .soft(await artworkHeight(), "the draft still has its crop")
      .toBe(wholeHeight - CUT.height);

    // 6) A download from the draft
    expect
      .soft(await sections.downloadHeight(), "the download from the draft is cropped")
      .toBeLessThan(WHOLE_DOWNLOAD);

    // 8) Closing a draft with changes asks first
    await sections.closeFirstDraftTab();
    expect
      .soft(await app.session.waitForConfirmation(), "closing a draft with changes asks first")
      .toMatch(/se pierden/i);
    await app.session.answerConfirmation(true);
    expect.soft((await tabs()).join(), "confirming closes it").not.toMatch(/Borrador 1/);
    expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
  },
);

test("inside a draft, the company search erases nothing and Estudio takes it", async ({
  openApp,
}) => {
  const app = await openApp({ user: "asesor" });
  const sections = app.flyerSections;
  const tabs = async () =>
    (await sections.tabs()).map(({ label, active }) => (active ? `*${label}` : label));
  const artworkHeight = async () => (await sections.cropStatus()).artworkHeight;
  const wholeHeight = await artworkHeight();
  await app.logoEditor.enter();
  await app.logoEditor.waitForBrandCatalog();
  await sections.removeBand(CUT.y, CUT.height);
  await app.page.waitForTimeout(300);
  await app.logoEditor.placeBrands([LOGO_ONE]);
  await app.page.waitForTimeout(600);
  await sections.newDraft();
  await app.logoEditor.placeBrands([LOGO_TWO]);
  await app.page.waitForTimeout(600);
  await sections.selectOpenTab(0);

  // 4) The company search inside the draft erases nothing
  await sections.bringCompany(COMPANY);
  expect.soft((await sections.cropStatus()).active, "the search keeps the crop").toBe(true);
  expect.soft((await sections.openWork())?.changes, "and the logos").toBe(1);
  expect.soft(await app.flyerEditor.companyName(), "and brings the company").toBe(COMPANY.empresa);
  await sections.closeCompanyUpdateNotice();

  // 5) Restaurar inside the draft
  await app.flyerEditor.restoreDefaults();
  await app.page.waitForTimeout(500);
  expect.soft(await artworkHeight(), "Restaurar leaves the original clean").toBe(wholeHeight);
  expect.soft((await sections.openWorkReading()).openId, "with no draft open").toBeNull();
  expect.soft(await app.flyerEditor.companyName(), "and the form empty").toBe("");
  await sections.selectOpenTab(0);
  expect.soft(await artworkHeight(), "the draft still has its crop").toBe(wholeHeight - CUT.height);

  // 7) Saving in Estudio from the draft
  const dialog = await app.studio.openSaveDialog();
  expect.soft(dialog.offersChoice, "from a draft it always saves as a new design").toBe(false);
  await app.studio.confirmSave({ name: "Sin cashback (prueba)" });
  const saved = await tabs();
  expect
    .soft(saved, "the tab takes the name of the saved design")
    .toContain("*Sin cashback (prueba)");
  expect.soft(saved.join(), 'and "Borrador 1" is gone').not.toMatch(/Borrador 1/);
  expect.soft((await sections.openWork())?.isDraft, "it stops being a draft").toBe(false);

  // 8) Closing "Borrador 2" with changes asks first
  await sections.closeFirstDraftTab();
  expect
    .soft(await app.session.waitForConfirmation(), "closing a draft with changes asks first")
    .toMatch(/se pierden/i);
  await app.session.answerConfirmation(true);
  expect.soft((await tabs()).join(), "confirming closes it").not.toMatch(/Borrador 2/);
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});
