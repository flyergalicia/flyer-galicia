// `_pgGenerarRows` for whoever has a workspace: while its libraries come down it already counts as
// running, it asks before starting, and it always tells how it went. A flyer that did not load leaves
// its companies in the report: there is no ZIP without flyers (invariant 23).
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { Company } from "@/shared/domain/company-registry/index.ts";
import { type BatchFormat, downloadBlob } from "@/shared/flyer-engine/index.ts";
import { useCashbackConfigs } from "@/shared/lib/app-config/cashback-query.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useSession } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { useBatchLibraries } from "../batch-libraries.ts";
import { logBatchFlyerUse } from "../usage-log.ts";
import { useFlyerWorkspace } from "../workspace-context.ts";
import { CompanyBatchQuestion, CompanyBatchReportDialog } from "./CompanyBatchDialogs.tsx";
import {
  companyBatchPlan,
  type CompanyBatchPlan,
  companyBatchQuestion,
  type CompanyBatchProgress,
  type CompanyBatchReport,
  type LabelRules,
  runCompanyBatch,
} from "./company-batch.ts";

const DEFAULT_ZIP_BASE = "Flyers_Empresas";
const NOTHING_TO_GENERATE = "Ninguna de las empresas tildadas se puede generar con tu perfil";
const NOTHING_GENERATED = "No se generó ningún flyer";

export interface CompanyBatchRequest {
  readonly companies: readonly Company[];
  readonly format: BatchFormat;
  readonly onProgress: (progress: CompanyBatchProgress) => void;
  /** What the name of the ZIP starts with. */
  readonly zipBase?: string;
}

export interface CompanyBatchOptions {
  readonly rules: LabelRules;
  /** Which flyer each company goes on. */
  readonly optionOf: (company: Company) => number;
  /** To that flyer: it says when it arrived or when it could not. */
  readonly goTo: (option: number) => Promise<unknown>;
  /** Back to the flyer it started on, once the batch ended. */
  readonly goBack: (option: number) => void;
  /** The cap of whoever has none of their own. */
  readonly formCap: () => string;
}

export interface CompanyBatch {
  readonly generate: (request: CompanyBatchRequest) => Promise<void>;
  readonly isGenerating: () => boolean;
  /** Its windows: wherever it goes, they open over everything. */
  readonly dialogs: ReactNode;
}

function doneText(total: number): string {
  return `✓ ZIP con ${String(total)} flyer${total === 1 ? "" : "s"}.`;
}

interface OpenQuestion {
  readonly text: string;
  readonly answer: (goAhead: boolean) => void;
}

export function useCompanyBatch(options: CompanyBatchOptions): CompanyBatch {
  const workspace = useFlyerWorkspace();
  const { show } = useToast();
  const { configs, names } = useCashbackConfigs();
  const { db } = useBackend();
  const session = useSession();
  const bringLibraries = useBatchLibraries();
  const [question, setQuestion] = useState<OpenQuestion | null>(null);
  const [report, setReport] = useState<CompanyBatchReport | null>(null);
  const userId = session.status === "signed-in" ? session.user.id : null;
  const latest = useRef({ options, configs, names, userId });
  useEffect(() => {
    latest.current = { options, configs, names, userId };
  });

  /** Until the libraries are here it counts as running: nothing takes its rows away. */
  const librariesReady = useCallback(async () => {
    const release = workspace.batch.hold();
    try {
      return await bringLibraries();
    } finally {
      release();
    }
  }, [bringLibraries, workspace]);

  const logWhatCameOut = useCallback(
    (count: number) => {
      const { userId: person } = latest.current;
      if (!person) return;
      const { option } = workspace.getState().slot;
      void logBatchFlyerUse(db, person, { count, fromCompanies: true, option });
    },
    [db, workspace],
  );

  const run = useCallback(
    async (plan: CompanyBatchPlan, request: CompanyBatchRequest) => {
      const { onProgress, format, zipBase = DEFAULT_ZIP_BASE } = request;
      const now = latest.current;
      const origin = workspace.getState().slot.option;
      const release = workspace.batch.hold();
      const lastPercent = { value: 0 };
      const tell = (progress: CompanyBatchProgress) => {
        lastPercent.value = progress.percent;
        onProgress(progress);
      };
      const finish = (text: string) => {
        release();
        onProgress({ percent: lastPercent.value, text });
        if (origin !== null) now.options.goBack(origin);
      };
      try {
        const { report: outcome, zip } = await runCompanyBatch({
          plan,
          format,
          zipBase,
          rules: now.options.rules,
          configs: now.configs,
          names: now.names,
          formCap: now.options.formCap(),
          logos: workspace.logos,
          readState: workspace.getState,
          goTo: now.options.goTo,
          onProgress: tell,
        });
        if (!zip) {
          finish(`${NOTHING_GENERATED}. Mirá el detalle.`);
          show(NOTHING_GENERATED);
          setReport(outcome);
          return;
        }
        if (!zip.ok) {
          finish(`Error al armar el ZIP: ${zip.error.detail}`);
          return;
        }
        downloadBlob(zip.value, outcome.zipName);
        logWhatCameOut(outcome.total);
        finish(doneText(outcome.total));
        setReport(outcome);
      } catch (cause) {
        finish(`Error al armar el ZIP: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    },
    [logWhatCameOut, show, workspace],
  );

  const generate = useCallback(
    async (request: CompanyBatchRequest) => {
      if (workspace.batch.isRunning() || request.companies.length === 0) return;
      if (!(await librariesReady())) return;
      const { rules, optionOf } = latest.current.options;
      const plan = companyBatchPlan(request.companies, optionOf, rules);
      if (plan.rows.length === 0) {
        show(NOTHING_TO_GENERATE);
        return;
      }
      const goAhead = await new Promise<boolean>((answer) => {
        setQuestion({ text: companyBatchQuestion(plan, rules), answer });
      });
      setQuestion(null);
      if (goAhead) await run(plan, request);
    },
    [librariesReady, run, show, workspace],
  );

  return {
    generate,
    isGenerating: workspace.batch.isRunning,
    dialogs: (
      <>
        {question && <CompanyBatchQuestion text={question.text} onAnswer={question.answer} />}
        {report && (
          <CompanyBatchReportDialog
            report={report}
            onClose={() => {
              setReport(null);
            }}
          />
        )}
      </>
    ),
  };
}
