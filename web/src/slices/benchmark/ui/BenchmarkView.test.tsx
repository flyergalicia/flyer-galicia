// The tab Benchmark over simulated tables: what it reads, what it says when something fails, the
// filters and each view.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { placeDeskOnPage } from "@/shared/lib/testing/place-desk-on-page.ts";
import { jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { openBenchmark } from "../testing/benchmark-on-screen.tsx";
import { BRANDS, CARDS, MANUAL, META, PROMOTIONS, promo } from "../testing/fixtures.ts";

const root = () => page.getByTestId("benchmark");
const tab = (name: string | RegExp) => root().getByRole("tab", { name });
const button = (name: string | RegExp) => root().getByRole("button", { name });
const filters = () => page.getByTestId("benchmark-filters");
const text = () =>
  (document.querySelector('[data-testid="benchmark"]')?.textContent ?? "").replace(/\s+/g, " ");
const rows = () =>
  Array.from(document.querySelectorAll('[data-testid="benchmark"] table tbody tr'), (row) =>
    (row.textContent ?? "").replace(/\s+/g, " "),
  );

async function openFull(extra: Parameters<typeof openBenchmark>[0] = {}) {
  const opened = await openBenchmark({
    promotions: PROMOTIONS,
    brands: BRANDS,
    meta: META,
    cards: CARDS,
    manual: MANUAL,
    ...extra,
  });
  await expect.element(tab("Resumen por rubro")).toBeVisible();
  return opened;
}

function sources(): string {
  return page.getByTestId("benchmark-sources").element().textContent;
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

describe("from the search of screens", () => {
  it("a view goes there, as its solapa does", async () => {
    await openFull();

    placeDeskOnPage().ask("benchmark", "tarjetas");
    await expect.element(root()).toHaveAttribute("data-view", "tarjetas");
    await expect.element(tab("Tarjetas y salas VIP")).toHaveAttribute("aria-selected", "true");
    placeDeskOnPage().ask("benchmark", "cargadas");
    await expect.element(root()).toHaveAttribute("data-view", "tarjetas");
  });
});

describe("reading", () => {
  it("says it is loading, then shows the summary with the labels of the sources", async () => {
    const { until: waiting, release } = held();
    await openBenchmark({
      promotions: PROMOTIONS,
      meta: META,
      tables: {
        promos_bench_cache: async () => {
          await waiting;
          return jsonResponse(PROMOTIONS);
        },
      },
    });
    await expect.element(root()).toMatchTextContent(/Cargando…Trayendo las promos de cada banco\./);
    expect(root().element().getAttribute("data-loading")).toBe("true");
    release();
    await expect.element(tab("Resumen por rubro")).toBeVisible();
    expect(root().element().getAttribute("data-loading")).toBe("false");
    const labels = page.getByTestId("benchmark-sources").element().querySelectorAll("[data-bank]");
    expect(Array.from(labels, (label) => label.textContent)).toEqual([
      expect.stringMatching(/^Galicia · vía MODO · act\. \d+\/\d+$/),
      expect.stringMatching(/^BBVA · vía MODO · act\. \d+\/\d+$/),
      "Macro · vía MODO · act. sin datos",
      "Supervielle · vía MODO · act. sin datos",
      "Santander · vía MODO · act. sin datos",
      "ICBC · vía MODO · act. sin datos",
    ]);
    expect(labels[1]?.getAttribute("data-stale")).toBe("true");
    expect(labels[0]?.getAttribute("data-stale")).toBe("false");
  });

  it("without the table of promotions it asks for the migration, and Reintentar reads again", async () => {
    const { tables, harness } = await openBenchmark({ missing: ["promos_bench_cache"] });
    await expect
      .element(root())
      .toMatchTextContent(
        /No se pudieron leer las promos del Benchmark\. ¿Está aplicada la migración 039\?/,
      );
    expect(document.querySelector('[role="tablist"]')).toBeNull();
    tables.missing.clear();
    tables.promotions.push(...PROMOTIONS);
    await button("Reintentar").click();
    await expect.element(tab("Resumen por rubro")).toBeVisible();
    expect(harness.network.to("/rest/v1/promos_bench_cache").length).toBeGreaterThan(1);
  });

  it("without promotions it says how to get them: the administrator updates, others wait", async () => {
    await openBenchmark();
    await expect
      .element(root())
      .toMatchTextContent(/Todavía no hay promos de la competenciaTocá «Actualizar ahora»/);
    expect(document.querySelector('[data-testid="benchmark"] button')?.textContent).toBe(
      "Actualizar ahora",
    );
  });

  it("someone who is not an administrator waits for the weekly update and sees no update button", async () => {
    await openBenchmark({ isAdmin: false });
    await expect
      .element(root())
      .toMatchTextContent(
        /Todavía no hay promos de la competenciaSe actualizan una vez por semana\./,
      );
    expect(document.querySelectorAll('[data-testid="benchmark"] button')).toHaveLength(0);
  });

  it("a part that could not be read is said, never shown as empty (invariant 24)", async () => {
    const { tables } = await openFull({
      missing: ["promos_bench_marcas", "promos_bench_manual", "promos_bench_meta"],
    });
    await expect
      .element(page.getByRole("alert").first())
      .toMatchTextContent(/No se pudo leer de dónde sale cada banco ni cuándo se actualizó\./);
    expect(text()).toMatch(/No se pudieron traer los lugares y los logos de las marcas/);
    expect(text()).toMatch(
      /No se pudieron traer las promos cargadas a mano: la comparación sigue sin ellas\./,
    );
    expect(page.getByTestId("benchmark-sources").query()).toBeNull();
    tables.missing.clear();
    await page.getByRole("alert").last().getByRole("button", { name: "Reintentar" }).click();
    await expect.element(page.getByTestId("benchmark-sources")).toBeVisible();
    expect(page.getByRole("alert").query()).toBeNull();
  });

  it("the labels keep the last sources read while it reads again", async () => {
    const { tables } = await openFull({ missing: ["promos_bench_marcas"] });
    const before = sources();
    const { until, release } = held();
    tables.gate = until;
    await page.getByRole("alert").getByRole("button", { name: "Reintentar" }).click();
    await expect.element(root()).toMatchTextContent(/Cargando…/);
    expect(sources()).toBe(before);
    release();
    await expect.element(tab("Resumen por rubro")).toBeVisible();
  });
});

describe("the filters", () => {
  it("a province leaves what is valid there, and warns of what MODO does not place", async () => {
    await openFull();
    await filters().getByRole("combobox", { name: "Provincia" }).selectOptions("BUENOS AIRES");
    await expect
      .element(root())
      .toMatchTextContent(
        /no se muestran las promos de las que MODO no informa dónde valen.*Macro 1/,
      );
    expect(text()).not.toMatch(/\$10\.000 \(25%\)/);
  });

  it("a promotion of a website with no place stays with a province, marked", async () => {
    await openFull({
      promotions: [
        ...PROMOTIONS,
        promo("su", { banco: "supervielle", fuente: "supervielle", titulo: "Dia Prueba", pct: 20 }),
      ],
    });
    expect(text()).not.toMatch(/Zona sin confirmar/);
    await filters().getByRole("combobox", { name: "Provincia" }).selectOptions("CAPITAL FEDERAL");
    await expect
      .element(root())
      .toMatchTextContent(/Dia PruebaZona sin confirmar|Zona sin confirmar/);
    const supervielle = Array.from(
      document.querySelectorAll('[data-testid="benchmark"] td[data-bank="supervielle"]'),
      (cell) => cell.textContent,
    );
    expect(supervielle.join(" ")).toMatch(/Ver promo ↗Zona sin confirmar/);
  });

  it("the rubro, the card of the person and the type of card", async () => {
    await openFull();
    await filters().getByRole("combobox", { name: "Rubro" }).selectOptions("Electrónica");
    await expect.element(root()).toMatchTextContent(/Electrónicacompra de \$50\.000/);
    await filters().getByRole("combobox", { name: "Rubro" }).selectOptions("");
    await filters()
      .getByRole("combobox", { name: "Tarjeta de la persona" })
      .selectOptions("clasico");
    await expect.element(root()).not.toMatchTextContent(/Sólo Selecta/);
    await filters().getByRole("combobox", { name: "Tipo de tarjeta" }).selectOptions("debito");
    await expect.element(root()).toMatchTextContent(/Sin promos con estos filtros/);
  });

  it("Galicia is compared with the bank chosen", async () => {
    await openFull();
    await filters().getByRole("combobox", { name: "Comparar Galicia con" }).selectOptions("macro");
    await expect.element(tab("Galicia vs Macro")).toBeVisible();
    await expect
      .element(page.getByTestId("benchmark-headline"))
      .toHaveTextContent(
        "Contra Macro, en 1 rubros con promos de los dos: Galicia devuelve más en 1, Macro en 0.",
      );
  });

  it("salary-only promotions enter on demand", async () => {
    await openFull({
      promotions: [
        ...PROMOTIONS,
        promo("hb", {
          banco: "galicia",
          titulo: "Sueldo",
          pct: 50,
          segmento: "premium",
          segmento_txt: "clientes Haberes Galicia",
        }),
      ],
    });
    expect(text()).not.toMatch(/Sueldo/);
    await filters()
      .getByRole("checkbox", { name: "Incluir promos para quien cobra el sueldo en el banco" })
      .click();
    await expect.element(root()).toMatchTextContent(/Sólo Haberes Galicia/);
  });

  it("a reference purchase changes on leaving its field, and the browser remembers it", async () => {
    await openFull();
    const field = filters().getByRole("spinbutton", { name: "Supermercados" });
    await field.fill("-20");
    expect(localStorage.getItem("fg_bench_ref")).toBeNull();
    await userEvent.keyboard("{Tab}");
    await expect.element(field).toHaveValue(0);
    expect(JSON.parse(localStorage.getItem("fg_bench_ref") ?? "{}")).toMatchObject({
      Supermercados: 0,
    });
    await field.fill("20000");
    await userEvent.keyboard("{Tab}");
    await expect.element(root()).toMatchTextContent(/compra de \$20\.000/);
  });

  it("without storage the purchases still change", async () => {
    await openFull();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    const field = filters().getByRole("spinbutton", { name: "Resto" });
    await field.fill("70000");
    await userEvent.keyboard("{Tab}");
    await expect.element(root()).toMatchTextContent(/compra de \$70\.000/);
  });

  it("remembered purchases are used from the start; unreadable storage is ignored", async () => {
    localStorage.setItem("fg_bench_ref", JSON.stringify({ Supermercados: 40_000 }));
    await openFull();
    await expect.element(root()).toMatchTextContent(/Supermercadoscompra de \$40\.000/);
  });
});

describe("the views", () => {
  it("are the six tabs: the page of promotions loaded by hand is shown to nobody", async () => {
    await openFull();
    const tabs = Array.from(
      document.querySelectorAll('[data-testid="benchmark"] [role="tab"]'),
      (one) => one.textContent,
    );
    expect(tabs).toEqual([
      "Resumen por rubro",
      "Cara a cara por marca",
      "Semana",
      "Por comercio",
      "Galicia vs BBVA",
      "Tarjetas y salas VIP",
    ]);
    expect(text()).not.toMatch(/Promos cargadas a mano|Es día de revisar/);
    await expect.element(tab("Resumen por rubro")).toHaveAttribute("aria-selected", "true");
    expect(root().element().getAttribute("data-view")).toBe("rubro");
  });

  it("Resumen por rubro: who gives back the most, the installments apart and the bars", async () => {
    await openFull();
    await expect
      .element(page.getByTestId("benchmark-headline"))
      .toHaveTextContent(
        "Contra BBVA, en 2 rubros con promos de los dos: Galicia devuelve más en 1, BBVA en 1.",
      );
    const supermarkets = rows().find((row) => row.startsWith("Supermercados"));
    expect(supermarkets).toMatch(/\$10\.000 \(25%\)Cototope \$10\.000 por mes · Martes/);
    expect(supermarkets).toMatch(/Sólo Selecta/);
    expect(supermarkets).toMatch(/2 promos/);
    expect(rows()).toContainEqual(
      expect.stringMatching(/^Más cuotas sin interés.*12 cuotasFravega/),
    );
    expect(text()).toMatch(/Empieza el/);
    expect(document.querySelectorAll('[data-wins="true"]').length).toBeGreaterThan(0);
  });

  it("Cara a cara: losses first, the pills filter, and the search waits for the typing", async () => {
    await openFull();
    await tab("Cara a cara por marca").click();
    await expect.element(root()).toMatchTextContent(/CotoBBVA gana/);
    expect(document.querySelector('[data-part="brand"] img')?.getAttribute("src")).toMatch(
      /modo\/9\.png$/,
    );
    await button(/^Perdemos/).click();
    await expect.element(button(/^Perdemos/)).toHaveAttribute("aria-pressed", "true");
    expect(rows()).toHaveLength(1);
    await button("Todas").click();
    await root().getByRole("searchbox", { name: "Buscar una marca" }).fill("farma");
    await vi.waitFor(() => {
      expect(rows()).toHaveLength(1);
    });
    expect(rows()[0]).toMatch(/^ ?FarmacityGalicia gana/);
    await root().getByRole("searchbox", { name: "Buscar una marca" }).fill("zzz");
    await expect
      .element(root())
      .toMatchTextContent(/No hay marcas para comparar con estos filtros/);
    await root().getByRole("searchbox", { name: "Buscar una marca" }).fill("");
    await root().getByRole("checkbox", { name: "Sólo marcas donde se puede comparar" }).click();
    await vi.waitFor(() => {
      expect(rows().some((row) => row.startsWith("Fravega"))).toBe(true);
    });
  });

  it("Cara a cara draws 250 brands at most and says so", async () => {
    const many = Array.from({ length: 251 }, (_unused, index) => [
      promo(`g${String(index)}`, { banco: "galicia", titulo: `Marca ${String(index)}`, pct: 10 }),
      promo(`b${String(index)}`, { banco: "bbva", titulo: `Marca ${String(index)}`, pct: 5 }),
    ]).flat();
    await openFull({ promotions: many });
    await tab("Cara a cara por marca").click();
    await expect.element(root()).toMatchTextContent(/Se muestran las primeras 250 de 251 marcas\./);
    expect(rows()).toHaveLength(250);
  });

  it("Semana: a row per day, and all the promotions of a bank on a day", async () => {
    await openFull();
    await tab("Semana").click();
    await expect.element(root()).toMatchTextContent(/La mejor promo de cada banco, día por día/);
    const firstCells = Array.from(
      document.querySelectorAll('[data-testid="benchmark"] table tbody tr td:first-child'),
      (cell) => cell.textContent,
    );
    expect(firstCells).toEqual([
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado",
      "Domingo",
    ]);
    await button("Ver las 3 promos").first().click();
    const listing = page.getByTestId("benchmark-day-listing");
    await expect.element(listing).toMatchTextContent(/^BBVA · Lunes: 3 promos/);
    await expect
      .element(listing)
      .toMatchTextContent(
        /CotoSupermercados\$30\.000tope \$30\.000 por mesTodos los díasVer promo ↗/,
      );
    await expect.element(listing).toMatchTextContent(/Sólo Clásico\/GoldEmpieza el/);
    expect(listing.element().querySelector("a")?.getAttribute("href")).toBe(
      "https://www.modo.com.ar/promos/coto-bbva",
    );
    await listing.getByRole("button", { name: "Cerrar" }).click();
    expect(listing.query()).toBeNull();
  });

  it("Semana with no promotions says so", async () => {
    await openFull({ manual: [] });
    await filters().getByRole("combobox", { name: "Tipo de tarjeta" }).selectOptions("debito");
    await tab("Semana").click();
    await expect.element(root()).toMatchTextContent(/Sin promos con estos filtros$/);
  });

  it("Por comercio: asks for a name, finds by day, and says when there are none", async () => {
    await openFull();
    await tab("Por comercio").click();
    const results = page.getByTestId("merchant-results");
    await expect.element(results).toMatchTextContent(/Escribí el nombre de un comercio/);
    await root().getByRole("combobox", { name: "Día" }).selectOptions("-1");
    await root().getByRole("textbox", { name: "Comercio" }).fill("coto");
    await expect
      .element(results)
      .toMatchTextContent(
        /La que más devuelve: BBVA · Coto — \$30\.000 en una compra de referencia/,
      );
    await root().getByRole("combobox", { name: "Día" }).selectOptions("3");
    await expect.element(results).toMatchTextContent(/La que más devuelve el jueves:/);
    await root().getByRole("textbox", { name: "Comercio" }).fill("fravega");
    await expect.element(results).toMatchTextContent(/12 cuotas sin interés/);
    expect(results.element().textContent).not.toMatch(/La que más devuelve/);
    await root().getByRole("textbox", { name: "Comercio" }).fill("zzzz");
    await expect
      .element(results)
      .toMatchTextContent(/No hay promos para «zzzz»Probá con «Cualquier día»/);
    await root().getByRole("combobox", { name: "Día" }).selectOptions("-1");
    await expect.element(results).toMatchTextContent(/Probá con otro nombre/);
  });

  it("Galicia vs BBVA: where we are strong and where they beat us, rubro by rubro", async () => {
    await openFull();
    await tab("Galicia vs BBVA").click();
    await expect
      .element(root())
      .toMatchTextContent(
        /Farmacity: Galicia devuelve \$12\.000 \(30 %, tope \$15\.000 por mes, lunes\) contra \$5\.000/,
      );
    expect(text()).toMatch(/Dónde nos ganan.*Coto: Galicia devuelve \$10\.000/);
    expect(text()).toMatch(/Supermercados \(compra de \$150\.000\): gana BBVA/);
    expect(text()).toMatch(/Salud y Bienestar \(compra de \$40\.000\): gana Galicia/);
    expect(text()).toMatch(/Galicia 0 cuotas|Galicia ninguna, BBVA ninguna|Sin promos de cuotas/);
  });

  it("Galicia vs a bank with nothing in common says so", async () => {
    await openFull();
    await filters().getByRole("combobox", { name: "Comparar Galicia con" }).selectOptions("icbc");
    await tab("Galicia vs ICBC").click();
    await expect
      .element(root())
      .toMatchTextContent(/No hay marcas con promo de los dos bancos a la vez\./);
    expect(text()).toMatch(/Con estos filtros no hay una marca donde Galicia devuelva más\./);
    expect(text()).toMatch(/Con estos filtros no hay una marca donde ICBC devuelva más\./);
    expect(text()).toMatch(/Supermercados: sólo Galicia tiene promos con reintegro/);
  });

  it("of the promotions valid with any bank, eight are listed and the rest counted", async () => {
    const shared = Array.from({ length: 10 }, (_unused, index) =>
      promo(`sh${String(index)}`, {
        banco: "galicia",
        titulo: `Red ${String(index)}`,
        pct: index,
        bancos_n: 3,
      }),
    );
    await openFull({ promotions: [...PROMOTIONS, ...shared] });
    const box = page.getByTestId("benchmark-shared");
    await expect.element(box).toMatchTextContent(/Y 2 más\.$/);
    expect(box.element().querySelectorAll("li")).toHaveLength(8);
    expect(box.element().querySelector("li")?.textContent).toBe("Red 9: 9% · Todos los días");
  });

  it("promotions valid with any bank go apart, once", async () => {
    const shared = {
      rubro: "Combustible",
      titulo: "Red Uno",
      beneficio: "15% de reintegro",
      pct: 15,
      tope: 5000,
      dias: "Jueves",
      bancos_n: 5,
    };
    await openFull({
      promotions: [
        ...PROMOTIONS,
        promo("sh", { ...shared, banco: "galicia" }),
        promo("sh", { ...shared, banco: "bbva" }),
      ],
    });
    await expect
      .element(page.getByTestId("benchmark-shared"))
      .toMatchTextContent(
        /Con MODO y cualquier banco.*Red Uno: 15% de reintegro, tope \$5\.000 por mes · Jueves$/,
      );
  });

  it("Galicia vs X lists six brands of each side, tells the rest, and compares installments", async () => {
    const pairs = Array.from({ length: 8 }, (_unused, index) => [
      promo(`gw${String(index)}`, {
        banco: "galicia",
        titulo: `Gana ${String(index)}`,
        pct: 20 + index,
      }),
      promo(`bw${String(index)}`, { banco: "bbva", titulo: `Gana ${String(index)}`, pct: 10 }),
      promo(`gl${String(index)}`, {
        banco: "galicia",
        rubro: "Hogar",
        titulo: `Pierde ${String(index)}`,
        pct: 5,
      }),
      promo(`bl${String(index)}`, {
        banco: "bbva",
        rubro: "Hogar",
        titulo: `Pierde ${String(index)}`,
        pct: 10 + index,
      }),
    ]).flat();
    await openFull({
      promotions: [
        ...pairs,
        promo("gt", { banco: "galicia", rubro: "Viajes", titulo: "Empata", pct: 10 }),
        promo("bt", { banco: "bbva", rubro: "Viajes", titulo: "Empata", pct: 10 }),
        promo("gc", { banco: "galicia", rubro: "Viajes", titulo: "Cuotas G", cuotas: 6 }),
        promo("bc", { banco: "bbva", rubro: "Viajes", titulo: "Cuotas B", cuotas: 12 }),
        promo("gc2", { banco: "galicia", titulo: "Mas Cuotas", cuotas: 18 }),
        promo("bc2", { banco: "bbva", rubro: "Hogar", titulo: "Pocas", cuotas: 3 }),
      ],
      manual: [],
    });
    await tab("Galicia vs BBVA").click();
    await expect
      .element(root())
      .toMatchTextContent(/Y 2 marcas más\. Están todas en «Cara a cara por marca»\./);
    expect(text()).toMatch(/Dónde nos ganan.*Y 2 marcas más\.Rubro por rubro/);
    expect(text()).toMatch(/y empatan en 1\./);
    expect(text()).toMatch(/Viajes \(compra de \$50\.000\): empatan/);
    expect(text()).toMatch(
      /Viajes: Galicia 6 cuotas \(Cuotas G\), BBVA 12 cuotas \(Cuotas B\) · más cuotas BBVA/,
    );
    expect(text()).toMatch(
      /Supermercados: Galicia 18 cuotas \(Mas Cuotas\), BBVA ninguna · más cuotas Galicia/,
    );
    expect(text()).toMatch(/Hogar: Galicia ninguna, BBVA 3 cuotas \(Pocas\) · más cuotas BBVA/);
    expect(text()).toMatch(/Por rubro, Galicia gana en 1 y BBVA en 1\./);
  });

  it("Galicia vs X with only installments says there are no rubros with a refund", async () => {
    await openFull({
      promotions: [
        promo("gc", { banco: "galicia", rubro: "Viajes", titulo: "Cuotas G", cuotas: 6 }),
        promo("bc", { banco: "bbva", rubro: "Viajes", titulo: "Cuotas G", cuotas: 6 }),
      ],
      manual: [],
    });
    await tab("Galicia vs BBVA").click();
    await expect.element(root()).toMatchTextContent(/Sin rubros con reintegro\./);
    expect(text()).toMatch(
      /Viajes: Galicia 6 cuotas \(Cuotas G\), BBVA 6 cuotas \(Cuotas G\)Es un borrador/,
    );
  });

  it("without filters that leave anything, Galicia vs X says so", async () => {
    await openFull({ manual: [] });
    await filters().getByRole("combobox", { name: "Tipo de tarjeta" }).selectOptions("debito");
    await tab("Galicia vs BBVA").click();
    await expect.element(root()).toMatchTextContent(/Sin promos con estos filtros$/);
  });
});

describe("its hooks", () => {
  it("fail outside the screen of Benchmark", async () => {
    const { useBenchmark, useBenchmarkActions } = await import("../model/benchmark-context.ts");
    const { render } = await import("vitest-browser-react");
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    function Reads() {
      useBenchmark();
      return null;
    }
    function Acts() {
      useBenchmarkActions();
      return null;
    }
    await expect(render(<Reads />)).rejects.toThrow(/needs the screen of Benchmark/);
    await expect(render(<Acts />)).rejects.toThrow(/needs the screen of Benchmark/);
    errors.mockRestore();
  });
});
