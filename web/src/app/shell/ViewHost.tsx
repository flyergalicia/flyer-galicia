import { type ComponentType, lazy, Suspense, useState } from "react";
import type { ViewProps } from "@/shared/lib/view-props.ts";
import { APP_VIEWS, type AppView, type LoadedView, viewById } from "../registry/views.ts";
import { LoadBoundary } from "./LoadBoundary.tsx";
import styles from "./AppShell.module.css";

interface LazyViewProps extends ViewProps {
  readonly load: () => Promise<LoadedView>;
  readonly loadFailure: string;
}

export function LazyView({ load, loadFailure, isActive, tabId }: LazyViewProps) {
  const [attempt, setAttempt] = useState(0);
  const [Screen, setScreen] = useState<ComponentType<ViewProps>>(() => lazy(load));
  const retry = () => {
    setAttempt((tries) => tries + 1);
    setScreen(() => lazy(load));
  };
  return (
    <LoadBoundary key={attempt} message={loadFailure} onRetry={retry}>
      <Suspense fallback={null}>
        <Screen isActive={isActive} tabId={tabId} />
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
export function ViewHost({ activeId }: { readonly activeId: string }) {
  const active = viewById(activeId);
  const activeHost = active?.hostId ?? "";
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set([activeHost]));
  if (!opened.has(activeHost)) setOpened(new Set([...opened, activeHost]));

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
              />
            </section>
          );
        },
      )}
    </main>
  );
}
