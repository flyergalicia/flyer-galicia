import { type RefObject, useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

function keepFocusInside(event: KeyboardEvent, panel: HTMLElement): void {
  const elements = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const first = elements[0];
  const last = elements.at(-1);
  if (!first || !last) {
    event.preventDefault();
    return;
  }
  const active = panel.ownerDocument.activeElement;
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

/** The windows open now, the last one on top: only that one listens to the keyboard. */
const openWindows: HTMLElement[] = [];

/**
 * What every window does: takes the focus and gives it back when it closes, keeps Tab inside,
 * and closes with Escape. In capture, so that Escape does not also reach what is behind it.
 */
export function useDialog(panel: RefObject<HTMLElement | null>, onClose: () => void): void {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const element = panel.current;
    if (!element) return undefined;
    const { activeElement } = element.ownerDocument;
    const previous = activeElement instanceof HTMLElement ? activeElement : null;
    element.focus();
    openWindows.push(element);
    const onKey = (event: KeyboardEvent) => {
      if (openWindows.at(-1) !== element) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        close.current();
      } else if (event.key === "Tab") {
        keepFocusInside(event, element);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      openWindows.splice(openWindows.indexOf(element), 1);
      previous?.focus();
    };
  }, [panel]);
}
