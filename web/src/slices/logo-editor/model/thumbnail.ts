// The small image of the window: what is on that place NOW. The logo put or, if it was not touched,
// the one printed on the flyer. It is drawn directly on its canvas.
import type { FlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { type FlyerPlace, isFromFlyer, isUploaded } from "./change.ts";
import type { LogoEditor } from "./editor-store.ts";

type ThumbnailEditor = Pick<LogoEditor, "picture" | "currentArt">;

const MAX_WIDTH = 96;
const MAX_HEIGHT = 56;

function fit(canvas: HTMLCanvasElement, width: number, height: number): void {
  const factor = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height);
  canvas.width = Math.max(1, Math.round(width * factor));
  canvas.height = Math.max(1, Math.round(height * factor));
}

function drawLogo(canvas: HTMLCanvasElement, logo: HTMLCanvasElement): void {
  fit(canvas, logo.width, logo.height);
  const context = canvas.getContext("2d");
  if (!context) return;
  context.imageSmoothingQuality = "high";
  context.drawImage(logo, 0, 0, canvas.width, canvas.height);
  canvas.hidden = false;
}

function drawPlace(canvas: HTMLCanvasElement, editor: ThumbnailEditor, place: FlyerPlace): void {
  const art = editor.picture();
  if (!art) return;
  const { x, y, w, h } = place;
  fit(canvas, w, h);
  canvas.getContext("2d")?.drawImage(art, x, y, w, h, 0, 0, canvas.width, canvas.height);
  canvas.hidden = false;
}

export interface ThumbnailRequest {
  readonly canvas: HTMLCanvasElement;
  readonly editor: ThumbnailEditor;
  readonly logos: Pick<FlyerWorkspace["logos"], "imageFor" | "fetch">;
  readonly place: FlyerPlace;
  /** The logo on that place; "" if it was not touched. */
  readonly logoKey: string;
}

/** Returns what stops a logo that is on its way: the window may close first. */
export function paintThumbnail({
  canvas,
  editor,
  logos,
  place,
  logoKey,
}: ThumbnailRequest): () => void {
  if (!logoKey) {
    drawPlace(canvas, editor, place);
    return () => undefined;
  }
  const art = editor.picture();
  const image = art && logos.imageFor(logoKey, art, editor.currentArt());
  if (image instanceof HTMLCanvasElement && image.width) {
    drawLogo(canvas, image);
    return () => undefined;
  }
  // Its logo is not in memory: the one of the flyer is not shown. It is asked for, and drawn.
  canvas.hidden = true;
  if (isUploaded(logoKey) || isFromFlyer(logoKey)) return () => undefined;
  let isWaiting = true;
  logos.fetch(logoKey).then(
    (logo) => {
      if (isWaiting && logo.width) drawLogo(canvas, logo);
    },
    () => undefined,
  );
  return () => {
    isWaiting = false;
  };
}
