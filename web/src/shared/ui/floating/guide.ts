// What the tutorial puts over the screen. Its veil is like a window on top: the search of screens does
// not open over it (`_cmdBloqueo`). And «Otros» of the flyer editor, that the tutorial opens on
// purpose, does not close when its globe is touched (`_fgOtrosFuera`).

/** On the veil of the tutorial. */
export const GUIDE_VEIL_ATTRIBUTE = "data-guide-veil";
/** On the globe of the tutorial. */
export const GUIDE_TIP_ATTRIBUTE = "data-guide-tip";

export function insideGuideTip(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`[${GUIDE_TIP_ATTRIBUTE}]`) !== null;
}
