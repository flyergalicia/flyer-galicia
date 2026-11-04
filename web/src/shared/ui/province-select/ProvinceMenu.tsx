import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  normalizeText,
  PROVINCE_SEPARATOR,
  provinceList,
  provincesName,
  titleCase,
} from "@/shared/domain/promotions/index.ts";
import styles from "./ProvinceSelect.module.css";

const MIN_WIDTH_PX = 250;
const MARGIN_PX = 8;
const GAP_PX = 4;
const ROOM_PX = 12;
const MAX_HEIGHT_PX = 380;

type ProvinceMenuProps = {
  readonly anchor: RefObject<HTMLSelectElement | null>;
  readonly provinces: readonly string[];
  readonly chosen: string;
  readonly allLabel: string;
  readonly onChange: (value: string) => void;
  readonly onClose: () => void;
};

/** Below it if there is room, or if there is more room there than above. */
function placeUnder(anchor: DOMRect, menu: HTMLElement): void {
  const { style } = menu;
  style.width = `${String(Math.min(Math.max(anchor.width, MIN_WIDTH_PX), window.innerWidth - 2 * MARGIN_PX))}px`;
  style.left = `${String(Math.max(MARGIN_PX, Math.min(anchor.left, window.innerWidth - MARGIN_PX - menu.offsetWidth)))}px`;
  const below = window.innerHeight - anchor.bottom - ROOM_PX;
  const above = anchor.top - ROOM_PX;
  const fullHeight = menu.scrollHeight;
  const goesBelow = below >= Math.min(MAX_HEIGHT_PX, fullHeight) || below >= above;
  const height = Math.min(MAX_HEIGHT_PX, goesBelow ? below : above);
  style.maxHeight = `${String(height)}px`;
  style.top = `${String(goesBelow ? anchor.bottom + GAP_PX : Math.max(MARGIN_PX, anchor.top - GAP_PX - Math.min(height, fullHeight)))}px`;
}

function nextProvinces(value: string, province: string, provinces: readonly string[]): string {
  const chosen = provinceList(value);
  const list = chosen.includes(province)
    ? chosen.filter((one) => one !== province)
    : [...chosen, province];
  return list
    .toSorted((one, other) => provinces.indexOf(one) - provinces.indexOf(other))
    .join(PROVINCE_SEPARATOR);
}

/** Its keys listen on the window, before anybody: Escape closes it alone, not the window under it. */
function useMenuKeys(
  rows: readonly string[],
  labelOf: (value: string) => string,
  chosen: string,
  focused: number,
  setFocused: (position: number) => void,
  choose: (value: string, add: boolean) => void,
  onClose: () => void,
) {
  const latest = useRef({ rows, labelOf, chosen, focused, setFocused, choose, onClose });
  useLayoutEffect(() => {
    latest.current = { rows, labelOf, chosen, focused, setFocused, choose, onClose };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      answerKey(event, latest.current);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);
}

interface KeyContext {
  readonly rows: readonly string[];
  readonly labelOf: (value: string) => string;
  readonly chosen: string;
  readonly focused: number;
  readonly setFocused: (position: number) => void;
  readonly choose: (value: string, add: boolean) => void;
  readonly onClose: () => void;
}

function stop(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function moveWithArrow(event: KeyboardEvent, context: KeyContext): void {
  const { rows, chosen, focused, setFocused } = context;
  const step = event.key === "ArrowDown" ? 1 : -1;
  const start = rows.indexOf(provinceList(chosen)[0] ?? "");
  setFocused(focused < 0 ? Math.max(0, start) : (focused + step + rows.length) % rows.length);
}

/** A letter jumps to the next province that starts that way. */
function jumpToLetter(letter: string, context: KeyContext): void {
  const { rows, labelOf, focused, setFocused } = context;
  const start = Math.max(focused, 0);
  for (let step = 1; step <= rows.length; step += 1) {
    const position = (start + step) % rows.length;
    const row = rows[position] ?? "";
    if (row && normalizeText(labelOf(row)).startsWith(letter)) {
      setFocused(position);
      return;
    }
  }
}

function answerKey(event: KeyboardEvent, context: KeyContext): void {
  const { key, shiftKey, ctrlKey, altKey, metaKey } = event;
  if (key === "Escape") {
    stop(event);
    context.onClose();
  } else if (key === "Tab") {
    context.onClose();
  } else if (key === "ArrowDown" || key === "ArrowUp") {
    stop(event);
    moveWithArrow(event, context);
  } else if (key === "Enter" || key === " ") {
    stop(event);
    const row = context.rows[context.focused];
    if (row === undefined) context.onClose();
    else context.choose(row, shiftKey);
  } else if (key.length === 1 && !ctrlKey && !altKey && !metaKey) {
    const letter = normalizeText(key);
    if (!letter) return;
    stop(event);
    jumpToLetter(letter, context);
  }
}

export function ProvinceMenu({
  anchor,
  provinces,
  chosen,
  allLabel,
  onChange,
  onClose,
}: ProvinceMenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(-1);
  const rows = ["", ...provinces];
  const list = provinceList(chosen);
  const several = list.length > 1;
  const labelOf = useCallback((value: string) => (value ? titleCase(value) : allLabel), [allLabel]);

  const place = useCallback(() => {
    const box = anchor.current?.getBoundingClientRect();
    if (!box || !menu.current) return;
    // The control hid.
    if (!box.width && !box.height) onClose();
    else placeUnder(box, menu.current);
  }, [anchor, onClose]);

  const choose = (value: string, add: boolean) => {
    if (!add || !value) {
      onClose();
      if (value !== chosen) onChange(value);
      return;
    }
    onChange(nextProvinces(chosen, value, provinces));
  };

  useMenuKeys(rows, labelOf, chosen, focused, setFocused, choose, onClose);

  // It opens where it has to be, with what is chosen in sight.
  useLayoutEffect(() => {
    place();
    const on = menu.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (on && menu.current) {
      menu.current.scrollTop = Math.max(
        0,
        on.offsetTop - menu.current.clientHeight / 2 + on.offsetHeight,
      );
    }
  }, [place]);

  useLayoutEffect(() => {
    if (focused >= 0) {
      menu.current?.querySelector('[data-focused="true"]')?.scrollIntoView({ block: "nearest" });
    }
  }, [focused]);

  useEffect(() => {
    const node = menu.current;
    const outside = (event: Event) => {
      const { target } = event;
      if (!(target instanceof Node)) return;
      if (!node?.contains(target) && target !== anchor.current) onClose();
    };
    const onScroll = (event: Event) => {
      const { target } = event;
      if (!(target instanceof Node) || !node?.contains(target)) place();
    };
    // The focus stays on the control.
    const keepFocus = (event: Event) => {
      event.preventDefault();
    };
    node?.addEventListener("mousedown", keepFocus);
    document.addEventListener("mousedown", outside, true);
    document.addEventListener("touchstart", outside, { capture: true, passive: true });
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      node?.removeEventListener("mousedown", keepFocus);
      document.removeEventListener("mousedown", outside, true);
      document.removeEventListener("touchstart", outside, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [anchor, onClose, place]);

  return createPortal(
    <div ref={menu} className={styles.menu} data-testid="province-menu">
      <ul className={styles.rows}>
        {rows.map((value, position) => {
          const isOn = value ? list.includes(value) : list.length === 0;
          const removes = isOn && several;
          const name = labelOf(value);
          return (
            <li key={value} className={styles.row} data-focused={position === focused}>
              <button
                type="button"
                className={styles.choose}
                tabIndex={-1}
                aria-pressed={isOn}
                data-value={value}
                onClick={(event) => {
                  choose(value, event.shiftKey);
                }}
              >
                <span className={styles.tick}>{isOn ? "✓" : ""}</span>
                <span className={styles.name}>{name}</span>
              </button>
              {value && (
                <button
                  type="button"
                  className={styles.add}
                  tabIndex={-1}
                  title={removes ? "Sacar esta provincia" : "Sumar esta provincia a la elegida"}
                  aria-label={`${removes ? "Sacar" : "Sumar"} ${name}`}
                  onClick={() => {
                    choose(value, true);
                  }}
                >
                  {removes ? "−" : "+"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className={styles.help}>
        <b>Shift + clic</b> (o el +) suma otra provincia
        {several && (
          <>
            <br />
            Elegidas: <b>{provincesName(chosen)}</b>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
