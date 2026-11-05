// The screens of the app. A slice plugs in here: one entry per tab, with what it takes to see it and
// how to load it. When a screen stops being a place to be filled, what changes is its `load`:
//   load: () => import("@/slices/promotions/index.ts").then(({ PromotionsView }) => ({
//     default: PromotionsView,
//   })),
import type { ComponentType } from "react";
import {
  MyProposalsSource,
  PendingProposalsSource,
} from "@/shared/lib/company-registry/proposal-notices.tsx";
import type { TitleKey } from "@/shared/domain/screen-titles.ts";
import type { MenuWindowProps, NoticeSourceProps, ViewProps } from "@/shared/lib/view-props.ts";
import type { IconName } from "@/shared/ui/index.ts";
import { NotesWindow, PasswordWindow } from "@/slices/auth/index.ts";
import { buildsFlyers, hasOptionOfTab, type MenuRules, type ViewRules } from "./view-rules.ts";

export type LoadedView = { readonly default: ComponentType<ViewProps> };
export type LoadedWindow = { readonly default: ComponentType<MenuWindowProps> };

export interface AppView {
  /** The name it has in `_titulos.json`: it is a contract. */
  readonly id: string;
  /** How it is called on its tab: editable by the administrator, or fixed. */
  readonly title: { readonly key: TitleKey } | { readonly fixed: string };
  /** The tabs of one screen share it. */
  readonly hostId: string;
  /** How a test recognizes the place: see `data-screen`. */
  readonly screen: string;
  readonly visible: (rules: ViewRules) => boolean;
  readonly load: () => Promise<LoadedView>;
  /** What it says if its code cannot be downloaded. */
  readonly loadFailure: string;
}

const pendingView = (): Promise<LoadedView> => import("./PendingView.tsx");

export const FLYER_EDITOR_HOST_ID = "flyer-editor";

const FLYER_EDITOR_HOST = {
  hostId: FLYER_EDITOR_HOST_ID,
  screen: "flyer-layout",
  load: () =>
    import("@/slices/flyer-editor/index.ts").then(({ FlyerEditorView }) => ({
      default: FlyerEditorView,
    })),
  loadFailure: "No se pudo cargar el armador. Revisá la conexión e intentá de nuevo.",
} as const;

export const APP_VIEWS: readonly AppView[] = [
  {
    ...FLYER_EDITOR_HOST,
    id: "flyer",
    title: { key: "flyer" },
    visible: buildsFlyers,
  },
  {
    ...FLYER_EDITOR_HOST,
    id: "rubros",
    title: { key: "rubros" },
    visible: (rules) => buildsFlyers(rules) && hasOptionOfTab("rubros", rules),
  },
  {
    ...FLYER_EDITOR_HOST,
    id: "sueldo",
    title: { key: "sueldo" },
    visible: (rules) => buildsFlyers(rules) && hasOptionOfTab("sueldo", rules),
  },
  {
    id: "estudio",
    title: { key: "estudio" },
    hostId: "studio",
    screen: "studio",
    // The studio slice adds who received a shared design without having the permission.
    visible: (rules) => buildsFlyers(rules) && rules.can("estudio"),
    load: pendingView,
    loadFailure: "No se pudo cargar Estudio. Revisá la conexión e intentá de nuevo.",
  },
  {
    id: "promos",
    title: { key: "promos" },
    hostId: "promotions",
    screen: "promotions",
    visible: ({ can }) => can("promos_buscar"),
    load: () =>
      import("@/slices/promotions/index.ts").then(({ PromotionsView }) => ({
        default: PromotionsView,
      })),
    loadFailure: "No se pudo cargar Promociones. Revisá la conexión e intentá de nuevo.",
  },
  {
    id: "benchmark",
    title: { fixed: "Benchmark" },
    hostId: "benchmark",
    screen: "benchmark",
    visible: ({ can }) => can("benchmark"),
    load: pendingView,
    loadFailure: "No se pudo cargar el Benchmark. Revisá la conexión e intentá de nuevo.",
  },
  {
    id: "hunter",
    title: { key: "hunter" },
    hostId: "hunter",
    screen: "hunter-screen",
    visible: ({ isHunter }) => isHunter,
    load: pendingView,
    loadFailure: "No se pudo cargar la pantalla. Revisá la conexión e intentá de nuevo.",
  },
  {
    id: "gestiones",
    title: { fixed: "Gestiones" },
    hostId: "commercial-actions",
    screen: "commercial-actions",
    visible: ({ commercialActionsOn }) => commercialActionsOn,
    load: pendingView,
    loadFailure: "No se pudo cargar Gestiones. Revisá la conexión e intentá de nuevo.",
  },
];

export function viewById(id: string): AppView | undefined {
  return APP_VIEWS.find((view) => view.id === id);
}

export interface MenuWindow {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly visible: (rules: MenuRules) => boolean;
  readonly load: () => Promise<LoadedWindow>;
  /** Whose number it carries, of `NOTICE_SOURCES`. */
  readonly noticeSource?: string;
}

const pendingWindow = (): Promise<LoadedWindow> => import("./PendingWindow.tsx");

const PROPOSALS_SOURCE = "proposals";
const MY_PROPOSALS_SOURCE = "myProposals";

/** What opens a window from the name menu, above the theme. */
export const MENU_WINDOWS_ABOVE: readonly MenuWindow[] = [
  {
    id: "password",
    label: "Cambiar mi clave",
    icon: "lock",
    visible: ({ isAdminNow }) => !isAdminNow,
    load: () => Promise.resolve({ default: PasswordWindow }),
  },
];

/** What opens a window from the name menu, below the theme. */
export const MENU_WINDOWS_BELOW: readonly MenuWindow[] = [
  {
    id: "notes",
    label: "Bloc de notas",
    icon: "document",
    visible: ({ can }) => can("notas"),
    load: () => Promise.resolve({ default: NotesWindow }),
  },
  {
    // A substitute may have none of their own, and still has something to decide.
    id: "database",
    label: "Base de datos",
    icon: "database",
    noticeSource: PROPOSALS_SOURCE,
    visible: ({ can, waiting }) =>
      can("padron_buscar") || can("asesores_guardados") || waiting(PROPOSALS_SOURCE) > 0,
    load: () =>
      import("@/slices/company-registry/index.ts").then(({ DatabaseWindow }) => ({
        default: DatabaseWindow,
      })),
  },
  {
    id: "proposals",
    label: "Mis propuestas",
    icon: "document",
    noticeSource: MY_PROPOSALS_SOURCE,
    visible: ({ isHunter, can }) => isHunter && can("proponer_oficiales"),
    load: () =>
      import("@/slices/company-registry/index.ts").then(({ MyProposalsWindow }) => ({
        default: MyProposalsWindow,
      })),
  },
  {
    // tour: it is there for everybody, and it starts on request.
    id: "tour",
    label: "Ver tutorial",
    icon: "help",
    visible: () => true,
    load: pendingWindow,
  },
];

/** The search of screens: what its button of the header opens. The search slice brings it. */
export const SEARCH_WINDOW: Pick<MenuWindow, "id" | "load"> = {
  id: "search",
  load: pendingWindow,
};

/** The panel of the administrator: what its button of the header opens. The admin slice brings it. */
export const ADMIN_WINDOW: Pick<MenuWindow, "id" | "load"> = {
  id: "admin",
  load: pendingWindow,
};

/**
 * Who tells what is waiting for the person (company-registry, studio, commercial-actions, hunter),
 * by the name it reports under.
 */
export const NOTICE_SOURCES: Readonly<Record<string, ComponentType<NoticeSourceProps>>> = {
  [PROPOSALS_SOURCE]: PendingProposalsSource,
  [MY_PROPOSALS_SOURCE]: MyProposalsSource,
};
