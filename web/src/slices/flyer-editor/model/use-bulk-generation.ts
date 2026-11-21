// Masivo: a sheet, and one flyer per line in a ZIP. The batch works on a copy of what was read, and
// while it runs nothing can take its lines away or change the flyer under it. What did not come out
// stays in Resumen.txt with its row and its reason, and the log counts what came out.
import { useCallback, useEffect, useRef, useState } from "react";
import { versionWithoutCashback } from "@/shared/domain/company-registry/index.ts";
import { dateForFileName, detailOf, downloadBlob } from "@/shared/flyer-engine/index.ts";
import { useCashbackConfigs } from "@/shared/lib/app-config/cashback-query.ts";
import {
  BATCH_RUNNING_NOTICE,
  useBatchLibraries,
  useFlyerWorkspace,
} from "@/shared/lib/flyer-workspace/index.ts";
import { logBatchFlyerUse } from "@/shared/lib/flyer-workspace/usage-log.ts";
import { downloadSheet, readSheetFile } from "@/shared/lib/sheet-library.ts";
import { registerProbe } from "@/shared/lib/test-probe.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useSheetLibrary } from "@/shared/lib/use-sheet-library.ts";
import { useSession } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { useLogoEditorActions } from "@/slices/logo-editor/index.ts";
import { baseOption } from "./category-check.ts";
import { useFlyerForm } from "./form-context.ts";
import { type DrawnLine, nothingCameOutText, zipDoneNotice, zipDoneText } from "./bulk-batch.ts";
import { type BulkProgress, runBulk } from "./bulk-run.ts";
import {
  type BulkReport,
  type BulkRow,
  bulkTemplate,
  readBulkRows,
  type TemplateSign,
  validateBulkRows,
} from "./bulk-sheet.ts";
import { LONG_NOTICE_MS, useDownloadBlock } from "./use-flyer-download.ts";
import { useFlyerRules } from "./use-flyer-rules.ts";

export type { BulkProgress };

export interface BulkGenerationOptions {
  /** To that flyer: it says when it arrived or when it could not. */
  readonly goTo: (option: number) => Promise<unknown>;
  /** Back to the flyer it started on. */
  readonly goBack: (option: number) => void;
  /** What the template of this flyer has of its sign. */
  readonly sign: () => Omit<TemplateSign, "isCategoryTab">;
}

export function useBulkGeneration({ goTo, goBack, sign }: BulkGenerationOptions) {
  const workspace = useFlyerWorkspace();
  const form = useFlyerForm();
  const editor = useLogoEditorActions();
  const toast = useToast();
  const rules = useFlyerRules();
  const { configs, names } = useCashbackConfigs();
  const { db } = useBackend();
  const session = useSession();
  const withSheets = useSheetLibrary();
  const bringLibraries = useBatchLibraries();
  const blocked = useDownloadBlock();
  const [rows, setRows] = useState<readonly BulkRow[]>([]);
  const [report, setReport] = useState<BulkReport | null>(null);
  const [progress, setProgress] = useState<BulkProgress | null>(null);
  const [generating, setGenerating] = useState(false);
  const drawn = useRef<DrawnLine[]>([]);
  const lastPercent = useRef(0);
  const rulesRead = useRef(rules);
  useEffect(() => {
    rulesRead.current = rules;
  });

  useEffect(
    () =>
      registerProbe("flyerBatch", () => ({
        isRunning: workspace.batch.isRunning,
        rowNumbers: () => rows.map(({ sheetRow }) => sheetRow),
        drawn: () => drawn.current,
        versionOf: (option: number) => versionWithoutCashback(option, rulesRead.current),
        baseOf: (option: number) => baseOption(option, rulesRead.current.options),
        listedAsVersionOf: (option: number) =>
          rulesRead.current.options.find(({ n }) => n === option)?.sinCB ?? null,
      })),
    [rows, workspace],
  );

  const chooseFile = useCallback(
    (file: Blob) => {
      if (workspace.batch.isRunning()) {
        toast.show(BATCH_RUNNING_NOTICE);
        return;
      }
      void withSheets(async (library) => {
        try {
          const clean = readBulkRows(await readSheetFile(library, file));
          setRows(clean);
          if (clean.length === 0) {
            toast.show("Archivo vacío");
            return;
          }
          setReport(
            validateBulkRows(clean, { names, isCategoryTab: form.getContext().tab === "rubros" }),
          );
        } catch (cause) {
          toast.show(`No se pudo leer el Excel: ${detailOf(cause)}`);
        }
      });
    },
    [form, names, toast, withSheets, workspace],
  );

  const clear = useCallback(() => {
    if (workspace.batch.isRunning()) {
      toast.show(BATCH_RUNNING_NOTICE);
      return;
    }
    setRows([]);
    setReport(null);
  }, [toast, workspace]);

  const downloadTemplate = useCallback(() => {
    void withSheets((library) => {
      downloadSheet(
        library,
        bulkTemplate({ isCategoryTab: form.getContext().tab === "rubros", ...sign() }),
      );
      toast.show("Plantilla descargada!");
    });
  }, [form, sign, toast, withSheets]);

  const onProgress = useCallback((next: BulkProgress) => {
    lastPercent.current = next.percent;
    setProgress(next);
  }, []);

  const makeZip = useCallback(
    async (lines: readonly BulkRow[]) => {
      const origin = workspace.getState().slot.option ?? 0;
      const { cap, secondCap } = form.getState();
      drawn.current = [];
      const { generated, errors, zip, hasChangedFlyer } = await runBulk({
        lines,
        origin,
        isFree: !editor.works.activeWork() && editor.cuts().length === 0,
        rules,
        configs,
        tab: form.getContext().tab,
        cap,
        secondCap,
        logos: workspace.logos,
        readState: workspace.getState,
        goTo,
        onProgress,
        onDrawn: (line) => {
          drawn.current.push(line);
        },
      });
      const finish = (text: string, notice: string) => {
        onProgress({ percent: lastPercent.current, text });
        if (hasChangedFlyer && workspace.getState().slot.option !== origin) goBack(origin);
        toast.show(notice);
      };
      if (!zip) {
        finish(nothingCameOutText(errors), "No se generó ningún flyer");
        return;
      }
      if (!zip.ok) {
        finish(
          `No se pudo armar el ZIP: ${zip.error.detail}`,
          "No se pudo armar el ZIP. Probá con menos filas.",
        );
        return;
      }
      downloadBlob(zip.value, `Flyers_Galicia_${dateForFileName(new Date())}.zip`);
      finish(zipDoneText(generated, errors), zipDoneNotice(errors));
      // What came out, not what the sheet said.
      if (session.status === "signed-in") {
        void logBatchFlyerUse(db, session.user.id, {
          count: generated,
          fromCompanies: false,
          option: workspace.getState().slot.option,
        });
      }
    },
    [configs, db, editor, form, goBack, goTo, onProgress, rules, session, toast, workspace],
  );

  const generate = useCallback(async () => {
    if (rows.length === 0 || workspace.batch.isRunning()) return;
    // From here on it counts as running: nothing takes its lines away while the libraries come.
    const release = workspace.batch.hold();
    try {
      if (!(await bringLibraries())) return;
      const reason = blocked();
      if (reason) {
        toast.show(reason, LONG_NOTICE_MS);
        return;
      }
      setGenerating(true);
      await makeZip(rows);
    } catch {
      onProgress({
        percent: lastPercent.current,
        text: "Algo salió mal al generar. Probá de nuevo.",
      });
      toast.show("Algo salió mal al generar el ZIP");
    } finally {
      setGenerating(false);
      release();
    }
  }, [blocked, bringLibraries, makeZip, onProgress, rows, toast, workspace]);

  return { rows, report, progress, generating, chooseFile, clear, downloadTemplate, generate };
}
