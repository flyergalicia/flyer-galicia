// The ZIP of many companies of the list, each one on its flyer: the rules of `_pgGenerarRows`. Whoever
// asks says which flyer each company goes on (Generar flyers and the Hunter do not decide it the same
// way) and how to get to one: a group whose flyer did not load is left out with its reason, and it
// never comes out on the picture of another one (invariant 23).
import {
  type CashbackConfig,
  type Company,
  type DestinationRules,
  destinationLabel,
} from "@/shared/domain/company-registry/index.ts";
import { optionLabel, optionTab } from "@/shared/domain/flyer-options.ts";
import { relativeDate } from "@/shared/domain/relative-date.ts";
import {
  type ArtworkFailure,
  type BatchFormat,
  type BatchOutcome,
  dateForFileName,
  type FlyerScene,
  generateBatch,
  type LogoSource,
  type OutputFailure,
  readyScene,
  safeFileName,
} from "@/shared/flyer-engine/index.ts";
import { failure, type Result, success } from "@/shared/supabase/index.ts";
import { drawsSingleCashback } from "../flyer-tab.ts";
import { companyFlyer } from "../company-flyer.ts";
import type { WorkspaceState } from "../workspace-store.ts";

const MANY_NAMES = 6;

export type LabelRules = Pick<DestinationRules, "options" | "tabLabel">;

export interface PlannedCompany {
  readonly company: Company;
  readonly option: number;
}

export interface CompanyBatchPlan {
  /** The ones that come out, each flyer's together, in the order the flyers first appear. */
  readonly rows: readonly PlannedCompany[];
  /** How many on each flyer, in that order. */
  readonly perOption: ReadonlyMap<number, number>;
  /** The ones that cannot come out for this profile, and why. */
  readonly leftOut: readonly string[];
}

export interface CompanyBatchProgress {
  readonly percent: number;
  readonly text: string;
}

export interface CompanyBatchReport {
  readonly total: number;
  readonly format: BatchFormat;
  readonly date: Date;
  /** Empty while nothing came out. */
  readonly zipName: string;
  readonly perOption: readonly {
    readonly label: string;
    readonly count: number;
    readonly folder: string;
  }[];
  readonly noOfficers: readonly string[];
  readonly noCashback: readonly string[];
  readonly noCap: readonly string[];
  readonly leftOut: readonly string[];
  readonly failed: readonly string[];
}

export interface CompanyBatchRun {
  readonly plan: CompanyBatchPlan;
  readonly format: BatchFormat;
  readonly zipBase: string;
  readonly rules: LabelRules;
  readonly configs: readonly CashbackConfig[];
  readonly names: readonly string[];
  readonly formCap: string;
  readonly logos: LogoSource;
  readonly readState: () => Pick<WorkspaceState, "slot" | "legal">;
  /** To that flyer, as the screen goes to it: it says when it arrived or when it could not. */
  readonly goTo: (option: number) => Promise<unknown>;
  readonly onProgress: (progress: CompanyBatchProgress) => void;
}

export interface CompanyBatchOutcome {
  readonly report: CompanyBatchReport;
  /** Null when nothing came out: an empty ZIP is not downloaded. */
  readonly zip: Result<Blob, OutputFailure> | null;
}

/** Which flyer each one goes on, and who stays out: what the question before starting says. */
export function companyBatchPlan(
  companies: readonly Company[],
  optionOf: (company: Company) => number,
  { options }: LabelRules,
): CompanyBatchPlan {
  const groups = new Map<number, Company[]>();
  const leftOut: string[] = [];
  for (const company of companies) {
    const option = optionOf(company);
    if (option > 0) groups.set(option, [...(groups.get(option) ?? []), company]);
    else if (option < 0) {
      leftOut.push(`${company.empresa} (rubro ${optionLabel(options, -option)} no habilitado)`);
    } else leftOut.push(`${company.empresa} (sin opción habilitada)`);
  }
  return {
    rows: [...groups].flatMap(([option, list]) => list.map((company) => ({ company, option }))),
    perOption: new Map([...groups].map(([option, list]) => [option, list.length])),
    leftOut,
  };
}

export function companyBatchQuestion(plan: CompanyBatchPlan, rules: LabelRules): string {
  const groups = [...plan.perOption].map(
    ([option, count]) => `• ${String(count)} en ${destinationLabel(option, rules)}`,
  );
  const { leftOut } = plan;
  const outside =
    leftOut.length > 0
      ? `\n\n${String(leftOut.length)} quedan afuera:\n• ${leftOut.slice(0, 4).join("\n• ")}${leftOut.length > 4 ? "\n• …" : ""}`
      : "";
  return `Se van a generar ${String(plan.rows.length)} flyers:\n${groups.join("\n")}${outside}`;
}

function folderOf(option: number, rules: LabelRules): string {
  return safeFileName(destinationLabel(option, rules).replace(" · ", " - "));
}

function reportOf(
  run: CompanyBatchRun,
  { generated, perOption, problems }: BatchOutcome<PlannedCompany>,
  notes: Pick<CompanyBatchReport, "noOfficers" | "noCashback" | "noCap">,
  date: Date,
): CompanyBatchReport {
  const { plan, rules, format, zipBase } = run;
  const name = ({ company }: PlannedCompany) => company.empresa || "?";
  return {
    total: generated,
    format,
    date,
    zipName: generated > 0 ? `${zipBase}_${dateForFileName(date)}.zip` : "",
    // By number: the order the summary always had.
    perOption: [...perOption]
      .toSorted(([first], [second]) => first - second)
      .map(([option, count]) => ({
        label: destinationLabel(option, rules),
        count,
        folder: folderOf(option, rules),
      })),
    ...notes,
    leftOut: [
      ...plan.leftOut,
      ...problems
        .filter(({ reason }) => reason !== "drawing")
        .map(
          ({ row, option }) =>
            `${name(row)} (no se pudo cargar el flyer «${optionLabel(rules.options, option)}»)`,
        ),
    ],
    failed: problems
      .filter(({ reason }) => reason === "drawing")
      .map(({ row, detail }) => `${name(row)}: ${detail ?? ""}`),
  };
}

/** Resumen.txt. Its words are read by people and they are the ones it always had. */
export function companyBatchSummary(report: CompanyBatchReport): string {
  const { total, format, date, perOption } = report;
  const lines = [
    "FLYERS GENERADOS DESDE EL PADRÓN",
    `Fecha: ${relativeDate(date.toISOString())}`,
    `Formato de archivo: ${format.toUpperCase()}`,
    `Total: ${String(total)} flyer${total === 1 ? "" : "s"}`,
    "",
    "POR FORMATO",
    ...perOption.map(
      ({ label, count, folder }) => `  ${label}: ${String(count)}  (carpeta "${folder}")`,
    ),
    "",
    "OBSERVACIONES",
  ];
  const observations = batchObservations(report).map(
    ({ text, names }) => `  ${String(names.length)} ${text}: ${names.join(", ")}`,
  );
  return [...lines, ...(observations.length > 0 ? observations : ["  Ninguna."])].join("\n");
}

export interface BatchObservation {
  readonly text: string;
  readonly names: readonly string[];
}

export function batchObservations({
  noOfficers,
  noCashback,
  noCap,
  leftOut,
  failed,
}: CompanyBatchReport): readonly BatchObservation[] {
  return [
    { text: "sin oficiales asignados (salen sin datos de contacto)", names: noOfficers },
    { text: "sin cashback (importes en blanco)", names: noCashback },
    { text: "sin tope cargado (se usó el del formulario)", names: noCap },
    { text: "no generadas", names: leftOut },
    { text: "con error", names: failed },
  ].filter(({ names }) => names.length > 0);
}

/** "A, B y 3 más". */
export function namesText(names: readonly string[], most = MANY_NAMES): string {
  const shown = names.slice(0, most).join(", ");
  return names.length > most ? `${shown} y ${String(names.length - most)} más` : shown;
}

/** What a group of a batch draws on: only that flyer, finished loading (invariant 23). */
export function sceneOnScreen(
  { slot, legal }: Pick<WorkspaceState, "slot" | "legal">,
  option: number,
): Result<{ readonly scene: FlyerScene; readonly legal: string }, ArtworkFailure> {
  const scene = slot.option === option ? readyScene(slot) : null;
  return scene ? success({ scene, legal }) : failure(slot.failure ?? "network");
}

/** Everything it can, in order. It always says what did not come out and why. */
export async function runCompanyBatch(run: CompanyBatchRun): Promise<CompanyBatchOutcome> {
  const { plan, format, rules, logos, configs, names, formCap, onProgress } = run;
  const date = new Date();
  const total = plan.rows.length;
  const noOfficers: string[] = [];
  const noCashback: string[] = [];
  const noCap: string[] = [];
  const group = { legal: "" };
  let done = 0;
  let text = "Preparando...";
  const say = () => {
    onProgress({ percent: Math.round((done / total) * 100), text });
  };
  say();
  const notes = { noOfficers, noCashback, noCap };
  const result = await generateBatch<PlannedCompany>({
    rows: plan.rows,
    format,
    logos,
    optionOf: ({ option }) => option,
    loadScene: async (option) => {
      await run.goTo(option);
      const arrived = sceneOnScreen(run.readState(), option);
      if (!arrived.ok) return arrived;
      group.legal = arrived.value.legal;
      return success(arrived.value.scene);
    },
    valuesOf: ({ company }, option) => {
      text = `Generando ${String(done + 1)} de ${String(total)} — ${destinationLabel(option, rules)}: ${company.empresa}`;
      say();
      const tab = optionTab(rules.options, option);
      const flyer = companyFlyer(company, {
        configs,
        names,
        legal: group.legal,
        singleCashback: drawsSingleCashback(tab),
        hasBenefit: tab === "rubros",
        formCap,
      });
      if (flyer.hasNoCashback) noCashback.push(company.empresa);
      if (flyer.hasNoOfficers) noOfficers.push(company.empresa);
      if (flyer.usedFormCap) noCap.push(company.empresa);
      return flyer.values;
    },
    folderOf: (option) => folderOf(option, rules),
    summaryOf: (outcome) => companyBatchSummary(reportOf(run, outcome, notes, date)),
    onProgress: (progress) => {
      ({ done } = progress);
      say();
    },
    onPacking: () => {
      text = "Empaquetando ZIP...";
      say();
    },
  });
  return { report: reportOf(run, result, notes, date), zip: result.zip };
}
