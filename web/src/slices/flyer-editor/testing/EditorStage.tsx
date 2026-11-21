// Test support: the editor, once the session is there.
import type { ViewProps } from "@/shared/lib/view-props.ts";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { FlyerEditorView } from "../ui/FlyerEditorView.tsx";

export function EditorStage({ tabId, isActive, ...ways }: ViewProps) {
  const session = useSession();
  const { loadStatus } = usePermissions();
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  return <FlyerEditorView tabId={tabId} isActive={isActive} {...ways} />;
}
