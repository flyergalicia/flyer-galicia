// Replaces pruebas/u04_benchmark_normalizar.mjs.
import { beforeAll, describe, expect, it } from "vitest";
import { loadEdgeFunctionApi } from "../support/edge-function-source.ts";

type BenchmarkRow = Record<string, unknown>;
type RubroOfBrand = (key: string) => string | undefined;

interface ManualSummary {
  banco: string;
  total: number;
  vencidas: string[];
  porVencer: string[];
}

interface BenchmarkFunction {
  normalizar(card: object, bank: string, today: string, now: string): BenchmarkRow | null;
  segmentoDe(card: object): BenchmarkRow;
  diasIdx(days: string[]): number[];
  diasTexto(days: number[]): string;
  marcaDeCabecera(header: string): string;
  diasBbva(days: string | null): number[];
  normalizarBbva(row: object, rubro: RubroOfBrand, today: string, now: string): BenchmarkRow;
  parsearLegalesGalicia(text: string): BenchmarkRow;
  normalizarGalicia(row: object, detail: object, today: string, now: string): BenchmarkRow;
  rubroDeGalicia(rubro: string): string;
  claveDup(row: BenchmarkRow): string;
  normalizarSupervielle(row: object, rubro: RubroOfBrand, today: string, now: string): BenchmarkRow;
  rubroSupervielle(rubro: string, brand: string, ofBrand: RubroOfBrand): string;
  normalizarSantander(row: object, today: string, now: string): BenchmarkRow;
  rubroSantander(categories: { description: string }[]): string;
  resumenManual(rows: object[], today: string): ManualSummary[];
  topeLegalSupervielle(text: string): BenchmarkRow;
  esMarcaCombustible(brand: string, detail?: string): boolean;
  normalizarMacroWeb(row: object, today: string, now: string): BenchmarkRow | null;
  normalizarIcbcWeb(row: object, today: string, now: string): BenchmarkRow[];
  diasIcbc(text: string): number[];
  finEnTexto(card: object): string | null;
}

const SOURCE_SLICES = [
  { from: "const MODO_RUBROS", to: "// Baja y guarda un banco" },
  { from: "// ── Webs propias", to: "async function rubroPorMarca" },
  { from: "// ── Supervielle: la API abierta", to: "async function jsonCon" },
  { from: "// ── Santander: su buscador", to: "const SAN_HEADERS" },
  { from: "// ── Recordatorio mensual", to: "async function recordatorioManual" },
  { from: "// ── Carga asistida", to: "async function importarWeb" },
];

const FUNCTIONS = [
  "normalizar",
  "segmentoDe",
  "diasIdx",
  "diasTexto",
  "marcaDeCabecera",
  "diasBbva",
  "normalizarBbva",
  "parsearLegalesGalicia",
  "normalizarGalicia",
  "rubroDeGalicia",
  "claveDup",
  "normalizarSupervielle",
  "rubroSupervielle",
  "normalizarSantander",
  "rubroSantander",
  "resumenManual",
  "topeLegalSupervielle",
  "esMarcaCombustible",
  "normalizarMacroWeb",
  "normalizarIcbcWeb",
  "diasIcbc",
  "finEnTexto",
] as const satisfies readonly (keyof BenchmarkFunction)[];

const TODAY = "2026-10-27";
const noBrand: RubroOfBrand = () => undefined;

let api: BenchmarkFunction;

beforeAll(() => {
  api = loadEdgeFunctionApi<BenchmarkFunction>({
    name: "benchmark-sync",
    slices: SOURCE_SLICES,
    prelude: "const BANCOS = { galicia: {}, bbva: {}, macro: {}, supervielle: {}, santander: {} };",
    functions: FUNCTIONS,
  });
});

function normalized(card: object, bank: string, today = TODAY): BenchmarkRow {
  const row = api.normalizar(card, bank, today, "x");
  if (!row) throw new Error("The promotion was discarded");
  return row;
}

/** Real BBVA, 27-oct-2026: 30% back, cap 15.000 a month, Mondays, Master credit, 3 installments. */
const BBVA_CARD = {
  card: {
    benefit: "30% de reintegro",
    validity_place: "Farmacity, Get The Look, Simplicity",
    cashback_cap: "15000",
    participating_bank: "BBVA",
  },
  benefit: {
    id: "abc",
    name: "Grupo Farmacity Lunes",
    publication: {
      slug: "s",
      description: "Disfruta reintegros y cuotas con tu tarjeta BBVA Mastercard",
    },
    conditions: {
      schedule: { start_date: "2026-10-26", stop_date: "2026-11-30", days_of_week: ["monday"] },
      payment_flow: { flows: ["instore", "online"] },
      payment_methods: { methods: [{ type: "credit_card", issuer: "master" }] },
    },
  },
  offer: {
    outcomes: {
      cashback: { amount: 30, amount_type: "percent" },
      financing: { installments: [1, 2, 3].map((number) => ({ type: "sin_interes", number })) },
    },
    limits: { period_cap: { reset_by: "month", amount_by_period: 15000 } },
    categories: ["4"],
  },
  calculated_status: "RUNNING",
};

const withBanks = (list: string[]) => ({
  ...BBVA_CARD,
  offer: { ...BBVA_CARD.offer, requirements: { banks: { list } } },
});

describe("promotions read from MODO", () => {
  describe("a common BBVA one", () => {
    let row: BenchmarkRow;

    beforeAll(() => {
      row = normalized(BBVA_CARD, "bbva", TODAY);
    });

    it("has 30%, capped at 15.000 a month", () => {
      expect(row).toMatchObject({ pct: 30, tope: 15000, tope_por: "month" });
    });

    it("has 3 installments, only on Mondays", () => {
      expect(row).toMatchObject({ cuotas: 3, dias: "Lunes", dias_n: [0] });
    });

    it("is only for Master credit", () => {
      expect.soft(row.credito).toBeTruthy();
      expect.soft(row.debito).toBeFalsy();
      expect.soft(row.emisores).toEqual(["master"]);
    });

    it('has its rubro and "places to complete", because it has a store', () => {
      expect(row).toMatchObject({ rubro: "Salud y Bienestar", provincias: null });
    });

    it("has no segment", () => {
      expect(row.segmento).toBeNull();
    });

    it("has as id bank:benefit.id, since the same promotion can be in two banks", () => {
      expect(row.id).toBe("bbva:abc");
    });
  });

  describe("a Macro Selecta one", () => {
    let row: BenchmarkRow;

    beforeAll(() => {
      row = normalized(
        {
          card: {
            benefit: "30% y hasta 12 CSI Nivel 4",
            validity_place: "CARDON",
            cashback_cap: "0",
            participating_bank: "Macro Selecta",
          },
          benefit: {
            id: "m1",
            name: "CARDON Selecta Nivel 4",
            conditions: {
              schedule: {
                days_of_week: ["monday", "tuesday", "wednesday"],
                stop_date: "2027-03-31",
                start_date: "2026-10-15",
              },
              payment_flow: { flows: ["online"] },
            },
          },
          offer: {
            outcomes: { cashback: { amount: 30, amount_type: "percent" } },
            categories: ["3"],
          },
        },
        "macro",
      );
    });

    it("is premium", () => {
      expect(row.segmento).toBe("premium");
    });

    it("has no cap, 30% and 12 installments read from the text", () => {
      expect(row).toMatchObject({ tope: null, pct: 30, cuotas: 12 });
    });

    it("is valid all over the country if only online, and with no cards listed means all", () => {
      expect.soft(row.provincias).toEqual([]);
      expect.soft(row.credito).toBeTruthy();
      expect.soft(row.debito).toBeTruthy();
    });

    it("writes days the way the flyer does", () => {
      expect(row.dias).toBe("Lunes, martes y miércoles");
    });
  });

  it('calls the 7 days "Todos los días"', () => {
    const week = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

    expect(api.diasTexto(api.diasIdx(week))).toBe("Todos los días");
  });

  it("takes Supervielle Gold as classic", () => {
    expect(api.segmentoDe({ card: { participating_bank: "Supervielle Gold" } }).segmento).toBe(
      "clasico",
    );
  });

  it("takes Supervielle Black as premium", () => {
    expect(api.segmentoDe({ benefit: { name: "Supervielle Black" } }).segmento).toBe("premium");
  });

  it("discards a promotion with no id nor name", () => {
    expect(api.normalizar({ card: {}, benefit: {} }, "bbva", "h", "a")).toBeNull();
  });

  it("saves 1 for one exclusive to a bank, and no data without the list of banks", () => {
    expect.soft(normalized(withBanks(["x"]), "bbva").bancos_n).toBe(1);
    expect.soft(normalized(BBVA_CARD, "bbva").bancos_n).toBeNull();
  });

  it("saves how many banks share one of the participating banks", () => {
    expect(normalized(withBanks(["a", "b", "c", "d", "e"]), "santander").bancos_n).toBe(5);
  });
});

describe("the own web of BBVA", () => {
  it.each([
    ["Supermercados Vea QR Modo 20%", "Supermercados Vea"],
    ["Lazaro 20% y 6 cuotas", "Lazaro"],
    ["Grimoldi 9 cuotas", "Grimoldi"],
    ["Gastronomía 20% NFC", "Gastronomía"],
  ])('takes the brand of "%s" without the %, installments or "QR Modo"', (header, brand) => {
    expect(api.marcaDeCabecera(header)).toBe(brand);
  });

  it("starts days on Monday; all of them or none means every day", () => {
    expect.soft(api.diasBbva("0,1,0,0,0,0,0")).toEqual([1]);
    expect.soft(api.diasBbva("1,1,1,1,1,1,1")).toHaveLength(0);
    expect.soft(api.diasBbva(null)).toHaveLength(0);
  });

  it("reads 20%, 6 installments, cap 50.000, Tuesday, only credit, rubro of the brand", () => {
    const row = api.normalizarBbva(
      {
        id: "88114",
        cabecera: "Lazaro 20% y 6 cuotas",
        fechaDesde: "2026-10-06",
        fechaHasta: "2027-10-27",
        diasPromo: "0,1,0,0,0,0,0",
        montoTope: "50000",
        grupoTarjeta: "Tarjetas de crédito BBVA",
      },
      (key) => (key === "lazaro" ? "Indumentaria" : undefined),
      TODAY,
      "x",
    );

    expect.soft(row).toMatchObject({
      pct: 20,
      cuotas: 6,
      tope: 50000,
      dias: "Martes",
      rubro: "Indumentaria",
      fuente: "bbva",
      id: "bbva:b88114",
    });
    expect.soft(row.credito).toBeTruthy();
    expect.soft(row.debito).toBeFalsy();
  });

  it("reads credit and debit, the rubro by the word of the header, no days as all", () => {
    const row = api.normalizarBbva(
      {
        id: "1",
        cabecera: "Supermercados Vea QR Modo 20%",
        fechaDesde: "2026-07-01",
        fechaHasta: "2026-10-31",
        diasPromo: null,
        montoTope: "25000",
        grupoTarjeta: "Tarjetas de crédito y débito BBVA",
      },
      noBrand,
      TODAY,
      "x",
    );

    expect.soft(row.credito).toBeTruthy();
    expect.soft(row.debito).toBeTruthy();
    expect.soft(row).toMatchObject({ rubro: "Supermercados", dias: "Todos los días" });
  });

  it("gives the same key to a promotion seen by MODO and its web; another % is another one", () => {
    const row = api.normalizarBbva(
      {
        id: "88114",
        cabecera: "Lazaro 20% y 6 cuotas",
        fechaDesde: "2026-10-06",
        fechaHasta: "2027-10-27",
        diasPromo: "0,1,0,0,0,0,0",
        montoTope: "50000",
        grupoTarjeta: "Tarjetas de crédito BBVA",
      },
      (key) => (key === "lazaro" ? "Indumentaria" : undefined),
      TODAY,
      "x",
    );

    expect.soft(api.claveDup(row)).toBe(api.claveDup({ ...row, id: "otro", fuente: "modo" }));
    expect.soft(api.claveDup(row)).not.toBe(api.claveDup({ ...row, pct: 25 }));
  });

  it('takes "Ypf 10%" as fuel although MODO lists the brand under vehicles (YPF Boxes)', () => {
    const row = api.normalizarBbva(
      {
        id: "7",
        cabecera: "Ypf 10%",
        fechaDesde: "2026-10-01",
        fechaHasta: "2026-12-31",
        diasPromo: null,
        montoTope: "30000",
        grupoTarjeta: "Tarjetas de crédito BBVA",
      },
      (key) => (key === "ypf" ? "Vehículos" : undefined),
      "2026-10-28",
      "x",
    );

    expect(row.rubro).toBe("Combustible");
  });

  it('does not take "Estación Central", a shop, as a gas station', () => {
    const row = api.normalizarBbva(
      {
        id: "8",
        cabecera: "Estacion Central 20%",
        fechaDesde: "2026-10-01",
        fechaHasta: "2026-12-31",
        diasPromo: null,
        montoTope: "30000",
        grupoTarjeta: "Tarjetas de crédito BBVA",
      },
      noBrand,
      "2026-10-28",
      "x",
    );

    expect(row.rubro).not.toBe("Combustible");
  });
});

describe("the catalog of Galicia", () => {
  it("takes the cap, 15.000 a month, and the cards from the legal text", () => {
    const legal = api.parsearLegalesGalicia(
      "CARTERA DE CONSUMO. Promoción del 20% de ahorro en compras realizadas, en el país. Tope de reintegro: $15.000 en total por mes. Válida para Viernes comprendidos entre el 20/08/2026 y el 31/10/2026, para compras realizadas con Tarjeta Galicia Débito, Tarjeta Visa, Tarjeta Mastercard y Tarjeta American Express escaneando el QR de MODO desde la app Galicia. No aplica para pagos con dinero en cuenta.",
    );

    expect.soft(legal).toMatchObject({ tope: 15000, por: "month" });
    expect.soft(legal.debito).toBeTruthy();
    expect.soft(legal.credito).toBeTruthy();
    expect.soft(legal.emisores).toEqual(["visa", "master", "american_express"]);
  });

  it('reads an installments promotion with no cap, and "no aplica… Débito" is not debit', () => {
    const legal = api.parsearLegalesGalicia(
      "CARTERA DE CONSUMO. Promoción de hasta 12 cuotas sin interés, para compras realizadas en el País. Válida para todos los días, para compras realizadas con Tarjeta Visa y Tarjeta American Express. No aplica para compras realizadas con tarjetas de Credito Visa Business y Tarjetas de Débito.",
    );

    expect.soft(legal.tope).toBeNull();
    expect.soft(legal.credito).toBeTruthy();
    expect.soft(legal.debito).toBeFalsy();
  });

  it("reads 20%, cap 15.000, Friday and its provinces from the catalog", () => {
    const row = api.normalizarGalicia(
      {
        id: 177749,
        titulo: "Dar",
        subtitulo: "Supermercados",
        beneficio: "20% de ahorro.",
        dias: "Viernes",
        provincias: ["SANTA FE"],
        fecha_desde: "2026-08-20",
        fecha_hasta: "2026-10-31",
        proximamente: false,
      },
      {
        diasAplicacion: "Vi",
        cuotaSinInteresHasta: null,
        legales:
          "Tope de reintegro: $15.000 en total por mes. para compras realizadas con Tarjeta Visa.",
      },
      TODAY,
      "x",
    );

    expect(row).toMatchObject({
      pct: 20,
      tope: 15000,
      dias_n: [4],
      id: "galicia:g177749",
      fuente: "galicia",
      provincias: ["SANTA FE"],
    });
  });

  it('reads 12 installments, the 7 days as all, and "Bares" as Gastronomía', () => {
    const row = api.normalizarGalicia(
      {
        id: 1,
        titulo: "Mas Go",
        subtitulo: "Bares",
        beneficio: "Hasta 12 cuotas sin interés.",
        dias: "Todos los días",
      },
      { diasAplicacion: "Lu;Ma;Mi;Ju;Vi;Sa;Do", cuotaSinInteresHasta: 12, legales: "" },
      TODAY,
      "x",
    );

    expect.soft(row).toMatchObject({ cuotas: 12, pct: null, rubro: "Gastronomía" });
    expect.soft(row.dias_n).toHaveLength(0);
  });

  it('takes "para Clientes Éminent" as premium and "Sin tope" does not make up a cap', () => {
    const legal = api.parsearLegalesGalicia(
      "CARTERA DE CONSUMO. Promoción del 25% de ahorro y hasta 3 cuotas sin interés, en compras realizadas en el País, para Clientes Éminent. Sin tope de reintegro. Válida para Viernes, para compras realizadas con Tarjeta Visa.",
    );

    expect(legal).toMatchObject({ segmento: "premium", tope: null });
  });

  it("gives an upcoming one with no date on the list the date of its detail", () => {
    const row = api.normalizarGalicia(
      {
        id: 9,
        titulo: "Combustible",
        subtitulo: "Combustible",
        beneficio: "25% de ahorro.",
        dias: "Martes",
        fecha_desde: null,
        fecha_hasta: "2026-11-10",
        proximamente: true,
      },
      {
        diasAplicacion: "Ma",
        fechaDesde: "03/11/2026",
        legales: "Tope de reintegro: $20.000 por mes.",
      },
      "2026-10-28",
      "x",
    );

    expect(row).toMatchObject({
      fecha_desde: "2026-11-03",
      proximamente: true,
      pct: 25,
      rubro: "Combustible",
    });
  });

  it("carries its fine rubros to those of MODO", () => {
    expect.soft(api.rubroDeGalicia("Peluquerías")).toBe("Salud y Bienestar");
    expect.soft(api.rubroDeGalicia("Educación")).toBe("Otros");
  });

  it('reads "para Clientes Plus Gold" as classic with its name, and the dates of the text', () => {
    const legal = api.parsearLegalesGalicia(
      "CARTERA DE CONSUMO. Promoción del 15% de ahorro, para compras realizadas en el País, para Clientes Plus Gold. Tope de reintegro: $20.000 por mes. Válida para Martes comprendidos entre el 03/11/2026 y el 24/11/2026, con Tarjeta Visa.",
    );

    expect(legal).toMatchObject({
      segTxt: "Clientes Plus Gold",
      segmento: "clasico",
      desde: "2026-11-03",
      hasta: "2026-11-24",
    });
  });

  it('reads "para Clientes Éminent" as premium with its name', () => {
    const legal = api.parsearLegalesGalicia(
      "CARTERA DE CONSUMO. Promoción del 25% de ahorro, para Clientes Éminent. Tope de reintegro: $20.000 por mes. Válida para Martes, con Tarjeta Visa.",
    );

    expect.soft(legal.segmento).toBe("premium");
    expect.soft(legal.segTxt).toMatch(/minent/);
  });

  it('reads "tope $15.000 en total mientras dure la promoción", a single day', () => {
    const legal = api.parsearLegalesGalicia(
      "Promoción del 15% de ahorro, para clientes Galicia Éminent. Tope de reintegro $15.000 en total mientras dure la promoción, incluye compras de adicionales. Válida para Martes comprendidos entre el 10/11/2026 y el 10/11/2026 para compras realizadas con Tarjeta Mastercard.",
    );

    expect(legal).toMatchObject({
      tope: 15000,
      por: "total",
      desde: "2026-11-10",
      hasta: "2026-11-10",
    });
  });
});

describe("the own web of Supervielle", () => {
  it("reads Shell con MODO as Shell, 10%, cap 10.000, Sundays, only debit, fuel", () => {
    const row = api.normalizarSupervielle(
      {
        dias: ["domingo"],
        cuotas: null,
        rubro: "Combustible",
        marca: "Shell con MODO",
        esTarjetaCredito: false,
        esTarjetaDebito: true,
        tope: 10000,
        esIdentite: false,
        descuento: "10%",
        id: "51009d",
        fechaVigenciaDesde: "2026-08-01",
        fechaVigenciaHasta: "2026-10-31",
      },
      noBrand,
      "2026-10-28",
      "x",
    );

    expect.soft(row).toMatchObject({
      titulo: "Shell",
      pct: 10,
      tope: 10000,
      dias: "Domingos",
      rubro: "Combustible",
      fuente: "supervielle",
    });
    expect.soft(row.credito).toBeFalsy();
    expect.soft(row.debito).toBeTruthy();
  });

  it("reads the 7 days as all, 3 installments, Identité as premium, Farmacia as health", () => {
    const row = api.normalizarSupervielle(
      {
        dias: ["lunes", " martes", " miércoles", " jueves", " viernes", " sábado", " domingo"],
        cuotas: ["3"],
        rubro: "Farmacia",
        marca: "Farmacia Central",
        esTarjetaCredito: true,
        esTarjetaDebito: false,
        tope: null,
        esIdentite: true,
        descuento: "20%",
        id: "x1",
        fechaVigenciaDesde: "2026-10-01",
        fechaVigenciaHasta: "2026-12-31",
      },
      noBrand,
      "2026-10-28",
      "x",
    );

    expect.soft(row.dias_n).toHaveLength(0);
    expect.soft(row).toMatchObject({ cuotas: 3, segmento: "premium", rubro: "Salud y Bienestar" });
  });

  it('takes the cap from the legal text, and "Sin tope" does not make one up', () => {
    const maximum = api.topeLegalSupervielle(
      "El beneficio consistirá en un reintegro del 30%. El importe máximo de reintegro será de $30.000 mensual o hasta agotar stock.",
    );
    const perAccount = api.topeLegalSupervielle(
      "Reintegro del 20% con un tope mensual por cuenta de $15.000 (considerando la suma de los consumos).",
    );
    const none = api.topeLegalSupervielle("Beneficio válido los martes. Sin tope de reintegro.");

    expect.soft(maximum).toMatchObject({ tope: 30000, por: "month" });
    expect.soft(perAccount).toMatchObject({ tope: 15000, por: "month" });
    expect.soft(none.tope).toBeNull();
  });

  it("takes Shell as fuel", () => {
    expect(api.rubroSupervielle("Varios", "Shell", noBrand)).toBe("Combustible");
  });
});

describe("the API of Santander", () => {
  it("reads YPF as 15% Thursdays, cap 20.000 a month, fuel, Select as premium, Visa", () => {
    const row = api.normalizarSantander(
      {
        startDatePublication: "2026-10-01T00:00:00",
        endDatePublication: "2026-10-31T00:00:00",
        id: 7909,
        monday: false,
        tuesday: false,
        wednesday: false,
        thursday: true,
        friday: false,
        saturday: false,
        sunday: false,
        fullWeek: false,
        customerDiscount: 15,
        topAmount: 20000,
        interestFreeFees: false,
        initialQuote: 0,
        finalQuote: 0,
        legal:
          "PARA CLIENTES SUSCRIPTOS AL PROGRAMA SORPRESA SANTANDER. Válido abonando con Tarjeta Santander Visa Débito y Crédito.",
        additionalText: "Pagando únicamente a través de la App YPF.",
        frecuency: { description: "Mensual" },
        tag: { description: "Sorpresa" },
        brands: [{ id: 546, name: "YPF" }],
        categories: [
          { description: "Automotor", code: "AUT" },
          { description: "Combustible", code: "COM" },
          { description: "Select", code: "SEC" },
        ],
        texts: { title: "15% de ahorro", description: "Tope de reintegro: $20.000 mensual" },
      },
      "2026-10-28",
      "x",
    );

    expect.soft(row).toMatchObject({
      titulo: "YPF",
      pct: 15,
      tope: 20000,
      tope_por: "month",
      dias: "Jueves",
      rubro: "Combustible",
      segmento: "premium",
      slug: "brand:546",
    });
    expect.soft(row.credito).toBeTruthy();
    expect.soft(row.debito).toBeTruthy();
    expect.soft(row.emisores).toContain("visa");
  });

  it("takes the rubro from its categories", () => {
    expect
      .soft(api.rubroSantander([{ description: "Automotor" }, { description: "Viajes" }]))
      .toBe("Entretenimiento");
    expect.soft(api.rubroSantander([{ description: "Supermercados" }])).toBe("Supermercados");
  });
});

describe("the reminder of the 5th", () => {
  it("counts by bank those loaded by hand and the expired, and all five banks show up", () => {
    const summary = api.resumenManual(
      [
        { banco: "santander", titulo: "YPF", fecha_hasta: "2026-11-03" },
        { banco: "santander", titulo: "Vieja", fecha_hasta: "2026-10-01" },
        { banco: "macro", titulo: "Changomas", fecha_hasta: "2026-12-31" },
      ],
      "2026-11-05",
    );
    const santander = summary.find(({ banco }) => banco === "santander");
    const macro = summary.find(({ banco }) => banco === "macro");

    expect.soft(santander?.total).toBe(2);
    expect.soft(santander?.vencidas).toEqual(["YPF", "Vieja"]);
    expect.soft(macro?.total).toBe(1);
    expect.soft(macro?.vencidas).toHaveLength(0);
    expect.soft(summary).toHaveLength(5);
  });

  it("warns about those that end in the next 7 days", () => {
    const summary = api.resumenManual(
      [{ banco: "macro", titulo: "Pronto", fecha_hasta: "2026-11-09" }],
      "2026-11-05",
    );

    expect(summary.find(({ banco }) => banco === "macro")?.porVencer).toEqual(["Pronto"]);
  });
});

describe("fuel brands", () => {
  it.each([
    ["YPF", undefined, true],
    ["Shell Full", "", false],
    ["YPF Boxes", undefined, false],
    ["YPF", "cambio de aceite y filtros", false],
    ["Axion Energy", undefined, true],
    ["Estación Central", undefined, false],
  ])("brand %j with detail %j is fuel: %s", (brand, detail, expected) => {
    expect(api.esMarcaCombustible(brand, detail)).toBe(expected);
  });
});

describe("the assisted load of Macro", () => {
  it("reads 12 installments at an automotive shop as vehicles, with no segment", () => {
    const row = api.normalizarMacroWeb(
      {
        comercio: "BRIDGESTONE",
        categoria: "Automotor y Combustible",
        cuotas: "12 cuotas",
        segmento: "General",
      },
      "2026-10-28",
      "x",
    );

    expect(row).toMatchObject({
      cuotas: 12,
      fuente: "macro",
      banco: "macro",
      rubro: "Vehículos",
      segmento: null,
      pct: null,
    });
  });

  it('reads YPF as fuel and "Selecta" as premium', () => {
    const row = api.normalizarMacroWeb(
      {
        comercio: "YPF",
        categoria: "Automotor y Combustible",
        cuotas: "6 cuotas",
        segmento: "Selecta",
      },
      "2026-10-28",
      "x",
    );

    expect(row).toMatchObject({
      rubro: "Combustible",
      segmento: "premium",
      segmento_txt: "Selecta",
    });
  });

  it("does not save one without a shop or without installments nor %", () => {
    expect.soft(api.normalizarMacroWeb({ comercio: "", cuotas: "3" }, "h", "a")).toBeNull();
    expect.soft(api.normalizarMacroWeb({ comercio: "X" }, "h", "a")).toBeNull();
  });

  it("takes Selecta and General of the same shop as different promotions", () => {
    const selecta = api.normalizarMacroWeb(
      { comercio: "A", cuotas: "3", segmento: "Selecta" },
      "h",
      "a",
    );
    const general = api.normalizarMacroWeb(
      { comercio: "A", cuotas: "3", segmento: "General" },
      "h",
      "a",
    );

    expect(selecta?.id).not.toBe(general?.id);
  });
});

const parsedIcbc = (shop: string, text: string, category = "super") =>
  api.normalizarIcbcWeb({ comercio: shop, categoria: category, texto: text }, "2026-10-29", "x");

describe("the page of ICBC", () => {
  it("reads two % as the lower for all and the higher for who gets paid at ICBC", () => {
    const rows = parsedIcbc(
      "CHANGOMAS",
      "M TODOS LOS JUEVES 30% %a SI DEPOSITÁS TU SUELDO EN ICBC 20% %a",
    );

    expect.soft(rows).toHaveLength(2);
    expect.soft(rows[0]).toMatchObject({
      pct: 20,
      segmento_txt: null,
      dias_n: [3],
      rubro: "Supermercados",
    });
    expect.soft(rows[1]).toMatchObject({ pct: 30, segmento_txt: "Cobrando el sueldo en ICBC" });
  });

  it('reads Exclusive Banking as premium and "jueves a domingo" as 4 days', () => {
    const rows = parsedIcbc(
      "KALIMNOS",
      "M JUEVES A DOMINGO 30% %a EXCLUSIVE BANKING 20% %a",
      "resto",
    );

    expect.soft(rows[1]?.segmento).toBe("premium");
    expect.soft(rows[0]).toMatchObject({ dias_n: [3, 4, 5, 6], rubro: "Gastronomía" });
  });

  it("reads only installments, every day", () => {
    const rows = parsedIcbc("THE FOOD MARKET", "TODOS LOS DÍAS HASTA 3 CUOTAS si");

    expect.soft(rows).toHaveLength(1);
    expect.soft(rows[0]).toMatchObject({ pct: null, cuotas: 3 });
    expect.soft(rows[0]?.dias_n).toHaveLength(0);
  });

  it("reads YPF as fuel; a single % with a condition is only for that condition", () => {
    const rows = parsedIcbc("YPF", "M MARTES 15% %a SI DEPOSITÁS TU SUELDO EN ICBC", "auto");

    expect.soft(rows).toHaveLength(1);
    expect.soft(rows[0]).toMatchObject({
      rubro: "Combustible",
      pct: 15,
      segmento_txt: "Cobrando el sueldo en ICBC",
    });
  });

  it('reads days such as "4to finde" and "lunes y miércoles"', () => {
    expect.soft(api.diasIcbc("4TO FINDE DE CADA MES")).toEqual([5, 6]);
    expect.soft(api.diasIcbc("LUNES Y MIÉRCOLES")).toEqual([0, 2]);
  });

  it("does not save one with no shop name", () => {
    expect(parsedIcbc("?", "TODOS LOS DÍAS 30% %a")).toHaveLength(0);
  });
});

describe("dates inside the text of a MODO promotion", () => {
  const LEFTOVER = {
    card: { benefit: "30% en YPF", validity_place: "YPF", participating_bank: "Macro Selecta" },
    benefit: {
      id: "z1",
      name: "YPF Selecta Nivel 4",
      publication: { description: "Del 01/06/2026 al 30/09/2026 con TC Visa Macro Selecta" },
      conditions: {
        schedule: {
          start_date: "2026-06-01",
          stop_date: "2027-03-31",
          days_of_week: ["wednesday"],
        },
      },
    },
    offer: {
      outcomes: { cashback: { amount: 30, amount_type: "percent" } },
      limits: { period_cap: { reset_by: "month", amount_by_period: 90000 } },
      categories: ["3"],
    },
  };
  const NO_DATE_IN_TEXT = {
    ...LEFTOVER,
    benefit: {
      ...LEFTOVER.benefit,
      publication: { description: "Pagando con tarjetas Macro Selecta" },
    },
  };

  it('reads "Del 01/06/2026 al 30/09/2026" as the end of validity', () => {
    expect(api.finEnTexto(LEFTOVER)).toBe("2026-09-30");
  });

  it("lets the text decide if it ends before the date of MODO", () => {
    expect(normalized(LEFTOVER, "macro", "2026-10-29").fecha_hasta).toBe("2026-09-30");
  });

  it("keeps the date of MODO with no date in the text", () => {
    expect(normalized(NO_DATE_IN_TEXT, "macro", "2026-10-29").fecha_hasta).toBe("2027-03-31");
  });
});

function hasCards(body: unknown): body is { cards: object[] } {
  return typeof body === "object" && body !== null && "cards" in body && Array.isArray(body.cards);
}

// Asks MODO for a real page, to find out when its format changes. It only runs with
// FLYER_LIVE_TESTS=1, so `npm test` and CI do not depend on the internet or on MODO.
describe.runIf(process.env.FLYER_LIVE_TESTS === "1")("a real page of each bank of MODO", () => {
  const API = "https://www.modo.com.ar/promos/api/rewards";
  const SLOTS = [
    "web-modo-hub-carrousel_principal",
    "web-modo-hub-destacadas",
    "web-modo-hub-supermercados",
    "web-modo-hub-exclusivas-online",
    "web-modo-hub-promos-financiacion",
    "web-modo-hub-mas-promos",
  ].join(",");
  const BANKS = [
    ["galicia", "88d8705e-2dda-46f9-8411-bb4916af858e"],
    ["bbva", "049ad22b-c0f0-4733-be35-e31256801ce8"],
    ["macro", "6a089c91-a7d3-4199-a578-2132a3733f69"],
    ["supervielle", "54fdfe50-7b7e-4316-bf88-97923d5a8a8d"],
    ["santander", "167504f6-caaf-4ead-b65b-6e6695ae6209"],
  ] as const;

  async function cardsOf(id: string): Promise<object[] | null> {
    const query = new URLSearchParams({
      slot_ids: SLOTS,
      banks: id,
      source: "web_modo",
      origin: "WEB_MODO",
      limit: "100",
      page: "1",
    });
    try {
      const response = await fetch(`${API}/v2/filter?${query.toString()}`, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(20_000),
      });
      const body: unknown = await response.json();
      return hasCards(body) ? body.cards : null;
    } catch {
      return null;
    }
  }

  it.for(BANKS)("reads most promotions of %s", { timeout: 30_000 }, async ([bank, id], context) => {
    const cards = await cardsOf(id);
    if (!cards) {
      context.skip("No internet, or MODO does not respond");
      return;
    }

    const rows = cards
      .map((card) => api.normalizar(card, bank, TODAY, "x"))
      .filter((row) => row !== null);
    const withPercent = rows.filter(({ pct }) => pct !== null && pct !== undefined);

    expect
      .soft(rows.length, "at least 95% can be read")
      .toBeGreaterThanOrEqual(cards.length * 0.95);
    expect
      .soft(withPercent.length, "most bring a % back")
      .toBeGreaterThanOrEqual(rows.length * 0.5);
  });
});
