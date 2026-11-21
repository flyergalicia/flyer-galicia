// The zoom of the preview of the Hunter, over a picture already made and not over the canvas of the
// editor: there is no cost in drawing again, so it goes up to 300%.
import { attachZoomPanGestures } from "@/shared/lib/zoom-pan-gestures.ts";

const LIMITS = { min: 0.2, max: 3, step: 1.25 };
const PANE_MARGIN = 40;
const MIN_BASE_WIDTH = 200;
const RESIZE_WAIT_MS = 150;

export interface PictureZoom {
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly reset: () => void;
  /** Once the browser finished measuring a new picture. */
  readonly apply: () => void;
  readonly detach: () => void;
}

interface PictureZoomOptions {
  readonly pane: HTMLElement;
  readonly picture: HTMLImageElement;
  readonly onPercent: (percent: number) => void;
  readonly onTip: (text: string) => void;
}

export function attachPictureZoom({
  pane,
  picture,
  onPercent,
  onTip,
}: PictureZoomOptions): PictureZoom {
  let zoom = 1;

  /** At 100%, the picture or what fits in the pane, whichever is smaller. */
  const baseWidth = () =>
    Math.min(picture.naturalWidth, Math.max(pane.clientWidth - PANE_MARGIN, MIN_BASE_WIDTH));

  const apply = () => {
    if (zoom === 1 || !picture.naturalWidth) {
      picture.style.width = "";
      picture.style.maxWidth = "";
    } else {
      picture.style.maxWidth = "none";
      picture.style.width = `${String(Math.round(baseWidth() * zoom))}px`;
    }
    onPercent(Math.round(zoom * 100));
  };

  const zoomTo = (next: number) => {
    zoom = next;
    apply();
  };

  const detachGestures = attachZoomPanGestures({
    pane,
    target: picture,
    limits: LIMITS,
    readZoom: () => zoom,
    applyZoom: zoomTo,
    onTip,
    canZoom: () => picture.naturalWidth > 0,
    noDragOn: "button, a, [data-preview-head]",
  });

  let resizing: ReturnType<typeof setTimeout> | undefined;
  const onResize = () => {
    clearTimeout(resizing);
    resizing = setTimeout(() => {
      if (zoom !== 1) apply();
    }, RESIZE_WAIT_MS);
  };
  window.addEventListener("resize", onResize);

  return {
    zoomIn: () => {
      zoomTo(Math.min(zoom * LIMITS.step, LIMITS.max));
    },
    zoomOut: () => {
      zoomTo(Math.max(zoom / LIMITS.step, LIMITS.min));
    },
    reset: () => {
      zoomTo(1);
    },
    apply,
    detach: () => {
      clearTimeout(resizing);
      window.removeEventListener("resize", onResize);
      detachGestures();
    },
  };
}
