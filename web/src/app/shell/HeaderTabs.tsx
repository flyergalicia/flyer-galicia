import { type KeyboardEvent, type RefObject, useEffect, useRef, useState } from "react";
import type { HoldReorder } from "@/shared/lib/use-hold-reorder.ts";
import type { HeaderTab } from "./use-header-tabs.ts";
import styles from "./AppHeader.module.css";

const TAPS_TO_RENAME = 4;
const TAP_WINDOW_MS = 1600;
const MOVE_AND_RENAME_HINT =
  "4 toques seguidos para cambiar el nombre · mantenelo apretado para mover la solapa";

function RenameField({
  title,
  onDone,
}: {
  readonly title: string;
  readonly onDone: (text: string | null) => void;
}) {
  const finished = useRef(false);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // It appears because of pressing there: it is where the person is writing.
    field.current?.focus();
    field.current?.select();
  }, []);
  const finish = (text: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(text);
  };
  return (
    <input
      ref={field}
      className={styles.rename}
      type="text"
      aria-label="Nombre de la solapa"
      maxLength={40}
      defaultValue={title}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") finish(event.currentTarget.value);
        if (event.key === "Escape") finish(null);
      }}
      onBlur={({ target }) => {
        finish(target.value);
      }}
    />
  );
}

interface TabClassOptions {
  readonly isActive: boolean;
  readonly isHeld: boolean;
  readonly isLifted: boolean;
}

function tabClass({ isActive, isHeld, isLifted }: TabClassOptions): string {
  return [
    styles.tab,
    isActive && styles.tabActive,
    isHeld && styles.tabHeld,
    isLifted && styles.tabLifted,
  ]
    .filter(Boolean)
    .join(" ");
}

function hintOf(tab: HeaderTab, canEdit: boolean): string | undefined {
  return canEdit && tab.isRenameable ? MOVE_AND_RENAME_HINT : undefined;
}

function badgeText(count: number): string {
  return count > 9 ? "9+" : String(count);
}

interface HeaderTabsProps {
  readonly tabs: readonly HeaderTab[];
  readonly activeId: string;
  readonly canEdit: boolean;
  readonly badges: Readonly<Record<string, number>>;
  readonly container: RefObject<HTMLDivElement | null>;
  readonly reorder: HoldReorder;
  readonly onSelect: (id: string) => void;
  readonly onRename: (id: string, text: string) => void;
}

/** The tabs of the header. They are the screens of the app, as each person has them. */
export function HeaderTabs({
  tabs,
  activeId,
  canEdit,
  badges,
  container,
  reorder,
  onSelect,
  onRename,
}: HeaderTabsProps) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const taps = useRef({ id: "", count: 0, at: 0 });

  const tap = (tab: HeaderTab) => {
    if (!canEdit || !tab.isRenameable) return;
    const now = Date.now();
    const { id, count, at } = taps.current;
    const next = id === tab.id && now - at <= TAP_WINDOW_MS ? count + 1 : 1;
    taps.current = { id: tab.id, count: next >= TAPS_TO_RENAME ? 0 : next, at: now };
    if (next >= TAPS_TO_RENAME) setRenaming(tab.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect(id);
  };

  const listClass = [
    styles.tabs,
    canEdit && styles.tabsCanMove,
    reorder.liftedId !== null && styles.tabsReordering,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={container}
      role="tablist"
      aria-label="Pantallas"
      className={listClass}
      {...reorder.handlers}
    >
      {tabs.map((tab) => {
        const badge = badges[tab.id] ?? 0;
        return (
          <div
            key={tab.id}
            role="tab"
            tabIndex={0}
            data-tab-id={tab.id}
            aria-selected={tab.id === activeId}
            title={hintOf(tab, canEdit)}
            className={tabClass({
              isActive: tab.id === activeId,
              isHeld: reorder.holdingId === tab.id,
              isLifted: reorder.liftedId === tab.id,
            })}
            onClick={() => {
              onSelect(tab.id);
              tap(tab);
            }}
            onKeyDown={(event) => {
              onKeyDown(event, tab.id);
            }}
          >
            {renaming === tab.id ? (
              <RenameField
                title={tab.title}
                onDone={(text) => {
                  setRenaming(null);
                  if (text !== null) onRename(tab.id, text);
                }}
              />
            ) : (
              <span className={styles.tabTitle}>{tab.title}</span>
            )}
            {badge > 0 && <i className={styles.tabBadge}>{badgeText(badge)}</i>}
          </div>
        );
      })}
    </div>
  );
}
