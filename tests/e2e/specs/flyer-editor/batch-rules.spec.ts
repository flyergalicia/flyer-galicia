// Protects the rules of the batches: repeated names, memory, the question before starting.
import { expect, test } from "../../support/test.ts";

const FLYER = "flyer_t7.jpg?v=1";
const row = (empresa: string, sheetRow: number) => ({
  cells: { empresa, asesor1_nombre: "Ana Perez", asesor1_celular: "11 4444 5555", config: "BAU" },
  sheetRow,
});

test.describe("a batch", () => {
  test("the template carries the four officers", async ({ openApp }) => {
    const { flyerEditor } = await openApp();
    await flyerEditor.chooseEditorTab("Masivo");

    const template = await flyerEditor.downloadBatchTemplate();
    for (const officer of [1, 2, 3, 4]) {
      for (const field of ["nombre", "celular", "email"]) {
        expect
          .soft(template.head, `officer ${String(officer)}`)
          .toContain(`asesor${String(officer)}_${field}`);
      }
    }
    expect.soft(template.head).toContain("config");
  });

  test("two lines with the same company do not step on each other in the ZIP", async ({
    openApp,
  }) => {
    const { flyerEditor } = await openApp();
    await flyerEditor.loadDownloadLibrary("pdf");
    await flyerEditor.loadDownloadLibrary("zip");

    const outcome = await flyerEditor.generateBatch({
      rows: [row("ACME", 2), row("ACME", 3), row("ACME", 4)],
    });

    const pdfs = outcome.files.filter((file) => file.endsWith(".pdf"));
    expect.soft(pdfs.length, "three flyers").toBe(3);
    expect.soft(new Set(pdfs).size, "with three names").toBe(3);
  });

  test("the ZIP reaches the disk and its memory is given back", async ({ openApp }) => {
    const { flyerEditor } = await openApp();

    const outcome = await flyerEditor.generateBatchToDisk([row("ACME", 2)]);

    expect.soft(outcome.file).toMatch(/\.zip$/);
    expect.soft(outcome.addressesMade, "an address for the file").toBeGreaterThan(0);
    expect.soft(outcome.addressesReleased, "released afterwards").toBe(outcome.addressesMade);
  });

  test("a ZIP that fails explains it and does not leave the button locked", async ({ openApp }) => {
    const { flyerEditor } = await openApp();

    const outcome = await flyerEditor.generateBatchWithBrokenZip([row("ACME", 2)]);

    expect.soft(outcome.notice).toMatch(/ZIP/);
    expect.soft(outcome.canGenerate).toBe(true);
  });

  test("the log counts what came out, not what was asked for", async ({ cloud, openApp }) => {
    const { flyerEditor } = await openApp();
    await flyerEditor.loadDownloadLibrary("pdf");
    await flyerEditor.loadDownloadLibrary("zip");

    await flyerEditor.generateBatch({
      rows: [row("ACME", 2), row("ROTA", 3), row("BETA", 4)],
      failingCompany: "ROTA",
    });

    await expect.poll(() => cloud.flyerLogWrites.length).toBe(1);
    expect.soft(cloud.flyerLogWrites[0]?.bulk_count, "two flyers, not three").toBe(2);
    expect.soft(cloud.flyerLogWrites[0]?.is_bulk).toBe(true);
  });

  test("generating the companies of the list logs them too, as such", async ({
    cloud,
    openApp,
  }) => {
    const { flyerEditor, companyRegistry } = await openApp({ user: "admin" });
    await flyerEditor.loadDownloadLibrary("pdf");
    await flyerEditor.loadDownloadLibrary("zip");

    const outcome = await companyRegistry.generateFlyers([
      { name: "ACME", cashback: "BAU" },
      { name: "BETA", cashback: "BAU" },
    ]);

    expect.soft(outcome.files.filter((file) => file.endsWith(".pdf")).length).toBe(2);
    expect.soft(outcome.summary, "with its summary").not.toBe("");
    await expect.poll(() => cloud.flyerLogWrites.length).toBe(1);
    expect.soft(cloud.flyerLogWrites[0]?.empresa).toMatch(/Mis empresas \(2 flyers\)/);
  });

  test("before generating the companies, it says how many go on which flyer", async ({
    cloud,
    openApp,
  }) => {
    cloud.addFlyerOption({
      option: 8,
      name: "Combustible rubro",
      image: FLYER,
      legal: "L",
      tab: "rubros",
    });
    const { flyerEditor } = await openApp({ user: "admin" });

    const question = await flyerEditor.batchQuestion([
      { name: "ACME", cashback: "BAU", option: 8 },
      { name: "BETA", cashback: "BAU", option: 8 },
      { name: "GAMA", cashback: "BAU" },
    ]);

    expect.soft(question).toMatch(/Revis. antes de generar/);
    expect.soft(question, "two on the flyer of their category").toMatch(/2 en .*Combustible rubro/);
    expect.soft(question, "one on the general").toMatch(/1 en /);
  });
});
