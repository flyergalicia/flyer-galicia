// Replaces pruebas/t75_masivo_excel_claro.cjs.
import { expect, test } from "../../support/test.ts";

const NOT_FOUND = (what: string) => new RegExp(`No encontr.{1,3} la columna ${what}`);
const ODD_HEADERS = ["EMPRESA", "Asesor1_Nombre ", "Asesor 1 Celular", "Cashback", "Columna rara"];

test.describe("Masivo por Excel", { tag: "@react" }, () => {
  test("understands headers written differently and reports the real row", async ({ openApp }) => {
    const { flyerEditor } = await openApp();

    // 1) Other headers, an empty row in the middle and an empty company
    const withEmptyCompany = await flyerEditor.uploadExcelSheet([
      ODD_HEADERS,
      ["Acme", "Ana Perez", "11 4444 5555", "BAU", "x"],
      ["", "", "", "", ""],
      ["", "Luis", "11 3333 4444", "BAU", "y"],
      ["Beta", "", "", "", ""],
    ]);
    expect
      .soft(withEmptyCompany.rowNumbers, "the reader keeps the REAL row of the sheet")
      .toEqual([2, 4, 5]);
    expect
      .soft(
        withEmptyCompany.columns.filter((column) => /rownum|__fila/i.test(column)),
        "the row number is not a column",
      )
      .toEqual([]);
    expect
      .soft(withEmptyCompany.validation, '"empty company" says row 4, the one in the sheet')
      .toMatch(/Fila 4: empresa vac/);
    expect
      .soft(withEmptyCompany.validation, "and not row 3, the one in the list")
      .not.toMatch(/Fila 3/);
    expect.soft(withEmptyCompany.canGenerate, "an empty company stops generating").toBe(false);
    expect.soft(withEmptyCompany.severity, "and it is an error").toBe("error");
    expect
      .soft(withEmptyCompany.validation, "it understands the headers written differently")
      .not.toMatch(/No encontr.{1,3} la columna/);

    // 2) The same sheet with the company filled in: warnings that do not stop it
    const withWarnings = await flyerEditor.uploadExcelSheet([
      ODD_HEADERS,
      ["Acme", "Ana Perez", "11 4444 5555", "BAU", "x"],
      ["Gamma", "Luis", "11 3333 4444", "BAU", "y"],
      ["Beta", "", "", "", ""],
    ]);
    expect.soft(withWarnings.canGenerate, "only warnings: it can generate").toBe(true);
    expect.soft(withWarnings.severity, "and they are warnings").toBe("warning");
    expect
      .soft(withWarnings.validation, "it lists the columns it ignores")
      .toMatch(/Columnas que ignor/);
    expect.soft(withWarnings.validation, 'such as "Columna rara"').toMatch(/Columna rara/);
    expect
      .soft(withWarnings.validation, "it counts rows without cashback")
      .toMatch(/1 fila sin cashback/);

    // 3) The data of those columns reaches the flyer
    const batch = await flyerEditor.generateBatch();
    const acme = batch.drawn.find(({ company }) => company === "Acme");
    const beta = batch.drawn.find(({ company }) => company === "Beta");
    expect.soft(acme?.officer, '"Asesor1_Nombre " reaches the flyer').toBe("Ana Perez");
    expect.soft(acme?.phone, '"Asesor 1 Celular" too').toMatch(/4444 5555/);
    expect.soft(acme?.firstAmount, '"Cashback" gives the amounts').toBeTruthy();
    expect.soft(acme?.noCashback, "that flyer has cashback").toBe(false);
    expect.soft(beta?.noCashback, "the line without cashback comes out without amounts").toBe(true);
    expect
      .soft(
        batch.files.filter((file) => file.endsWith(".pdf")),
        "the ZIP has the three flyers",
      )
      .toHaveLength(3);
    expect.soft(batch.summary, "Resumen.txt has the totals").toMatch(/Filas del Excel: 3/);
    expect.soft(batch.summary, "and who has no cashback").toMatch(/sin cashback.*Beta/);
    expect.soft(batch.summary, "and who has no officers").toMatch(/sin oficiales.*Beta/);
  });

  test("a missing column is explained once", async ({ openApp }) => {
    const { flyerEditor } = await openApp();

    // 4) No cashback column: a warning, it does not stop
    const noCashback = await flyerEditor.uploadExcelSheet([
      ["empresa", "nombre", "celular"],
      ["Acme", "Ana", "11 4444 5555"],
    ]);
    expect
      .soft(noCashback.validation, "no cashback column: it warns")
      .toMatch(NOT_FOUND("del cashback"));
    expect.soft(noCashback.canGenerate, "and lets it generate").toBe(true);

    // 5) No company column: ONE error, not one per row
    const noCompany = await flyerEditor.uploadExcelSheet([
      ["razon", "nombre"],
      ["Acme", "Ana"],
      ["Beta", "Luis"],
      ["Gamma", "Eva"],
    ]);
    expect
      .soft(noCompany.validation, "no company column: one clear message")
      .toMatch(NOT_FOUND("empresa"));
    expect.soft(noCompany.validation, "and not one per row").not.toMatch(/Fila \d/);
    expect.soft(noCompany.canGenerate, "it does not let it generate").toBe(false);
  });

  test("while the batch runs nothing gets mixed", async ({ openApp }) => {
    const { flyerEditor } = await openApp();
    await flyerEditor.loadDownloadLibrary("pdf");
    await flyerEditor.loadDownloadLibrary("zip");
    await flyerEditor.uploadExcelSheet([
      ["empresa", "nombre", "config"],
      ["A", "x", "BAU"],
      ["B", "y", "BAU"],
      ["C", "z", "BAU"],
      ["D", "w", "BAU"],
    ]);

    const during = await flyerEditor.generateBatchAndInterfere();

    expect
      .soft(during.clearNotice, "Limpiar in the middle of the batch is refused")
      .toMatch(/Esper/);
    expect.soft(during.rowsAfterClear, "and the rows stay").toBe(4);
    expect.soft(during.switchNotice, "changing option in the middle is refused").toMatch(/Esper/);
    expect.soft(during.pdfs, "the batch ends with its four rows").toBe(4);
    expect.soft(during.idle, "and then everything is free again").toBe(true);
  });

  test("a row that fails stays in the summary with its row and its reason", async ({ openApp }) => {
    const { flyerEditor } = await openApp();
    await flyerEditor.loadDownloadLibrary("zip");

    const batch = await flyerEditor.generateBatch({
      rows: [
        { cells: { empresa: "Buena 1", config: "BAU", asesor1_nombre: "X" } },
        { cells: { empresa: "Rota", config: "BAU", asesor1_nombre: "Y" }, sheetRow: 7 },
        { cells: { empresa: "Buena 2", config: "BAU", asesor1_nombre: "Z" } },
      ],
      failingCompany: "Rota",
    });

    const pdfs = batch.files.filter((file) => file.endsWith(".pdf"));
    expect.soft(pdfs, "a row that fails does not cut the batch").toHaveLength(2);
    expect
      .soft(
        pdfs.filter((file) => /Rota/.test(file)),
        "and it has no PDF",
      )
      .toEqual([]);
    expect
      .soft(batch.summary, "Resumen.txt names the row and the reason")
      .toMatch(/Fila 7 — Rota: no se pudo dibujar \(falla simulada\)/);
    expect.soft(batch.progress, "the bar counts it").toMatch(/1 no salió/);
    expect.soft(batch.idle, "and the button is free").toBe(true);
  });

  test("the company sheet also reports the real row", async ({ cloud, openApp }) => {
    cloud.setPermissions("asesor", { padron_buscar: true });
    const app = await openApp();

    const { problems } = await app.companyRegistry.validateSheet([
      { cells: { empresa: "Uno", config: "BAU", cuit: "123" }, readerRow: 9 },
    ]);

    expect
      .soft(problems.join(" | "), "importing companies: the tax id warning says row 10")
      .toMatch(/fila 10/);
    expect.soft(app.pageErrors(), "no JavaScript errors").toEqual([]);
  });
});
