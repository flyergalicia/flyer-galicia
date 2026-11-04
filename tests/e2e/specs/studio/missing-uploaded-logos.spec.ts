// Replaces pruebas/t76_logos_pc_faltan.cjs.
import { addDesign, designData } from "../../support/cloud/designs.ts";
import { fixtureFile } from "../../support/cloud/index.ts";
import { expect, test } from "../../support/test.ts";

const FILE_NAME = "gofarma_180.png";
const LOST_LOGO_DESIGN = "d99-0000-4000-8000-000000000000";
const QUESTION_DOWNLOAD_WINDOW_MS = 600;
const PUBLISH_NOTICE_MS = 2500;

test("an uploaded logo that is gone is told about, never silently replaced", async ({
  cloud,
  openApp,
}) => {
  const logo = fixtureFile(FILE_NAME);
  const app = await openApp({ user: "asesor" });

  // 1) The key of each upload is unique, even after reloading sets the counter to 0
  const keys = await app.studio.uploadKeysOfSameFile(logo, FILE_NAME);
  expect.soft(new Set(keys).size, "two uploads and one after a reload have different keys").toBe(3);
  for (const key of keys) {
    expect
      .soft(key, "every key has the form of the app")
      .toMatch(/^pc:[0-9a-z]+:gofarma_180\.png$/);
  }

  // 2) Loading from the history a flyer whose uploaded logo is gone warns
  const reopened = await app.studio.reopenHistoryWithLostUpload(logo, FILE_NAME);
  expect
    .soft(reopened.notice, "history: it warns the uploaded logo is missing")
    .toMatch(/Falta el logo subido de la PC «gofarma_180\.png»/);
  expect.soft(reopened.changes, "and opens the rest in a draft anyway").toBe(1);

  // 3) Saving in Estudio with the logo missing: the window warns and what was kept stays
  expect
    .soft(
      await app.studio.saveDialogTextWithoutStoredUpload(),
      "Guardar en Estudio: if the logo is nowhere, the window warns",
    )
    .toMatch(/Falta el logo subido de la PC/);
  expect
    .soft(
      await app.studio.saveDialogTextWithStoredUpload(reopened.key, logo),
      "if the design kept it, it does not warn",
    )
    .not.toMatch(/Falta el logo subido de la PC/);
  await app.studio.fillSaveDialogAndSave("Con logo faltante");
  expect
    .soft(
      designData(cloud.designs.at(-1)).subidos[reopened.key],
      "saving keeps the image the design already had",
    )
    .toBeTruthy();

  // 4) Two old designs with the SAME key and different images: each shows its own
  const colors = await app.studio.colorsOfDesignsSharingKey();
  expect.soft(colors.first[0], "same key: the first loads its red").toBeGreaterThan(200);
  expect.soft(colors.second[2], "the second loads its blue").toBeGreaterThan(200);
  expect.soft(colors.third[0], "and the first its red again").toBeGreaterThan(200);

  // 5) Drafts in the PC with no room: saved without the logos and it warns
  const noRoom = await app.studio.saveDraftsWithoutRoom(logo);
  expect
    .soft(
      noRoom.savedLogos.every((count) => count === 0),
      "no room: they are saved without the logos",
    )
    .toBe(true);
  expect.soft(noRoom.firstNotice, "and it warns once").toMatch(/sin los logos subidos/);
  expect.soft(noRoom.pendingKeepsItsLogo, "the pending drafts keep their logos").toBe(true);
  expect.soft(noRoom.openDraftLogos, "and so do the open ones").toBe(1);
  expect
    .soft(noRoom.secondNotice, "if it does not fit even without logos it says it is not saved")
    .toMatch(/No se pudieron guardar los borradores en esta PC/);
  expect.soft(noRoom.warnedNoRoom, "and remembers it warned").toBe(true);

  // 6) Recovering a draft whose uploaded logo could not be saved
  expect
    .soft(await app.studio.recoverDraftWithLostUpload(), "recovering warns a logo is missing")
    .toMatch(/1 logo subido de la PC no se pudo guardar/);

  // 7) History: downloading a flyer with a lost uploaded logo asks first
  let downloads = 0;
  app.page.on("download", () => {
    downloads += 1;
  });
  const question = await app.studio.redownloadHistoryWithLostUpload();
  expect.soft(question, "downloading again asks first").toMatch(/Falta un logo subido de la PC/);
  expect.soft(downloads, "before downloading anything").toBe(0);
  await app.session.answerConfirmation(false);
  await app.page.waitForTimeout(QUESTION_DOWNLOAD_WINDOW_MS);
  expect.soft(downloads, "Cancelar: nothing comes down").toBe(0);
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
  await app.close();
});

test("the administrator cannot publish a design that lacks an uploaded logo", async ({
  cloud,
  openApp,
}) => {
  const admin = await openApp({ user: "admin" });
  const place = { x: 10, y: 2000, w: 100, h: 50 };
  const design = addDesign(cloud, {
    id: LOST_LOGO_DESIGN,
    nombre: "Con logo perdido",
    base_name: "flyer_t9.jpg",
    estado: "pedido",
    pedido_at: new Date().toISOString(),
    datos: {
      v: 1,
      cambios: [
        {
          img: "pc:abc:a.png",
          t: "a",
          ...place,
          tx: 10,
          ty: 2000,
          tw: 100,
          th: 50,
          ox: 10,
          oy: 2000,
          ow: 100,
          oh: 50,
          bg: "rgb(255,255,255)",
        },
      ],
      subidos: {},
      recortes: [],
      legal: "",
    },
  });
  const uploadsBefore = cloud.uploads.length;

  await admin.studio.publishDirectly(LOST_LOGO_DESIGN, 9, "Prueba");
  await admin.page.waitForTimeout(PUBLISH_NOTICE_MS);

  expect
    .soft(await admin.flyerEditor.latestNotice(), "publishing stops, with the reason")
    .toMatch(/No se pudo publicar: le falta el logo subido de la PC «a\.png»/);
  expect
    .soft(
      cloud.uploads.slice(uploadsBefore).some(({ name }) => /^_active\d+\.json$/.test(name)),
      "no new option is reserved or uploaded",
    )
    .toBe(false);
  expect.soft(design.estado, "the design stays requested").toBe("pedido");
});
