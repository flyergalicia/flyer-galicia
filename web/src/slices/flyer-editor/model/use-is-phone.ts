import { useSyncExternalStore } from "react";

const PHONE_WIDTH = "(max-width:900px)";

function subscribe(listener: () => void): () => void {
  const query = window.matchMedia(PHONE_WIDTH);
  query.addEventListener("change", listener);
  return () => {
    query.removeEventListener("change", listener);
  };
}

/** Up to here the flyer goes under the form and the page is what scrolls. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_WIDTH).matches);
}
