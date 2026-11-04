import { createContext, useContext } from "react";
import type { Backend } from "./create-backend.ts";

export const BackendContext = createContext<Backend | null>(null);

export function useBackend(): Backend {
  const backend = useContext(BackendContext);
  if (!backend) throw new Error("useBackend needs a BackendProvider above it");
  return backend;
}
