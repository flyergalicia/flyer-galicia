import { describe, expect, it } from "vitest";
import {
  type Promotion,
  type PromotionZone,
  promotionZone,
  supermarketIndexOf,
} from "@/shared/domain/promotions/index.ts";
import {
  type BrandFilters,
  daysOfCard,
  filterBrands,
  listInfo,
  MAX_CARDS,
  promotionsOfLogoDetail,
  shortNote,
  untilDate,
  whereChosen,
} from "./brand-filter.ts";
import { EXPIRED_TEXT, markReaderFor, outOfProvinceText } from "./flyer-marks.ts";

const TODAY = new Date(2026, 10, 4);
const NO_FILTERS: BrandFilters = {
  search: "",
  category: "",
  province: "",
  locality: "",
  onePerBrand: false,
  hideOnline: false,
  onlyPercent: false,
};

function promotion(titulo: string, fields: Partial<Promotion> = {}): Promotion {
  return {
    id: `${titulo}${fields.beneficio ?? ""}`,
    titulo,
    subtitulo: "Indumentaria",
    imagen: `${titulo}.png`,
    fecha_hasta: "2099-12-31",
    provincias: ["MENDOZA"],
    beneficio: "10% de ahorro",
    ...fields,
  };
}

function shown(catalog: readonly Promotion[], filters: Partial<BrandFilters> = {}, ids?: string[]) {
  const all = { ...NO_FILTERS, ...filters };
  const supermarkets = supermarketIndexOf(catalog);
  const zone: PromotionZone | null = promotionZone(all.province, all.locality, ids ?? null);
  return filterBrands(catalog, all, ids ?? null, supermarkets, zone, TODAY);
}

function titles(
  catalog: readonly Promotion[],
  filters: Partial<BrandFilters> = {},
  ids?: string[],
) {
  return shown(catalog, filters, ids).list.map(({ titulo }) => titulo);
}

describe("the brands of a window", () => {
  it("leaves out what has no logo, is over or has not started", () => {
    const catalog = [
      promotion("Sin", { imagen: null }),
      promotion("Vieja", { fecha_hasta: "2020-01-01" }),
      promotion("Pronto", { proximamente: true }),
      promotion("Buena"),
    ];
    expect(titles(catalog)).toEqual(["Buena"]);
  });

  it("filters by category and by what is written, in order", () => {
    const catalog = [
      promotion("Zapatos Pepe"),
      promotion("Pepe"),
      promotion("Otra", { subtitulo: "Farmacias" }),
    ];
    expect(titles(catalog, { category: "Farmacias" })).toEqual(["Otra"]);
    expect(titles(catalog, { search: "pepe" })).toEqual(["Pepe", "Zapatos Pepe"]);
    expect(titles(catalog)).toEqual(["Otra", "Pepe", "Zapatos Pepe"]);
  });

  it("with a province, those of the place go first", () => {
    const catalog = [promotion("A online", { provincias: [] }), promotion("B")];
    expect(titles(catalog, { province: "MENDOZA" })).toEqual(["B", "A online"]);
    expect(titles(catalog, { province: "MENDOZA", hideOnline: true })).toEqual(["B"]);
    expect(titles(catalog, { province: "SALTA", hideOnline: true })).toEqual([]);
  });

  it("with a locality, only what Galicia said is there", () => {
    const catalog = [promotion("A", { id: 1 }), promotion("B", { id: 2 })];
    expect(titles(catalog, { province: "MENDOZA", locality: "LUJAN" }, ["2"])).toEqual(["B"]);
  });

  it("each card is one logo: its promotions go together, the best one in front", () => {
    const catalog = [
      promotion("Coto", { beneficio: "12 cuotas", fecha_hasta: "2099-01-01" }),
      promotion("Coto", { beneficio: "25%", fecha_hasta: "2099-12-31" }),
    ];
    const { list, ofLogo } = shown(catalog);
    expect(list).toHaveLength(1);
    expect(list[0]?.beneficio).toBe("25%");
    expect(ofLogo.get("Coto.png")).toHaveLength(2);
  });

  it("joins the branches of a brand, with the tick", () => {
    const catalog = [promotion("Adidas"), promotion("Adidas MDQ")];
    expect(titles(catalog, { onePerBrand: true })).toEqual(["Adidas"]);
    expect(titles(catalog, { onePerBrand: false })).toHaveLength(2);
  });

  it("with the tick of %, only supermarkets with a discount", () => {
    const catalog = [
      promotion("Coto", { subtitulo: "Supermercados", beneficio: "25% de ahorro" }),
      promotion("Disco", { subtitulo: "Supermercados", beneficio: "6 cuotas" }),
      promotion("Adidas"),
    ];
    expect(titles(catalog, { onlyPercent: true })).toEqual(["Coto"]);
  });
});

describe("what a card says", () => {
  const coto = promotion("Coto", {
    subtitulo: "Supermercados",
    beneficio: "Hasta 12 cuotas",
    dias: "Todos los días",
  });
  const discount = promotion("Coto", {
    subtitulo: "Supermercados",
    beneficio: "25% de ahorro",
    dias: "Martes",
  });

  it("the days of the promotion and, if others go on the flyer, which", () => {
    const index = supermarketIndexOf([coto, discount]);
    expect(daysOfCard(coto, index, null)).toBe("Todos los días (en el flyer: Martes)");
    expect(daysOfCard(discount, index, null)).toBe("Martes");
    expect(daysOfCard(promotion("Adidas"), index, null)).toBe("");
    const noOwnDays = { ...discount, dias: null };
    expect(daysOfCard(noOwnDays, supermarketIndexOf([noOwnDays, discount]), null)).toBe(
      "en el flyer: Martes",
    );
  });

  it("the detail of its promotions, with their days", () => {
    expect(promotionsOfLogoDetail([discount, { ...coto, origen: "modo" }])).toBe(
      "25% de ahorro (Martes)\nHasta 12 cuotas (Todos los días) · MODO",
    );
  });

  it("a long note is cut, and the date goes short", () => {
    const long = "x".repeat(80);
    expect(shortNote(promotion("A", { aclaracion: long }))).toHaveLength(68);
    expect(shortNote(promotion("A", { aclaracion: "corta" }))).toBe("corta");
    expect(untilDate(promotion("A", { fecha_hasta: "2099-12-31" }))).toBe("31/12");
    expect(untilDate(promotion("A", { fecha_hasta: null }))).toBe("");
  });

  it("the line over the list says how many and where", () => {
    expect(listInfo(NO_FILTERS, 0)).toBe("");
    expect(listInfo(NO_FILTERS, 1)).toBe("1 marca vigente.");
    expect(listInfo({ ...NO_FILTERS, province: "MENDOZA" }, 2)).toMatch(/2 marcas vigentes en /);
    expect(listInfo(NO_FILTERS, MAX_CARDS + 1)).toMatch(/^Mostrando 60 de 61/);
    expect(whereChosen({ ...NO_FILTERS, province: "MENDOZA", locality: "LUJAN" })).toBe(
      " en Lujan",
    );
  });
});

describe("the marks over the flyer", () => {
  const base = { x: 0, y: 0, w: 1, h: 1, bg: "", t: "", ox: 0, oy: 0, ow: 1, oh: 1 };
  const placed = (img: string, prov?: string) => ({ ...base, img, ...(prov ? { prov } : {}) });

  it("an expired logo, or one that left the catalog; not what does not come from it", () => {
    const marks = markReaderFor(
      [
        promotion("Vieja", { fecha_hasta: "2020-01-01" }),
        promotion("Buena"),
        promotion("Vuelve", { fecha_hasta: "2020-01-01" }),
        promotion("Vuelve", { proximamente: true, fecha_hasta: "2099-01-01" }),
      ],
      TODAY,
    );
    expect(marks.isExpired(placed("Vieja.png"))).toBe(true);
    expect(marks.isExpired(placed("Nunca.png"))).toBe(true);
    expect(marks.isExpired(placed("Buena.png"))).toBe(false);
    expect(marks.isExpired(placed("Vuelve.png"))).toBe(false);
    expect(marks.isExpired(placed("pc:1:a.png"))).toBe(false);
    expect(marks.isExpired(placed("orig:1,2,3,4"))).toBe(false);
    expect(marks.isExpired({ ...base, tipo: "txt", img: "" })).toBe(false);
    expect(EXPIRED_TEXT).toMatch(/Vencida/);
  });

  it("without a catalog nothing is marked: not knowing is not having expired", () => {
    const marks = markReaderFor([], TODAY);
    expect(marks.isExpired(placed("Vieja.png"))).toBe(false);
    expect(marks.isOutOfProvince(placed("Vieja.png", "SALTA"))).toBe(false);
  });

  it("one saved for a province where it has no promotion; expired ones go in red only", () => {
    const marks = markReaderFor(
      [promotion("Buena"), promotion("Vieja", { fecha_hasta: "2020-01-01" })],
      TODAY,
    );
    expect(marks.isOutOfProvince(placed("Buena.png", "SALTA"))).toBe(true);
    expect(marks.isOutOfProvince(placed("Buena.png", "SALTA"))).toBe(true);
    expect(marks.isOutOfProvince(placed("Buena.png", "MENDOZA"))).toBe(false);
    expect(marks.isOutOfProvince(placed("Buena.png"))).toBe(false);
    expect(marks.isOutOfProvince(placed("Vieja.png", "SALTA"))).toBe(false);
    expect(outOfProvinceText(placed("Buena.png", "SALTA"))).toMatch(/Sin promo en Salta/);
  });
});
