// What the mouse does on the preview of the editor. It zooms by drawing the flyer again.
import {
  type FlyerWorkspace,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from "@/shared/lib/flyer-workspace/index.ts";
import { attachZoomPanGestures, ZOOM_TIP } from "@/shared/lib/zoom-pan-gestures.ts";

export { ZOOM_TIP };

export interface PreviewGesturesOptions {
  readonly pane: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly workspace: Pick<FlyerWorkspace, "setZoom" | "drawNow"> & {
    readonly getState: () => { readonly zoom: number };
  };
  readonly onTip: (text: string) => void;
}

/** Returns what takes the gestures away. */
export function attachPreviewGestures({
  pane,
  canvas,
  workspace,
  onTip,
}: PreviewGesturesOptions): () => void {
  return attachZoomPanGestures({
    pane,
    target: canvas,
    limits: { min: ZOOM_MIN, max: ZOOM_MAX, step: ZOOM_STEP },
    readZoom: () => workspace.getState().zoom,
    applyZoom: (zoom) => {
      workspace.setZoom(zoom);
      workspace.drawNow();
    },
    onTip,
  });
}
