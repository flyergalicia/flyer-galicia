// Replaces pruebas/t39_recortar.cjs.
import {
  activeFile,
  designData,
  legalFile,
  publishedOptions,
} from "../../support/cloud/designs.ts";
import { meanDifference } from "../../support/settled.ts";
import { expect, test } from "../../support/test.ts";

const OPTION = 9;
const CHANGED_LOGO = { x: 600, y: 2690, width: 140, height: 60 };
const NEW_CROP = { y: 700, height: 320 };
const LEGAL = "Legal del flyer sin cashback.";
const MAX_DIFFERENCE = 1;
const MAX_SEAM_DIFFERENCE = 30;

test("cropping takes out a band and everything joins", { tag: "@react" }, async ({ openApp }) => {
  const app = await openApp({ user: "asesor" });
  const sections = app.flyerSections;
  const savedCalibration = await app.flyerEditor.optionCalibration(OPTION);
  const wholeHeight = (await sections.cropStatus()).artworkHeight;
  const wholeDownload = await sections.downloadHeight();
  const above = await sections.downloadBandSample(560, 120);
  const below = await sections.downloadBandSample(4000, 200);
  const foot = await sections.downloadBandSample(wholeDownload - 300, 250);

  const logoTop = await test.step("a changed logo goes under the cut", async () => {
    // A changed logo under the cut, to see it go up
    await app.logoEditor.enter();
    await app.logoEditor.waitForBrandCatalog();
    await app.logoEditor.placeBrands([CHANGED_LOGO]);
    return (await app.logoEditor.placements())[0]?.box?.y ?? 0;
  });

  const height = await test.step("the cashback band is marked with the mouse", async () => {
    // Marking the cashback band with the mouse
    await sections.toggleCropping();
    expect.soft(await sections.isMarkingCrop(), '"Recortar" turns on the marking').toBe(true);
    expect
      .soft(await sections.cropButtonLabel(), "and its button can cancel")
      .toBe("Cancelar recorte");
    await sections.dragCropBand(690, 1030);
    await sections.confirmCrop();

    const cropped = await sections.cropStatus();
    const cutHeight = cropped.cuts[0]?.height ?? 0;
    expect.soft(cropped.active, "the crop is on").toBe(true);
    expect
      .soft(cropped.artworkHeight, "the image is that much shorter")
      .toBe(wholeHeight - cutHeight);
    expect.soft(cropped.amountsHidden, "without amounts").toBe(true);
    expect.soft(cropped.amountsCardHidden, "the Montos card hides").toBe(true);
    return cropped.cuts[0]?.height ?? 0;
  });

  await test.step("the rest of the flyer joins", async () => {
    const companyName = await sections.companyNamePlacement();
    expect.soft(companyName.off, "the company name stays on").toBe(false);
    expect.soft(companyName.centerY, "and in its place, above the cut").toBe(658);
    expect
      .soft(
        await sections.legalWithAmounts("A {eminentblack} B {cashback} C"),
        "the legal text no longer puts amounts in",
      )
      .toBe("A B C");
    const croppedDownload = await sections.downloadHeight();
    expect.soft(croppedDownload, "the download is that much shorter").toBe(wholeDownload - height);
    expect
      .soft(
        meanDifference(above, await sections.downloadBandSample(560, 120)),
        "what is above the cut stays the same",
      )
      .toBeLessThan(MAX_DIFFERENCE);
    expect
      .soft(
        meanDifference(below, await sections.downloadBandSample(4000 - height, 200)),
        "what is below goes up exactly that much",
      )
      .toBeLessThan(MAX_DIFFERENCE);
    expect
      .soft(
        meanDifference(foot, await sections.downloadBandSample(croppedDownload - 300, 250)),
        "officers and legal text go up together: the foot is identical",
      )
      .toBeLessThan(MAX_DIFFERENCE);
    expect
      .soft(await sections.seamDifference(), "the seam hardly shows")
      .toBeLessThan(MAX_SEAM_DIFFERENCE);
    const logoAfterCrop = (await app.logoEditor.placements())[0]?.box?.y ?? 0;
    expect
      .soft(Math.abs(logoAfterCrop - (logoTop - height)), "the changed logo goes up with the rest")
      .toBeLessThan(0.01);
    expect
      .soft(await sections.cropSign(), 'the sign says "Recortado: 1 parte"')
      .toContain("Recortado: 1 parte");
  });

  await test.step("it goes back to how it was", async () => {
    // Back to how it was
    await sections.undoCrop();
    await app.page.waitForTimeout(400);
    const undone = await sections.cropStatus();
    expect.soft(undone.active, '"Volver a como estaba" takes off the crop').toBe(false);
    expect.soft(undone.artworkHeight, "the flyer is whole").toBe(wholeHeight);
    expect.soft(undone.amountsCardHidden, "with its Montos card").toBe(false);
    expect
      .soft(await app.flyerEditor.activeCalibration(), "and its calibration")
      .toEqual(await app.flyerEditor.optionCalibration(OPTION));
    const logoAfterUndo = (await app.logoEditor.placements())[0]?.box?.y ?? 0;
    expect
      .soft(Math.abs(logoAfterUndo - logoTop), "the logo goes back to its place")
      .toBeLessThan(0.01);
    expect
      .soft(
        meanDifference(below, await sections.downloadBandSample(4000, 200)),
        "the download is the original again",
      )
      .toBeLessThan(MAX_DIFFERENCE);
  });

  await test.step("changing the option lets the crop go", async () => {
    // Changing the option lets it go, without touching the saved calibration
    await sections.removeBand(NEW_CROP.y, NEW_CROP.height);
    expect.soft((await sections.cropStatus()).active, "the crop is on again").toBe(true);
    await sections.reenterCurrentOption();
    await app.page.waitForTimeout(200);
    const released = await sections.cropStatus();
    expect.soft(released.active, "changing the option lets the crop go").toBe(false);
    expect.soft(released.cuts, "all of it").toEqual([]);
    expect.soft(released.artworkHeight, "with the flyer whole").toBe(wholeHeight);
    expect
      .soft(
        await app.flyerEditor.optionCalibration(OPTION),
        "the saved calibration is not modified",
      )
      .toEqual(savedCalibration);
  });

  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});

test("the company name stays above the cut, and the download keeps it", async ({ openApp }) => {
  const app = await openApp({ user: "asesor" });
  const sections = app.flyerSections;
  await app.flyerEditor.fillCompanyName("ACME S.A.");
  await app.page.waitForTimeout(300);
  const above = await sections.downloadBandSample(560, 120);
  await app.logoEditor.enter();
  await sections.toggleCropping();
  await sections.dragCropBand(690, 1030);
  await sections.confirmCrop();
  expect
    .soft(
      meanDifference(above, await sections.downloadBandSample(560, 120)),
      "what is above the cut stays the same, the name included",
    )
    .toBeLessThan(MAX_DIFFERENCE);
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});

test("a crop travels to Estudio and the administrator publishes it", async ({ cloud, openApp }) => {
  const app = await openApp({ user: "asesor" });
  const sections = app.flyerSections;
  await app.flyerEditor.fillCompanyName("ACME S.A.");
  await app.page.waitForTimeout(300);
  const wholeHeight = (await sections.cropStatus()).artworkHeight;
  await app.logoEditor.enter();
  await app.logoEditor.waitForBrandCatalog();

  const design = await test.step("it is saved in Estudio with the crop", async () => {
    // Estudio: saving with the crop and the legal text, opening it as a design
    await app.logoEditor.removeAllChanges();
    await sections.removeBand(NEW_CROP.y, NEW_CROP.height);
    await sections.setLegal(LEGAL);
    await app.studio.save({ name: "Sin cashback ACME" });
    const saved = cloud.designs.at(-1);
    const data = designData(saved);
    expect.soft(data.recortes, "the design is saved with the crop").toHaveLength(1);
    expect.soft(data.legal, "and the legal text").toBe(LEGAL);
    expect.soft(String(saved?.miniatura).length, "it has a thumbnail").toBeGreaterThan(1000);
    await sections.reenterCurrentOption();
    await app.studio.open();
    await app.studio.waitForCards();
    await app.studio.use();
    const opened = await sections.cropStatus();
    expect.soft(opened.active, '"Usar" opens the design cropped').toBe(true);
    expect.soft(opened.artworkHeight, "at its height").toBe(wholeHeight - NEW_CROP.height);
    expect.soft(opened.amountsHidden, "without amounts").toBe(true);
    expect.soft(await sections.legal(), "and with its legal text").toBe(LEGAL);
    await sections.selectFlyerTab();
    const original = await sections.cropStatus();
    expect.soft(original.active, "going back to the original tab shows no crop").toBe(false);
    expect.soft(original.artworkHeight, "and the flyer whole").toBe(wholeHeight);
    expect.soft(app.pageErrors(), "no JavaScript errors for the advisor").toEqual([]);
    await app.close();
    return saved;
  });

  await test.step("the administrator publishes it", async () => {
    // Publishing, by the administrator
    if (design) {
      design.estado = "pedido";
      design.pedido_at = new Date().toISOString();
    }
    const admin = await openApp({ user: "admin" });
    await admin.studio.open();
    await admin.studio.showFilter("requests");
    await admin.studio.waitForCards();
    await admin.studio.approve("Sin cashback");
    const option = publishedOptions(cloud).at(-1) ?? 0;
    const active = activeFile(cloud, option);
    expect
      .soft(active?.cfg, "the new option is born without amounts")
      .toHaveProperty("montos.off", true);
    expect
      .soft(active?.cfg, "and remembers which flyer it came from")
      .toHaveProperty("recDe", OPTION);
    expect.soft(legalFile(cloud, option)?.text, "it has the legal text of the design").toBe(LEGAL);
    const image = cloud.bucketBinaries[active?.name ?? ""] ?? Buffer.alloc(0);
    expect
      .soft((await admin.flyerSections.imageSize(image)).height, "its image comes already cropped")
      .toBe(wholeHeight - NEW_CROP.height);
    expect.soft(admin.pageErrors(), "no JavaScript errors for the administrator").toEqual([]);
  });
});
