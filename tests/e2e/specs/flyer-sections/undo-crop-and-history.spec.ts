// Replaces pruebas/t42_deshacer_recorte_historial.cjs.
import { expect, test } from "../../support/test.ts";

const CUT = { y: 669, height: 340 };
const LOGO = { x: 600, y: 2690, width: 140, height: 60 };

test("undo also undoes a crop", { tag: "@react" }, async ({ openApp }) => {
  const app = await openApp({ user: "asesor" });
  const sections = app.flyerSections;
  const status = () => sections.cropStatus();
  const logoTop = async () => Math.round((await app.logoEditor.placements())[0]?.box?.y ?? -1);
  const wholeHeight = (await status()).artworkHeight;
  await app.logoEditor.enter();
  await app.logoEditor.waitForBrandCatalog();

  // A logo, then a crop, then moving the logo
  await app.logoEditor.placeBrands([LOGO], { keepLastChosen: true });
  await app.logoEditor.writeUndoStep();
  await sections.removeBand(CUT.y, CUT.height);
  await app.logoEditor.moveFirstChangeAsStep(30);
  const steps = await app.logoEditor.undoSteps();
  expect.soft(steps.length, "each one is a step").toBeGreaterThanOrEqual(4);
  expect.soft(steps, "the crop is one of them").toContain("Recortar una parte");
  expect.soft(steps[1], "after the logo").toMatch(/^Poner /);
  expect.soft(steps.at(-1), "and before moving it").toMatch(/^Mover /);

  const moved = await logoTop();
  await sections.pressShortcut("Control+z"); // undoes the move
  const beforeMove = await logoTop();
  expect.soft(beforeMove, "undoing a sideways move leaves the logo at that height").toBe(moved);
  expect
    .soft((await status()).artworkHeight, "and the flyer cropped")
    .toBe(wholeHeight - CUT.height);

  await sections.pressShortcut("Control+z"); // undoes the crop
  const undone = await status();
  expect.soft(undone.artworkHeight, "Ctrl+Z undoes the crop").toBe(wholeHeight);
  expect.soft(undone.active, "with the flyer whole").toBe(false);
  expect.soft(undone.amountsCardHidden, "and Montos back").toBe(false);
  expect
    .soft(await logoTop(), "the logo goes back to its place on the whole flyer")
    .toBe(beforeMove + CUT.height);

  await sections.pressShortcut("Control+y");
  const redone = await status();
  expect.soft(redone.active, "Ctrl+Y crops again").toBe(true);
  expect.soft(redone.artworkHeight, "at that height").toBe(wholeHeight - CUT.height);
  expect.soft(await logoTop(), "with the logo in its place").toBe(beforeMove);

  await sections.pressShortcut("Control+y");
  expect.soft(await logoTop(), "and redoes the last move").toBe(moved);
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});

test("the history remembers crop and logos", { tag: "@react" }, async ({ openApp }) => {
  const app = await openApp({ user: "asesor" });
  const sections = app.flyerSections;
  const status = () => sections.cropStatus();
  const wholeHeight = (await status()).artworkHeight;
  await app.logoEditor.enter();
  await app.logoEditor.waitForBrandCatalog();
  await app.logoEditor.placeBrands([LOGO], { keepLastChosen: true });
  await app.logoEditor.writeUndoStep();
  await sections.removeBand(CUT.y, CUT.height);

  // The history
  const downloadHeight = await sections.downloadHeight();
  await sections.keepInHistory();
  const entry = await sections.newestHistoryEntry();
  expect.soft(entry.cuts, "the history keeps the crop").toBe(1);
  expect.soft(entry.hasBase, "of which flyer").toBe(true);
  expect.soft(entry.logos, "and the logo").toBe(1);

  // Back to the clean original, downloading again from the history
  await sections.selectFlyerTab();
  expect.soft((await status()).artworkHeight, "the original is whole").toBe(wholeHeight);
  expect
    .soft(await sections.redownloadHeightFromHistory(), "downloading from the history is cropped")
    .toBe(downloadHeight);
  expect
    .soft((await status()).artworkHeight, "and the screen keeps the whole original")
    .toBe(wholeHeight);

  // Loading from the history opens it in a draft
  const openTabs = async () => (await sections.tabs()).filter(({ isFlyer }) => !isFlyer).length;
  const tabsBefore = await openTabs();
  await sections.loadFromHistory();
  const loaded = await sections.openWork();
  expect
    .soft((await status()).artworkHeight, "loading from the history opens it cropped")
    .toBe(wholeHeight - CUT.height);
  expect.soft(loaded?.changes, "with its logo").toBe(1);
  expect.soft(loaded?.name, "in a draft").toMatch(/Borrador/);
  expect.soft(await openTabs(), "in a new tab").toBe(tabsBefore + 1);
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});
