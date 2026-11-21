// Cmd+K on a Mac, Ctrl+K elsewhere: on the window and in capture, before any other key of the app.
// While the search is open the keys are its own: neither the letters of Cambiar logos nor another
// Escape react underneath. It is mounted only with a session: at the entry, the key is the browser's.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";

export type SearchKeyHandler = (event: KeyboardEvent) => void;

export interface SearchKeys {
  /** The open window says what it does with each key; it gives what takes it back. */
  readonly attach: (handler: SearchKeyHandler) => () => void;
}

export function isSearchShortcut(event: KeyboardEvent): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "k"
  );
}

export function useSearchShortcut(isOpen: boolean, onShortcut: () => void): SearchKeys {
  const open = useRef(isOpen);
  const shortcut = useRef(onShortcut);
  const handler = useRef<SearchKeyHandler | null>(null);
  // Before the next key: a letter right after opening is already the search's.
  useLayoutEffect(() => {
    open.current = isOpen;
    shortcut.current = onShortcut;
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isSearchShortcut(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.repeat) shortcut.current();
        return;
      }
      if (!open.current) return;
      event.stopImmediatePropagation();
      if (!event.isComposing) handler.current?.(event);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  const attach = useCallback((next: SearchKeyHandler) => {
    handler.current = next;
    return () => {
      if (handler.current === next) handler.current = null;
    };
  }, []);
  return useMemo(() => ({ attach }), [attach]);
}
