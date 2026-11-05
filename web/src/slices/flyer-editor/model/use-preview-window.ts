// The window of Vista previa shows the very picture that comes out (invariant 16): a flyer that did
// not load has nothing to show, and that is said instead (invariant 23).
import { useCallback, useState } from "react";
import { useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { LONG_NOTICE_MS, useDownloadBlock } from "./use-flyer-download.ts";

const PICTURE_QUALITY = 0.85;

export interface ShownFlyer {
  readonly canvas: HTMLCanvasElement;
  readonly picture: string;
}

export function usePreviewWindow() {
  const workspace = useFlyerWorkspace();
  const toast = useToast();
  const blocked = useDownloadBlock();
  const [shown, setShown] = useState<ShownFlyer | null>(null);
  const open = useCallback(() => {
    const reason = blocked();
    const canvas = reason ? null : workspace.renderDownload();
    if (!canvas) {
      toast.show(reason, LONG_NOTICE_MS);
      return;
    }
    setShown({ canvas, picture: canvas.toDataURL("image/jpeg", PICTURE_QUALITY) });
  }, [blocked, toast, workspace]);
  const close = useCallback(() => {
    setShown(null);
  }, []);
  return { shown, open, close };
}
