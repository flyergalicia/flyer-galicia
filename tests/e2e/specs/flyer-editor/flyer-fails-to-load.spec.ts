// Replaces pruebas/t72_flyer_no_carga.cjs.
import { bucketUrl } from "../../support/cloud/index.ts";
import { expect, test } from "../../support/test.ts";

const COULD_NOT_LOAD = /No se pudo cargar el flyer/;
const NO_FLYER_YET = /todav[ií]a no tiene flyer/;
const ASK_THE_ADMIN = /administrador/;
const LONG_STANDING_ACTIVE = (image: string) => ({ name: "Vigente", imageUrl: bucketUrl(image) });

// Option 11 has artwork and its own calibration; option 12 has no flyer at all.
test.describe("when a flyer does not arrive", { tag: "@react" }, () => {
  test("it warns, stops downloads and never mixes it with another flyer", async ({
    cloud,
    openApp,
  }) => {
    cloud.addFlyerOption({
      option: 11,
      name: "Once",
      image: "flyer_t7.jpg?v=11",
      legal: "Legal 11",
      calibration: { __once: true },
    });
    cloud.addFlyerOption({ option: 12, name: "Doce", image: null, legal: "Legal 12" });
    cloud.setPermissions("asesor", { opcion_11: true, opcion_12: true });
    const artwork = cloud.dropBucketFile("flyer_t7.jpg");
    const opened = await openApp();
    const app = opened.flyerEditor;

    const calibrationOfNine = await app.optionCalibration(9);
    expect.soft(await app.showsArtworkOf(9), "it starts on option 9 with its artwork").toBe(true);

    // 1) The artwork of option 11 does not arrive
    await app.selectOption(11);
    const notice = await app.waitForLoadProblem();
    expect.soft(notice, 'notice "No se pudo cargar el flyer"').toMatch(COULD_NOT_LOAD);
    expect.soft(notice, "with Reintentar").toMatch(/Reintentar/);
    const failed = await app.optionStatus(11);
    expect.soft(failed.settled, "option 11 is not settled, so it is tried again").toBe(false);
    expect.soft(await app.showsArtworkOf(9), "it keeps the artwork of option 9").toBe(true);
    expect
      .soft(await app.activeCalibration(), "and the calibration of option 9, untouched")
      .toEqual(calibrationOfNine);
    const reason = await app.downloadBlockReason();
    expect.soft(reason, "the download is stopped, with its reason").toMatch(COULD_NOT_LOAD);
    expect.soft(failed.ready, "option 11 is not ready to download").toBe(false);
    expect.soft(await app.previewIsOff(), "the preview goes off meanwhile").toBe(true);

    // 2) Coming back to option 11 later warns again
    await app.selectOption(9);
    await app.waitForNoLoadProblem();
    await app.selectOption(11);
    expect
      .soft(await app.waitForLoadProblem(), "the notice comes back on option 11")
      .toMatch(COULD_NOT_LOAD);
    expect.soft(await app.showsArtworkOf(9), "it still does not mix artworks").toBe(true);

    // 3) The network is back and Reintentar is pressed
    artwork.restore();
    await app.retryLoading();
    await app.waitForOptionShown(11);
    expect.soft(await app.downloadBlockReason(), "Reintentar: it can be downloaded").toBe("");
    expect.soft((await app.optionStatus(11)).ready, "Reintentar: option 11 is ready").toBe(true);
    expect
      .soft(await app.activeCalibration(), "Reintentar: now it has the calibration of option 11")
      .toHaveProperty("__once", true);
    expect.soft(await app.previewIsOff(), "the preview goes back on").toBe(false);

    // 4) Option without a flyer (a firm fact): an asesor cannot upload one
    await app.selectOption(12);
    const noFlyer = await app.waitForLoadProblem();
    expect.soft(noFlyer, "asesor: it has no flyer yet").toMatch(NO_FLYER_YET);
    expect.soft(noFlyer, "asesor: tell the administrator").toMatch(ASK_THE_ADMIN);
    expect.soft(noFlyer, "asesor: nothing about uploading it").not.toMatch(/subilo/);
    const noArtwork = await app.optionStatus(12);
    expect.soft(noArtwork.settled, '"no flyer" is a firm fact: it is settled').toBe(true);
    expect.soft(noArtwork.hasArtwork, '"no flyer" is a firm fact: no artwork').toBe(false);
    expect
      .soft(await app.downloadBlockReason(), "the download explains why not")
      .toMatch(ASK_THE_ADMIN);
    await app.selectOption(9);
    await app.waitForNoLoadProblem();

    // 5) The JSON of the option does not arrive (network): that is not "it has no flyer"
    cloud.dropBucketFile("_active11.json");
    await app.reloadOption(11);
    const noData = await app.waitForLoadProblem();
    expect.soft(noData, "no JSON: it could not be loaded").toMatch(/No se pudo cargar/);
    expect.soft(noData, 'no JSON: it does not say "no flyer"').not.toMatch(NO_FLYER_YET);
    expect.soft(opened.pageErrors(), "no JavaScript errors").toEqual([]);
  });

  test("entering with the artwork of its option down keeps the session and warns", async ({
    cloud,
    openApp,
  }) => {
    cloud.dropBucketFile("flyer_t9.jpg");

    const app = await openApp({ waitUntilReady: false });
    await app.flyerEditor.waitForLoadProblem();

    const status = await app.session.status();
    expect.soft(status.stillEntering, "entering: the screen does not stay stuck").toBe(false);
    expect
      .soft(await app.flyerEditor.downloadBlockReason(), "entering: warns, shows no other artwork")
      .toMatch(COULD_NOT_LOAD);
    expect.soft(status.signedIn, "entering: the session stays open").toBe(true);
    expect.soft(status.loginScreenVisible, "entering: no login screen").toBe(false);
  });

  // Option 1 is the long-standing flyer.
  test.describe("on option 1", () => {
    test.beforeEach(({ cloud }) => {
      cloud.setPermissions("asesor", {
        opcion_1: true,
        opcion_9: false,
        opcion_11: false,
        opcion_12: false,
      });
    });

    test("artwork down: notice, not the sample image in silence", async ({ cloud, openApp }) => {
      cloud.bucketJson["_active.json"] = LONG_STANDING_ACTIVE("flyer_t6.jpg?v=3");
      cloud.dropBucketFile("flyer_t6.jpg");

      const app = await openApp({ waitUntilReady: false });
      await app.flyerEditor.waitForLoadProblem();

      expect
        .soft(await app.flyerEditor.downloadBlockReason(), "option 1 with its artwork down")
        .toMatch(COULD_NOT_LOAD);
    });

    test("healthy artwork: no notice and it can be downloaded", async ({ cloud, openApp }) => {
      cloud.bucketJson["_active.json"] = LONG_STANDING_ACTIVE("flyer_t6.jpg?v=3");

      const app = await openApp({ waitUntilReady: false });
      await app.flyerEditor.waitForOptionShown(1);

      expect.soft(await app.flyerEditor.hasLoadProblem(), "healthy: no notice").toBe(false);
      expect.soft(await app.flyerEditor.downloadBlockReason(), "healthy: downloads").toBe("");
      expect.soft((await app.flyerEditor.optionStatus(1)).settled, "healthy: settled").toBe(true);
    });

    test("no flyer loaded: tells to ask the administrator", async ({ openApp }) => {
      const app = await openApp({ waitUntilReady: false });

      const notice = await app.flyerEditor.waitForLoadProblem();

      expect.soft(notice, "option 1 without a flyer: it has none yet").toMatch(NO_FLYER_YET);
      expect.soft(notice, "option 1 without a flyer: tell the admin").toMatch(ASK_THE_ADMIN);
    });
  });
});
