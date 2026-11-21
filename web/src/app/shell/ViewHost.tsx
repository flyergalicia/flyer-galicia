import { type ComponentType, lazy, Suspense, useState } from "react";
import type { ViewProps } from "@/shared/lib/view-props.ts";
import { APP_VIEWS, type AppView, type LoadedView, viewById } from "../registry/views.ts";
import { LoadBoundary } from "./LoadBoundary.tsx";
import styles from "./AppShell.module.css";

interface ScreenWays {
  readonly goToTab: NonNullable<ViewProps["goToTab"]>;
  readonly openMenuWindow: NonNullable<ViewProps["openMenuWindow"]>;
}

interface LazyViewProps extends Pick<ViewProps, "isActive" | "tabId">, ScreenWays {
  readonly load: () => Promise<LoadedView>;
  readonly loadFailure: string;
}

export function LazyView({
  load,
  loadFailure,
  isActive,
  tabId,
  goToTab,
  openMenuWindow,
}: LazyViewProps) {
  const [attempt, setAttempt] = useState(0);
  const [Screen, setScreen] = useState<ComponentType<ViewProps>>(() => lazy(load));
  const retry = () => {
    setAttempt((tries) => tries + 1);
    setScreen(() => lazy(load));
  };
  return (
    <LoadBoundary key={attempt} message={loadFailure} onRetry={retry}>
      <Suspense fallback={null}>
        <Screen
          isActive={isActive}
          tabId={tabId}
          goToTab={goToTab}
          openMenuWindow={openMenuWindow}
        />
      </Suspense>
    </LoadBoundary>
  );
}

/** One per screen: the tabs of the flyer editor share theirs. */
const HOSTS: readonly AppView[] = APP_VIEWS.filter(
  (view, index) => APP_VIEWS.findIndex(({ hostId }) => hostId === view.hostId) === index,
);

/**
 * A screen stays mounted once it was opened, as it is today: what was being done is still there on
 * coming back. Its code is not downloaded until then.
 */
export function ViewHost({
  activeId,
  alsoOpen,
  goToTab,
  openMenuWindow,
}: ScreenWays & {
  readonly activeId: string;
  /** A screen somebody else needs on the page, even if its tab is not the one chosen. */
  readonly alsoOpen?: string | undefined;
}) {
  const active = viewById(activeId);
  const activeHost = active?.hostId ?? "";
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set([activeHost]));
  if (!opened.has(activeHost)) setOpened(new Set([...opened, activeHost]));
  if (alsoOpen && !opened.has(alsoOpen)) setOpened(new Set([...opened, alsoOpen]));

  return (
    <main className={styles.host}>
      {HOSTS.filter(({ hostId }) => opened.has(hostId)).map(
        ({ hostId, screen, load, loadFailure }) => {
          const isActive = hostId === activeHost;
          return (
            <section key={hostId} className={styles.view} data-screen={screen} hidden={!isActive}>
              <LazyView
                load={load}
                loadFailure={loadFailure}
                isActive={isActive}
                tabId={isActive ? activeId : hostId}
                goToTab={goToTab}
                openMenuWindow={openMenuWindow}
              />
            </section>
          );
        },
      )}
    </main>
  );
}
