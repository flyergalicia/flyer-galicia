import { type ReactNode, useCallback, useLayoutEffect, useMemo, useState } from "react";
import { ThemeActionsContext, ThemeStateContext } from "./theme-context.ts";
import {
  applyAppearance,
  type Palette,
  readStoredDark,
  readStoredPalette,
  saveDark,
  savePalette,
} from "./theme-model.ts";

function browserStorage(): Storage {
  return window.localStorage;
}

function readDark(): boolean {
  try {
    return readStoredDark(browserStorage());
  } catch {
    return false;
  }
}

function readPalette(): Palette {
  try {
    return readStoredPalette(browserStorage());
  } catch {
    return "marfil";
  }
}

function write(save: (storage: Storage) => void): void {
  try {
    save(browserStorage());
  } catch {
    // Without storage the choice lasts until the page reloads.
  }
}

type ThemeProviderProps = {
  /** Where to start instead of the saved choice. Stories use it to show each look. */
  readonly initial?: { readonly dark: boolean; readonly palette: Palette };
  readonly children: ReactNode;
};

export function ThemeProvider({ initial, children }: ThemeProviderProps) {
  const [dark, setDark] = useState(() => initial?.dark ?? readDark());
  const [palette, setPaletteState] = useState(() => initial?.palette ?? readPalette());

  useLayoutEffect(() => {
    applyAppearance(document.documentElement, dark, palette);
  }, [dark, palette]);

  const toggleDark = useCallback(() => {
    setDark((current) => {
      const next = !current;
      write((storage) => {
        saveDark(storage, next);
      });
      return next;
    });
  }, []);

  const setPalette = useCallback((next: Palette) => {
    setPaletteState(next);
    write((storage) => {
      savePalette(storage, next);
    });
  }, []);

  const state = useMemo(() => ({ dark, palette }), [dark, palette]);
  const actions = useMemo(() => ({ toggleDark, setPalette }), [toggleDark, setPalette]);

  return (
    <ThemeStateContext.Provider value={state}>
      <ThemeActionsContext.Provider value={actions}>{children}</ThemeActionsContext.Provider>
    </ThemeStateContext.Provider>
  );
}
