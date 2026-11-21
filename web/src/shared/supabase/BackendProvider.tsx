import type { ReactNode } from "react";
import { BackendContext } from "./backend-context.ts";
import type { Backend } from "./create-backend.ts";

export function BackendProvider({
  backend,
  children,
}: {
  readonly backend: Backend;
  readonly children: ReactNode;
}) {
  return <BackendContext.Provider value={backend}>{children}</BackendContext.Provider>;
}
