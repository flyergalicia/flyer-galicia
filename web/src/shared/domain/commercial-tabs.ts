// The solapas of Gestiones of each profile (`_gesTabsDe`). They live here, apart from the screen,
// because the search of screens lists them before the code of Gestiones comes down.

export type InnerTab = "empresas" | "agenda" | "lista" | "tablero";
export type TabChoice = readonly [InnerTab, string];

const HUNTER_TABS: readonly TabChoice[] = [
  ["agenda", "Mi agenda"],
  ["lista", "Mis gestiones"],
  ["tablero", "Tablero"],
];

const LEADER_TABS: readonly TabChoice[] = [
  ["agenda", "Agenda del equipo"],
  ["tablero", "Tablero del equipo"],
  ["lista", "Gestiones del equipo"],
];

const OFFICER_TABS: readonly TabChoice[] = [
  ["empresas", "Mis empresas"],
  ["agenda", "Agenda"],
  ["lista", "Gestiones"],
  ["tablero", "Tablero"],
];

/** The solapas of each profile, in their order. */
export function tabsOf(role: string | null): readonly TabChoice[] {
  if (role === "hunter") return HUNTER_TABS;
  return role === "lider" ? LEADER_TABS : OFFICER_TABS;
}

export function isInnerTab(value: string): value is InnerTab {
  return OFFICER_TABS.some(([id]) => id === value);
}
