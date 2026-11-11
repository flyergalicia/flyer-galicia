// Made-up promotions of Benchmark: every brand and amount is invented.
type Row = Readonly<Record<string, unknown>>;

const DAY_MS = 86_400_000;

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

export function inDays(days: number): string {
  return new Date(Date.now() - 3 * 3_600_000 + days * DAY_MS).toISOString().slice(0, 10);
}

export function promo(k: string, fields: Row & { banco: string; titulo: string }): Row {
  return {
    id: `${fields.banco}:${k}`,
    slug: "",
    rubro: "Supermercados",
    beneficio: "",
    pct: null,
    tope: null,
    tope_por: "month",
    cuotas: 0,
    dias: "Todos los días",
    dias_n: [],
    credito: true,
    debito: false,
    emisores: ["visa", "master"],
    segmento: null,
    segmento_txt: null,
    provincias: null,
    fecha_desde: "2026-01-01",
    fecha_hasta: "2099-12-31",
    proximamente: false,
    marca_clave: fields.titulo.toLowerCase().replace(/[^a-z0-9]/g, ""),
    ...fields,
  };
}

/** Coto: Galicia 25% capped at 10.000, BBVA 20% capped at 30.000. Farmacity: Galicia wins. */
export const PROMOTIONS: readonly Row[] = [
  promo("g1", {
    banco: "galicia",
    titulo: "Coto",
    pct: 25,
    tope: 10_000,
    dias: "Martes",
    dias_n: [1],
    provincias: ["CAPITAL FEDERAL"],
  }),
  promo("b1", {
    banco: "bbva",
    titulo: "Coto",
    slug: "coto-bbva",
    pct: 20,
    tope: 30_000,
    provincias: ["CAPITAL FEDERAL"],
  }),
  promo("b0", {
    banco: "bbva",
    titulo: "Dia",
    pct: 5,
    tope: 1000,
    segmento: "clasico",
    fecha_desde: inDays(3),
    provincias: [],
  }),
  promo("m0", { banco: "macro", titulo: "Sin Lugar", pct: 5, tope: 1000 }),
  promo("m1", {
    banco: "macro",
    titulo: "Coto",
    pct: 30,
    tope: 5000,
    segmento: "premium",
    segmento_txt: "Macro Selecta",
  }),
  promo("g2", {
    banco: "galicia",
    rubro: "Salud y Bienestar",
    titulo: "Farmacity",
    pct: 30,
    tope: 15_000,
    dias: "Lunes",
    dias_n: [0],
    provincias: [],
  }),
  promo("b2", {
    banco: "bbva",
    rubro: "Salud y Bienestar",
    titulo: "Farmacity",
    pct: 20,
    tope: 5000,
    dias: "Lunes",
    dias_n: [0],
    provincias: [],
  }),
  promo("s1", {
    banco: "santander",
    rubro: "Electrónica",
    titulo: "Fravega",
    cuotas: 12,
    provincias: [],
  }),
  promo("g3", {
    banco: "galicia",
    rubro: "Hogar",
    titulo: "Proxima",
    pct: 40,
    proximamente: true,
    fecha_desde: inDays(5),
    provincias: [],
  }),
];

export const BRANDS: readonly Row[] = [
  { marca_clave: "coto", provincias: ["CAPITAL FEDERAL", "BUENOS AIRES"], imagen: "modo/9.png" },
];

export const META: readonly Row[] = [
  { banco: "galicia", last_sync_at: daysAgoIso(0), error: null },
  { banco: "bbva", last_sync_at: daysAgoIso(20), error: null },
];

export const CARDS: readonly Row[] = [
  {
    id: "tg1",
    banco: "galicia",
    tarjeta: "Visa Signature",
    paquete: "Éminent",
    orden: 10,
    pases_anio: 4,
    salas_vip: "4 pases por año.",
    fuente_url: "https://www.galicia.ar/x",
    confianza: "oficial",
    revisada: "2026-10-28",
  },
  {
    id: "tm1",
    banco: "macro",
    tarjeta: "Visa Signature",
    paquete: "Selecta",
    orden: 10,
    pases_anio: 10,
    vigencia: "Hasta el 17/11/2099; desde el 18/11/2099, 6 pases.",
    fuente_url: "javascript:alert(1)",
    notas: "<img src=x onerror=alert(2)>",
    confianza: "sin_dato",
  },
];

export const MANUAL: readonly Row[] = [
  {
    id: "m1",
    banco: "santander",
    titulo: "YPF",
    rubro: "Combustible",
    beneficio: "Pagando con la App YPF",
    pct: 15,
    tope: 20_000,
    tope_por: "month",
    cuotas: 0,
    dias_n: [3],
    credito: true,
    debito: true,
    segmento: "premium",
    condicion: "Paquete Black+ All",
    provincias: null,
    fecha_desde: "2026-01-01",
    fecha_hasta: "2099-12-31",
    fuente_url: "https://www.santander.com.ar/x",
    notas: "Revisar",
    updated_at: daysAgoIso(3),
  },
  {
    id: "m2",
    banco: "macro",
    titulo: "Vieja SA",
    rubro: "Otros",
    pct: 10,
    cuotas: 6,
    tope: 1000,
    tope_por: "week",
    dias_n: [],
    credito: false,
    debito: true,
    segmento: "clasico",
    fecha_desde: "2026-01-01",
    fecha_hasta: "2026-02-01",
  },
];
