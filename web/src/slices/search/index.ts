// The search of screens. The shortcut is in the first load, so it works as soon as there is a session;
// the window comes down the first time it opens.
export { type SearchEntry } from "./model/entry.ts";
export { searchBlock } from "./model/blocking.ts";
export { type SearchKeys, useSearchShortcut } from "./model/use-search-shortcut.ts";
export type { SearchWindowProps } from "./ui/SearchWindow.tsx";

export function loadSearchWindow() {
  return import("./ui/SearchWindow.tsx").then(({ SearchWindow }) => ({ default: SearchWindow }));
}
