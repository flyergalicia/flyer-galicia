import { createContext, useContext, useEffect, useRef } from "react";

export type PrimaryAction = () => void;

export interface PrimaryActionRegistry {
  /** Returns how to take it back. */
  readonly register: (action: () => PrimaryAction | undefined) => () => void;
}

export const PrimaryActionContext = createContext<PrimaryActionRegistry | null>(null);

/**
 * What Ctrl+Enter does while this screen is the one showing: the main action of each screen. It
 * does nothing with a window on top.
 */
export function usePrimaryAction(action: PrimaryAction, isActive: boolean): void {
  const registry = useContext(PrimaryActionContext);
  if (!registry) throw new Error("usePrimaryAction needs a PrimaryActionProvider above it");
  const latest = useRef(action);
  useEffect(() => {
    latest.current = action;
  }, [action]);
  useEffect(() => {
    if (!isActive) return undefined;
    return registry.register(() => latest.current);
  }, [isActive, registry]);
}
