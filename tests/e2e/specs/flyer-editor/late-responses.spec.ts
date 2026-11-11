// Replaces pruebas/t55_respuestas_tarde.cjs.
import { type Page, type Route } from "@playwright/test";
import { expect, test } from "../../support/test.ts";

const LOGO_HOST = "https://www.galicia.ar/**";
const DESIGNS_TABLE = "**/rest/v1/flyer_disenos**";
const FREE_AREA = { x: 140, y: 2650, width: 300, height: 110 };
const SLOW_MS = 1_500;

const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function slowDown(page: Page, url: string, shouldWait: (route: Route) => boolean) {
  await page.route(url, async (route) => {
    if (shouldWait(route)) await delay(SLOW_MS);
    await route.fallback();
  });
}

test.describe("answers that arrive late", () => {
  test("closing the picker while the logo downloads does not apply it", async ({ openApp }) => {
    const app = await openApp();
    await app.logoEditor.enter();
    await app.logoEditor.waitForBrandCatalog();
    await slowDown(app.page, LOGO_HOST, () => true);

    await app.logoEditor.openPickerForArea(FREE_AREA);
    await app.logoEditor.waitForBrandList();
    await app.logoEditor.pressFirstBrand();
    await app.page.waitForTimeout(100);
    await app.page.keyboard.press("Escape");
    await app.page.waitForTimeout(3_000);

    expect
      .soft(await app.logoEditor.placements(), "closing the picker: nothing is applied")
      .toEqual([]);
  });

  test("a design saved late does not convert the draft opened meanwhile", async ({
    cloud,
    openApp,
  }) => {
    const app = await openApp();
    await app.logoEditor.enter();
    await app.logoEditor.placeEmpty(FREE_AREA);
    await app.page.waitForTimeout(300);
    await slowDown(app.page, DESIGNS_TABLE, (route) => route.request().method() !== "GET");

    await app.flyerEditor.startSavingDesign("Diseño lento");
    await app.page.waitForTimeout(100);
    await app.page.keyboard.press("Escape");
    await app.flyerEditor.newDraft();
    await app.page.waitForTimeout(600);
    const { id: draftId } = await app.flyerEditor.openDraft();
    await app.page.waitForTimeout(3_000);

    expect.soft(cloud.designs, "the design was saved").toHaveLength(1);
    expect.soft(draftId, "a new draft is open").not.toBeNull();
    const draft = await app.flyerEditor.draftById(String(draftId));
    expect.soft(draft.id, "that draft is still the open one").toBe(draftId);
    expect.soft(draft.temporary, "it is still a draft").toBe(true);
    expect.soft(draft.name, "it does not take the name of the design").not.toBe("Diseño lento");
    expect.soft(draft.designName, "nor does it become the design").not.toBe("Diseño lento");
  });

  test("a fixed bold part before a **marked** one is not lost in the legal", async ({
    openApp,
  }) => {
    const app = await openApp();

    const bold = await app.flyerEditor.boldPartsOfLegal(
      "(1) Promoción del 100% de ahorro. Válido con tope de **$5.000 por mes** en comercios.",
    );

    expect.soft(bold, "legal: both bold parts are seen").toHaveLength(2);
    expect.soft(bold[0], "legal: the fixed one comes first").toMatch(/^\(1\)/);
  });

  test("downloading with other officers does not move the touch areas on screen", async ({
    openApp,
  }) => {
    const app = await openApp();

    const { before, after } = await app.flyerEditor.screenLayoutAroundDownload();

    expect.soft(after, "after downloading the screen keeps its values").toEqual(before);
    expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
  });
});
