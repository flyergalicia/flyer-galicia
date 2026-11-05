// Test support: the screen of Gestiones, once the session is there.
import {
  type CommercialDesk,
  CommercialDeskContext,
} from "@/shared/lib/commercial-actions/commercial-desk.ts";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { CommercialActionsView } from "../ui/CommercialActionsView.tsx";

export function CommercialStage({
  isActive,
  goToTab,
  desk,
}: {
  readonly isActive: boolean;
  readonly goToTab?: ((tabId: string) => void) | undefined;
  readonly desk?: CommercialDesk | undefined;
}) {
  const session = useSession();
  const { loadStatus } = usePermissions();
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  const view = (
    <CommercialActionsView
      tabId="gestiones"
      isActive={isActive}
      {...(goToTab ? { goToTab } : {})}
    />
  );
  return desk ? (
    <CommercialDeskContext.Provider value={desk}>{view}</CommercialDeskContext.Provider>
  ) : (
    view
  );
}
