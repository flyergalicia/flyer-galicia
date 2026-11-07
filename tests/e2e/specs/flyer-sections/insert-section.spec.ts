// Replaces pruebas/t88_insertar_seccion.cjs.
import { designData, sourcesFile } from "../../support/cloud/designs.ts";
import { bucketUrl, type Cloud, fixtureFile } from "../../support/cloud/index.ts";
import { meanDifference, settled } from "../../support/settled.ts";
import { expect, test } from "../../support/test.ts";

const SOURCE_IMAGE = "fuente_1.jpg";
const SOURCE_URL = bucketUrl(SOURCE_IMAGE);
const PLACE_Y = 2400;
const MARK = { from: 700, to: 1020 };
const SNAP_MARGIN = 100;
const GAP_MARGIN = 160;
const SECOND_CUT = { y: 669, height: 340 };
const PROPOSED = "Gastronomía Córdoba";

function publishSource(cloud: Cloud): void {
  cloud.bucketBinaries[SOURCE_IMAGE] = fixtureFile("op9.jpg");
  cloud.bucketJson["_fuentes.json"] = {
    lista: [
      {
        id: "f1",
        nombre: "Shoppings CABA",
        img: SOURCE_URL,
        w: 1240,
        h: 0,
        mini: "",
        at: new Date().toISOString(),
        de: "",
      },
    ],
  };
}

test("a section copied from another flyer goes in", async ({ cloud, openApp }) => {
  publishSource(cloud);
  const app = await openApp({ user: "asesor" });
  const sections = app.flyerSections;
  const wholeHeight = (await sections.cropStatus()).artworkHeight;
  const wholeDownload = await sections.downloadHeight();
  const above = await sections.downloadBandSample(560, 120);
  const foot = await sections.downloadBandSample(wholeDownload - 300, 250);
  await app.logoEditor.enter();
  expect.soft(await sections.insertButtonVisible(), '"Insertar" is beside Recortar').toBe(true);

  const section = await test.step("the section is marked in the window", async () => {
    // The window: the only flyer is chosen by itself; the section is marked
    await sections.openInsertPicker();
    expect.soft(await sections.copyEnabled(), '"Copiar esta sección" waits for a mark').toBe(false);
    await sections.markSectionToCopy(MARK.from, MARK.to);
    expect.soft(await sections.copyEnabled(), "on letting go it can be copied").toBe(true);
    expect.soft(await sections.sectionMarkVisible(), "with the band marked").toBe(true);
    await sections.copyMarkedSection();
    const copying = await sections.insertStatus();
    expect.soft(copying.placing, "it goes on to placing").toBe(true);
    expect.soft(copying.pickerOpen, "the window closes").toBe(false);
    expect.soft(copying.buttonLabel, "and the button can cancel").toBe("Cancelar inserción");
    const copied = copying.section ?? { y: 0, height: 0, width: 0 };
    expect
      .soft(Math.abs(copied.y - MARK.from), "it copies from near the mark")
      .toBeLessThanOrEqual(SNAP_MARGIN);
    expect
      .soft(Math.abs(copied.y + copied.height - MARK.to), "until near its end")
      .toBeLessThanOrEqual(SNAP_MARGIN);
    expect
      .soft(
        await sections.copiedSectionFitsItsBlock(),
        "the exact block, without its blank margins",
      )
      .toBe(true);
    return copied;
  });

  const placed = await test.step("it is placed where the line is", async () => {
    // Placing: the line follows the mouse; a click inserts
    await sections.hoverForPlacement(PLACE_Y);
    expect.soft(await sections.placementLineVisible(), 'the line "Va acá" appears').toBe(true);
    await sections.clickToPlace(PLACE_Y);
    const inserted = await sections.cropStatus();
    const cut = inserted.cuts[0];
    const height = cut?.height ?? 0;
    const padding = cut?.inserted?.padding ?? 0;
    const y = cut?.y ?? 0;
    expect.soft(inserted.active, "it is on").toBe(true);
    expect.soft(cut?.inserted, "as an inserted section").toBeTruthy();
    expect.soft(inserted.artworkHeight, "the image grows that much").toBe(wholeHeight + height);
    expect
      .soft(height, "the section plus the space above and below")
      .toBe(section.height + 2 * padding);
    expect.soft(padding, "with space on it").toBeGreaterThan(5);
    const space = await sections.spaceAroundFirstInsertion();
    expect
      .soft(Math.abs(space.above - space.below), "the space above and below is even")
      .toBeLessThanOrEqual(3);
    expect
      .soft(Math.abs(y - PLACE_Y), "it enters at the closest gap to the mouse")
      .toBeLessThanOrEqual(GAP_MARGIN);
    expect.soft(await sections.isGapInWholeFlyer(y), "without splitting a card").toBe(true);
    return { y, height, padding, sourceY: cut?.inserted?.y ?? 0 };
  });

  await test.step("placing ends and the rest of the flyer moves down", async () => {
    const { height, padding, y: cutY, sourceY } = placed;
    const status = await sections.insertStatus();
    expect.soft(status.placing, "placing ends").toBe(false);
    expect.soft(status.lineOnPage, "and the line goes away").toBe(false);
    const grownDownload = await sections.downloadHeight();
    expect.soft(grownDownload, "the download grows that much").toBe(wholeDownload + height);
    expect
      .soft(
        meanDifference(above, await sections.downloadBandSample(560, 120)),
        "what is above stays the same",
      )
      .toBeLessThan(1);
    expect
      .soft(
        meanDifference(foot, await sections.downloadBandSample(grownDownload - 300, 250)),
        "officers and legal text go down together: the foot is identical",
      )
      .toBeLessThan(1);
    // The section is the one of the other flyer (here it is the same file): the middle is identical.
    const middleRows = Math.max(10, height - 2 * padding - 40);
    expect
      .soft(
        meanDifference(
          await sections.downloadBandSample(cutY + padding + 20, middleRows),
          await sections.sourceSectionSample(sourceY + 20, middleRows),
        ),
        "the section looks as in its flyer",
      )
      .toBeLessThan(2);
    expect
      .soft(await sections.cropSign(), 'the sign says "Insertado: 1 sección"')
      .toContain("Insertado: 1 sección");
  });

  await test.step("it can be undone and redone", async () => {
    // Deshacer / Rehacer
    await sections.pressUndo();
    expect
      .soft((await sections.cropStatus()).artworkHeight, "Deshacer takes it out")
      .toBe(wholeHeight);
    await sections.pressRedo();
    expect
      .soft((await sections.cropStatus()).artworkHeight, "Rehacer puts it back")
      .toBe(wholeHeight + placed.height);
  });

  await test.step("it lives with a crop", async () => {
    // Cropping after inserting: both steps live together
    await sections.removeBand(SECOND_CUT.y, SECOND_CUT.height);
    expect
      .soft((await sections.cropStatus()).artworkHeight, "insert and crop on one flyer")
      .toBe(wholeHeight + placed.height - SECOND_CUT.height);
    expect.soft(await sections.cropSign(), "the sign tells both").toContain("Recortado: 1 parte");
  });

  await test.step("what was copied is offered again", async () => {
    // "Copiadas hace poco"
    await sections.pressShortcut("i");
    await sections.waitForRecentSection();
    await sections.pickRecentSection();
    expect
      .soft((await sections.insertStatus()).placing, "touching a recent one goes to place it")
      .toBe(true);
    await sections.pressShortcut("i");
    const cancelled = await sections.insertStatus();
    expect.soft(cancelled.placing, "the key I again cancels").toBe(false);
    expect.soft(cancelled.lineOnPage, "with no line left").toBe(false);
    await sections.pressShortcut("r");
    expect
      .soft(await sections.isMarkingCrop(), "the other letters still work (R = Recortar)")
      .toBe(true);
    await sections.pressShortcut("r");
  });

  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});

test("a recovered draft with a section brings its image before opening", async ({
  cloud,
  openApp,
}) => {
  publishSource(cloud);
  const app = await openApp({ user: "asesor" });
  const sections = app.flyerSections;
  const wholeHeight = (await sections.cropStatus()).artworkHeight;
  await app.logoEditor.enter();
  await sections.waitForDraftsReviewed();
  await sections.openInsertPicker();
  await sections.markSectionToCopy(MARK.from, MARK.to);
  await sections.copyMarkedSection();
  await sections.hoverForPlacement(PLACE_Y);
  await sections.clickToPlace(PLACE_Y);
  const grown = (await sections.cropStatus()).artworkHeight;
  await settled(async () => (await sections.savedDrafts()).drafts.length === 1);
  const stored = await sections.savedDrafts();
  await app.close();

  const back = await openApp({
    user: "asesor",
    localStorage: { [stored.key]: stored.value ?? "" },
  });
  await back.page
    .getByRole("dialog", { name: /Borradores de la última vez/ })
    .getByRole("button", { name: "Recuperar" })
    .click();
  expect
    .soft((await back.flyerSections.cropStatus()).artworkHeight, "the original stays whole")
    .toBe(wholeHeight);
  await back.flyerSections.selectOpenTab(0);
  expect
    .soft((await back.flyerSections.cropStatus()).artworkHeight, "the draft has its section")
    .toBe(grown);
  expect.soft(await back.flyerSections.sectionsMissingImage(), "its image came down first").toBe(0);
  expect.soft(back.pageErrors(), "no JavaScript errors").toEqual([]);
});

test("a section travels to Estudio, and a flyer is proposed and approved", async ({
  cloud,
  openApp,
}) => {
  publishSource(cloud);
  const findProposal = () => cloud.designs.find(({ tipo }) => tipo === "fuente");
  const app = await openApp({ user: "asesor" });
  const sections = app.flyerSections;
  await app.flyerEditor.fillCompanyName("ACME S.A.");
  await app.page.waitForTimeout(300);
  const wholeHeight = (await sections.cropStatus()).artworkHeight;
  await app.logoEditor.enter();
  await sections.openInsertPicker();
  await sections.markSectionToCopy(MARK.from, MARK.to);
  await sections.copyMarkedSection();
  await sections.hoverForPlacement(PLACE_Y);
  await sections.clickToPlace(PLACE_Y);
  const placed = { height: (await sections.cropStatus()).cuts[0]?.height ?? 0 };
  await sections.removeBand(SECOND_CUT.y, SECOND_CUT.height);

  await test.step("Estudio keeps it and brings its image", async () => {
    // Estudio: it is saved and, opened with the image not in memory, downloaded by itself
    await app.studio.save({ name: "Con Galerías" });
    const design = cloud.designs.findLast(({ tipo }) => tipo === "diseno");
    const steps = designData(design).recortes;
    expect.soft(steps, "the design keeps both steps").toHaveLength(2);
    expect.soft(steps[0]?.ins?.u, "and which flyer the section is from").toBe(SOURCE_URL);
    await sections.reenterCurrentOption();
    await sections.forgetSectionImages();
    await app.studio.open();
    await app.studio.waitForCards();
    await app.studio.use();
    const reopened = await sections.cropStatus();
    expect.soft(reopened.active, '"Usar" opens the design').toBe(true);
    expect
      .soft(reopened.artworkHeight, "with the section")
      .toBe(wholeHeight + placed.height - SECOND_CUT.height);
    expect.soft(await sections.sectionsMissingImage(), "its image came down first").toBe(0);
  });

  await test.step("an advisor proposes a flyer", async () => {
    // Proposing a flyer from Estudio
    await app.studio.open();
    await app.studio.waitForSourcesButton();
    expect
      .soft(await app.studio.sourcesButtonLabel(), 'an advisor sees "Proponer un flyer"')
      .toContain("Proponer");
    await app.studio.proposeSource(
      { name: "op9.jpg", mimeType: "image/jpeg", buffer: fixtureFile("op9.jpg") },
      PROPOSED,
    );
    const proposal = findProposal();
    expect.soft(proposal?.estado, "the proposal arrives as a request").toBe("pedido");
    expect.soft(designData(proposal).img, "with the image").toMatch(/^data:image\/jpeg;base64,/);
    expect.soft(String(proposal?.miniatura).length, "and its thumbnail").toBeGreaterThan(500);
    expect.soft(await sections.sourcesInDepot(), "until approved it is not in the depot").toBe(1);
    expect.soft(app.pageErrors(), "no JavaScript errors for the advisor").toEqual([]);
    await app.close();
  });

  // The administrator approves
  const admin = await openApp({ user: "admin" });
  await test.step("the administrator approves the proposal", async () => {
    await admin.studio.open();
    await admin.studio.waitForSourceToApprove();
    expect
      .soft(await admin.studio.sourcesButtonLabel(), 'the administrator sees "Subir"')
      .toContain("Subir");
    expect.soft(await admin.studio.tabBadge(), "the proposal counts on the tab").toBe("1");
    await admin.studio.approveFirstSource();
    const sources = sourcesFile(cloud);
    const added = sources.at(-1);
    expect.soft(sources, "on approving it enters the depot").toHaveLength(2);
    expect.soft(added?.nombre, "with its name").toBe(PROPOSED);
    expect.soft(added?.de, "and who proposed it").toBe("Asesor Prueba");
    expect
      .soft(
        cloud.bucketBinaries[added?.img.split("/").pop() ?? ""],
        "the image goes up to the bucket",
      )
      .toBeDefined();
    expect.soft(findProposal()?.estado, "the proposal is approved").toBe("publicado");
    expect.soft(designData(findProposal()).img, "without the heavy copy").toBeFalsy();
    expect.soft(await admin.studio.tabBadge(), "and the number goes away").toBe("");
  });

  await test.step("a list that could not be read is not taken as empty", async () => {
    // A list that could not be read (403) is not taken as empty: the depot is not overwritten
    const before = JSON.stringify(sourcesFile(cloud));
    expect
      .soft(await admin.studio.saveSourcesWhenListIsForbidden(), "with a 403 nothing is saved")
      .not.toBe("saved");
    expect.soft(JSON.stringify(sourcesFile(cloud)), "and the list stays").toBe(before);
  });

  await test.step("removing it from the list keeps the image", async () => {
    // Removing it from the list keeps the image, for the designs that use it
    await admin.studio.removeSource("f1");
    expect.soft(sourcesFile(cloud), "Quitar takes it off the list").toHaveLength(1);
    expect.soft(cloud.bucketBinaries[SOURCE_IMAGE], "without erasing the image").toBeDefined();
    expect.soft(admin.pageErrors(), "no JavaScript errors for the administrator").toEqual([]);
  });
});
