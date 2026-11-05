import {
  type ComponentType,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type FlyerOption, isFlyerTabId } from "@/shared/domain/flyer-options.ts";
import type { ScreenTitles } from "@/shared/domain/screen-titles.ts";
import { FlyerGenerationHost } from "@/shared/lib/company-registry/FlyerGenerationHost.tsx";
import type { MenuWindowProps } from "@/shared/lib/view-props.ts";
import { type SessionValue, usePermissions } from "@/shared/session/index.ts";
import { firstView, resolveView } from "../registry/resolve-view.ts";
import type { MenuRules } from "../registry/view-rules.ts";
import {
  ADMIN_WINDOW,
  FLYER_EDITOR_HOST_ID,
  MENU_WINDOWS_BELOW,
  type MenuWindow,
  NOTICE_SOURCES,
  SEARCH_WINDOW,
} from "../registry/views.ts";
import { AppHeader } from "./AppHeader.tsx";
import { LoadBoundary } from "./LoadBoundary.tsx";
import { PromotionPickingHost } from "./PromotionPickingHost.tsx";
import { useWaitingNotices } from "./use-waiting-notices.tsx";
import { ViewHost } from "./ViewHost.tsx";
import styles from "./AppShell.module.css";

type SignedInSession = Extract<SessionValue, { readonly status: "signed-in" }>;

interface OpenWindow {
  readonly id: string;
  readonly Component: ComponentType<MenuWindowProps>;
}

interface AppShellProps {
  readonly session: SignedInSession;
  readonly titles: ScreenTitles;
  readonly flyerOptions: readonly FlyerOption[];
  readonly commercialActionsOn: boolean;
  /** Who tells what is waiting for this person. */
  readonly noticeSources?: Parameters<typeof useWaitingNotices>[0];
}

/** What is around every screen: the header, and the screen of the tab that is chosen. */
export function AppShell({
  session,
  titles,
  flyerOptions,
  commercialActionsOn,
  noticeSources = NOTICE_SOURCES,
}: AppShellProps) {
  const { can, isHunter, isLeader, isAdminNow } = usePermissions();
  const { notice, reporters, waiting } = useWaitingNotices(noticeSources);
  const rules = useMemo<MenuRules>(
    () => ({ can, isHunter, isLeader, isAdminNow, commercialActionsOn, flyerOptions, waiting }),
    [can, isHunter, isLeader, isAdminNow, commercialActionsOn, flyerOptions, waiting],
  );
  const [chosen, setChosen] = useState(() => firstView(rules, titles.order));
  const [openWindow, setOpenWindow] = useState<OpenWindow | null>(null);
  const [needsEditor, setNeedsEditor] = useState(false);
  const activeId = resolveView(chosen, rules);
  const isOnFlyerEditor = isFlyerTabId(activeId);

  useEffect(() => {
    // What the toast and the fixed pieces of the flyer editor listen to, on a phone.
    document.body.dataset.flyerEditor = String(isOnFlyerEditor);
    return () => {
      delete document.body.dataset.flyerEditor;
    };
  }, [isOnFlyerEditor]);

  const closeWindow = useCallback(() => {
    setOpenWindow(null);
  }, []);

  const onNeedEditor = useCallback(() => {
    setNeedsEditor(true);
  }, []);

  const showWindow = useCallback(({ id, load }: Pick<MenuWindow, "id" | "load">) => {
    setOpenWindow({ id, Component: lazy(load) });
  }, []);
  const openMenuWindow = useCallback(
    (windowId: string) => {
      const menuWindow = MENU_WINDOWS_BELOW.find(({ id }) => id === windowId);
      if (menuWindow) showWindow(menuWindow);
    },
    [showWindow],
  );
  const showSearch = useCallback(() => {
    showWindow(SEARCH_WINDOW);
  }, [showWindow]);
  const showAdmin = useCallback(() => {
    showWindow(ADMIN_WINDOW);
  }, [showWindow]);

  const { displayName, role, isAdmin, profile } = session;
  const Window = openWindow?.Component;

  return (
    <FlyerGenerationHost onNeedEditor={onNeedEditor}>
      <div className={styles.shell}>
        {reporters}
        <AppHeader
          activeId={activeId}
          titles={titles}
          rules={rules}
          name={displayName}
          role={role}
          isAdmin={isAdmin}
          isTestAccount={profile.es_prueba}
          notice={notice}
          onSelectView={setChosen}
          onOpenWindow={showWindow}
          onOpenSearch={showSearch}
          onOpenAdmin={showAdmin}
        />
        <PromotionPickingHost activeId={activeId} goTo={setChosen}>
          <ViewHost
            activeId={activeId}
            alsoOpen={needsEditor ? FLYER_EDITOR_HOST_ID : undefined}
            goToTab={setChosen}
            openMenuWindow={openMenuWindow}
          />
        </PromotionPickingHost>
        {Window && (
          <LoadBoundary
            key={openWindow.id}
            message="No se pudo abrir. Revisá la conexión e intentá de nuevo."
            onRetry={closeWindow}
          >
            <Suspense fallback={null}>
              <Window onClose={closeWindow} />
            </Suspense>
          </LoadBoundary>
        )}
      </div>
    </FlyerGenerationHost>
  );
}
