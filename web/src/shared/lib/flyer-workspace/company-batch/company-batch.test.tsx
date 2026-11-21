import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { type Company, DEFAULT_CASHBACK_CONFIGS } from "@/shared/domain/company-registry/index.ts";
import { sanitizeFlyerOptions } from "@/shared/domain/flyer-options.ts";
import { EMPTY_FLYER_SLOT, flyerSlotReducer } from "@/shared/flyer-engine/index.ts";
import { NO_LOGOS, paintedCanvas, testScene } from "@/shared/flyer-engine/testing/test-scene.ts";
import {
  batchObservations,
  companyBatchPlan,
  companyBatchQuestion,
  type CompanyBatchReport,
  type CompanyBatchRun,
  companyBatchSummary,
  type LabelRules,
  namesText,
  runCompanyBatch,
} from "./company-batch.ts";

const OPTIONS = sanitizeFlyerOptions([
  { n: 9, nombre: "Combustible", solapa: "flyer" },
  { n: 10, nombre: "Sin cashback", solapa: "flyer", sinCB: 9 },
  { n: 8, nombre: "Rubro", solapa: "rubros" },
  { n: 7, nombre: "Roto", solapa: "flyer" },
]);
const RULES: LabelRules = {
  options: OPTIONS,
  tabLabel: (tab) => (tab === "rubros" ? "Flyer Rubros" : "Flyer Galicia"),
};
const SCENE = testScene({ art: paintedCanvas(124, 646) });
const NAMES = DEFAULT_CASHBACK_CONFIGS.map(({ nombre }) => nombre);

function company(empresa: string, fields: Partial<Company> = {}): Company {
  return {
    empresa,
    cuits: [],
    config: "BAU",
    asesores: [{ nombre: "Ana", celular: "", email: "a@x.com" }],
    rubro: { opcion: 0, importe: "", importe2: "", txt: "" },
    ...fields,
  };
}

function optionOf({ empresa }: Company): number {
  if (empresa.startsWith("rubro")) return 8;
  if (empresa.startsWith("sin")) return 10;
  if (empresa.startsWith("rota")) return 7;
  if (empresa.startsWith("prohibida")) return -8;
  if (empresa.startsWith("nada")) return 0;
  return 9;
}

function runOf(companies: readonly Company[], fields: Partial<CompanyBatchRun> = {}) {
  const plan = companyBatchPlan(companies, optionOf, RULES);
  let state = { slot: EMPTY_FLYER_SLOT, legal: "" };
  const onProgress = vi.fn<CompanyBatchRun["onProgress"]>();
  const goTo = vi.fn<CompanyBatchRun["goTo"]>((option) => {
    const slot = flyerSlotReducer(EMPTY_FLYER_SLOT, { type: "selected", option });
    state = {
      slot: flyerSlotReducer(
        slot,
        option === 7
          ? { type: "failed", option, reason: "network" }
          : { type: "loaded", option, scene: SCENE },
      ),
      legal: `Legal ${String(option)}`,
    };
    return Promise.resolve();
  });
  const run: CompanyBatchRun = {
    plan,
    format: "pdf",
    zipBase: "Flyers_Empresas",
    rules: RULES,
    configs: DEFAULT_CASHBACK_CONFIGS,
    names: NAMES,
    formCap: "$24.000",
    logos: NO_LOGOS,
    readState: () => state,
    goTo,
    onProgress,
    ...fields,
  };
  return { run, plan, goTo, onProgress };
}

async function entriesOf(blob: Blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const names = Object.keys(zip.files).filter((name) => !zip.files[name]?.dir);
  return { names, summary: (await zip.file("Resumen.txt")?.async("string")) ?? "" };
}

async function finished(run: CompanyBatchRun) {
  const outcome = await runCompanyBatch(run);
  if (!outcome.zip?.ok) throw new Error("There is no ZIP");
  return { ...outcome, ...(await entriesOf(outcome.zip.value)) };
}

const REPORT: CompanyBatchReport = {
  total: 1,
  format: "pdf",
  date: new Date(),
  zipName: "x.zip",
  perOption: [
    { label: "Flyer Galicia · Combustible", count: 1, folder: "Flyer Galicia - Combustible" },
  ],
  noOfficers: [],
  noCashback: [],
  noCap: [],
  leftOut: [],
  failed: [],
};

describe("the plan of a batch of companies", () => {
  it("puts each flyer's together and says who stays out and why", () => {
    const plan = companyBatchPlan(
      [company("a"), company("rubro 1"), company("b"), company("prohibida"), company("nada")],
      optionOf,
      RULES,
    );
    expect(plan.rows.map(({ company: { empresa }, option }) => [empresa, option])).toEqual([
      ["a", 9],
      ["b", 9],
      ["rubro 1", 8],
    ]);
    expect(plan.perOption).toEqual(
      new Map([
        [9, 2],
        [8, 1],
      ]),
    );
    expect(plan.leftOut).toEqual([
      "prohibida (rubro Rubro no habilitado)",
      "nada (sin opción habilitada)",
    ]);
  });

  it("asks saying how many go on which flyer", () => {
    const plan = companyBatchPlan([company("a"), company("rubro"), company("b")], optionOf, RULES);
    expect(companyBatchQuestion(plan, RULES)).toBe(
      "Se van a generar 3 flyers:\n• 2 en Flyer Galicia · Combustible\n• 1 en Flyer Rubros · Rubro",
    );
  });

  it("names the first ones that stay out, and says there are more", () => {
    const plan = companyBatchPlan(
      [company("a"), ...["1", "2", "3", "4", "5"].map((n) => company(`nada ${n}`))],
      optionOf,
      RULES,
    );
    const text = companyBatchQuestion(plan, RULES);
    expect(text).toContain("\n\n5 quedan afuera:\n• nada 1 (sin opción habilitada)");
    expect(text).toMatch(/nada 4 \(sin opción habilitada\)\n• …$/);
    expect(text).not.toContain("nada 5");
  });
});

describe("a batch of companies", () => {
  it("comes out in one folder per flyer, with Resumen.txt", async () => {
    const { names, summary, report } = await finished(
      runOf([
        company("a"),
        company("rubro 1", { rubro: { opcion: 8, importe: "24000", importe2: "", txt: "" } }),
        company("a"),
      ]).run,
    );
    expect(names.toSorted()).toEqual([
      "Flyer Galicia - Combustible/Flyer a (2).pdf",
      "Flyer Galicia - Combustible/Flyer a.pdf",
      "Flyer Rubros - Rubro/Flyer rubro 1.pdf",
      "Resumen.txt",
    ]);
    expect(report.total).toBe(3);
    expect(report.zipName).toMatch(/^Flyers_Empresas_\d{4}-\d{2}-\d{2}\.zip$/);
    expect(summary).toContain("FLYERS GENERADOS DESDE EL PADRÓN");
    expect(summary).toContain("Formato de archivo: PDF");
    expect(summary).toContain("Total: 3 flyers");
    expect(summary).toContain(
      'Flyer Galicia · Combustible: 2  (carpeta "Flyer Galicia - Combustible")',
    );
    expect(summary).toContain("  Ninguna.");
  });

  it("a flyer that does not load leaves its companies out, with the reason, and never on another picture", async () => {
    const { names, summary, report } = await finished(
      runOf([company("a"), company("rota 1"), company("rota 2")]).run,
    );
    expect(names.filter((name) => name.endsWith(".pdf"))).toEqual([
      "Flyer Galicia - Combustible/Flyer a.pdf",
    ]);
    expect(report.leftOut).toEqual([
      "rota 1 (no se pudo cargar el flyer «Roto»)",
      "rota 2 (no se pudo cargar el flyer «Roto»)",
    ]);
    expect(summary).toContain("2 no generadas: rota 1 (no se pudo cargar el flyer «Roto»)");
  });

  it("with no flyer at all there is no ZIP, only the report", async () => {
    const { report, zip } = await runCompanyBatch(runOf([company("rota")]).run);
    expect(zip).toBeNull();
    expect(report.total).toBe(0);
    expect(report.zipName).toBe("");
    expect(report.leftOut).toHaveLength(1);
  });

  it("each company is drawn with the legal of its flyer", async () => {
    const { run } = runOf([company("a"), company("rubro")]);
    const legals: string[] = [];
    const real = run.readState;
    const { report } = await finished({
      ...run,
      readState: () => {
        const state = real();
        legals.push(state.legal);
        return state;
      },
    });
    expect(report.total).toBe(2);
    expect(legals).toEqual(["Legal 9", "Legal 8"]);
  });

  it("if another flyer is on screen when it arrives, it counts as not loaded", async () => {
    const { run } = runOf([company("a")]);
    const { report, zip } = await runCompanyBatch({
      ...run,
      readState: () => ({ slot: { ...EMPTY_FLYER_SLOT, option: 1, scene: SCENE }, legal: "" }),
    });
    expect(zip).toBeNull();
    expect(report.leftOut[0]).toContain("no se pudo cargar");
  });

  it("notes who has no officers, no cashback and no cap", async () => {
    const { report, summary } = await finished(
      runOf([company("a", { asesores: [], config: "" }), company("rubro", { asesores: [] })]).run,
    );
    expect(report.noOfficers).toEqual(["a", "rubro"]);
    expect(report.noCashback).toEqual(["a"]);
    expect(report.noCap).toEqual(["rubro"]);
    expect(summary).toContain("2 sin oficiales asignados (salen sin datos de contacto): a, rubro");
    expect(summary).toContain("1 sin cashback (importes en blanco): a");
    expect(summary).toContain("1 sin tope cargado (se usó el del formulario): rubro");
  });

  it("a company that fails is noted down with its reason and the rest come out", async () => {
    const prototype = CanvasRenderingContext2D.prototype;
    const real: unknown = Reflect.get(prototype, "fillText");
    Reflect.set(prototype, "fillText", function draw(this: unknown, ...args: unknown[]) {
      if (String(args[0]).includes("MALA")) throw new Error("falla simulada");
      if (typeof real === "function") Reflect.apply(real, this, args);
    });
    const { report, summary, names } = await finished(
      runOf([company("MALA"), company("BUENA")]).run,
    ).finally(() => {
      Reflect.set(prototype, "fillText", real);
    });
    expect(report.failed).toEqual(["MALA: falla simulada"]);
    expect(summary).toContain("1 con error: MALA: falla simulada");
    expect(names).toContain("Flyer Galicia - Combustible/Flyer BUENA.pdf");
  });

  it("says which one goes, and when it starts making the ZIP", async () => {
    const { run, onProgress } = runOf([company("a"), company("b")]);
    await finished(run);
    const texts = onProgress.mock.calls.map(([{ text }]) => text);
    expect(texts[0]).toBe("Preparando...");
    expect(texts).toContain("Generando 1 de 2 — Flyer Galicia · Combustible: a");
    expect(texts).toContain("Generando 2 de 2 — Flyer Galicia · Combustible: b");
    expect(texts.at(-1)).toBe("Empaquetando ZIP...");
    expect(onProgress.mock.calls.at(-1)?.[0].percent).toBe(100);
  });

  it("makes images when it is asked to", async () => {
    const { names, report } = await finished({ ...runOf([company("a")]).run, format: "png" });
    expect(names).toContain("Flyer Galicia - Combustible/Flyer a.png");
    expect(report.format).toBe("png");
  });

  it("a company without a name goes in the report as a question mark", async () => {
    const { report } = await runCompanyBatch(
      runOf([company("rota", {})], {
        plan: {
          rows: [{ company: company(""), option: 7 }],
          perOption: new Map([[7, 1]]),
          leftOut: [],
        },
      }).run,
    );
    expect(report.leftOut[0]).toMatch(/^\? \(no se pudo cargar/);
  });

  it("the summary counts one in singular, and orders the flyers by number", () => {
    const summary = companyBatchSummary({
      ...REPORT,
      perOption: [
        { label: "Nueve", count: 1, folder: "N" },
        { label: "Diez", count: 2, folder: "D" },
      ],
    });
    expect(summary).toContain("Total: 1 flyer\n");
    expect(summary.indexOf("Nueve")).toBeLessThan(summary.indexOf("Diez"));
  });
});

describe("what is told about a batch", () => {
  it("has nothing to say when everything was there", () => {
    expect(batchObservations(REPORT)).toEqual([]);
  });

  it("names a few and counts the rest", () => {
    expect(namesText(["a", "b"])).toBe("a, b");
    expect(namesText(["a", "b", "c", "d", "e", "f", "g", "h"])).toBe("a, b, c, d, e, f y 2 más");
    expect(namesText(["a", "b", "c"], 2)).toBe("a, b y 1 más");
  });
});
