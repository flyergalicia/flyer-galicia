// The window of the search of screens. The keys come from the window of the page (see
// `useSearchShortcut`): the field keeps the focus, and nothing under it hears them.
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { SearchEntry } from "../model/entry.ts";
import { type ResultRow, searchRows, titleParts } from "../model/filter.ts";
import { readRecent, rememberRecent } from "../model/recent.ts";
import type { SearchKeys } from "../model/use-search-shortcut.ts";
import styles from "./SearchWindow.module.css";

const PROMPT = "Buscar una pantalla o función";
// The pattern of a field that filters a list as it is written (a combobox with its listbox): a native
// select cannot show the groups, the marks and what is written.
const LIST_ROLE = "listbox";
const ROW_ROLE = "option";

export interface SearchWindowProps {
  readonly entries: readonly SearchEntry[];
  readonly keys: SearchKeys;
  /** One was chosen: the window is already done, and where it goes is the app's. */
  readonly onChoose: (entry: SearchEntry) => void;
  /** Escape, a touch outside or the shortcut again: nothing was chosen. */
  readonly onCancel: () => void;
}

/** How the list follows what is marked: the top shows the heading of the first group. */
type Scroll = "top" | "near" | "none";

function Title({ title, typed }: { readonly title: string; readonly typed: string }) {
  const { before, match, after } = titleParts(title, typed);
  return (
    <span className={styles.title} data-part="title">
      {before}
      {match && <mark>{match}</mark>}
      {after}
    </span>
  );
}

function Rows({
  rows,
  marked,
  typed,
  listId,
}: {
  readonly rows: readonly ResultRow[];
  readonly marked: number;
  readonly typed: string;
  readonly listId: string;
}) {
  const items: ReactNode[] = [];
  let group: string | null = null;
  rows.forEach(({ entry, group: under }, index) => {
    if (under !== null && under !== group) {
      group = under;
      items.push(
        <div key={`group-${String(index)}`} role="presentation" className={styles.section}>
          {under}
        </div>,
      );
    }
    items.push(
      <div
        key={`${entry.id}-${String(index)}`}
        id={`${listId}-${String(index)}`}
        role={ROW_ROLE}
        aria-selected={index === marked}
        data-index={index}
        className={styles.row}
      >
        <Title title={entry.title} typed={typed} />
        {entry.current && <span className={styles.here}>Estás acá</span>}
        {under === null && <span className={styles.hint}>{entry.group}</span>}
      </div>,
    );
  });
  return items;
}

function rowIndexOf(target: EventTarget | null): number | null {
  const row = target instanceof Element ? target.closest("[data-index]") : null;
  return row instanceof HTMLElement ? Number(row.dataset.index) : null;
}

interface MouseWays {
  readonly cancel: () => void;
  readonly mark: (index: number) => void;
  readonly choose: (index: number) => void;
}

/** The mouse: outside closes, inside the field keeps the focus, a row is marked and chosen. */
function useMouse(
  backdrop: RefObject<HTMLDivElement | null>,
  list: RefObject<HTMLDivElement | null>,
  field: RefObject<HTMLInputElement | null>,
  ways: MouseWays,
) {
  const latest = useRef(ways);
  useLayoutEffect(() => {
    latest.current = ways;
  });
  useEffect(() => {
    const outside = backdrop.current;
    const rows = list.current;
    if (!outside || !rows) return undefined;
    const onPress = (event: MouseEvent) => {
      if (event.target === outside) {
        event.preventDefault();
        latest.current.cancel();
      } else if (event.target !== field.current) {
        event.preventDefault();
      }
    };
    // On moving and not on entering: the list moving under a still mouse does not change what is marked.
    const onMove = (event: MouseEvent) => {
      const index = rowIndexOf(event.target);
      if (index !== null) latest.current.mark(index);
    };
    const onClick = (event: MouseEvent) => {
      const index = rowIndexOf(event.target);
      if (index !== null) latest.current.choose(index);
    };
    outside.addEventListener("mousedown", onPress);
    rows.addEventListener("mousemove", onMove);
    rows.addEventListener("click", onClick);
    return () => {
      outside.removeEventListener("mousedown", onPress);
      rows.removeEventListener("mousemove", onMove);
      rows.removeEventListener("click", onClick);
    };
  }, [backdrop, field, list]);
}

interface KeyWays {
  readonly markBy: (step: number) => void;
  readonly chooseMarked: () => void;
  readonly cancel: () => void;
}

/** The arrows go around the list, Enter chooses, Escape closes; Tab does not leave the field. */
function useKeys(keys: SearchKeys, ways: KeyWays) {
  const latest = useRef(ways);
  useLayoutEffect(() => {
    latest.current = ways;
  });
  useEffect(
    () =>
      keys.attach((event) => {
        const now = latest.current;
        if (event.key === "ArrowDown") now.markBy(1);
        else if (event.key === "ArrowUp") now.markBy(-1);
        else if (event.key === "Enter") now.chooseMarked();
        else if (event.key === "Escape") now.cancel();
        else if (event.key !== "Tab") return;
        event.preventDefault();
      }),
    [keys],
  );
}

function Foot() {
  return (
    <div className={styles.foot}>
      <span>
        <kbd>↑</kbd>
        <kbd>↓</kbd> moverse
      </span>
      <span>
        <kbd>Enter</kbd> abrir
      </span>
      <span>
        <kbd>Esc</kbd> cerrar
      </span>
    </div>
  );
}

export function SearchWindow({ entries, keys, onChoose, onCancel }: SearchWindowProps) {
  const listId = useId();
  const [typed, setTyped] = useState("");
  const [recent] = useState(readRecent);
  const [marked, setMarked] = useState(0);
  const rows = useMemo(() => searchRows(entries, typed, recent), [entries, typed, recent]);
  const backdrop = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const scroll = useRef<Scroll>("top");

  const choose = (index: number) => {
    const row = rows[index];
    if (!row) return;
    if (!row.entry.forgotten) rememberRecent(row.entry.id);
    onChoose(row.entry);
  };
  useMouse(backdrop, list, field, {
    cancel: onCancel,
    mark: (index) => {
      if (index !== marked) setMarked(index);
    },
    choose,
  });
  useKeys(keys, {
    markBy: (step) => {
      if (rows.length === 0) return;
      scroll.current = "near";
      setMarked((marked + step + rows.length) % rows.length);
    },
    chooseMarked: () => {
      choose(marked);
    },
    cancel: onCancel,
  });

  useLayoutEffect(() => {
    const how = scroll.current;
    scroll.current = "none";
    if (how === "none" || !list.current) return;
    if (how === "top" || marked === 0) list.current.scrollTop = 0;
    else
      document.getElementById(`${listId}-${String(marked)}`)?.scrollIntoView({ block: "nearest" });
  });
  useEffect(() => {
    field.current?.focus();
  }, []);

  return createPortal(
    <div ref={backdrop} className={styles.backdrop}>
      <dialog open aria-modal="true" aria-label="Buscador de pantallas" className={styles.panel}>
        <div className={styles.top}>
          <svg className={styles.glass} viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
          <input
            ref={field}
            className={styles.field}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label={PROMPT}
            aria-activedescendant={rows.length > 0 ? `${listId}-${String(marked)}` : undefined}
            placeholder={`${PROMPT}…`}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={typed}
            onChange={({ target }) => {
              scroll.current = "top";
              setTyped(target.value);
              setMarked(0);
            }}
          />
        </div>
        <div
          ref={list}
          id={listId}
          className={styles.list}
          role={LIST_ROLE}
          aria-label="Resultados"
        >
          {rows.length > 0 ? (
            <Rows rows={rows} marked={marked} typed={typed} listId={listId} />
          ) : (
            <div className={styles.nothing}>{`No encontré nada con «${typed.trim()}»`}</div>
          )}
        </div>
        <Foot />
      </dialog>
    </div>,
    document.body,
  );
}
