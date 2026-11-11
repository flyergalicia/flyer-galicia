import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useId,
  useMemo,
  useRef,
} from "react";
import { Icon, type IconName } from "../icon/Icon.tsx";
import styles from "./Tabs.module.css";

/**
 * segmented: the block of the form (Individual, Masivo, Historial).
 * pills: the sub-tabs of the admin panel. pills-window: the same ones, inside a window.
 * pills-inside: the same ones, inside a sheet of the panel (one per option, in Config → Legales).
 * underline: the three main tabs of the admin panel, which share the whole width.
 * line: the tabs of a screen, as many as they need, in a row.
 */
export type TabsVariant =
  | "segmented"
  | "pills"
  | "pills-window"
  | "pills-inside"
  | "underline"
  | "line";

type TabsContextValue = {
  readonly baseId: string;
  readonly value: string;
  readonly variant: TabsVariant;
  readonly select: (value: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(part: string): TabsContextValue {
  const tabs = useContext(TabsContext);
  if (!tabs) throw new Error(`Tabs.${part} must be inside Tabs`);
  return tabs;
}

type TabsProps = {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly variant?: TabsVariant;
  readonly children: ReactNode;
};

export function TabsRoot({ value, onChange, variant = "segmented", children }: TabsProps) {
  const baseId = useId();
  const context = useMemo(
    () => ({ baseId, value, variant, select: onChange }),
    [baseId, value, variant, onChange],
  );
  return <TabsContext.Provider value={context}>{children}</TabsContext.Provider>;
}

const NEXT_KEYS: Readonly<Record<string, (index: number, count: number) => number>> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
};

function moveFocus(event: KeyboardEvent<HTMLDivElement>, list: HTMLDivElement | null): void {
  const next = NEXT_KEYS[event.key];
  if (!next || !list) return;
  const tabs = [...list.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)')];
  const { target: pressed } = event;
  const index = pressed instanceof HTMLButtonElement ? tabs.indexOf(pressed) : -1;
  if (index < 0) return;
  event.preventDefault();
  const target = tabs[next(index, tabs.length)];
  target?.focus();
  target?.click();
}

export function TabsList({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  const { variant } = useTabs("List");
  const list = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={list}
      role="tablist"
      tabIndex={-1}
      aria-label={label}
      className={[styles.list, styles[`list-${variant}`]].join(" ")}
      onKeyDown={(event) => {
        moveFocus(event, list.current);
      }}
    >
      {children}
    </div>
  );
}

type TabProps = {
  readonly value: string;
  readonly icon?: IconName;
  /** The number of things to look at there. Zero or nothing shows no number. */
  readonly count?: number;
  /** A small dot that says there is something new. */
  readonly dot?: boolean;
  readonly disabled?: boolean;
  readonly children: ReactNode;
};

export function TabsTab({ value, icon, count, dot = false, disabled = false, children }: TabProps) {
  const { baseId, value: current, variant, select } = useTabs("Tab");
  const selected = current === value;
  const classes = [
    styles.tab,
    styles[`tab-${variant}`],
    selected && styles.selected,
    selected && styles[`selected-${variant}`],
    dot && styles.dot,
  ];
  return (
    <button
      type="button"
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${baseId}-panel-${value}`}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      className={classes.filter(Boolean).join(" ")}
      onClick={() => {
        select(value);
      }}
    >
      {icon && <Icon name={icon} className={styles.icon} />}
      {children}
      {count ? <span className={styles.count}>{count}</span> : null}
    </button>
  );
}

type PanelProps = {
  readonly value: string;
  /** It stays in the page, hidden, while another tab shows: what it has is still there. */
  readonly keepMounted?: boolean;
  readonly children: ReactNode;
};

/** What a tab shows. The others stay out of the page. */
export function TabsPanel({ value, keepMounted = false, children }: PanelProps) {
  const { baseId, value: current } = useTabs("Panel");
  if (current !== value && !keepMounted) return null;
  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      hidden={current !== value}
    >
      {children}
    </div>
  );
}
