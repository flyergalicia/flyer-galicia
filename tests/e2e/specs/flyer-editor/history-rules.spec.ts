// Protects what the Historial does with an old flyer: it never comes out on the picture of another
// one, and it does not go down without a logo without saying so. They come from the browser of the
// person, as they do with the faculty "Guardar historial y borrador".
import { type Page } from "@playwright/test";
import { type Cloud } from "../../support/cloud/index.ts";
import { expect, test } from "../../support/test.ts";

const WITH_NO_FLYER = 10;
const ANOTHER_FLYER = 12;
const NOT_ENABLED = 13;
const GONE = 77;
const NOTICE_MS = 800;
const FIRST_MOMENT = 1_000;

interface OldFlyerOptions {
  option: number;
  company?: string;
  logos?: Record<string, unknown>[];
}

function oldFlyer({ option, company = "VIEJA SA", logos }: OldFlyerOptions, position: number) {
  return {
    v: {
      empresa: company,
      nombre: "Ana Perez",
      has1: true,
      celular: "Cel: 11 4444 5555",
      email: "",
      legal: "Legal viejo",
      ...(logos ? { logos } : {}),
    },
    fn: `Flyer ${company}`,
    thumb: "",
    hora: "1:00",
    // The first one is the newest, as they are listed. Two of the same moment and name are one.
    ts: FIRST_MOMENT - position,
    ac: 0,
    opt: option,
  };
}

function setUp(cloud: Cloud, flyers: readonly OldFlyerOptions[]) {
  cloud.addFlyerOption({ option: WITH_NO_FLYER, name: "Sin flyer", image: null, legal: "Sin" });
  cloud.addFlyerOption({
    option: ANOTHER_FLYER,
    name: "Otro flyer",
    image: "flyer_t2.jpg?v=12",
    legal: "Legal del otro",
  });
  cloud.addFlyerOption({
    option: NOT_ENABLED,
    name: "No habilitado",
    image: "flyer_t3.jpg?v=13",
    legal: "Legal del no habilitado",
  });
  cloud.setPermissions("asesor", {
    guardar_trabajo: true,
    [`opcion_${String(WITH_NO_FLYER)}`]: true,
    [`opcion_${String(ANOTHER_FLYER)}`]: true,
    [`opcion_${String(NOT_ENABLED)}`]: false,
  });
  return {
    [`fg_hist_${cloud.users.asesor?.id ?? ""}`]: JSON.stringify(flyers.map(oldFlyer)),
  };
}

function countDownloads(page: Page) {
  let count = 0;
  page.on("download", () => {
    count += 1;
  });
  return () => count;
}

test.describe("downloading an old flyer again", () => {
  test(
    "with a format that no longer exists or is not enabled, it says so and nothing comes out",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      const stored = setUp(cloud, [{ option: GONE }, { option: NOT_ENABLED }]);
      const { flyerEditor, page } = await openApp({ localStorage: stored });
      const downloads = countDownloads(page);
      await flyerEditor.chooseEditorTab("Historial");

      await flyerEditor.pressDownloadFromHistory(0);
      await page.waitForTimeout(NOTICE_MS);
      expect.soft(await flyerEditor.latestNotice()).toMatch(/ya no existe/);
      expect.soft(await flyerEditor.latestNotice()).toMatch(/No se puede volver a descargar/);

      await flyerEditor.pressDownloadFromHistory(1);
      await page.waitForTimeout(NOTICE_MS);
      expect.soft(await flyerEditor.latestNotice()).toMatch(/no está habilitado/);
      expect.soft(downloads(), "nothing, on any other flyer").toBe(0);
      expect.soft(await flyerEditor.activeOption(), "and it stays on the flyer it was").toBe(9);
    },
  );

  test(
    "if its flyer does not load, no PDF comes out with another picture",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      const stored = setUp(cloud, [{ option: WITH_NO_FLYER }]);
      const { flyerEditor, page } = await openApp({ localStorage: stored });
      const downloads = countDownloads(page);
      await flyerEditor.chooseEditorTab("Historial");

      await flyerEditor.pressDownloadFromHistory(0);
      await flyerEditor.waitForLoadProblem();
      await page.waitForTimeout(NOTICE_MS);

      expect.soft(downloads(), "no file").toBe(0);
      expect.soft(await flyerEditor.latestNotice(), "and it says why").toMatch(/no tiene flyer/);
    },
  );

  test(
    "on another flyer it goes to that one first, and comes out with it",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      const stored = setUp(cloud, [{ option: ANOTHER_FLYER }]);
      const { flyerEditor, page } = await openApp({ localStorage: stored });
      await flyerEditor.chooseEditorTab("Historial");

      const [download] = await Promise.all([
        page.waitForEvent("download"),
        flyerEditor.pressDownloadFromHistory(0),
      ]);

      expect.soft(download.suggestedFilename()).toMatch(/VIEJA SA\.pdf$/);
      expect.soft(await flyerEditor.activeOption(), "its flyer is on screen").toBe(ANOTHER_FLYER);
      await expect.poll(() => cloud.flyerLogWrites.length, "it is logged again").toBe(1);
      await flyerEditor.chooseEditorTab("Individual");
      await flyerEditor.chooseEditorTab("Historial");
      expect.soft((await flyerEditor.historyRows()).length, "and it stays in the history").toBe(2);
    },
  );

  test(
    "with a logo uploaded from the PC that is gone, it asks first",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      const logos = [{ img: "pc:1:toledo.png", t: "", x: 1, y: 1, w: 9, h: 9, bg: "white" }];
      const stored = setUp(cloud, [{ option: 9, logos }]);
      const { flyerEditor, session, page } = await openApp({ localStorage: stored });
      const downloads = countDownloads(page);
      await flyerEditor.chooseEditorTab("Historial");

      await flyerEditor.pressDownloadFromHistory(0);
      expect.soft(await session.waitForConfirmation()).toMatch(/Falta un logo subido de la PC/);
      expect.soft(await session.waitForConfirmation()).toMatch(/toledo\.png/);
      await session.answerConfirmation(false);
      await page.waitForTimeout(NOTICE_MS);
      expect.soft(downloads(), "Cancelar: nothing comes out").toBe(0);

      await flyerEditor.pressDownloadFromHistory(0);
      await session.waitForConfirmation();
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        session.answerConfirmation(true),
      ]);
      expect.soft(download.suggestedFilename(), "Descargar igual").toMatch(/\.pdf$/);
    },
  );
});

test.describe("the Historial", () => {
  test(
    "with nothing, it says how to get something there; a flyer can be taken out of it",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      const { flyerEditor } = await openApp();
      await flyerEditor.chooseEditorTab("Historial");
      expect.soft(await flyerEditor.emptyHistoryText()).toMatch(/Todavía no hay flyers/);
      await flyerEditor.chooseEditorTab("Individual");
      await flyerEditor.fillCompanyName("UNO SA");
      await flyerEditor.downloadPdfToDisk();
      await flyerEditor.dismissAfterDownload();

      await flyerEditor.chooseEditorTab("Historial");
      expect.soft(await flyerEditor.historyRows()).toHaveLength(1);
      expect.soft(await flyerEditor.emptyHistoryText()).toBe("");
      await flyerEditor.pressRemoveFromHistory(0);

      expect.soft(await flyerEditor.emptyHistoryText()).toMatch(/Todavía no hay flyers/);
      await expect.poll(() => cloud.flyerLogWrites.length, "the log stays").toBe(1);
    },
  );

  test(
    "editing one whose format is gone brings its data to the flyer on screen, and says so",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      const stored = setUp(cloud, [{ option: NOT_ENABLED, company: "AJENA SA" }]);
      const { flyerEditor } = await openApp({ localStorage: stored });
      await flyerEditor.chooseEditorTab("Historial");

      await flyerEditor.editFromHistory(0);

      await expect.poll(() => flyerEditor.companyName()).toBe("AJENA SA");
      expect.soft(await flyerEditor.latestNotice()).toMatch(/Se cargaron los datos en/);
      expect.soft(await flyerEditor.activeOption(), "it stays on the flyer it was").toBe(9);
    },
  );
});
