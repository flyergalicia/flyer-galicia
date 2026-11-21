// With the window of a strip open, these keys are of the window: Ctrl+Z, Ctrl+Y, + and −.
import { grown } from "./strip-selection.ts";
import type { StripSession } from "./strip-session.ts";

const STEP = 0.1;
const BIG_STEP = 0.25;

function isWriting(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

function isTyping(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement && target.type === "range") return false;
  return isWriting(target);
}

function onHistoryKey(event: KeyboardEvent, session: StripSession): void {
  if (isWriting(event.target)) return; // There, it is the one of the browser.
  const key = event.key.toLowerCase();
  if (key === "z" && !event.shiftKey) {
    event.preventDefault();
    session.undo();
  } else if (key === "y" || (key === "z" && event.shiftKey)) {
    event.preventDefault();
    session.redo();
  }
}

function onSizeKey(event: KeyboardEvent, session: StripSession): void {
  if (isTyping(event.target)) return;
  const bigger = event.key === "+" || event.key === "=";
  const smaller = event.key === "-" || event.key === "_";
  if (!bigger && !smaller) return;
  event.preventDefault();
  const step = (event.shiftKey ? BIG_STEP : STEP) * (bigger ? 1 : -1);
  session.change((choice) => grown(choice, step));
}

export function attachStripKeyboard(session: StripSession): () => void {
  const listener = (event: KeyboardEvent) => {
    if (event.altKey) return;
    if (event.ctrlKey || event.metaKey) onHistoryKey(event, session);
    else onSizeKey(event, session);
  };
  document.addEventListener("keydown", listener);
  return () => {
    document.removeEventListener("keydown", listener);
  };
}
