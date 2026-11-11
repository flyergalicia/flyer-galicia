import { type ReactNode, useCallback, useState } from "react";
import { IncludeModoContext, SetIncludeModoContext } from "./include-modo-context.ts";

const STORAGE_KEY = "fg_promos_modo";

function readRemembered(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function remember(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    // Without storage it is just not remembered.
  }
}

/** It starts on, and this browser remembers it. */
export function IncludeModoProvider({ children }: { readonly children: ReactNode }) {
  const [includeModo, setIncludeModo] = useState(readRemembered);
  const set = useCallback((on: boolean) => {
    setIncludeModo(on);
    remember(on);
  }, []);
  return (
    <SetIncludeModoContext.Provider value={set}>
      <IncludeModoContext.Provider value={includeModo}>{children}</IncludeModoContext.Provider>
    </SetIncludeModoContext.Provider>
  );
}
