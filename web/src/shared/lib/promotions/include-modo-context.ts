import { createContext, useContext } from "react";

export const IncludeModoContext = createContext<boolean | null>(null);
export const SetIncludeModoContext = createContext<((on: boolean) => void) | null>(null);

/** The tick "Incluir MODO": one wherever it shows. */
export function useIncludeModo(): boolean {
  const includeModo = useContext(IncludeModoContext);
  if (includeModo === null) throw new Error("useIncludeModo needs an IncludeModoProvider above it");
  return includeModo;
}

export function useSetIncludeModo(): (on: boolean) => void {
  const set = useContext(SetIncludeModoContext);
  if (!set) throw new Error("useSetIncludeModo needs an IncludeModoProvider above it");
  return set;
}
