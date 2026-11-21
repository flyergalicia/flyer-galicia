import { createContext, useContext, useSyncExternalStore } from "react";
import type { LogoEditor, LogoEditorState } from "./editor-store.ts";

export const LogoEditorContext = createContext<LogoEditor | null>(null);

/** The editor: its actions never change, so reading it does not draw anything again. */
export function useLogoEditorActions(): LogoEditor {
  const editor = useContext(LogoEditorContext);
  if (!editor) throw new Error("useLogoEditorActions needs a LogoEditorProvider above it");
  return editor;
}

/** One value of the editor: the component draws again only when that value changes. */
export function useLogoEditorValue<Value>(select: (state: LogoEditorState) => Value): Value {
  const { subscribe, getState } = useLogoEditorActions();
  return useSyncExternalStore(subscribe, () => select(getState()));
}
