// "Descargar PDF" and "Descargar como imagen": one at a time, it says "descargado" only when the
// file came out, and an error is explained and does not leave "Generando…" for ever (invariant 24).
import { useCallback, useRef, useState } from "react";
import { optionLabel } from "@/shared/domain/flyer-options.ts";
import {
  buildFileName,
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

export type DownloadKind = "pdf" | "png";

const LONG_NOTICE_MS = 6000;
const WORKING = "Generando…";
const FILE_PATTERN = "Flyer {empresa}";

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

function failureText(kind: DownloadKind, { kind: reason }: OutputFailure): string {
  return reason === "library"
    ? `No se pudo preparar ${WHAT[kind]}. Revisá la conexión y probá de nuevo.`
    : `No se pudo generar ${WHAT[kind]}. Probá de nuevo; si sigue, recargá la página.`;
}

export function useFlyerDownload() {
  const workspace = useFlyerWorkspace();
  const toast = useToast();
  const { isAdminNow } = usePermissions();
  const { options } = useFlyerOptions();
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);

  const blocked = useCallback(() => {
    const { slot } = workspace.getState();
    return blockReason(slot, optionLabel(options, slot.option), isAdminNow);
  }, [isAdminNow, options, workspace]);

  const generate = useCallback(
    async (kind: DownloadKind) => {
      const canvas = workspace.renderDownload();
      if (!canvas) throw new Error("There is no flyer to download");
      const name = buildFileName(FILE_PATTERN, workspace.currentValues(), {
        now: new Date(),
        configuration: "",
      });
      const result = await saved(kind, canvas, name);
      if (result.ok) toast.show(DONE[kind]);
      else toast.show(failureText(kind, result.error), LONG_NOTICE_MS);
    },
    [toast, workspace],
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
        else await generate(kind);
      } catch {
        toast.show(failureText(kind, { kind: "generation", detail: "" }), LONG_NOTICE_MS);
      } finally {
        locked.current = false;
        setBusy(false);
      }
    },
    [blocked, generate, toast],
  );

  return { download, busy };
}
