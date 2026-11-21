// The canvas is drawn from the store, with no render of React in between (plan, "Manejo de estado").
import { createFlyerPreview } from "@/shared/flyer-engine/index.ts";
import type { FlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { attachPreviewGestures } from "./preview-gestures.ts";

const SIDE_PADDING = 40;
const RESIZE_WAIT_MS = 150;

export interface PreviewDrawingOptions {
  readonly canvas: HTMLCanvasElement;
  readonly pane: HTMLElement;
  readonly workspace: FlyerWorkspace;
  readonly onTip: (text: string) => void;
}

/** Returns what stops it. */
export function attachPreviewDrawing({
  canvas,
  pane,
  workspace,
  onTip,
}: PreviewDrawingOptions): () => void {
  const preview = createFlyerPreview({
    canvas,
    readFrame: workspace.readFrame,
    logos: workspace.logos,
    onDrawn: ({ extra }) => {
      workspace.noteDrawn(extra);
    },
  });
  workspace.attachPreview(preview);
  const measure = () => {
    if (pane.clientWidth > 0) workspace.fitToWidth(pane.clientWidth - SIDE_PADDING);
    workspace.requestDraw();
  };
  measure();
  let wait: ReturnType<typeof setTimeout> | undefined;
  const resized = new ResizeObserver(() => {
    clearTimeout(wait);
    wait = setTimeout(measure, RESIZE_WAIT_MS);
  });
  resized.observe(pane);
  const detach = attachPreviewGestures({ pane, canvas, workspace, onTip });
  return () => {
    clearTimeout(wait);
    resized.disconnect();
    detach();
    preview.dispose();
    workspace.attachPreview(null);
  };
}
