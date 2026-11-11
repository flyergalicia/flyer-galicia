import { useMemo } from "react";
import { useCommercialPeople } from "@/shared/lib/commercial-actions/people-query.ts";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import type { Who } from "./who.ts";

export function useWho(): Who & {
  readonly isTestAccount: boolean;
  readonly myLeader: string | null;
  readonly reloadPeople: () => void;
} {
  const session = useSession();
  const { effectiveRole } = usePermissions();
  const { people, failed, reload } = useCommercialPeople();
  if (session.status !== "signed-in" || effectiveRole === null) {
    throw new Error("useWho needs a person who is signed in");
  }
  const { user, isAdmin, profile } = session;
  return useMemo(
    () => ({
      me: user.id,
      role: effectiveRole,
      isAdmin,
      people,
      isTestAccount: profile.es_prueba,
      myLeader: profile.lider_id,
      peopleFailed: failed,
      reloadPeople: () => {
        void reload();
      },
    }),
    [effectiveRole, failed, isAdmin, people, profile, reload, user],
  );
}
