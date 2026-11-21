import ExcelJS from "exceljs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Promotion, promotionLogoSource } from "@/shared/domain/promotions/index.ts";
import { activeRows, type ResultRow, searchRows } from "../model/result-rows.ts";
import { downloadPromotionsSheet, type SheetRequest } from "./promotions-sheet.ts";

// The smallest PNG there is: a picture of one pixel.
const ONE_PIXEL = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (char) => char.charCodeAt(0),
);

function fileAddress(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : input.toString();
}

const logoSource = (image: string | null | undefined) =>
  promotionLogoSource(image, (file) => `https://bucket.invalid/${file}`);

function promotion(titulo: string, fields: Partial<Promotion> = {}): Promotion {
  return {
    id: titulo,
    titulo,
    subtitulo: "Indumentaria",
    imagen: "logo.png",
    fecha_hasta: "2099-12-31",
    provincias: ["MENDOZA"],
    beneficio: "10% de ahorro",
    ...fields,
  };
}

let saved: Blob[] = [];
let names: string[] = [];

interface Sheet {
  readonly head: string[];
  readonly rows: unknown[][];
  readonly name: string;
  readonly images: number;
}

async function readSaved(): Promise<Sheet> {
  const [blob] = saved;
  if (!blob) throw new Error("No file was saved");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await blob.arrayBuffer());
  const [sheet] = book.worksheets;
  if (!sheet) throw new Error("It has no sheet");
  const lines: unknown[][] = [];
  sheet.eachRow((row) => {
    const { values } = row;
    if (Array.isArray(values)) lines.push(values.slice(1));
  });
  const [head = [], ...rows] = lines;
  return { head: head.map(String), rows, name: sheet.name, images: sheet.getImages().length };
}

async function download(
  rows: readonly ResultRow[],
  options: Partial<SheetRequest> = {},
): Promise<{ notice: ReturnType<typeof vi.fn<(text: string) => void>>; busy: boolean[] }> {
  const notice = vi.fn<(text: string) => void>();
  const busy: boolean[] = [];
  await downloadPromotionsSheet({
    rows,
    isActiveTab: false,
    province: "",
    logoSource,
    notice,
    setBusy: (on) => busy.push(on),
    ...options,
  });
  return { notice, busy };
}

const search = (brands: readonly string[], catalog: readonly Promotion[], province = "") =>
  searchRows(brands, catalog, province, new Date(2026, 9, 1)).rows;

beforeEach(() => {
  saved = [];
  names = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    if (blob instanceof Blob) saved.push(blob);
    return "blob:invented";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function saveName(
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(() => Promise.resolve(new Response(ONE_PIXEL)));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the Excel of Promociones", () => {
  it("on Buscar has the pasted brand, the benefit and the link", async () => {
    const rows = search(
      ["Alfa", "Nada Parecido"],
      [
        promotion("Alfa", {
          id: 5,
          beneficio: "25% de ahorro.",
          aclaracion: "Sólo en caja",
          dias: "Martes",
          primera_vez: new Date().toISOString(),
        }),
      ],
    );

    const { busy } = await download(rows);

    const { head, rows: lines, name, images } = await readSaved();
    expect(name).toBe("Promociones");
    expect(head).toEqual([
      "Logo",
      "Marca (flyer)",
      "Coincidencia en Galicia",
      "Beneficio",
      "Categoría",
      "Dónde",
      "Desde",
      "Hasta",
      "Días",
      "Estado",
      "Origen",
      "En Galicia",
    ]);
    const at = (line: unknown[] | undefined, column: string) => line?.[head.indexOf(column)];
    expect(at(lines[0], "Marca (flyer)")).toBe("Alfa");
    expect(at(lines[0], "Coincidencia en Galicia")).toBe("Alfa (nueva)");
    expect(at(lines[0], "Beneficio")).toBe("25% de ahorro (Sólo en caja)");
    expect(at(lines[0], "Dónde")).toBe("Mendoza");
    expect(at(lines[0], "Hasta")).toBe("31/12/2099");
    expect(at(lines[0], "Días")).toBe("Martes");
    expect(at(lines[0], "Estado")).toBe("Vigente");
    expect(at(lines[0], "Origen")).toBe("Galicia");
    expect(JSON.stringify(at(lines[0], "En Galicia"))).toMatch(
      /beneficios\.galicia\.ar\/promocion\/5/,
    );
    expect(at(lines[1], "Coincidencia en Galicia")).toBe("-");
    expect(at(lines[1], "Estado")).toBe("No encontrada");
    expect(at(lines[1], "En Galicia")).toBe("-");
    expect(images).toBe(1);
    expect(busy).toEqual([true, false]);
    expect(names[0]).toMatch(/^promociones_galicia_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it("on Activas has no pasted brand, and its name says the provinces", async () => {
    const rows = activeRows(
      [
        promotion("Alfa", { provincias: null, subtitulo: "" }),
        promotion("Moda", { id: "m:1", origen: "modo", slug: "moda", provincias: null }),
      ],
      { province: "", locality: "", category: "", localityIds: null },
      new Date(2026, 9, 1),
    );

    await download(rows, { isActiveTab: true, province: "BUENOS AIRES;RIO NEGRO" });

    const { head, rows: lines, name } = await readSaved();
    expect(name).toBe("Promociones activas");
    expect(head).toContain("Promoción");
    expect(head).not.toContain("Marca (flyer)");
    const origin = head.indexOf("Origen");
    expect(lines.map((line) => line[origin])).toEqual(["Galicia", "MODO"]);
    expect(lines[0]?.[head.indexOf("Categoría")]).toBe("-");
    expect(lines[0]?.[head.indexOf("Dónde")]).toBe("-");
    expect(names[0]).toMatch(/^promociones_activas_buenos_aires_rio_negro_/);
  });

  it("a logo with several promotions goes down and in the file only once", async () => {
    const rows = activeRows(
      [promotion("Alfa"), promotion("Beta"), promotion("Sin Logo", { imagen: "" })],
      { province: "", locality: "", category: "", localityIds: null },
      new Date(2026, 9, 1),
    );

    const { notice } = await download(rows);

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect((await readSaved()).images).toBe(2);
    expect(notice).not.toHaveBeenCalled();
  });

  it("logos go down a few at a time, and each one comes from where it lives", async () => {
    const asked: string[] = [];
    let running = 0;
    let most = 0;
    vi.mocked(globalThis.fetch).mockImplementation(async (address) => {
      asked.push(fileAddress(address));
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });
      running -= 1;
      return new Response(ONE_PIXEL);
    });
    const catalog = Array.from({ length: 12 }, (_, at) =>
      promotion(`Marca ${String(at)}`, { imagen: `logo${String(at)}.png` }),
    );
    const rows = activeRows(
      [...catalog, promotion("Moda", { imagen: "modo/9.png" })],
      { province: "", locality: "", category: "", localityIds: null },
      new Date(2026, 9, 1),
    );

    await download(rows);

    expect(most).toBeLessThanOrEqual(6);
    expect(asked).toHaveLength(13);
    expect(asked).toContain("https://bucket.invalid/modo/9.png");
    expect(asked.find((address) => address.endsWith("logo0.png"))).toMatch(/galicia\.ar/);
    expect((await readSaved()).images).toBe(13);
  });

  it("says when a logo could not come, or none, and the data is there", async () => {
    vi.mocked(globalThis.fetch).mockImplementation((address) =>
      Promise.resolve(
        fileAddress(address).endsWith("buena.png")
          ? new Response(ONE_PIXEL)
          : new Response(null, { status: 404 }),
      ),
    );
    const choice = { province: "", locality: "", category: "", localityIds: null };
    const now = new Date(2026, 9, 1);

    const some = await download(
      activeRows(
        [promotion("Buena", { imagen: "buena.png" }), promotion("Mala", { imagen: "mala.png" })],
        choice,
        now,
      ),
    );
    expect(some.notice).toHaveBeenCalledWith("Excel generado; 1 logo(s) no se pudieron descargar.");

    const none = await download(
      activeRows(
        [promotion("Mala", { imagen: "mala.png" }), promotion("Rara", { imagen: "rara.webp" })],
        choice,
        now,
      ),
    );
    expect(none.notice).toHaveBeenCalledWith(
      "Excel generado sin logos (no se pudieron descargar desde Galicia). Los datos están completos.",
    );
  });

  it("over 150 rows it goes without logos, and says why", async () => {
    const catalog = Array.from({ length: 151 }, (_, at) => promotion(`Marca ${String(at)}`));
    const rows = activeRows(
      catalog,
      { province: "", locality: "", category: "", localityIds: null },
      new Date(2026, 9, 1),
    );

    const { notice } = await download(rows);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(notice).toHaveBeenCalledWith(
      "Excel generado sin logos: son 151 filas y bajarlos de a una haría fallar la descarga.",
    );
    expect((await readSaved()).rows).toHaveLength(151);
  });

  it("with nothing to save it says so, and saves nothing", async () => {
    const { notice, busy } = await download([]);
    expect(notice).toHaveBeenCalledWith("No hay filas para exportar con el filtro actual");
    expect(busy).toEqual([]);
    expect(saved).toEqual([]);
  });

  it("a promotion with an unknown status color still paints; what fails says so and frees the button", async () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("El navegador no dejó");
    });
    const rows = search(["Alfa"], [promotion("Alfa")]);
    const { notice, busy } = await download(rows);
    expect(notice).toHaveBeenCalledWith("Error generando el Excel: El navegador no dejó");
    expect(busy).toEqual([true, false]);

    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      // Not an Error: what a library may throw.
      throw "raro";
    });
    const other = await download(rows);
    expect(other.notice).toHaveBeenCalledWith("Error generando el Excel: raro");
  });
});
