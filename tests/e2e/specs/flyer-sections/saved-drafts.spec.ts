// Replaces pruebas/t46_borradores_guardados.cjs.
import { settled } from "../../support/settled.ts";
import { expect, test } from "../../support/test.ts";

const CUT = { y: 669, height: 340 };
const LOGO = { x: 600, y: 2690, width: 140, height: 60 };
const DRAFTS_CARD = /Borradores de la última vez/;

test(
  "drafts survive a reload: they are kept in the browser and offered back",
  { tag: "@react" },
  async ({ openApp }) => {
    const app = await openApp({ user: "asesor" });
    const wholeHeight = (await app.flyerSections.cropStatus()).artworkHeight;
    await app.logoEditor.enter();
    await app.logoEditor.waitForBrandCatalog();
    await app.flyerSections.waitForDraftsReviewed();

    // Draft 1: a crop; draft 2: a logo
    await app.flyerSections.removeBand(CUT.y, CUT.height);
    await app.page.waitForTimeout(300);
    await app.flyerSections.newDraft();
    await app.logoEditor.placeBrands([LOGO]);
    await settled(async () => {
      const { drafts } = await app.flyerSections.savedDrafts();
      return drafts.length === 2 && drafts.some(({ changes }) => changes === 1);
    });
    const stored = await app.flyerSections.savedDrafts();
    expect.soft(stored.drafts, "both drafts are kept in the browser").toHaveLength(2);
    expect
      .soft(
        stored.drafts.some(({ cuts }) => cuts === 1),
        "one with its crop",
      )
      .toBe(true);
    expect
      .soft(
        stored.drafts.some(({ changes }) => changes === 1),
        "the other with its logo",
      )
      .toBe(true);
    expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
    await app.close();
    const browserStorage = { [stored.key]: stored.value ?? "" };

    // "Reloading": another page with what was kept
    const back = await openApp({ user: "asesor", localStorage: browserStorage });
    const card = back.page.getByRole("dialog", { name: DRAFTS_CARD });
    await expect
      .soft(card, "on entering it offers the 2 drafts of last time")
      .toContainText(/2 borradores/);
    await card.getByRole("button", { name: "Recuperar" }).click();
    await back.page.waitForTimeout(600);
    const openTabs = async () =>
      (await back.flyerSections.tabs()).filter(({ isFlyer }) => !isFlyer);
    expect.soft(await openTabs(), '"Recuperar" puts both tabs back').toHaveLength(2);
    expect
      .soft((await back.flyerSections.cropStatus()).artworkHeight, "the original stays clean")
      .toBe(wholeHeight);
    const contents = [];
    for (const index of [0, 1]) {
      await back.flyerSections.selectOpenTab(index);
      contents.push({
        height: (await back.flyerSections.cropStatus()).artworkHeight,
        changes: (await back.flyerSections.openWork())?.changes,
      });
    }
    expect
      .soft(
        contents.some(({ height }) => height === wholeHeight - CUT.height),
        "one recovered draft has its crop",
      )
      .toBe(true);
    expect
      .soft(
        contents.some(({ changes }) => changes === 1),
        "and the other its logo",
      )
      .toBe(true);

    // Closing one takes it out of what is kept
    await back.flyerSections.closeOpenTab(0);
    await back.session.waitForConfirmation();
    await back.session.answerConfirmation(true);
    await settled(async () => (await back.flyerSections.savedDrafts()).drafts.length === 1);
    expect
      .soft((await back.flyerSections.savedDrafts()).drafts, "closing a draft forgets it")
      .toHaveLength(1);
    expect.soft(back.pageErrors(), "no JavaScript errors").toEqual([]);
    await back.close();

    // "Descartar"
    const discarding = await openApp({ user: "asesor", localStorage: browserStorage });
    await discarding.page
      .getByRole("dialog", { name: DRAFTS_CARD })
      .getByRole("button", { name: "Descartar" })
      .click();
    await discarding.page.waitForTimeout(600);
    expect
      .soft((await discarding.flyerSections.savedDrafts()).value, '"Descartar" erases them')
      .toBeNull();
    expect
      .soft(
        (await discarding.flyerSections.tabs()).filter(({ isFlyer }) => !isFlyer),
        "with no tabs",
      )
      .toEqual([]);
    await discarding.close();

    // With the browser storage blocked nothing breaks
    const blocked = await openApp({ user: "asesor" });
    await blocked.flyerSections.blockBrowserStorage();
    await blocked.logoEditor.enter();
    await blocked.flyerSections.removeBand(CUT.y, CUT.height);
    await blocked.page.waitForTimeout(1500);
    expect.soft(blocked.pageErrors(), "with the storage blocked there are no errors").toEqual([]);
    expect
      .soft(
        (await blocked.flyerSections.tabs()).filter(({ isFlyer }) => !isFlyer),
        "and the draft works anyway",
      )
      .toHaveLength(1);
  },
);
