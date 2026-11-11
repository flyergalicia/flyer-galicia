// "Descargar PDF" and "Descargar como imagen": one at a time, it says "descargado" only when the
// file came out, and an error is explained and does not leave "Generando…" for ever (invariant 24).
import { useCallback, useEffect, useRef, useState } from "react";
import { optionLabel } from "@/shared/domain/flyer-options.ts";
import {
  buildFileName,
  type FlyerValues,
  type OutputFailure,
  saveFlyerPdf,
  saveFlyerPng,
  yieldToPaint,
} from "@/shared/flyer-engine/index.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { blockReason, useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { usePermissions } from "@/shared/session/index.ts";
import type { Result } from "@/shared/supabase/index.ts";
import { useFlyerForm } from "./form-context.ts";
import { problemsOnFlyer, withAllFieldsChecked } from "./form-state.ts";
import { useFlyerRecord } from "./use-flyer-record.ts";

export type DownloadKind = "pdf" | "png";

export const LONG_NOTICE_MS = 6000;
const WORKING = "Generando…";
const AFTER_DONE_MS = 1300;

const WHAT: Readonly<Record<DownloadKind, string>> = { pdf: "el PDF", png: "la imagen" };
const DONE: Readonly<Record<DownloadKind, string>> = {
  pdf: "PDF descargado!",
  png: "PNG descargado!",
};

function saved(
  kind: DownloadKind,
  canvas: HTMLCanvasElement,
  name: string,
): Promise<Result<true, OutputFailure>> {
  return kind === "pdf" ? saveFlyerPdf(canvas, name) : Promise.resolve(saveFlyerPng(canvas, name));
}

export function failureText(kind: DownloadKind, { kind: reason }: OutputFailure): string {
  return reason === "library"
    ? `No se pudo preparar ${WHAT[kind]}. Revisá la conexión y probá de nuevo.`
    : `No se pudo generar ${WHAT[kind]}. Probá de nuevo; si sigue, recargá la página.`;
}

/** Why it cannot come out right now, in the words the person reads; "" if it can (invariant 23). */
export function useDownloadBlock() {
  const workspace = useFlyerWorkspace();
  const { isAdminNow } = usePermissions();
  const { options } = useFlyerOptions();
  return useCallback(() => {
    const { slot } = workspace.getState();
    return blockReason(slot, optionLabel(options, slot.option), isAdminNow);
  }, [isAdminNow, options, workspace]);
}

/** The name of the file with what the form says now. */
export function useFileNameOf() {
  const form = useFlyerForm();
  return useCallback(
    (values: FlyerValues) =>
      buildFileName(form.getState().fileName, values, { now: new Date(), configuration: "" }),
    [form],
  );
}

/** What is wrong never stops a download: it marks the fields and it is said a moment after. */
export function useFieldsWarning() {
  const form = useFlyerForm();
  const toast = useToast();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  return useCallback(
    (wait = AFTER_DONE_MS) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const problems = problemsOnFlyer(form.getState());
        if (problems.length === 0) return;
        form.update(withAllFieldsChecked);
        toast.show(`Ojo: revisá ${problems.join(" y ")} (se generó igual).`, LONG_NOTICE_MS);
      }, wait);
    },
    [form, toast],
  );
}

export interface FlyerDownloadOptions {
  /** It stops at the warning of the wrong flyer: it says so, and it goes on with what it gets. */
  readonly checkBefore?: (goOn: () => void) => boolean;
  /** One flyer came out: the list of companies may have something to say about it. */
  readonly afterDownload?: () => void;
}

export function useFlyerDownload({ checkBefore, afterDownload }: FlyerDownloadOptions = {}) {
  const workspace = useFlyerWorkspace();
  const toast = useToast();
  const record = useFlyerRecord(afterDownload);
  const blocked = useDownloadBlock();
  const fileNameOf = useFileNameOf();
  const warnAboutFields = useFieldsWarning();
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);

  /** It says whether the file came out. */
  const saveCanvas = useCallback(
    async (kind: DownloadKind, canvas: HTMLCanvasElement, values: FlyerValues) => {
      const fileName = fileNameOf(values);
      const result = await saved(kind, canvas, fileName);
      if (!result.ok) {
        toast.show(failureText(kind, result.error), LONG_NOTICE_MS);
        return false;
      }
      record({ values, fileName, canvas, format: kind });
      return true;
    },
    [fileNameOf, record, toast],
  );

  /** Whoever answered a warning hears the end too. */
  const saveAndSay = useCallback(
    async (kind: DownloadKind, canvas: HTMLCanvasElement, values: FlyerValues) => {
      if (!(await saveCanvas(kind, canvas, values))) return;
      toast.show(DONE[kind]);
      warnAboutFields();
    },
    [saveCanvas, toast, warnAboutFields],
  );

  const generate = useCallback(
    async (kind: DownloadKind) => {
      const canvas = workspace.renderDownload();
      if (!canvas) throw new Error("There is no flyer to download");
      await saveAndSay(kind, canvas, workspace.currentValues());
    },
    [saveAndSay, workspace],
  );

  const generateExplaining = useCallback(
    async (kind: DownloadKind) => {
      try {
        await generate(kind);
      } catch {
        toast.show(failureText(kind, { kind: "generation", detail: "" }), LONG_NOTICE_MS);
      }
    },
    [generate, toast],
  );

  const download = useCallback(
    async (kind: DownloadKind) => {
      if (locked.current) return;
      const reason = blocked();
      if (reason) {
        toast.show(reason, LONG_NOTICE_MS);
        return;
      }
      locked.current = true;
      setBusy(true);
      toast.show(WORKING);
      try {
        await yieldToPaint();
        // Something may have changed while the notice was painted.
        const lateReason = blocked();
        if (lateReason) toast.show(lateReason, LONG_NOTICE_MS);
        else if (checkBefore?.(() => void generateExplaining(kind))) toast.hide(WORKING);
        else await generate(kind);
      } catch {
        toast.show(failureText(kind, { kind: "generation", detail: "" }), LONG_NOTICE_MS);
      } finally {
        locked.current = false;
        setBusy(false);
      }
    },
    [blocked, checkBefore, generate, generateExplaining, toast],
  );

  /**
   * From the window of Vista previa: what is seen there is what comes out, and the window is proof
   * enough, so it says nothing unless a warning stopped it.
   */
  const saveShown = useCallback(
    async (kind: DownloadKind, canvas: HTMLCanvasElement) => {
      const reason = blocked();
      if (reason) {
        toast.show(reason, LONG_NOTICE_MS);
        return;
      }
      const values = workspace.currentValues();
      if (checkBefore?.(() => void saveAndSay(kind, canvas, values))) return;
      await saveCanvas(kind, canvas, values);
    },
    [blocked, checkBefore, saveAndSay, saveCanvas, toast, workspace],
  );

  return { download, busy, saveShown };
}
