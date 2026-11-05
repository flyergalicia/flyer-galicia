// What the administrator does on Benchmark: the cards, the promotions loaded by hand, Actualizar ahora,
// and the Excel any of them downloads.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { openBenchmark } from "../testing/benchmark-on-screen.tsx";
import { BRANDS, CARDS, MANUAL, META, PROMOTIONS } from "../testing/fixtures.ts";

const root = () => page.getByTestId("benchmark");
const tab = (name: string | RegExp) => root().getByRole("tab", { name });
const button = (name: string | RegExp) => root().getByRole("button", { name, exact: true });
const editor = () => page.getByRole("dialog");
const notice = () => page.getByRole("status");
const rowOf = (text: string) => root().getByRole("row").filter({ hasText: text });

async function openCards(extra: Parameters<typeof openBenchmark>[0] = {}) {
  const opened = await openBenchmark({
    promotions: PROMOTIONS,
    brands: BRANDS,
    meta: META,
    cards: CARDS,
    manual: MANUAL,
    ...extra,
  });
  await tab("Tarjetas y salas VIP").click();
  return opened;
}

function buttonLabels(): string[] {
  return Array.from(
    document.querySelectorAll('[data-testid="benchmark"] button'),
    (one) => one.textContent,
  );
}

/** An answer held until it is released. */
function noAnswerYet(): void {
  // Nothing to release yet.
}

function held(): { readonly until: Promise<void>; readonly release: () => void } {
  let release: () => void = noAnswerYet;
  const until = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { until, release };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("Tarjetas y salas VIP", () => {
  it("summarizes the passes, warns of announced changes and links only https pages", async () => {
    await openCards();
    await expect
      .element(root())
      .toMatchTextContent(
        /Los que más dan: Macro Selecta \(10\), Galicia Éminent \(4\)\. La de Galicia con más pases es Visa Signature \(4\)\./,
      );
    await expect
      .element(root())
      .toMatchTextContent(/Cambios anunciados.*Macro · Visa Signature: cambia el 18\/11\/2099\./);
    const links = Array.from(
      document.querySelectorAll('[data-testid="benchmark"] table a'),
      (link) => link.getAttribute("href"),
    );
    expect(links).toEqual(["https://www.galicia.ar/x"]);
    expect(document.querySelector('[data-testid="benchmark"] img[src="x"]')).toBeNull();
    await expect.element(rowOf("Macro")).toMatchTextContent(/<img src=x onerror=alert\(2\)>/);
    await expect.element(rowOf("Macro")).toMatchTextContent(/Sin dato firme/);
    await expect.element(rowOf("Galicia")).toMatchTextContent(/Página del banco · revisada 28\/10/);
  });

  it("a card without passes says it has no data", async () => {
    await openCards({ cards: [{ id: "a", banco: "bbva", tarjeta: "Black", pases_anio: null }] });
    await expect.element(root()).toMatchTextContent(/BBVA · Blacksin dato/);
    expect(root().element().textContent).not.toMatch(/Los que más dan/);
  });

  it("editing a card saves it as reviewed today and reads the cards again", async () => {
    const { tables } = await openCards();
    await rowOf("Galicia").getByRole("button", { name: "Editar" }).click();
    await expect.element(editor()).toMatchTextContent(/Editar tarjeta/);
    await editor()
      .getByRole("spinbutton", { name: "Pases a salas VIP por año (titular)" })
      .fill("6");
    await editor().getByRole("textbox", { name: "Costo y cómo bonificarlo" }).fill(" Gratis ");
    await editor().getByRole("button", { name: "Guardar" }).click();
    await expect.element(notice()).toHaveTextContent("Guardado.");
    expect(editor().query()).toBeNull();
    expect(tables.cards.find(({ id }) => id === "tg1")).toMatchObject({
      pases_anio: 6,
      costo: "Gratis",
      revisada: new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10),
    });
    await expect
      .element(root())
      .toMatchTextContent(/La de Galicia con más pases es Visa Signature \(6\)\./);
  });

  it("what saving checks keeps the window open and says why", async () => {
    await openCards();
    await button("+ Agregar tarjeta").click();
    await expect.element(editor()).toMatchTextContent(/Agregar tarjeta/);
    await editor().getByRole("button", { name: "Guardar" }).click();
    await expect.element(notice()).toHaveTextContent("Falta el nombre de la tarjeta.");
    await editor().getByRole("textbox", { name: "Tarjeta", exact: true }).fill("Infinite");
    await editor()
      .getByRole("textbox", { name: "Dirección de la página (https://…)" })
      .fill("http://x.com");
    await editor().getByRole("button", { name: "Guardar" }).click();
    await expect
      .element(notice())
      .toHaveTextContent("La dirección de la página tiene que empezar con https://");
    await editor().getByRole("button", { name: "Cancelar" }).click();
    expect(editor().query()).toBeNull();
  });

  it("a new card is added, and removing one asks first", async () => {
    const { tables } = await openCards();
    await button("+ Agregar tarjeta").click();
    await editor().getByRole("combobox", { name: "Banco" }).selectOptions("santander");
    await editor().getByRole("combobox", { name: "De dónde sale" }).selectOptions("nota");
    await editor().getByRole("textbox", { name: "Tarjeta", exact: true }).fill("Infinite");
    await editor().getByRole("button", { name: "Guardar" }).click();
    await expect.element(rowOf("Infinite")).toBeVisible();
    expect(tables.cards.at(-1)).toMatchObject({ banco: "santander", confianza: "nota", orden: 0 });
    await rowOf("Infinite").getByRole("button", { name: "Quitar" }).click();
    const confirm = page.getByRole("alertdialog");
    await expect
      .element(confirm)
      .toMatchTextContent(
        /¿Quitar «Infinite» de Santander\?Se borra de la tabla\. No se puede deshacer\./,
      );
    await confirm.getByRole("button", { name: "Cancelar" }).click();
    expect(tables.cards).toHaveLength(3);
    await rowOf("Infinite").getByRole("button", { name: "Quitar" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Quitar" }).click();
    await vi.waitFor(() => {
      expect(tables.cards).toHaveLength(2);
    });
    await expect.element(root()).not.toMatchTextContent(/Infinite/);
  });

  it("a failure to save or remove says so and nothing changes", async () => {
    await openCards({
      tables: {
        promos_bench_tarjetas: ({ method }) =>
          method === "GET"
            ? jsonResponse(CARDS)
            : jsonResponse({ message: "permiso denegado", code: "42501" }, 403),
      },
    });
    await rowOf("Galicia").getByRole("button", { name: "Editar" }).click();
    await editor().getByRole("button", { name: "Guardar" }).click();
    await expect.element(notice()).toHaveTextContent("No se pudo guardar: permiso denegado");
    await expect.element(editor().getByRole("button", { name: "Guardar" })).toBeEnabled();
    await editor().getByRole("button", { name: "Cancelar" }).click();
    await rowOf("Galicia").getByRole("button", { name: "Quitar" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Quitar" }).click();
    await expect.element(notice()).toHaveTextContent("No se pudo quitar: permiso denegado");
  });

  it("a connection that drops while saving says to check it", async () => {
    await openCards({
      tables: {
        promos_bench_tarjetas: ({ method }) => {
          if (method === "GET") return jsonResponse(CARDS);
          throw new TypeError("Failed to fetch");
        },
      },
    });
    await rowOf("Galicia").getByRole("button", { name: "Editar" }).click();
    await editor().getByRole("button", { name: "Guardar" }).click();
    await expect.element(notice()).toMatchTextContent(/^No se pudo guardar/);
  });

  it("someone who is not an administrator sees the cards without buttons", async () => {
    await openCards({ isAdmin: false });
    await expect.element(rowOf("Galicia")).toBeVisible();
    const labels = buttonLabels();
    for (const label of ["Editar", "Quitar", "+ Agregar tarjeta"])
      expect(labels).not.toContain(label);
    expect(root().element().textContent).not.toMatch(/Vos podés corregir/);
  });

  it("without the table of cards, it asks for the migration; with no cards, how to add one", async () => {
    const { tables } = await openCards({ missing: ["promos_bench_tarjetas"] });
    await expect
      .element(root())
      .toMatchTextContent(/No se pudo leer la tabla de tarjetas¿Está aplicada la migración 042\?/);
    expect(document.querySelector('[data-testid="benchmark"] button')?.textContent).not.toBe(
      "+ Agregar tarjeta",
    );
    tables.missing.clear();
    tables.cards.splice(0);
    await button("Reintentar").click();
    await tab("Tarjetas y salas VIP").click();
    await expect
      .element(root())
      .toMatchTextContent(
        /Todavía no hay tarjetas cargadasAgregá la primera con «\+ Agregar tarjeta»\./,
      );
  });

  it("with no cards, somebody else is told the administrator loads them", async () => {
    await openCards({ isAdmin: false, cards: [] });
    await expect.element(root()).toMatchTextContent(/El administrador las va a cargar\./);
  });
});

describe("Actualizar ahora", () => {
  it("says each step on its button, then what could not be updated, and reads again", async () => {
    const { until: waiting, release } = held();
    const { tables } = await openCards({
      sync: async (body) => {
        if (body["banco"] === "galicia") await waiting;
        if (body["banco"] === "macro")
          return jsonResponse({ data: { resultados: [{ error: "falló" }] } });
        return jsonResponse({ data: { pendientes: 0 } });
      },
    });
    await button("Actualizar ahora").click();
    await expect.element(button("Actualizando Galicia…")).toBeDisabled();
    release();
    await expect.element(notice()).toHaveTextContent("Algo no se pudo actualizar: Macro: falló");
    await expect.element(button("Actualizar ahora")).toBeEnabled();
    expect(tables.calls.map(({ action }) => action)).toEqual([
      "sync",
      "sync",
      "sync",
      "sync",
      "sync",
      "sync",
      "bbva",
      "supervielle",
      "galicia",
      "marcas",
    ]);
    await expect.element(tab("Resumen por rubro")).toBeVisible();
  });

  it("a second press while it works does nothing", async () => {
    const { until: waiting, release } = held();
    const { tables } = await openCards({
      sync: async () => {
        await waiting;
        return jsonResponse({ data: {} });
      },
    });
    await button("Actualizar ahora").click();
    await expect.element(button("Actualizando Galicia…")).toBeVisible();
    button("Actualizando Galicia…")
      .element()
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    release();
    await expect.element(notice()).toHaveTextContent("Benchmark actualizado.");
    expect(tables.calls).toHaveLength(10);
  });
});

describe("the Excel", () => {
  it("comes down with the screen, and says so", async () => {
    const saved: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      if (blob instanceof Blob) saved.push(blob);
      return "blob:benchmark";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    await openCards();
    await button("Descargar Excel").click();
    await expect.element(notice()).toHaveTextContent("Excel descargado.");
    expect(saved).toHaveLength(1);
    await expect.element(button("Descargar Excel")).toBeEnabled();
  });

  it("carries the filters of the screen", async () => {
    const saved: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      if (blob instanceof Blob) saved.push(blob);
      return "blob:benchmark";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    await openCards();
    await page
      .getByTestId("benchmark-filters")
      .getByRole("combobox", { name: "Rubro" })
      .selectOptions("Electrónica");
    await button("Descargar Excel").click();
    await expect.element(notice()).toHaveTextContent("Excel descargado.");
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await (saved[0] ?? new Blob()).arrayBuffer());
    const promotions = workbook.getWorksheet("Promos");
    expect(promotions?.rowCount).toBe(2);
    expect(promotions?.getRow(2).getCell(3).value).toBe("Fravega");
    expect(workbook.getWorksheet("Resumen")?.getRow(6).values).toEqual([
      undefined,
      "Rubro",
      "Electrónica",
    ]);
  });

  it("a failure says so and leaves the button as it was", async () => {
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      throw new Error("sin memoria");
    });
    await openCards();
    await button("Descargar Excel").click();
    await expect
      .element(notice())
      .toHaveTextContent("No se pudo armar el Excel. Revisá la conexión e intentá de nuevo.");
    await expect.element(button("Descargar Excel")).toBeEnabled();
  });
});

async function openPage(extra: Parameters<typeof openBenchmark>[0] = {}) {
  const opened = await openBenchmark({
    promotions: PROMOTIONS,
    manual: MANUAL,
    handLoadedPage: true,
    ...extra,
  });
  await expect.element(root()).toMatchTextContent(/Promos cargadas a mano/);
  return opened;
}

describe("Cargadas a mano, the page shown to nobody", () => {
  it("lists them, the ended one marked, with what each says", async () => {
    await openPage();
    await expect
      .element(rowOf("YPF"))
      .toMatchTextContent(
        /SantanderYPFCombustible15% · tope \$20\.000 por mesPagando con la App YPFPaquete Black\+ AllSólo PremiumJuevesCrédito y Débito/,
      );
    await expect.element(rowOf("YPF")).toMatchTextContent(/Ver página.*act\. \d+\/\d+Revisar/);
    await expect
      .element(rowOf("Vieja SA"))
      .toMatchTextContent(
        /10% · 6 cuotas sin interés · tope \$1\.000 por semana.*Sólo Clásico\/GoldTodos los díasDébitoVencida hasta 1\/2/,
      );
  });

  it("the administrator adds one, and it needs a percent or installments", async () => {
    const { tables } = await openPage();
    await button("+ Agregar promo").click();
    await expect.element(editor()).toMatchTextContent(/Agregar promo/);
    await editor().getByRole("button", { name: "Guardar" }).click();
    await expect.element(notice()).toHaveTextContent("Falta la marca o el comercio.");
    await editor().getByRole("combobox", { name: "Banco" }).selectOptions("macro");
    await editor().getByRole("textbox", { name: "Marca o comercio" }).fill("Changomas");
    await editor().getByRole("button", { name: "Guardar" }).click();
    await expect
      .element(notice())
      .toHaveTextContent("Poné el % de descuento o las cuotas sin interés.");
    await editor().getByRole("spinbutton", { name: "% de descuento o reintegro" }).fill("20");
    await editor().getByRole("spinbutton", { name: "Tope ($)" }).fill("15000");
    await editor().getByRole("combobox", { name: "El tope es" }).selectOptions("month");
    await editor().getByRole("checkbox", { name: "Mi" }).click();
    await editor().getByRole("checkbox", { name: "Lu" }).click();
    await editor().getByRole("checkbox", { name: "Lu" }).click();
    await editor().getByRole("button", { name: "Guardar" }).click();
    await expect.element(notice()).toHaveTextContent("Guardado.");
    expect(tables.manual.at(-1)).toMatchObject({
      banco: "macro",
      titulo: "Changomas",
      pct: 20,
      tope: 15_000,
      tope_por: "month",
      dias_n: [2],
      provincias: null,
      credito: true,
      debito: true,
    });
    await expect.element(rowOf("Changomas")).toMatchTextContent(/Miércoles/);
  });

  it("the condition of a package is edited, and a promotion removed asking first", async () => {
    const { tables } = await openPage();
    await rowOf("YPF").getByRole("button", { name: "Editar" }).click();
    const condition = editor().getByRole("textbox", {
      name: "Condición (ej.: Paquete Black+ All · Visa Signature por NFC)",
    });
    await expect.element(condition).toHaveValue("Paquete Black+ All");
    await condition.fill("Paquete Black+ Travel");
    await editor().getByRole("checkbox", { name: "Crédito" }).click();
    await editor().getByRole("button", { name: "Guardar" }).click();
    await expect.element(notice()).toHaveTextContent("Guardado.");
    expect(tables.manual[0]).toMatchObject({ condicion: "Paquete Black+ Travel", credito: false });
    await rowOf("Vieja SA").getByRole("button", { name: "Quitar" }).click();
    await expect
      .element(page.getByRole("alertdialog"))
      .toMatchTextContent(/¿Quitar «Vieja SA» de Macro\?Se borra de las promos cargadas a mano\./);
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
    expect(tables.manual).toHaveLength(2);
    await rowOf("Vieja SA").getByRole("button", { name: "Quitar" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Quitar" }).click();
    await vi.waitFor(() => {
      expect(tables.manual).toHaveLength(1);
    });
  });

  it("a failure to save or remove says so", async () => {
    await openPage({
      tables: {
        promos_bench_manual: ({ method }) =>
          method === "GET"
            ? jsonResponse(MANUAL)
            : jsonResponse({ message: "permiso denegado", code: "42501" }, 403),
      },
    });
    await rowOf("YPF").getByRole("button", { name: "Editar" }).click();
    await editor().getByRole("button", { name: "Guardar" }).click();
    await expect.element(notice()).toHaveTextContent("No se pudo guardar: permiso denegado");
    await userEvent.keyboard("{Escape}");
    await rowOf("YPF").getByRole("button", { name: "Quitar" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Quitar" }).click();
    await expect.element(notice()).toHaveTextContent("No se pudo quitar: permiso denegado");
  });

  it("somebody else cannot edit; without the table it asks for the migration; empty says so", async () => {
    await openPage({ isAdmin: false });
    const labels = buttonLabels();
    for (const label of ["Editar", "Quitar", "+ Agregar promo"])
      expect(labels).not.toContain(label);
  });

  it("without the table it asks for the migration", async () => {
    await openBenchmark({
      promotions: PROMOTIONS,
      missing: ["promos_bench_manual"],
      handLoadedPage: true,
    });
    await expect
      .element(root())
      .toMatchTextContent(
        /No se pudo leer la tabla de promos cargadas a mano¿Está aplicada la migración 043\?/,
      );
  });

  it("with none, the administrator is told how to add the first", async () => {
    await openBenchmark({ promotions: PROMOTIONS, handLoadedPage: true });
    await expect
      .element(root())
      .toMatchTextContent(
        /Todavía no hay promos cargadas a manoAgregá la primera con «\+ Agregar promo»\./,
      );
  });

  it("with none, somebody else is told the administrator loads them", async () => {
    await openBenchmark({ promotions: PROMOTIONS, handLoadedPage: true, isAdmin: false });
    await expect.element(root()).toMatchTextContent(/El administrador las va a cargar\./);
  });
});
