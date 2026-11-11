const OPEN_WINDOW = '[aria-modal="true"], [role="dialog"], [role="alertdialog"], dialog[open]';

/** A window on top of the screen goes first, whichever it is. */
export function hasOpenWindow(root: Pick<Document, "querySelector"> = document): boolean {
  return root.querySelector(OPEN_WINDOW) !== null;
}
