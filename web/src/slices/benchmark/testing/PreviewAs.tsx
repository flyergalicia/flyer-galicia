// Test support: the administrator enters the preview of a profile, as from Facultades.
import { useEffect } from "react";
import { usePermissions, useSession, useSessionActions } from "@/shared/session/index.ts";

export function PreviewAs({ role }: { readonly role: string }) {
  const session = useSession();
  const { simulatedRole } = usePermissions();
  const { startRolePreview } = useSessionActions();
  const isInside = session.status === "signed-in";
  useEffect(() => {
    if (isInside && !simulatedRole) startRolePreview(role);
  }, [isInside, role, simulatedRole, startRolePreview]);
  return null;
}
