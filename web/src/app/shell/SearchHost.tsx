// The search of screens on the shell: Cmd+K on a Mac, Ctrl+K elsewhere, or the button of the header
// (`fgCmdK`, `_cmdIr`). What it lists comes from the registry; what each entry does is what its button
// does. Base de datos and the panel close themselves on the way out, with their question about what is
// not saved.
import { type ComponentType, lazy, type ReactNode, Suspense, useState } from "react";
import type { FlyerOption } from "@/shared/domain/flyer-options.ts";
import type { ScreenTitles } from "@/shared/domain/screen-titles.ts";
import { databasePanes } from "@/shared/domain/company-registry/database-panes.ts";
import { useFlyerGeneration } from "@/shared/lib/company-registry/flyer-generation-port.ts";
import { useOptionOnScreen } from "@/shared/lib/option-on-screen/option-on-screen-context.ts";
import { type PlaceDesk, usePlaceDesk } from "@/shared/lib/places/place-desk.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { usePermissions, useSessionActions } from "@/shared/session/index.ts";
import { closeFloating, useTheme, useThemeActions } from "@/shared/ui/index.ts";
import {
  loadSearchWindow,
  type SearchEntry,
  searchBlock,
  type SearchWindowProps,
  useSearchShortcut,
} from "@/slices/search/index.ts";
import { headerTabsOf } from "../registry/header-tabs.ts";
import { tabOrder } from "../registry/resolve-view.ts";
import { type AppSearchEntry, type SearchMove, searchEntries } from "../registry/search-entries.ts";
import type { MenuRules } from "../registry/view-rules.ts";
import {
  ADMIN_WINDOW,
  MENU_WINDOWS_BELOW,
  type MenuWindow,
  PROPOSALS_SOURCE,
} from "../registry/views.ts";
import { LoadBoundary } from "./LoadBoundary.tsx";

/** Where the shell goes: the same ways its tabs and windows take. */
export interface ShellWays {
  readonly goToTab: (tab: string) => void;
  readonly openWindow: (window: Pick<MenuWindow, "id" | "load">) => void;
  /** The window open now, by its id; null with none. */
  readonly openWindowId: string | null;
}

type LoadWindow = () => Promise<{ readonly default: ComponentType<SearchWindowProps> }>;

interface SearchHostProps extends ShellWays {
  readonly rules: MenuRules;
  readonly titles: ScreenTitles;
  readonly activeId: string;
  readonly flyerOptions: readonly FlyerOption[];
  /** What is around: it gets how to open the search, for the button of the header. */
  readonly children: (toggle: () => void) => ReactNode;
  /** Where the window comes from: its code comes down the first time. */
  readonly loadWindow?: LoadWindow;
}

interface OpenSearch {
  readonly entries: readonly AppSearchEntry[];
  /** Where the focus was: cancelling gives it back. */
  readonly returnFocus: Element | null;
}

const COULD_NOT_OPEN = "No se pudo abrir. Revisá la conexión e intentá de nuevo.";
const DATABASE_WINDOW = MENU_WINDOWS_BELOW.find(({ id }) => id === "database");
/** The windows that are screens: the search goes elsewhere from them, closing them first. */
const SCREEN_WINDOWS: ReadonlySet<string> = new Set(["admin", "database"]);

function giveFocusBack(element: Element | null): void {
  if (element instanceof HTMLElement && document.contains(element)) element.focus();
}

interface MoveWays extends ShellWays {
  readonly desk: PlaceDesk | null;
  readonly toggleDark: () => void;
  readonly signOut: () => void;
}

function run(move: SearchMove, ways: MoveWays): void {
  const { desk, goToTab, openWindow, openWindowId } = ways;
  switch (move.kind) {
    case "tab":
      goToTab(move.tab);
      return;
    case "place":
      desk?.ask(move.holder, move.place);
      goToTab(move.tab);
      return;
    case "database":
      desk?.ask("database", move.pane);
      if (openWindowId !== "database" && DATABASE_WINDOW) openWindow(DATABASE_WINDOW);
      return;
    case "admin":
      desk?.ask("admin", move.sheet);
      if (openWindowId !== "admin") openWindow(ADMIN_WINDOW);
      return;
    case "window":
      openWindow(move.window);
      return;
    case "theme":
      ways.toggleDark();
      return;
    default:
      ways.signOut();
  }
}

/** The window that has to be left first, if the entry goes elsewhere. */
function windowToLeave({ openWindowId }: ShellWays, move: SearchMove): "admin" | "database" | null {
  if (openWindowId === null || !SCREEN_WINDOWS.has(openWindowId)) return null;
  if (move.kind === openWindowId) return null;
  return openWindowId === "admin" ? "admin" : "database";
}

function useSources({ rules, titles, activeId, flyerOptions }: SearchHostProps) {
  const { effectiveRole } = usePermissions();
  const optionOnScreen = useOptionOnScreen();
  const { dark } = useTheme();
  // What there is right now, as the shell shows it.
  return () =>
    searchEntries({
      tabs: headerTabsOf(tabOrder(titles.order), rules, titles),
      activeId,
      rules,
      role: effectiveRole,
      flyerOptions,
      optionOnScreen: optionOnScreen.get(),
      // What waits in Cambios pendientes, as the menu counts it.
      databasePanes: databasePanes(rules.can, rules.waiting(PROPOSALS_SOURCE)),
      dark,
    });
}

export function SearchHost(props: SearchHostProps) {
  const { children, loadWindow = loadSearchWindow } = props;
  const generation = useFlyerGeneration();
  const desk = usePlaceDesk();
  const toast = useToast();
  const { toggleDark } = useThemeActions();
  const { signOut } = useSessionActions();
  const entriesNow = useSources(props);
  const [open, setOpen] = useState<OpenSearch | null>(null);
  const [Window, setWindow] = useState<ComponentType<SearchWindowProps>>(() => lazy(loadWindow));
  const cancel = () => {
    setOpen(null);
    giveFocusBack(open?.returnFocus ?? null);
  };
  const toggle = () => {
    if (open) {
      cancel();
      return;
    }
    const block = searchBlock(generation?.isGenerating() ?? false);
    if (block) {
      toast.show(block);
      return;
    }
    // What floats (the name menu, the magnifying glass, the advisors, the provinces, «Otros»)
    // closes, as `fgCmdK` does.
    closeFloating();
    setOpen({ entries: entriesNow(), returnFocus: document.activeElement });
  };
  const choose = (chosen: SearchEntry) => {
    const entry = open?.entries.find((candidate) => candidate === chosen);
    setOpen(null);
    if (!entry) return;
    const ways: MoveWays = {
      ...props,
      desk,
      toggleDark,
      signOut: () => {
        void signOut();
      },
    };
    const go = () => {
      try {
        run(entry.move, ways);
      } catch {
        toast.show(`No se pudo abrir «${entry.title}».`);
      }
    };
    const leaving = windowToLeave(ways, entry.move);
    if (leaving && entry.move.kind !== "theme") desk?.leave(leaving, go);
    else go();
  };

  const keys = useSearchShortcut(open !== null, toggle);

  return (
    <>
      {children(toggle)}
      {open && (
        <LoadBoundary
          message={COULD_NOT_OPEN}
          onRetry={() => {
            setWindow(() => lazy(loadWindow));
            setOpen(null);
          }}
        >
          <Suspense fallback={null}>
            <Window entries={open.entries} keys={keys} onChoose={choose} onCancel={cancel} />
          </Suspense>
        </LoadBoundary>
      )}
    </>
  );
}
