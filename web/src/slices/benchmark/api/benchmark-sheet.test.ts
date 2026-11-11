import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { brandIndex, FIRST_FILTERS } from "../model/filters.ts";
import { REFERENCE_DEFAULTS } from "../model/reference.ts";
import type { BenchPromotion } from "../model/rows.ts";
import { type SheetInputs, writeBenchmarkSheet } from "./benchmark-sheet.ts";

const ROWS: readonly BenchPromotion[] = [
  {
    id: "g1",
    banco: "galicia",
    titulo: "Coto",
    marca_clave: "coto",
    rubro: "Supermercados",
    pct: 25,
    tope: 10_000,
  },
  {
    id: "b1",
    banco: "bbva",
    titulo: "Coto",
    marca_clave: "coto",
    rubro: "Supermercados",
    pct: 20,
    tope: 30_000,
  },
];

const INPUTS: SheetInputs = {
  filtered: ROWS,
  filters: { ...FIRST_FILTERS, rubro: "Supermercados" },
  references: REFERENCE_DEFAULTS,
  meta: [{ banco: "galicia", last_sync_at: "2026-10-30T15:00:00Z" }],
  cards: [{ id: "c", banco: "galicia", tarjeta: "Visa Signature", pases_anio: 4 }],
  brands: brandIndex([]),
  today: "2026-10-30",
};

async function written(inputs: SheetInputs) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await writeBenchmarkSheet(ExcelJS, inputs));
  return workbook;
}

describe("the Excel of Benchmark", () => {
  it("has its six sheets, with the same numbers as the screen", async () => {
    const workbook = await written(INPUTS);
    expect(workbook.worksheets.map(({ name }) => name)).toEqual([
      "Resumen",
      "Por rubro",
      "Por marca",
      "Semana",
      "Tarjetas y salas VIP",
      "Promos",
    ]);
    const byRubro = workbook.getWorksheet("Por rubro");
    expect(byRubro?.getRow(1).values).toEqual([
      undefined,
      "Rubro",
      "Compra de referencia",
      "Banco",
      "Promos vigentes",
      "Mejor: devuelve",
      "%",
      "Marca",
      "Tope",
      "Días",
      "Más cuotas sin interés",
      "Marca (cuotas)",
    ]);
    expect(byRubro?.getRow(3).getCell(5).value).toBe(30_000);
    expect(byRubro?.getRow(1).getCell(1).fill).toMatchObject({ fgColor: { argb: "FF14213D" } });
    expect(byRubro?.autoFilter).toBeTruthy();
    expect(workbook.getWorksheet("Promos")?.rowCount).toBe(3);
    expect(workbook.creator).toBe("Armador de flyers");
  });

  it("keeps the filters and the purchases on the summary", async () => {
    const summary = (await written(INPUTS)).getWorksheet("Resumen");
    expect(summary?.getRow(6).values).toEqual([undefined, "Rubro", "Supermercados"]);
    expect(summary?.getRow(11).values).toEqual([undefined, "Supermercados", 150_000]);
    expect(summary?.getRow(11).getCell(2).numFmt).toBe("$#,##0");
    expect(summary?.getRow(1).font).toMatchObject({ bold: true, size: 14 });
  });

  it("an empty sheet has no filter", async () => {
    const workbook = await written({ ...INPUTS, filtered: [], cards: [] });
    expect(workbook.getWorksheet("Promos")?.autoFilter).toBeFalsy();
  });
});
