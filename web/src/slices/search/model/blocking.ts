// When the search does not open (`_cmdBloqueo`). A window open may have something half done, and
// leaving from under it would leave it over another screen: it is closed first. Base de datos and the
// panel of the administrator are left open: they are screens, and going elsewhere closes them with
// their question about what is not saved.
import { BATCH_RUNNING_NOTICE } from "@/shared/lib/flyer-workspace/batch-lock.ts";

export const WINDOW_OPEN_NOTICE = "Cerrá la ventana abierta para usar el buscador.";

const WINDOW = '[aria-modal="true"], [role="dialog"], [role="alertdialog"], dialog[open]';
/** A window that works as a screen: the search opens over it. */
const SCREEN_WINDOW = "data-screen-window";

function isShown(element: Element): boolean {
  return element.getClientRects().length > 0;
}

export function windowInTheWay(root: ParentNode = document): boolean {
  return [...root.querySelectorAll(WINDOW)].some(
    (element) => !element.hasAttribute(SCREEN_WINDOW) && isShown(element),
  );
}

/** What it says instead of opening; empty when it opens. */
export function searchBlock(isGenerating: boolean, root: ParentNode = document): string {
  if (isGenerating) return BATCH_RUNNING_NOTICE;
  return windowInTheWay(root) ? WINDOW_OPEN_NOTICE : "";
}
