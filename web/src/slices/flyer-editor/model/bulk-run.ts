// One ZIP of Masivo, from the lines that were read: each one on its flyer, one at a time. A group
// whose flyer did not load stays out with its reason (invariant 23), and what did not come out is told.
import {
  type CashbackConfig,
  cashbackIndex,
  type DestinationRules,
} from "@/shared/domain/company-registry/index.ts";
import { type FlyerTab, optionLabel, optionTab } from "@/shared/domain/flyer-options.ts";
import {
  type BatchOutcome,
  formatAmount,
  generateBatch,
  type LogoSource,
  type OutputFailure,
} from "@/shared/flyer-engine/index.ts";
import {
  drawsSingleCashback,
  sceneOnScreen,
  type WorkspaceState,
} from "@/shared/lib/flyer-workspace/index.ts";
import { type Result, success } from "@/shared/supabase/index.ts";
import {
  type BulkError,
  bulkErrors,
  bulkFlyerValues,
  bulkPlan,
  bulkSummaryText,
  type DrawnLine,
  drawnLine,
  type PlannedRow,
} from "./bulk-batch.ts";
import type { BulkRow } from "./bulk-sheet.ts";

export interface BulkProgress {
  readonly percent: number;
  readonly text: string;
}

export interface BulkRun {
  /** A copy of what was read: what happens to the panel meanwhile does not touch it. */
  readonly lines: readonly BulkRow[];
  readonly origin: number;
  /** No draft and no crop: each line can go on the flyer it needs. */
  readonly isFree: boolean;
  readonly rules: DestinationRules;
  readonly configs: readonly CashbackConfig[];
  readonly tab: FlyerTab;
  readonly cap: string;
  readonly secondCap: string;
  readonly logos: LogoSource;
  readonly readState: () => Pick<WorkspaceState, "slot" | "legal">;
  readonly goTo: (option: number) => Promise<unknown>;
  readonly onProgress: (progress: BulkProgress) => void;
  readonly onDrawn: (line: DrawnLine) => void;
}

export interface BulkOutcome {
  readonly generated: number;
  readonly errors: readonly BulkError[];
  /** Null when nothing came out: an empty ZIP is not downloaded. */
  readonly zip: Result<Blob, OutputFailure> | null;
  /** It went to another flyer: whoever asked goes back. */
  readonly hasChangedFlyer: boolean;
}

function summaryOf(
  run: BulkRun,
  rows: readonly PlannedRow[],
  labelOf: (option: number) => string,
  { generated, perOption, problems }: BatchOutcome<PlannedRow>,
): string {
  const failed = new Set(problems.map(({ row }) => row));
  const out = rows.filter((line) => !failed.has(line)).map(({ row }) => row);
  return bulkSummaryText(
    {
      total: rows.length,
      generated,
      date: new Date(),
      perOption,
      noCashback: out
        .filter(({ config }) => cashbackIndex(config, run.rules.cashbackNames) < 0)
        .map(({ empresa }) => empresa),
      noOfficers: out
        .filter(({ officers }) => !officers.some(({ nombre }) => nombre))
        .map(({ empresa }) => empresa),
      errors: bulkErrors(problems, labelOf),
    },
    run.rules,
  );
}

export async function runBulk(run: BulkRun): Promise<BulkOutcome> {
  const { lines, origin, isFree, rules, configs, tab, cap, secondCap, onProgress } = run;
  const { rows } = bulkPlan(lines, origin, isFree, rules);
  const total = rows.length;
  const labelOf = (option: number) => optionLabel(rules.options, option);
  const say = (done: number, text: string) => {
    onProgress({ percent: Math.round((done / total) * 100), text });
  };
  const group = { legal: "" };
  const changes = { happened: false };
  say(0, `Generando 1 de ${String(total)}...`);
  const result = await generateBatch<PlannedRow>({
    rows,
    format: "pdf",
    logos: run.logos,
    optionOf: ({ option }) => option,
    loadScene: async (option) => {
      if (option !== origin) {
        changes.happened = true;
        say(0, `Cambiando a ${labelOf(option)} para las empresas sin cashback...`);
        await run.goTo(option);
      }
      const arrived = sceneOnScreen(run.readState(), option);
      if (!arrived.ok) return arrived;
      group.legal = arrived.value.legal;
      return success(arrived.value.scene);
    },
    valuesOf: ({ row }, option, scene) => {
      const values = bulkFlyerValues(row, {
        configs,
        names: rules.cashbackNames,
        legal: group.legal,
        singleCashback: drawsSingleCashback(optionTab(rules.options, option)),
        hasBenefit: tab === "rubros",
        formCap: formatAmount(cap),
        formSecondCap: formatAmount(secondCap),
      });
      run.onDrawn(drawnLine(values, option, scene));
      return values;
    },
    summaryOf: (outcome) => summaryOf(run, rows, labelOf, outcome),
    onProgress: ({ done }) => {
      say(
        done,
        done < total ? `Generando ${String(done + 1)} de ${String(total)}...` : "Finalizando...",
      );
    },
    onPacking: () => {
      say(total, "Empaquetando ZIP...");
    },
  });
  return {
    generated: result.generated,
    errors: bulkErrors(result.problems, labelOf),
    zip: result.zip,
    hasChangedFlyer: changes.happened,
  };
}
