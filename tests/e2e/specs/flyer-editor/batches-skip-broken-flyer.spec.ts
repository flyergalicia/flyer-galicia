// Replaces pruebas/t74_tandas_saltean_flyer_roto.cjs.
import { type Cloud } from "../../support/cloud/index.ts";
import { expect, test } from "../../support/test.ts";

const NO_CASHBACK_ARTWORK = "flyer_t8.jpg";
const ORIGINAL_OPTION = 9;
const NO_CASHBACK_OPTION = 10;
const COULD_NOT_LOAD = /no se pudo cargar/;
const WITHOUT_CASHBACK = {
  name: "SIN CB S.A.",
  cashback: "",
  officers: [{ name: "Ana Pérez", phone: "11 5555 5555" }],
};
const WITH_CASHBACK = {
  name: "CON CB S.A.",
  cashback: "BAU",
  officers: [{ name: "Juan Díaz", phone: "11 4444 4444" }],
};
const BATCH = [
  { cells: { empresa: "A con", config: "BAU", asesor1_nombre: "X" } },
  { cells: { empresa: "B sin", config: "", asesor1_nombre: "Y" } },
  { cells: { empresa: "C con", config: "BAU", asesor1_nombre: "Z" } },
  { cells: { empresa: "D sin", config: "SIN", asesor1_nombre: "W" } },
];

/** Option 10 is the version without cashback of option 9, and its artwork can fall. */
function addVariantWithoutCashback(cloud: Cloud): void {
  cloud.addFlyerOption({
    option: NO_CASHBACK_OPTION,
    name: "Combustible sin cashback",
    image: `${NO_CASHBACK_ARTWORK}?v=10`,
    legal: "Legal SIN cashback.",
    noCashbackOf: ORIGINAL_OPTION,
  });
  cloud.setPermissions("asesor", { opcion_10: true, padron_buscar: true });
}

test.describe("when the flyer of a format does not load", () => {
  test(
    "batches skip what they cannot draw and say so",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      addVariantWithoutCashback(cloud);
      cloud.dropBucketFile(NO_CASHBACK_ARTWORK);
      const opened = await openApp();
      const { companyRegistry, flyerEditor } = opened;
      await flyerEditor.loadDownloadLibrary("zip");

      // 1) Generar flyers: the one without cashback goes to option 10 (it does not load)
      expect
        .soft(
          await companyRegistry.destinationOption(WITHOUT_CASHBACK),
          "without cashback: option 10",
        )
        .toBe(NO_CASHBACK_OPTION);
      expect
        .soft(await companyRegistry.destinationOption(WITH_CASHBACK), "with cashback: option 9")
        .toBe(ORIGINAL_OPTION);
      const generated = await companyRegistry.generateFlyers([WITHOUT_CASHBACK, WITH_CASHBACK]);
      expect
        .soft(
          generated.files.some((file) => /CON CB/.test(file)),
          "the ZIP has the one that loaded",
        )
        .toBe(true);
      expect
        .soft(
          generated.files.some((file) => /SIN CB/.test(file)),
          "and not the other",
        )
        .toBe(false);
      expect.soft(generated.summary, "Resumen.txt says why").toMatch(/no se pudo cargar el flyer/);
      expect.soft(generated.summary, "and which company stayed out").toMatch(/SIN CB/);
      expect.soft(generated.finalOption, "it goes back to the option it started on").toBe(9);

      // 2) Generar flyers where no flyer loads: it does not download an empty ZIP
      await companyRegistry.dismissUpdateDialog();
      const nothing = await companyRegistry.generateFlyers([WITHOUT_CASHBACK]);
      expect.soft(nothing.zips, "no flyer came out: no empty ZIP").toBe(0);
      expect.soft(nothing.stillGenerating, "and it is not stuck").toBe(false);
      expect.soft(nothing.notice, "the notice says none was generated").toMatch(/No se gener/);
      expect.soft(nothing.notice, "and explains the reason").toMatch(COULD_NOT_LOAD);
      await companyRegistry.dismissUpdateDialog();

      // 3) Masivo: lines with and without cashback
      const batch = await flyerEditor.generateBatch({ rows: BATCH });
      expect
        .soft(
          batch.drawn.map(({ company }) => company),
          "only the lines whose flyer loaded are drawn",
        )
        .toEqual(["A con", "C con"]);
      expect
        .soft(
          batch.files.filter((file) => file.endsWith(".pdf")),
          "two PDFs come out",
        )
        .toHaveLength(2);
      expect.soft(batch.progress, "it says which stayed out").toMatch(/2 con error|B sin/);
      expect.soft(batch.progress, "and why").toMatch(COULD_NOT_LOAD);
      expect
        .soft(batch.summary, "Resumen.txt has the row of the sheet and the reason")
        .toMatch(/Fila 3 — B sin: no se pudo cargar/);
      expect.soft(batch.summary, "for each line left out").toMatch(/Fila 5 — D sin/);
      expect.soft(batch.finalOption, "Masivo goes back to the option it started on").toBe(9);

      // 4) Masivo with the flyer on screen not loaded: it generates nothing
      const blocked = await flyerEditor.tryBatchWithoutFlyer([
        { cells: { empresa: "A", config: "BAU", asesor1_nombre: "X" } },
      ]);
      expect.soft(blocked.zips, "flyer not loaded: nothing is generated").toBe(0);
      expect.soft(blocked.notice, "and it explains why").toMatch(/No se pudo cargar el flyer/);
      await flyerEditor.selectOption(ORIGINAL_OPTION);
      expect.soft(opened.pageErrors(), "no JavaScript errors").toEqual([]);
    },
  );

  test(
    "the automatic choice does not send a company to an option without artwork",
    { tag: "@react" },
    async ({ cloud, openApp }) => {
      addVariantWithoutCashback(cloud);
      cloud.bucketJson[`_active${String(NO_CASHBACK_OPTION)}.json`] = { name: "", imageUrl: null };
      const { companyRegistry, flyerEditor } = await openApp();

      await flyerEditor.checkOptionsInBackground();
      await flyerEditor.waitForOptionKnownWithoutArtwork(NO_CASHBACK_OPTION);

      expect
        .soft(await flyerEditor.noCashbackVariantOf(ORIGINAL_OPTION), "option 10 is not offered")
        .toBe(0);
      expect
        .soft(await companyRegistry.destinationOption(WITHOUT_CASHBACK), "the company stays on 9")
        .toBe(ORIGINAL_OPTION);

      await companyRegistry.applyCompany(WITHOUT_CASHBACK);

      expect.soft(await flyerEditor.activeOption(), "the search stays on option 9").toBe(9);
      expect.soft(await flyerEditor.hasLoadProblem(), "with no error notice").toBe(false);
      expect
        .soft(await flyerEditor.companyName(), "and with the company loaded")
        .toBe("SIN CB S.A.");
    },
  );
});
