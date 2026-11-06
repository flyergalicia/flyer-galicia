// Uploading a flyer in Config → Flyer: an HTML of the build goes up as it is; a PDF or an image is
// converted to the picture of the flyer, goes up with a name of its own and opens the calibrator.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { type FlyerOption, optionLabel } from "@/shared/domain/flyer-options.ts";
import { loadPicture } from "@/shared/flyer-engine/index.ts";
import { rasterizeFlyer } from "@/shared/lib/pdf-flyer/rasterize-flyer.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { uploadFlyerImage, uploadHtml } from "../api/flyer-files.ts";
import { flyerFileKind, newFlyerImage, uploadProblem } from "./flyer-config.ts";
import { FLYER_LIST_QUERY_KEY } from "./use-flyer-list.ts";

const PROGRESS_STEP = 8;
const PROGRESS_SHOWN_MAX = 80;
const PROGRESS_TICK_MS = 150;
const PROGRESS_STAYS_MS = 600;

export interface UploadedPicture {
  readonly image: HTMLImageElement;
  readonly name: string;
  readonly url: string;
  readonly option: number;
}

export interface UploadState {
  readonly error: string;
  readonly ok: string;
  /** Null: no bar. */
  readonly progress: number | null;
  /** Something is going up: the box to drop files on does not take another one. */
  readonly busy: boolean;
  /** The public address of the HTML that went up. */
  readonly htmlUrl: string;
}

const IDLE: UploadState = { error: "", ok: "", progress: null, busy: false, htmlUrl: "" };

/** The bar goes up by itself to 80 % while it works, and to 100 % when it ends. */
function useProgress(setState: (change: (state: UploadState) => UploadState) => void) {
  const ticking = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const hiding = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearInterval(ticking.current);
      clearTimeout(hiding.current);
    },
    [],
  );
  const start = () => {
    clearTimeout(hiding.current);
    setState((state) => ({ ...state, progress: 0, busy: true }));
    ticking.current = setInterval(() => {
      setState((state) => ({
        ...state,
        progress: Math.min((state.progress ?? 0) + PROGRESS_STEP, PROGRESS_SHOWN_MAX),
      }));
    }, PROGRESS_TICK_MS);
  };
  const finish = () => {
    clearInterval(ticking.current);
    setState((state) => ({ ...state, progress: 100, busy: false }));
    hiding.current = setTimeout(() => {
      setState((state) => ({ ...state, progress: null }));
    }, PROGRESS_STAYS_MS);
  };
  return { start, finish };
}

export function useFlyerUpload(
  options: readonly FlyerOption[],
  onPicture: (picture: UploadedPicture) => void,
) {
  const { bucket } = useBackend();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [state, setState] = useState<UploadState>(IDLE);
  const progress = useProgress(setState);
  const reread = () => {
    void queryClient.invalidateQueries({ queryKey: FLYER_LIST_QUERY_KEY });
  };
  const say = (change: Partial<UploadState>) => {
    setState((now) => ({ ...now, ...change }));
  };

  const sendHtml = async (file: File) => {
    progress.start();
    const sent = await uploadHtml(bucket, file, Date.now());
    progress.finish();
    if (!sent.ok) {
      say({ error: `Error al subir: ${sent.error}` });
      return;
    }
    say({ htmlUrl: sent.value, ok: "¡Archivo subido exitosamente!" });
    toast.show("Flyer subido OK");
    reread();
  };

  const sendPicture = async (file: File, option: number) => {
    progress.start();
    toast.show("Convirtiendo flyer...");
    const rasterized = await rasterizeFlyer(file, toast.show);
    // Without the reader of PDF it stays busy, as it is today: the notice says so.
    if (rasterized === "no-reader") return;
    if (!rasterized) {
      progress.finish();
      say({ error: "No se pudo procesar el archivo." });
      return;
    }
    const name = newFlyerImage(Date.now(), option);
    const sent = await uploadFlyerImage(bucket, name, rasterized.blob);
    progress.finish();
    if (!sent.ok) {
      say({ error: `Error al subir: ${sent.error}` });
      return;
    }
    say({ ok: `¡Flyer convertido! Acomodá las zonas y guardá (${optionLabel(options, option)}).` });
    toast.show("Flyer subido — calibrá las zonas");
    reread();
    const address = URL.createObjectURL(rasterized.blob);
    const image = await loadPicture(address);
    URL.revokeObjectURL(address);
    if (image) onPicture({ image, name, url: bucket.listedUrl(name), option });
  };

  /** `option`: the one chosen in the question; 0 for an HTML, which is not asked. */
  const upload = async (file: File, option: number) => {
    setState((now) => ({ ...now, error: "", ok: "", htmlUrl: "" }));
    const problem = uploadProblem(file);
    if (problem) {
      say({ error: problem });
      return;
    }
    if (flyerFileKind(file) === "html") await sendHtml(file);
    else await sendPicture(file, option);
  };

  return { state, upload };
}
