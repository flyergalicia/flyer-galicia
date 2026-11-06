// Gives the editor the size remembered in this browser, and lets its bar and its corner change it.
import { type RefObject, useCallback, useEffect } from "react";
import {
  cornerDragged,
  type DragStart,
  type EditorSize,
  editorBox,
  enlarged,
  loadEditorSize,
  pictureHeight,
  pictureMaxOf,
  saveEditorSize,
  sizeForgotten,
  splitDragged,
} from "../../model/calibrator/editor-size.ts";
import styles from "./Calibrator.module.css";

export interface EditorParts {
  readonly card: RefObject<HTMLElement | null>;
  readonly picture: RefObject<HTMLDivElement | null>;
  readonly controls: RefObject<HTMLDivElement | null>;
  readonly split: RefObject<HTMLDivElement | null>;
  readonly corner: RefObject<HTMLDivElement | null>;
}

function windowSize() {
  return { width: window.innerWidth, height: window.innerHeight };
}

function px(value: number | null): string {
  return value === null ? "" : `${String(value)}px`;
}

function applySize({ card, picture }: EditorParts, size: EditorSize): void {
  const editor = card.current;
  const area = picture.current;
  if (!editor || !area) return;
  const box = editorBox(size, windowSize());
  editor.style.width = px(box.width);
  editor.classList.toggle(styles.sized ?? "", box.width !== null);
  editor.style.height = px(box.height);
  const height = pictureHeight(
    size,
    windowSize(),
    box.height === null ? null : editor.clientHeight,
    area.offsetTop,
  );
  area.style.height = px(height);
  editor.classList.toggle(styles.split ?? "", height !== null);
}

function bindDrag(parts: EditorParts, part: "split" | "corner"): () => void {
  const handle = (part === "split" ? parts.split : parts.corner).current;
  if (!handle) return () => undefined;
  let start: DragStart | null = null;
  let moved: EditorSize | null = null;
  const down = (event: PointerEvent) => {
    const { card, picture, controls } = parts;
    if (!card.current || !picture.current || !controls.current) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    start = {
      x: event.clientX,
      y: event.clientY,
      width: card.current.offsetWidth,
      height: card.current.offsetHeight,
      pictureHeight: picture.current.offsetHeight,
      pictureMax: pictureMaxOf(picture.current.offsetHeight, controls.current.offsetHeight),
    };
  };
  const move = (event: PointerEvent) => {
    if (!start) return;
    const size = loadEditorSize(localStorage);
    moved =
      part === "split"
        ? splitDragged(size, start, event.clientY)
        : cornerDragged(size, start, event.clientX, event.clientY);
    applySize(parts, moved);
  };
  const end = () => {
    if (start && moved) saveEditorSize(localStorage, moved);
    start = null;
    moved = null;
  };
  const forget = () => {
    const size = sizeForgotten(loadEditorSize(localStorage), part);
    saveEditorSize(localStorage, size);
    applySize(parts, size);
  };
  handle.addEventListener("pointerdown", down);
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
  handle.addEventListener("dblclick", forget);
  return () => {
    handle.removeEventListener("pointerdown", down);
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", end);
    handle.removeEventListener("pointercancel", end);
    handle.removeEventListener("dblclick", forget);
  };
}

/** Says how to enlarge it (or bring it back to normal). */
export function useEditorSize(parts: EditorParts): () => void {
  useEffect(() => {
    applySize(parts, loadEditorSize(localStorage));
    const unbindSplit = bindDrag(parts, "split");
    const unbindCorner = bindDrag(parts, "corner");
    return () => {
      unbindSplit();
      unbindCorner();
    };
  }, [parts]);
  return useCallback(() => {
    const size = enlarged(loadEditorSize(localStorage), windowSize());
    saveEditorSize(localStorage, size);
    applySize(parts, size);
  }, [parts]);
}
