// Config → Marcas vigiladas: each flyer with its brands and how they stand, those of MODO included,
// and taking one out. The dates go from today: no test depends on the day it runs.
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { FIRST_PLACE, rememberPlace } from "../model/panel.ts";
import {
  type BucketStore,
  bucketStore,
  type ConfigOptions,
  openConfigSheet,
} from "../testing/config-cloud.ts";

const DAY_MS = 86_400_000;

function fromToday(days: number): string {
  const day = new Date(Date.now() + days * DAY_MS);
  const month = String(day.getMonth() + 1).padStart(2, "0");
  return `${String(day.getFullYear())}-${month}-${String(day.getDate()).padStart(2, "0")}`;
}

const CATALOG = [
  { id: 1, titulo: "Lejana", imagen: "lejana.png", fecha_hasta: fromToday(40) },
  { id: 2, titulo: "Cercana", imagen: "cercana.png", fecha_hasta: fromToday(3) },
  { id: 3, titulo: "Vencida", imagen: "vencida.png", fecha_hasta: fromToday(-5) },
];
const MODO = [
  {
    id: "m1",
    titulo: "Sólo En Modo",
    imagen: "modo/1.png",
    beneficio: "20% de reintegro",
    fecha_hasta: fromToday(60),
    proximamente: false,
  },
];
const WATCHED = {
  opciones: {
    "9": [
      { m: "Lejana", t: "Lejana", img: "lejana.png", origen: "manual" },
      { m: "La cercana", t: "Cercana", img: "cercana.png", origen: "manual" },
      { m: "Vencida", t: "Vencida", img: "vencida.png", origen: "estudio" },
    ],
    "5": [{ m: "Sólo En Modo", t: "Sólo En Modo", origen: "manual" }],
  },
};

const sheet = () => page.getByTestId("admin-watched");
const sections = () => sheet().getByTestId("watched-section");
const brands = () => sheet().getByTestId("watched-row");
const notice = () => page.getByRole("status");

function rowTexts(): string[][] {
  return brands()
    .elements()
    .map((row) => [
      row.querySelector('[data-testid="watched-brand"]')?.textContent ?? "",
      row.querySelector('[data-testid="watched-state"]')?.textContent ?? "",
    ]);
}

async function open(files: BucketStore, options: ConfigOptions = {}) {
  return openConfigSheet("vigiladas", "admin-watched", files, {
    catalog: CATALOG,
    modo: MODO,
    ...options,
  });
}

afterEach(() => {
  rememberPlace(FIRST_PLACE);
  localStorage.removeItem("fg_promos_modo");
});

describe("Config → Marcas vigiladas", () => {
  it("each flyer with its brands and how they stand today; one only on MODO is current", async () => {
    await open(bucketStore({ "_vigilar.json": WATCHED }));
    await expect.poll(() => brands().elements().length).toBe(4);
    expect(
      sections()
        .elements()
        .map((one) => one.querySelector("h4")?.textContent),
    ).toEqual(["Opción 5 (ya no está) 1 marcas", "Combustible 3 marcas · 2 para revisar"]);
    expect(rowTexts()).toEqual([
      ["Sólo En Modo", "Vigente"],
      ["Lejana", "Vigente"],
      ["La cercana (Cercana)", "Vence en 3 días"],
      ["Vencida Estudio", "Sin promo vigente"],
    ]);
  });

  it("with the tick of MODO off, a brand of MODO is still current (invariant 26)", async () => {
    localStorage.setItem("fg_promos_modo", "0");
    await open(bucketStore({ "_vigilar.json": WATCHED }));
    await expect.poll(() => brands().elements().length).toBe(4);
    expect(rowTexts()[0]).toEqual(["Sólo En Modo", "Vigente"]);
  });

  it("the × stops watching that brand, by its logo, for everybody", async () => {
    const files = bucketStore({ "_vigilar.json": WATCHED });
    await open(files);
    await expect.poll(() => brands().elements().length).toBe(4);
    await brands().nth(2).getByRole("button", { name: "Dejar de vigilar" }).click();
    await expect.element(notice()).toHaveTextContent("Listo: esa marca ya no se vigila.");
    await expect.poll(() => brands().elements().length).toBe(3);
    const saved = files.written.findLast(({ file }) => file === "_vigilar.json")?.content;
    expect(saved).toMatchObject({
      opciones: {
        "9": [WATCHED.opciones["9"][0], WATCHED.opciones["9"][2]],
        "5": WATCHED.opciones["5"],
      },
    });
    expect(saved).toHaveProperty("updated_at");
  });

  it("taking one out when the list cannot be read writes nothing and says so (invariant 24)", async () => {
    const files = bucketStore({ "_vigilar.json": WATCHED });
    await open(files);
    await expect.poll(() => brands().elements().length).toBe(4);
    files.dropped.add("_vigilar.json");
    await brands().first().getByRole("button", { name: "Dejar de vigilar" }).click();
    await expect.element(notice()).toHaveTextContent("No se pudo: No se pudo leer la lista");
    expect(files.written).toEqual([]);
    expect(brands().elements()).toHaveLength(4);
  });

  it("a brand that is not on the list anymore saves nothing", async () => {
    const files = bucketStore({ "_vigilar.json": WATCHED });
    await open(files);
    await expect.poll(() => brands().elements().length).toBe(4);
    files.files["_vigilar.json"] = { opciones: { "9": [] } };
    await brands().first().getByRole("button", { name: "Dejar de vigilar" }).click();
    await expect.element(notice()).toHaveTextContent("Listo: esa marca ya no se vigila.");
    expect(files.written).toEqual([]);
  });

  it("without lists, it says there are none yet", async () => {
    const first = await open(bucketStore());
    await expect.element(sheet()).toMatchTextContent(/Todavía no hay marcas vigiladas\./);
    await first.screen.unmount();
    await open(bucketStore({ "_vigilar.json": { opciones: { "9": [] } } }));
    await expect.element(sheet()).toMatchTextContent(/Todavía no hay marcas vigiladas\./);
  });

  it("a list that could not be read is not an empty one (invariant 24)", async () => {
    const files = bucketStore({ "_vigilar.json": WATCHED });
    files.dropped.add("_vigilar.json");
    await open(files);
    await expect
      .element(sheet())
      .toMatchTextContent(/No se pudo leer la lista de marcas vigiladas: sin conexión\./);
    expect(
      sheet()
        .getByText(/Todavía no hay/)
        .elements(),
    ).toHaveLength(0);
    files.dropped.delete("_vigilar.json");
    await sheet().getByRole("button", { name: "Reintentar" }).click();
    await expect.poll(() => brands().elements().length).toBe(4);
  });

  it("without the catalog it does not say how they stand: they are not expired (invariant 24)", async () => {
    await open(bucketStore({ "_vigilar.json": WATCHED }), { catalogFails: true });
    await expect.element(sheet()).toMatchTextContent(/No se pudo leer el catálogo de promociones/);
    expect(brands().elements()).toHaveLength(0);
    expect(sheet().getByText("Sin promo vigente").elements()).toHaveLength(0);
  });
});
