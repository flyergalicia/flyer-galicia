import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  bringSheetScript,
  downloadSheet,
  readSheetFile,
  SHEET_LIBRARY,
  type SheetApi,
} from "./sheet-library.ts";

async function sheetBytes(lines: readonly (readonly (string | number)[])[]): Promise<Blob> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Hoja1");
  for (const line of lines) sheet.addRow([...line]);
  return new Blob([await book.xlsx.writeBuffer()]);
}

describe("the library of the sheets", () => {
  it("comes down when it is asked for, once", async () => {
    const api = await SHEET_LIBRARY.load();

    expect(SHEET_LIBRARY.isReady()).toBe(true);
    expect(await SHEET_LIBRARY.load()).toBe(api);
    expect(document.querySelectorAll('script[src*="xlsx"]')).toHaveLength(1);
  });

  it("a script that does not come down says so, and leaves nothing behind", async () => {
    const before = document.querySelectorAll("script").length;

    await expect(bringSheetScript("/does-not-exist.js", "")).rejects.toThrow("did not load");

    expect(document.querySelectorAll("script")).toHaveLength(before);
  });

  it("a script that brings something else is not the library", async () => {
    const address = URL.createObjectURL(
      new Blob(["window.XLSX = { read: 1 };"], { type: "text/javascript" }),
    );
    const kept: unknown = Reflect.get(window, "XLSX");
    try {
      await expect(bringSheetScript(address, "")).rejects.toThrow("no library");
    } finally {
      URL.revokeObjectURL(address);
      Reflect.set(window, "XLSX", kept);
    }
  });

  it("reads each row by its headers, as text", async () => {
    const api = await SHEET_LIBRARY.load();
    const bytes = await sheetBytes([
      ["empresa", "cuit", "celular"],
      ["ACME", "30-71111111-9", "11 4444 5555"],
    ]);

    const rows = await readSheetFile(api, bytes);

    expect(rows).toEqual([{ empresa: "ACME", cuit: "30-71111111-9", celular: "11 4444 5555" }]);
  });

  it("no digit of a tax id or a phone changes, even if the cell is a number", async () => {
    const api = await SHEET_LIBRARY.load();
    const bytes = await sheetBytes([
      ["empresa", "cuit", "celular"],
      ["ACME", 30_711_111_119, 1_144_445_555],
    ]);

    const [row] = await readSheetFile(api, bytes);

    expect(row?.cuit).toBe("30711111119");
    expect(row?.celular).toBe("1144445555");
  });

  it("says the row of each one, and an empty cell is an empty text", async () => {
    const api = await SHEET_LIBRARY.load();
    const bytes = await sheetBytes([
      ["empresa", "cuit"],
      ["ACME", ""],
      ["", ""],
      ["BETA", "307"],
    ]);

    const rows = await readSheetFile(api, bytes);

    expect(rows.at(-1)).toEqual({ empresa: "BETA", cuit: "307" });
    expect(Reflect.get(rows.at(-1) ?? {}, "__rowNum__")).toBe(3);
  });

  it("a book without sheets has no rows", async () => {
    const api = await SHEET_LIBRARY.load();
    const fake = { ...api, read: () => ({ SheetNames: [], Sheets: {} }) };

    expect(await readSheetFile(fake, new Blob(["x"]))).toEqual([]);
  });

  it("downloads with its name, its widths and its sheet", async () => {
    const api = await SHEET_LIBRARY.load();
    const written: { name: string; widths: unknown }[] = [];
    const fake: SheetApi = {
      ...api,
      writeFile: (book, name) => {
        written.push({ name, widths: book.Sheets["Hoja"]?.["!cols"] });
      },
    };

    downloadSheet(fake, {
      lines: [["a"], ["b"]],
      widths: [12],
      sheetName: "Hoja",
      fileName: "x.xlsx",
    });

    expect(written).toEqual([{ name: "x.xlsx", widths: [{ wch: 12 }] }]);
  });
});
