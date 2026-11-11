import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { hasOpenWindow } from "./has-open-window.ts";
import {
  type PrimaryAction,
  type PrimaryActionRegistry,
  PrimaryActionContext,
} from "./primary-action-context.ts";

function isPrimaryKey(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && event.key === "Enter";
}

export function PrimaryActionProvider({ children }: { readonly children: ReactNode }) {
  const current = useRef<(() => PrimaryAction | undefined) | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isPrimaryKey(event) || hasOpenWindow()) return;
      const action = current.current?.();
      if (!action) return;
      event.preventDefault();
      // Holding the keys down does not repeat it.
      if (!event.repeat) action();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const registry = useMemo<PrimaryActionRegistry>(
    () => ({
      register: (action) => {
        current.current = action;
        return () => {
          if (current.current === action) current.current = null;
        };
      },
    }),
    [],
  );

  return <PrimaryActionContext.Provider value={registry}>{children}</PrimaryActionContext.Provider>;
}
