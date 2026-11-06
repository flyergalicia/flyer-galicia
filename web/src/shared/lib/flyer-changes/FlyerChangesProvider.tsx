import { type ReactNode, useState } from "react";
import { createFlyerChanges, FlyerChangesContext } from "./flyer-changes.ts";

/** Who hears which flyer changed: one for the whole app. */
export function FlyerChangesProvider({ children }: { readonly children: ReactNode }) {
  const [changes] = useState(createFlyerChanges);
  return <FlyerChangesContext.Provider value={changes}>{children}</FlyerChangesContext.Provider>;
}
