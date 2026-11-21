// "Compartir": the menu of the device (WhatsApp, mail, Teams), always with the PDF: an advisor sends
// PDFs. A browser that cannot share a PDF is not offered the button, and no download takes its place.
import { useCallback, useRef, useState } from "react";
import { createFlyerPdf, type FlyerValues } from "@/shared/flyer-engine/index.ts";
import { useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import {
  type FlyerDownloadOptions,
  LONG_NOTICE_MS,
  useDownloadBlock,
  useFieldsWarning,
  useFileNameOf,
} from "./use-flyer-download.ts";
import { useFlyerRecord } from "./use-flyer-record.ts";

const SHARED_NOTICE_MS = 4000;
const FAILED_NOTICE_MS = 5000;
const AFTER_SHARING_MS = 1200;
const NO_SHARING = "Este navegador no permite compartir archivos. Usá Descargar PDF.";
const NO_LIBRARY = "No se pudo cargar la librería del PDF. Revisá la conexión.";
const NO_PDF = "No se pudo armar el PDF. Probá con Descargar PDF.";
const TOUCH_AGAIN = "Tocá Compartir de nuevo (ya está todo listo).";
const NO_MENU = "No se pudo abrir el menú de compartir. Usá Descargar PDF.";

export function canSharePdf(): boolean {
  try {
    if (!("share" in navigator) || !("canShare" in navigator)) return false;
    return navigator.canShare({
      files: [new File(["%PDF-1.4"], "flyer.pdf", { type: "application/pdf" })],
    });
  } catch {
    return false;
  }
}

/** What to say when the menu did not end in sharing. Closing it is not an error. */
function refusalText(cause: unknown): string {
  if (cause instanceof DOMException && cause.name === "AbortError") return "";
  // The gesture of the click was lost: too much time went by loading.
  return cause instanceof DOMException && cause.name === "NotAllowedError" ? TOUCH_AGAIN : NO_MENU;
}

export function useFlyerShare({ checkBefore, afterDownload }: FlyerDownloadOptions = {}) {
  const workspace = useFlyerWorkspace();
  const toast = useToast();
  const record = useFlyerRecord(afterDownload);
  const blocked = useDownloadBlock();
  const fileNameOf = useFileNameOf();
  const warnAboutFields = useFieldsWarning();
  const [isOffered] = useState(canSharePdf);
  const [sharing, setSharing] = useState(false);
  const running = useRef(false);

  const send = useCallback(
    async (canvas: HTMLCanvasElement, values: FlyerValues) => {
      const fileName = fileNameOf(values);
      const pdf = await createFlyerPdf(canvas);
      if (!pdf.ok) {
        toast.show(pdf.error.kind === "library" ? NO_LIBRARY : NO_PDF, FAILED_NOTICE_MS);
        return;
      }
      const file = new File([pdf.value.toArrayBuffer()], `${fileName}.pdf`, {
        type: "application/pdf",
      });
      await navigator.share({ files: [file], title: fileName });
      toast.show("Flyer compartido", SHARED_NOTICE_MS);
      record({ values, fileName, canvas, format: "compartir" });
      warnAboutFields(AFTER_SHARING_MS);
    },
    [fileNameOf, record, toast, warnAboutFields],
  );

  const shareCanvas = useCallback(
    async (canvas: HTMLCanvasElement, values: FlyerValues) => {
      if (running.current) return;
      if (!canSharePdf()) {
        toast.show(NO_SHARING);
        return;
      }
      running.current = true;
      setSharing(true);
      try {
        await send(canvas, values);
      } catch (cause) {
        const text = refusalText(cause);
        if (text) toast.show(text, FAILED_NOTICE_MS);
      } finally {
        running.current = false;
        setSharing(false);
      }
    },
    [send, toast],
  );

  /** With what is on screen, or with what the window of Vista previa is showing. */
  const share = useCallback(
    (shown?: HTMLCanvasElement) => {
      const canvas = shown ?? (blocked() ? null : workspace.renderDownload());
      if (!canvas) {
        toast.show(blocked(), LONG_NOTICE_MS);
        return;
      }
      const values = workspace.currentValues();
      if (checkBefore?.(() => void shareCanvas(canvas, values))) return;
      void shareCanvas(canvas, values);
    },
    [blocked, checkBefore, shareCanvas, toast, workspace],
  );

  return { isOffered, sharing, share };
}
