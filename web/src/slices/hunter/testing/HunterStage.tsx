// Test support: the screen of the Hunter, once the session is there.
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { HunterView } from "../ui/HunterView.tsx";

export function HunterStage({ isActive }: { readonly isActive: boolean }) {
  const session = useSession();
  const { loadStatus } = usePermissions();
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  return <HunterView tabId="hunter" isActive={isActive} />;
}
