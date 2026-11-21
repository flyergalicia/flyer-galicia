export const PALETTES = ["marfil", "marino", "grafito", "cielo"] as const;
export type Palette = (typeof PALETTES)[number];

export const THEME_KEY = "fg_theme";
export const PALETTE_KEY = "fg_palette";
const PALETTE_PREFIX = "t-";
const DEFAULT_PALETTE: Palette = "marfil";

/** Saved values can be anything, and the browser can refuse to read them. */
export function readStoredDark(storage: Pick<Storage, "getItem">): boolean {
  try {
    return storage.getItem(THEME_KEY) === "dark";
  } catch {
    return false;
  }
}

export function readStoredPalette(storage: Pick<Storage, "getItem">): Palette {
  try {
    const stored = storage.getItem(PALETTE_KEY);
    const found = PALETTES.find((palette) => `${PALETTE_PREFIX}${palette}` === stored);
    return found ?? DEFAULT_PALETTE;
  } catch {
    return DEFAULT_PALETTE;
  }
}

export function saveDark(storage: Pick<Storage, "setItem">, dark: boolean): void {
  try {
    storage.setItem(THEME_KEY, dark ? "dark" : "light");
  } catch {
    // A preference that cannot be saved still applies until the page reloads.
  }
}

export function savePalette(storage: Pick<Storage, "setItem">, palette: Palette): void {
  try {
    storage.setItem(PALETTE_KEY, `${PALETTE_PREFIX}${palette}`);
  } catch {
    // A preference that cannot be saved still applies until the page reloads.
  }
}

/** The classes on <html> are what the tokens listen to. */
export function applyAppearance(root: HTMLElement, dark: boolean, palette: Palette): void {
  root.classList.toggle("dark", dark);
  for (const name of PALETTES) {
    root.classList.toggle(`${PALETTE_PREFIX}${name}`, name === palette);
  }
}
