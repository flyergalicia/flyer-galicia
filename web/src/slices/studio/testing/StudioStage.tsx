// Test support: the screen of Estudio, once the session is there.
import { DesignDeskContext, type DesignDeskWorks } from "@/shared/lib/studio/design-desk.ts";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { StudioView } from "../ui/StudioView.tsx";

export function StudioStage({
  isActive,
  desk,
}: {
  readonly isActive: boolean;
  readonly desk: DesignDeskWorks;
}) {
  const session = useSession();
  const { loadStatus } = usePermissions();
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  return (
    <DesignDeskContext.Provider value={desk}>
      <StudioView tabId="estudio" isActive={isActive} />
    </DesignDeskContext.Provider>
  );
}
