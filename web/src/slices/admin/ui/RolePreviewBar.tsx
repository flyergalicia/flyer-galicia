import { useCallback } from "react";
import { roleLabel, usePermissions, useSessionActions } from "@/shared/session/index.ts";
import styles from "./RolePreviewBar.module.css";

const HEIGHT_VAR = "--simbar-h";

function Bar({ role }: { readonly role: string }) {
  const { stopRolePreview } = useSessionActions();
  // It is fixed at the bottom: its height goes on the page for the screens to leave room, also
  // when the window changes size, and it goes with the bar.
  const measured = useCallback((bar: HTMLDivElement) => {
    const root = document.documentElement;
    const publish = () => {
      root.style.setProperty(HEIGHT_VAR, `${String(bar.offsetHeight)}px`);
    };
    publish();
    window.addEventListener("resize", publish);
    return () => {
      window.removeEventListener("resize", publish);
      root.style.removeProperty(HEIGHT_VAR);
    };
  }, []);
  return (
    <div ref={measured} className={styles.bar} data-testid="role-preview-bar">
      <span>
        Vista previa: <strong>{roleLabel(role)}</strong>. Así ve la app este perfil.
      </span>
      <button type="button" className={styles.leave} onClick={stopRolePreview}>
        Salir de la vista previa
      </button>
    </div>
  );
}

/** The black bar of the preview of a profile: what the administrator sees the app as. */
export function RolePreviewBar() {
  const { simulatedRole } = usePermissions();
  return simulatedRole ? <Bar role={simulatedRole} /> : null;
}
