// Replaces pruebas/t16_estudio_prototipo_carreras.cjs.
import { addDesign, textChange } from "../../support/cloud/designs.ts";
import { fixtureFile } from "../../support/cloud/index.ts";
import { expect, test } from "../../support/test.ts";

const FIRST = "d801-0000-4000-8000-000000000000";
const SECOND = "d802-0000-4000-8000-000000000000";
const OPTION = 9;

test("the last tab touched wins, even if an earlier one was still opening", async ({
  cloud,
  openApp,
}) => {
  const logo = fixtureFile("gofarma_180.png").toString("base64");
  addDesign(cloud, {
    id: FIRST,
    nombre: "Diseño A",
    datos: {
      v: 1,
      cambios: [textChange("AAA")],
      subidos: { "pc:9:x": `data:image/png;base64,${logo}` },
    },
  });
  addDesign(cloud, {
    id: SECOND,
    nombre: "Diseño B",
    datos: { v: 1, cambios: [textChange("BBB")], subidos: {} },
  });
  const app = await openApp({ user: "asesor" });

  for (const id of [FIRST, SECOND]) {
    await app.studio.open();
    await app.studio.use(id);
  }
  await app.flyerSections.selectFlyerTab(OPTION);

  await app.flyerSections.openDesignThenAnother(FIRST, SECOND);
  expect.soft(await app.flyerSections.openWorkReading(), "A and right after B: B stays").toEqual({
    openId: SECOND,
    texts: ["BBB"],
    downloadTexts: ["BBB"],
    activeTabs: ["Diseño B"],
  });

  await app.flyerSections.openDesignThenFlyer(FIRST, OPTION);
  expect
    .soft(
      await app.flyerSections.openWorkReading(),
      "A and right after the original: the original stays, with no changes",
    )
    .toEqual({ openId: null, texts: [], downloadTexts: [], activeTabs: ["Combustible"] });
  expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
});
