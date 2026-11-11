// Rows of the Benchmark tables. Their keys are the columns of the database: contracts.
import { type Cloud, type Row } from "../../support/cloud/index.ts";

const DAY_MS = 86_400_000;
const ARGENTINA_OFFSET_MS = 3 * 3_600_000;

export function daysFromNow(days: number): string {
  return new Date(Date.now() - ARGENTINA_OFFSET_MS + days * DAY_MS).toISOString().slice(0, 10);
}

export function today(): string {
  return daysFromNow(0);
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

interface PromotionFields extends Row {
  k: string;
  banco: string;
  titulo: string;
}

export function promotion(fields: PromotionFields): Row {
  return {
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
    canales: ["instore"],
    segmento: null,
    segmento_txt: null,
    provincias: null,
    fecha_desde: "2026-10-01",
    fecha_hasta: "2027-12-31",
    proximamente: false,
    ...fields,
    marca_clave: fields.titulo.toLowerCase().replace(/[^a-z0-9]/g, ""),
    id: `${fields.banco}:${fields.k}`,
  };
}

/**
 * Supermarkets on a purchase of $150.000: Galicia 25% capped at $10.000, BBVA 20% capped at
 * $30.000 (it wins), Macro 30% capped at $5.000. Pharmacies on $40.000: Galicia 30% capped at
 * $15.000 gives $12.000 (it wins), BBVA 20% capped at $5.000. Plus one that ended, one that
 * starts in months, fuel only at BBVA and installments only at Santander.
 */
export function seedComparison(cloud: Cloud): void {
  cloud.benchmarkPromotions = [
    promotion({
      k: "g1",
      banco: "galicia",
      titulo: "Coto",
      pct: 25,
      tope: 10_000,
      dias: "Martes",
      dias_n: [1],
      provincias: ["CAPITAL FEDERAL", "BUENOS AIRES"],
    }),
    promotion({
      k: "b1",
      banco: "bbva",
      titulo: "Coto",
      pct: 20,
      tope: 30_000,
      provincias: ["CAPITAL FEDERAL"],
    }),
    promotion({
      k: "m1",
      banco: "macro",
      titulo: "Coto",
      pct: 30,
      tope: 5000,
      segmento: "premium",
      segmento_txt: "Macro Selecta",
      provincias: ["CAPITAL FEDERAL"],
    }),
    promotion({
      k: "g2",
      banco: "galicia",
      rubro: "Salud y Bienestar",
      titulo: "Farmacity",
      pct: 30,
      tope: 15_000,
      dias: "Lunes",
      dias_n: [0],
      provincias: [],
    }),
    promotion({
      k: "b2",
      banco: "bbva",
      rubro: "Salud y Bienestar",
      titulo: "Farmacity",
      pct: 20,
      tope: 5000,
      dias: "Lunes",
      dias_n: [0],
      provincias: [],
    }),
    promotion({
      k: "b3",
      banco: "bbva",
      rubro: "Combustible",
      titulo: "YPF",
      pct: 10,
      tope: 8000,
      cuotas: 6,
      debito: true,
      credito: false,
      emisores: [],
      provincias: null,
    }),
    promotion({
      k: "g3",
      banco: "galicia",
      titulo: "Vencida SA",
      pct: 50,
      tope: 99_999,
      fecha_hasta: "2020-01-01",
      provincias: [],
    }),
    promotion({
      k: "g4",
      banco: "galicia",
      titulo: "Proxima SA",
      pct: 50,
      tope: 99_999,
      proximamente: true,
      fecha_desde: "2027-06-01",
      provincias: [],
    }),
    promotion({
      k: "s1",
      banco: "santander",
      titulo: "Fravega",
      rubro: "Electrónica",
      cuotas: 12,
      provincias: [],
    }),
  ];
  cloud.benchmarkBrands = [
    { marca_clave: "ypf", provincias: ["BUENOS AIRES"], localidades: [], imagen: "" },
    { marca_clave: "coto", provincias: ["CAPITAL FEDERAL"], localidades: [], imagen: "modo/9.png" },
  ];
  cloud.benchmarkMeta = [
    { banco: "galicia", last_sync_at: daysAgoIso(0), total: 4, error: null },
    { banco: "bbva", last_sync_at: daysAgoIso(20), total: 3, error: null },
    { banco: "macro", last_sync_at: daysAgoIso(0), total: 1, error: "MODO respondió 500" },
  ];
}

/** Promotions read from the websites of the banks themselves. */
export function seedOwnWebsites(cloud: Cloud): void {
  cloud.benchmarkPromotions.push(
    // The one from MODO (b2) is capped at 5.000.
    promotion({
      k: "bx1",
      banco: "bbva",
      fuente: "bbva",
      rubro: "Salud y Bienestar",
      titulo: "Farmacity",
      pct: 20,
      tope: 8000,
      dias: "Lunes",
      dias_n: [0],
      provincias: [],
    }),
    promotion({
      k: "bx2",
      banco: "bbva",
      fuente: "bbva",
      rubro: "Otros",
      titulo: "Cabify",
      pct: 100,
      tope: null,
      provincias: [],
    }),
    promotion({
      k: "gx1",
      banco: "galicia",
      fuente: "galicia",
      rubro: "Supermercados",
      titulo: "Mas Go",
      cuotas: 18,
      dias: "Todos los días",
      provincias: ["CAPITAL FEDERAL"],
    }),
    promotion({
      k: "bx3",
      banco: "bbva",
      fuente: "bbva",
      rubro: "Supermercados",
      titulo: "Coto",
      cuotas: 12,
      provincias: ["CAPITAL FEDERAL"],
    }),
  );
  cloud.benchmarkMeta.push(
    { banco: "bbva_web", last_sync_at: daysAgoIso(0), total: 2, error: null },
    { banco: "galicia_web", last_sync_at: daysAgoIso(0), total: 2, error: null },
  );
}

/** Promotions of MODO valid with any bank, one starting soon and one starting too late. */
export function seedSharedAndUpcoming(cloud: Cloud): void {
  const shared = {
    k: "sh1",
    rubro: "Combustible",
    titulo: "WICO Combustibles",
    beneficio: "15% de reintegro",
    pct: 50,
    tope: 99_999,
    dias: "Jueves",
    dias_n: [3],
    bancos_n: 5,
    provincias: [],
  };
  cloud.benchmarkPromotions.push(
    promotion({ ...shared, banco: "galicia" }),
    promotion({ ...shared, banco: "bbva" }),
    promotion({
      k: "gp1",
      banco: "galicia",
      fuente: "galicia",
      rubro: "Combustible",
      titulo: "Combustible",
      beneficio: "25% de ahorro.",
      pct: 25,
      tope: 20_000,
      dias: "Martes",
      dias_n: [1],
      proximamente: true,
      fecha_desde: daysFromNow(10),
      provincias: [],
    }),
    promotion({
      k: "gp2",
      banco: "galicia",
      fuente: "galicia",
      rubro: "Combustible",
      titulo: "Shell Lejana",
      pct: 40,
      tope: 50_000,
      proximamente: true,
      fecha_desde: daysFromNow(30),
      provincias: [],
    }),
  );
  cloud.benchmarkMeta.push({
    banco: "santander_web",
    last_sync_at: null,
    total: null,
    error: "Santander bloquea la lectura automática desde la nube (no respondió en 20 s)",
  });
}

/** Levels of Macro Selecta that give back the same, and a website with no place informed. */
export function seedMacroLevels(cloud: Cloud): void {
  const ypf = {
    banco: "macro",
    rubro: "Combustible",
    titulo: "YPF",
    dias: "Miércoles",
    dias_n: [2],
    segmento: "premium",
    bancos_n: 1,
    provincias: [],
  };
  cloud.benchmarkPromotions.push(
    promotion({
      ...ypf,
      k: "mx4",
      beneficio: "30% de reintegro Nivel 4",
      pct: 30,
      tope: 90_000,
      segmento_txt: "Macro Selecta · YPF Selecta Nivel 4",
    }),
    promotion({
      ...ypf,
      k: "mx2",
      beneficio: "30% en YPF Nivel 2",
      pct: 30,
      tope: 30_000,
      segmento_txt: "Macro Selecta · YPF Selecta Nivel 2",
    }),
    promotion({
      ...ypf,
      k: "mxg",
      beneficio: "20% de reintegro",
      pct: 20,
      tope: 10_000,
      segmento_txt:
        "Macro · 20% en YPF Combustible · Los miércoles pagando con Tarjetas de Crédito Visa Platinum Macro",
    }),
    promotion({
      k: "su1",
      banco: "supervielle",
      fuente: "supervielle",
      rubro: "Supermercados",
      titulo: "Dia Prueba",
      pct: 20,
      tope: 12_000,
      provincias: null,
    }),
  );
}

/** One current hand-loaded promotion of Santander and one of Macro that ended. */
export function seedHandLoaded(cloud: Cloud): void {
  const lastMonth = daysAgoIso(40);
  cloud.benchmarkManual = [
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
      provincias: null,
      fecha_desde: "2026-10-01",
      fecha_hasta: "2027-12-31",
      fuente_url: "https://www.santander.com.ar/personas/beneficios",
      notas: "",
      updated_at: lastMonth,
    },
    {
      id: "m2",
      banco: "macro",
      titulo: "Vieja SA",
      rubro: "Otros",
      beneficio: "",
      pct: 10,
      tope: null,
      tope_por: null,
      cuotas: 0,
      dias_n: [],
      credito: true,
      debito: true,
      segmento: null,
      provincias: null,
      fecha_desde: "2026-01-01",
      fecha_hasta: "2026-02-01",
      fuente_url: "",
      notas: "",
      updated_at: lastMonth,
    },
  ];
}

/** A benefit of a package loaded by hand, and Macro read by the assisted load. */
export function seedPackageBenefit(cloud: Cloud): void {
  const recently = daysAgoIso(2);
  cloud.benchmarkManual.push({
    id: "pq1",
    banco: "bbva",
    titulo: "Supermercados",
    rubro: "Supermercados",
    beneficio: "20% todos los días con Visa Signature por NFC",
    pct: 20,
    tope: 100_000,
    tope_por: "month",
    cuotas: 0,
    dias_n: [],
    credito: true,
    debito: false,
    segmento: "premium",
    condicion: "Paquete Black+ All · Visa Signature por NFC",
    provincias: null,
    fecha_desde: "2026-07-01",
    fecha_hasta: "2027-12-31",
    fuente_url: "https://www.bbva.com.ar/personas/productos/paquetes/black-all.html",
    notas: "",
    updated_at: recently,
  });
  cloud.benchmarkMeta.push({
    banco: "macro_web",
    last_sync_at: recently,
    total: 40,
    error: "carga asistida",
  });
}

export function seedSalaryOnly(cloud: Cloud): void {
  const fuel = {
    banco: "galicia",
    fuente: "galicia",
    rubro: "Combustible",
    dias: "Martes",
    dias_n: [1],
    segmento: "premium",
    bancos_n: 1,
    provincias: [],
  };
  cloud.benchmarkPromotions.push(
    promotion({
      ...fuel,
      k: "hb1",
      titulo: "Combustible Haberes",
      pct: 25,
      tope: 20_000,
      segmento_txt: "clientes Haberes Galicia Éminent",
    }),
    promotion({
      ...fuel,
      k: "hb2",
      titulo: "Combustible Eminent",
      pct: 15,
      tope: 15_000,
      segmento_txt: "clientes Galicia Éminent",
    }),
  );
}

function card(fields: Row): Row {
  return {
    paquete: "",
    orden: 0,
    pases_anio: null,
    salas_vip: "",
    fast_pass: "",
    acompanantes: "",
    parking: "",
    seguros: "",
    puntos: "",
    costo: "",
    vigencia: "",
    fuente_url: "",
    confianza: "oficial",
    revisada: "2026-10-28",
    notas: "",
    ...fields,
  };
}

export function seedCards(cloud: Cloud): void {
  cloud.benchmarkCards = [
    card({
      id: "tg1",
      banco: "galicia",
      tarjeta: "Visa Signature",
      paquete: "Éminent",
      orden: 10,
      pases_anio: 4,
      salas_vip: "4 pases por año a salones Visa Airport Companion.",
      fast_pass: "4 Fast Pass por año.",
      fuente_url: "https://www.galicia.ar/personas/tarjetas/beneficios-viajes",
    }),
    card({
      id: "tb1",
      banco: "bbva",
      tarjeta: "Visa Signature + Mastercard Black",
      paquete: "Black+ All",
      orden: 10,
      pases_anio: 20,
      salas_vip:
        "Hasta 20 pases por año: 10 Sala VIP BBVA, 8 Visa Airport Companion y 2 Mastercard.",
      costo: "Mantenimiento mensual $188.000.",
      fuente_url: "https://www.bbva.com.ar/personas/productos/paquetes/black-all.html",
    }),
    card({
      id: "tm1",
      banco: "macro",
      tarjeta: "Visa Signature",
      paquete: "Selecta",
      orden: 10,
      pases_anio: 10,
      salas_vip: "10 pases por año. Desde el 18/11/2026: 6 pases por año calendario.",
      vigencia: "Hasta el 17/11/2026; desde el 18/11/2026, 6 pases.",
      fuente_url: "javascript:alert(1)",
      notas: "<img src=x onerror=alert(2)>",
    }),
    card({
      id: "ts1",
      banco: "supervielle",
      tarjeta: "Mastercard Black",
      paquete: "Identité",
      orden: 20,
      pases_anio: null,
      salas_vip: "La página de la tarjeta no menciona salas VIP.",
      confianza: "sin_dato",
    }),
  ];
}
