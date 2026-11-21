import type { ReactNode } from "react";
import { usePermissions, useSession } from "@/shared/session/index.ts";

/** Only once the person is inside, with their permissions, as it is in the app. */
export function Inside({ children }: { readonly children: ReactNode }) {
  const session = useSession();
  const { loadStatus } = usePermissions();
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  return children;
}
