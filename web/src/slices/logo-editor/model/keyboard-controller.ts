// The keys of Cambiar logos. None of them acts while writing or with a window open: there, the keys
// are of the field and of the window.
import type { LogoEditor, ZoneMode } from "./editor-store.ts";
import { isAdjustable } from "./change.ts";

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};
const SIZE_KEYS = new Set(["+", "=", "-", "_"]);
const GROWS = new Set(["+", "="]);
const LETTER_MODES: Readonly<Record<string, ZoneMode>> = { r: "trim", f: "strip" };

function isWritingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function isTypingOutsideSlider(target: EventTarget | null): boolean {
  const isSlider = target instanceof HTMLInputElement && target.type === "range";
  return isWritingTarget(target) && !isSlider;
}

function hasWindowOpen(): boolean {
  return document.querySelector('[aria-modal="true"], [role="alertdialog"]') !== null;
}

function isSelectingText(): boolean {
  return String(window.getSelection() ?? "") !== "";
}

function onShortcut(event: KeyboardEvent, editor: LogoEditor): void {
  const key = event.key.toLowerCase();
  if (key === "z" && !event.shiftKey) {
    event.preventDefault();
    editor.undo();
  } else if (key === "y" || (key === "z" && event.shiftKey)) {
    event.preventDefault();
    editor.redo();
  } else if (key === "c" && !editor.getState().clean) {
    // With text marked on the page it copies that text, as usual.
    if (!isSelectingText() && editor.copyChosen()) event.preventDefault();
  } else if (key === "v" && !editor.getState().clean && editor.hasCopy()) {
    event.preventDefault();
    editor.paste();
  }
}

/** V is the only one that acts in Vista previa; the same letter goes back. */
function onLetter(event: KeyboardEvent, editor: LogoEditor): void {
  const key = event.key.toLowerCase();
  const { clean, mode } = editor.getState();
  if (mode === "insert" && key !== "i") return;
  if (key === "v") {
    if (mode === "none") {
      event.preventDefault();
      editor.toggleClean();
    }
    return;
  }
  if (clean) return;
  event.preventDefault();
  if (key === "i") {
    // I opens the window; while placing a section, it cancels.
    if (mode === "none" || mode === "insert") editor.toggleInsert();
    return;
  }
  if (key === "n") {
    if (mode === "none") editor.works.newDraft();
    return;
  }
  const asked = LETTER_MODES[key];
  if (asked) editor.toggleMode(asked);
}

function resizeWithKey(event: KeyboardEvent, editor: LogoEditor): void {
  const entry = editor.active()[editor.getState().selected];
  if (!isAdjustable(entry)) return;
  event.preventDefault();
  const size = event.shiftKey ? 25 : 10;
  editor.resizeBy(GROWS.has(event.key) ? size : -size);
}

function onChosenKey(event: KeyboardEvent, editor: LogoEditor): void {
  const isOnSlider = event.target instanceof HTMLInputElement && event.target.type === "range";
  if (event.key === "Escape") {
    editor.letGo();
  } else if ((event.key === "Delete" || event.key === "Backspace") && !isOnSlider) {
    event.preventDefault();
    editor.deleteChosen();
  } else if (SIZE_KEYS.has(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
    resizeWithKey(event, editor);
  } else {
    const arrow = ARROWS[event.key];
    if (arrow) {
      event.preventDefault();
      const size = event.shiftKey ? 10 : 1;
      editor.nudge(arrow[0] * size, arrow[1] * size);
    }
  }
}

function onPlacesKey(event: KeyboardEvent, editor: LogoEditor): void {
  if (event.key === "Escape") {
    editor.letAllGo();
  } else if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    event.stopImmediatePropagation();
    editor.deleteGroup();
  }
}

/** In Vista previa only V and Escape count. */
function onCleanKey(event: KeyboardEvent, editor: LogoEditor): void {
  if (event.key === "Escape") {
    event.preventDefault();
    editor.setClean(false);
  } else if (!isWritingTarget(event.target) && event.key.toLowerCase() === "v" && !event.shiftKey) {
    onLetter(event, editor);
  }
}

function isPlainLetter(event: KeyboardEvent): boolean {
  return (
    /^[vrfin]$/i.test(event.key) &&
    !event.altKey &&
    !event.shiftKey &&
    !event.repeat &&
    !isWritingTarget(event.target)
  );
}

function onEditingKey(event: KeyboardEvent, editor: LogoEditor): void {
  if (isTypingOutsideSlider(event.target)) return;
  const { mode, places, selected, pendingTrim, insertConfirm } = editor.getState();
  if (pendingTrim) {
    if (event.key === "Escape") {
      event.preventDefault();
      editor.cancelTrim();
    }
    return;
  }
  if (insertConfirm) return;
  // Armar franja goes on with Escape: it is cancelled with its button or its letter.
  if (event.key === "Escape" && mode !== "none" && mode !== "strip") {
    event.preventDefault();
    editor.toggleMode(mode);
  } else if (isPlainLetter(event)) {
    onLetter(event, editor);
  } else {
    if (places.length > 0) onPlacesKey(event, editor);
    if (!event.defaultPrevented && selected >= 0) onChosenKey(event, editor);
  }
}

/** Placing a saved set: Enter is the main button, Escape ends, and Ctrl+Z goes back. */
function onPlacementKey(event: KeyboardEvent, editor: LogoEditor): void {
  const hasControl = event.ctrlKey || event.metaKey;
  if (hasControl && !event.altKey && event.key.toLowerCase() === "z" && !event.shiftKey) {
    if (isWritingTarget(event.target)) return;
    event.preventDefault();
    editor.placement.back();
    return;
  }
  if (hasControl || event.altKey || isWritingTarget(event.target)) return;
  if (event.key === "Enter") {
    // On a button, Enter is that button.
    if (event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    editor.placement.enter();
  } else if (event.key === "Escape") {
    event.preventDefault();
    editor.placement.finish();
  }
}

function onKey(event: KeyboardEvent, editor: LogoEditor): void {
  const { on, clean, placement } = editor.getState();
  if (!on || hasWindowOpen()) return;
  if (placement) {
    onPlacementKey(event, editor);
    return;
  }
  if ((event.ctrlKey || event.metaKey) && !event.altKey) {
    if (!isWritingTarget(event.target)) onShortcut(event, editor);
  } else if (clean) {
    onCleanKey(event, editor);
  } else {
    onEditingKey(event, editor);
  }
}

export function attachKeyboardController(editor: LogoEditor): () => void {
  const listener = (event: KeyboardEvent) => {
    onKey(event, editor);
  };
  document.addEventListener("keydown", listener);
  return () => {
    document.removeEventListener("keydown", listener);
  };
}
