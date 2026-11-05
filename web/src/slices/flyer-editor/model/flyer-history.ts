// The flyers that came out, the last one first. It lives while the page does; with the faculty
// "Guardar historial y borrador" it also stays in the browser of the person, and nothing goes up.
import type { FlyerValues } from "@/shared/flyer-engine/index.ts";
import type { HistoryItem } from "./stored-flyer.ts";

const LIMIT_IN_PAGE = 10;
const LIMIT_KEPT = 20;
/** No room in the browser: fewer flyers are better than none. */
const LIMIT_WITH_NO_ROOM = 5;
const THUMBNAIL_WIDTH = 120;
const THUMBNAIL_QUALITY = 0.7;
const FALLBACK_QUALITY = 0.25;

export interface NewHistoryEntry {
  readonly values: FlyerValues;
  readonly fileName: string;
  readonly canvas: HTMLCanvasElement;
  readonly cashback: number;
  readonly option: number;
}

export interface FlyerHistory {
  readonly getItems: () => readonly HistoryItem[];
  readonly subscribe: (listener: () => void) => () => void;
  readonly add: (entry: NewHistoryEntry) => void;
  readonly remove: (position: number) => void;
  /** With the faculty, what the browser has joins what this page made. */
  readonly keepFor: (personId: string) => void;
  readonly stopKeeping: () => void;
}

function historyKey(personId: string): string {
  return `fg_hist_${personId}`;
}

/** Small: the card shows it at 32 by 56, and it has to fit in the storage of the browser. */
function thumbnailOf(canvas: HTMLCanvasElement): string {
  try {
    const small = document.createElement("canvas");
    small.width = THUMBNAIL_WIDTH;
    small.height = Math.max(1, Math.round((canvas.height * THUMBNAIL_WIDTH) / canvas.width));
    small.getContext("2d")?.drawImage(canvas, 0, 0, small.width, small.height);
    return small.toDataURL("image/jpeg", THUMBNAIL_QUALITY);
  } catch {
    return canvas.toDataURL("image/jpeg", FALLBACK_QUALITY);
  }
}

function hourOf(date: Date): string {
  return `${String(date.getHours())}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** "18:32" if it is of today, "ayer 18:32", or "12/09 18:32". */
export function whenOf({ ts, hora }: Pick<HistoryItem, "ts" | "hora">, now = new Date()): string {
  if (!ts) return hora;
  const date = new Date(ts);
  if (date.toDateString() === now.toDateString()) return hora;
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (date.toDateString() === yesterday.toDateString()) return `ayer ${hora}`;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month} ${hora}`;
}

function isItem(value: unknown): value is HistoryItem {
  return typeof value === "object" && value !== null && Boolean(Reflect.get(value, "v"));
}

function readKept(key: string): readonly HistoryItem[] {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    return Array.isArray(kept) ? kept.filter(isItem) : [];
  } catch {
    return [];
  }
}

function writeKept(key: string, items: readonly HistoryItem[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    try {
      localStorage.setItem(key, JSON.stringify(items.slice(0, LIMIT_WITH_NO_ROOM)));
    } catch {
      // The browser has no room at all: it stays in this page.
    }
  }
}

/** What was kept joins what this page made, without repeating, newest first. */
function joined(own: readonly HistoryItem[], kept: readonly HistoryItem[]): HistoryItem[] {
  const seen = new Set<string>();
  const result: HistoryItem[] = [];
  for (const item of [...own, ...kept]) {
    const key = `${String(item.ts)}|${item.fn}`;
    if (!item.ts || !seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result.toSorted((one, other) => (other.ts || 0) - (one.ts || 0));
}

export function createFlyerHistory(): FlyerHistory {
  let items: readonly HistoryItem[] = [];
  let key: string | null = null;
  const listeners = new Set<() => void>();
  const limit = () => (key === null ? LIMIT_IN_PAGE : LIMIT_KEPT);
  const publish = () => {
    for (const listener of listeners) listener();
  };
  const save = () => {
    if (key !== null) writeKept(key, items);
  };
  return {
    getItems: () => items,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    add: ({ values, fileName, canvas, cashback, option }) => {
      const now = new Date();
      const item: HistoryItem = {
        v: structuredClone(values),
        fn: fileName,
        thumb: thumbnailOf(canvas),
        hora: hourOf(now),
        ts: now.getTime(),
        ac: cashback,
        opt: option,
      };
      items = [item, ...items].slice(0, limit());
      save();
      publish();
    },
    remove: (position) => {
      items = items.toSpliced(position, 1);
      save();
      publish();
    },
    keepFor: (personId) => {
      if (key === historyKey(personId)) return;
      key = historyKey(personId);
      const kept = readKept(key);
      if (kept.length === 0) return;
      items = joined(items, kept).slice(0, limit());
      publish();
    },
    stopKeeping: () => {
      key = null;
    },
  };
}
