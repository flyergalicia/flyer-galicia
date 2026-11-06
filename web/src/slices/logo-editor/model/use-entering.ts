// Pressing "Cambiar logos". A flyer that did not load is not edited: the changes would fall on the
// picture of another (invariant 23).
import { useCallback } from "react";
import { optionLabel } from "@/shared/domain/flyer-options.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { blockReason, useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { usePermissions } from "@/shared/session/index.ts";
import { useLogoEditorActions } from "./editor-context.ts";

/** The button: in when it is out, out ("Listo") when it is in. */
export function useEntering(): () => void {
  const editor = useLogoEditorActions();
  const workspace = useFlyerWorkspace();
  const toast = useToast();
  const { isAdminNow } = usePermissions();
  const { options } = useFlyerOptions();
  return useCallback(() => {
    const { slot } = workspace.getState();
    const reason = blockReason(slot, optionLabel(options, slot.option), isAdminNow);
    if (reason && !editor.getState().on) toast.show(reason);
    else editor.toggleOn();
  }, [editor, isAdminNow, options, toast, workspace]);
}

/** What the search of screens does with "Cambiar logos": the same press, only to go in. */
export function useEnterLogoEditing(): () => void {
  const editor = useLogoEditorActions();
  const press = useEntering();
  return useCallback(() => {
    if (!editor.getState().on) press();
  }, [editor, press]);
}
