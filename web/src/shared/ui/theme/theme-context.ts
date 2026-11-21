import { createContext, useContext } from "react";
import type { Palette } from "./theme-model.ts";

type ThemeState = {
  readonly dark: boolean;
  readonly palette: Palette;
};

type ThemeActions = {
  readonly toggleDark: () => void;
  readonly setPalette: (palette: Palette) => void;
};

export const ThemeStateContext = createContext<ThemeState | null>(null);
export const ThemeActionsContext = createContext<ThemeActions | null>(null);

export function useTheme(): ThemeState {
  const state = useContext(ThemeStateContext);
  if (!state) throw new Error("useTheme must be inside a ThemeProvider");
  return state;
}

export function useThemeActions(): ThemeActions {
  const actions = useContext(ThemeActionsContext);
  if (!actions) throw new Error("useThemeActions must be inside a ThemeProvider");
  return actions;
}
