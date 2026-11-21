// What the search of screens lists for this person (`_cmdEntradas`), in this order: the tabs of the
// header, the flyers, the places of the flyer editor, Promociones, Gestiones, Benchmark, Base de datos,
// the panel and the account. It adds no permission: each list comes from where the app already
// decided it (the tabs, the options of the profile, the panes of Base de datos, the sheets of the
// panel, the items of the name menu). A screen, a sheet or a flyer that is added appears by itself.
import { PILLARS, SHEETS } from "@/shared/domain/admin-sheets.ts";
import { BENCHMARK_VIEWS } from "@/shared/domain/benchmark-views.ts";
import { tabsOf } from "@/shared/domain/commercial-tabs.ts";
import type { DatabasePaneInfo } from "@/shared/domain/company-registry/database-panes.ts";
import {
  EDITOR_PANELS,
  LOGO_EDITING_PLACE,
  optionPlace,
  OTHERS_PLACE,
} from "@/shared/domain/editor-panels.ts";
import {
  type FlyerOption,
  isFlyerTabId,
  optionLabel,
  optionTab,
} from "@/shared/domain/flyer-options.ts";
import { PROMOTIONS_TABS } from "@/shared/domain/promotions/tabs.ts";
import type { PlaceHolder } from "@/shared/lib/places/place-desk.ts";
import type { SearchEntry } from "@/slices/search/index.ts";
import type { HeaderTab } from "./header-tabs.ts";
import { buildsFlyers, type MenuRules } from "./view-rules.ts";
import { MENU_WINDOWS_ABOVE, MENU_WINDOWS_BELOW, type MenuWindow } from "./views.ts";

/** What choosing an entry does: the same as its button. */
export type SearchMove =
  | { readonly kind: "tab"; readonly tab: string }
  | {
      readonly kind: "place";
      readonly tab: string;
      readonly holder: PlaceHolder;
      readonly place: string;
    }
  | { readonly kind: "database"; readonly pane: string }
  | { readonly kind: "admin"; readonly sheet: string }
  | { readonly kind: "window"; readonly window: MenuWindow }
  | { readonly kind: "theme" }
  | { readonly kind: "sign-out" };

export interface AppSearchEntry extends SearchEntry {
  readonly move: SearchMove;
}

export interface SearchSources {
  readonly tabs: readonly HeaderTab[];
  readonly activeId: string;
  readonly rules: MenuRules;
  /** The profile of now, also in the preview of a profile: it decides the solapas of Gestiones. */
  readonly role: string | null;
  readonly flyerOptions: readonly FlyerOption[];
  /** The flyer open on the editor; null before it opened. */
  readonly optionOnScreen: number | null;
  readonly databasePanes: readonly DatabasePaneInfo[];
  readonly dark: boolean;
}

/** Other words each tab is also found with (`_CMD_CLAVES`). */
const TAB_KEYWORDS: Readonly<Record<string, string>> = {
  flyer: "armador inicio",
  rubros: "armador combustible supermercado",
  sueldo: "armador cashback",
  estudio: "disenos publicar",
  promos: "promociones marcas beneficios buscador",
  benchmark: "competencia bancos comparar",
  hunter: "empresa cuit",
  gestiones: "visitas prospectos altas agenda tablero",
};

/** And each sheet of the panel (`_CMD_CLAVES_ADMIN`). */
const SHEET_KEYWORDS: Readonly<Record<string, string>> = {
  usuarios: "altas cuentas perfiles",
  registros: "flyers generados",
  uso: "estadisticas metricas",
  facultades: "permisos perfiles",
  auditoria: "acciones log",
  varios: "padron excel",
  padronotros: "padron",
  padronlog: "padron historial",
  subir: "flyer pdf imagen calibrar",
  legales: "legal texto",
  opciones: "solapas flyers",
  vigiladas: "promociones vencidas",
};

const EDITOR_KEYWORDS: Readonly<Record<string, string>> = {
  individual: "un flyer formulario",
  masivo: "excel zip varios",
  historial: "anteriores descargados",
};

const PROMOTIONS_KEYWORDS: Readonly<Record<string, readonly [string, string]>> = {
  search: ["buscar", "pegar marcas validar"],
  active: ["activas", "vigentes provincia rubro"],
};

const FIRST_OPTION = 1;

function tabEntries({ tabs, activeId }: SearchSources): AppSearchEntry[] {
  return tabs.map(({ id, title }) => ({
    id: `app:${id}`,
    group: "Pantallas",
    title,
    keywords: TAB_KEYWORDS[id],
    current: id === activeId,
    move: { kind: "tab", tab: id },
  }));
}

/** A list of one is not a choice: it goes only with more than one flyer. */
function flyerEntries(sources: SearchSources): AppSearchEntry[] {
  const { flyerOptions, rules, tabs, activeId, optionOnScreen } = sources;
  const allowed = flyerOptions.filter(({ n }) => rules.can(`opcion_${n}`));
  if (allowed.length < 2) return [];
  const isOnEditor = isFlyerTabId(activeId);
  return allowed.map(({ n, solapa }) => ({
    id: `opt:${String(n)}`,
    group: "Flyers",
    title: optionLabel(flyerOptions, n),
    keywords: tabs.find(({ id }) => id === solapa)?.title,
    current: isOnEditor && n === optionOnScreen,
    move: { kind: "place", tab: solapa, holder: "flyer-editor", place: optionPlace(n) },
  }));
}

/** The editor opens on the tab of the flyer it has. */
function editorEntries({ flyerOptions, optionOnScreen }: SearchSources): AppSearchEntry[] {
  const tab = optionTab(flyerOptions, optionOnScreen ?? FIRST_OPTION);
  const move = (place: string): SearchMove => ({
    kind: "place",
    tab,
    holder: "flyer-editor",
    place,
  });
  return [
    ...EDITOR_PANELS.map(([panel, title]) => ({
      id: `tab:${panel}`,
      group: "Armador",
      title,
      keywords: EDITOR_KEYWORDS[panel],
      move: move(panel),
    })),
    {
      id: "fn:logos",
      group: "Armador",
      title: "Cambiar logos",
      keywords: "marcas franja recortar insertar",
      move: move(LOGO_EDITING_PLACE),
    },
    {
      id: "fn:otros",
      group: "Armador",
      title: "Otros",
      keywords: "png descargar sede",
      move: move(OTHERS_PLACE),
    },
  ];
}

function hasTab({ tabs }: SearchSources, id: string): boolean {
  return tabs.some((tab) => tab.id === id);
}

function promotionEntries(sources: SearchSources): AppSearchEntry[] {
  if (!hasTab(sources, "promos")) return [];
  return PROMOTIONS_TABS.map(([tab, title]) => {
    const [id, keywords] = PROMOTIONS_KEYWORDS[tab] ?? [tab, ""];
    return {
      id: `pro:${id}`,
      group: "Promociones",
      title,
      keywords,
      move: { kind: "place", tab: "promos", holder: "promotions", place: tab },
    };
  });
}

function commercialEntries(sources: SearchSources): AppSearchEntry[] {
  if (!hasTab(sources, "gestiones")) return [];
  return tabsOf(sources.role).map(([tab, title]) => ({
    id: `ges:${tab}`,
    group: "Gestiones",
    title,
    move: { kind: "place", tab: "gestiones", holder: "commercial-actions", place: tab },
  }));
}

function benchmarkEntries(sources: SearchSources): AppSearchEntry[] {
  if (!hasTab(sources, "benchmark")) return [];
  return BENCHMARK_VIEWS.map(([view, title]) => ({
    id: `ben:${view}`,
    group: "Benchmark",
    title,
    move: { kind: "place", tab: "benchmark", holder: "benchmark", place: view },
  }));
}

function shows(windows: readonly MenuWindow[], id: string, rules: MenuRules): MenuWindow | null {
  const found = windows.find((window) => window.id === id);
  return found?.visible(rules) ? found : null;
}

function databaseEntries({ rules, databasePanes }: SearchSources): AppSearchEntry[] {
  if (!shows(MENU_WINDOWS_BELOW, "database", rules)) return [];
  return databasePanes.map(({ id, label }) => ({
    id: `bd:${id}`,
    group: "Base de datos",
    title: label,
    keywords: "padron excel",
    move: { kind: "database", pane: id },
  }));
}

function panelEntries({ rules }: SearchSources): AppSearchEntry[] {
  if (!rules.isAdminNow) return [];
  return PILLARS.flatMap(([pillar, group]) =>
    SHEETS[pillar].map(([sheet, title]) => ({
      id: `adm:${sheet}`,
      group,
      title,
      keywords: `panel ${SHEET_KEYWORDS[sheet] ?? ""}`,
      move: { kind: "admin", sheet },
    })),
  );
}

function windowEntry(
  window: MenuWindow | null,
  id: string,
  keywords?: string,
): readonly AppSearchEntry[] {
  if (!window) return [];
  return [{ id, group: "Cuenta", title: window.label, keywords, move: { kind: "window", window } }];
}

function accountEntries({ rules, dark }: SearchSources): AppSearchEntry[] {
  return [
    {
      id: "fn:tema",
      group: "Cuenta",
      title: dark ? "Modo claro" : "Modo oscuro",
      keywords: "tema color noche dia",
      move: { kind: "theme" },
    },
    ...windowEntry(shows(MENU_WINDOWS_BELOW, "notes", rules), "fn:notas"),
    ...windowEntry(shows(MENU_WINDOWS_BELOW, "proposals", rules), "fn:propuestas"),
    ...windowEntry(shows(MENU_WINDOWS_ABOVE, "password", rules), "fn:clave", "contrasena password"),
    ...windowEntry(shows(MENU_WINDOWS_BELOW, "tour", rules), "fn:tutorial", "ayuda"),
    {
      id: "fn:salir",
      group: "Cuenta",
      title: "Salir",
      keywords: "cerrar sesion logout",
      forgotten: true,
      move: { kind: "sign-out" },
    },
  ];
}

export function searchEntries(sources: SearchSources): readonly AppSearchEntry[] {
  const flyerEditor = buildsFlyers(sources.rules)
    ? [...flyerEntries(sources), ...editorEntries(sources)]
    : [];
  return [
    ...tabEntries(sources),
    ...flyerEditor,
    ...promotionEntries(sources),
    ...commercialEntries(sources),
    ...benchmarkEntries(sources),
    ...databaseEntries(sources),
    ...panelEntries(sources),
    ...accountEntries(sources),
  ];
}
