import { useId } from "react";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { roleLabel } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import styles from "./TestAccountSections.module.css";

const TRIED_PROFILES = ["hunter", "vip", "asesor", "pro", "lider"] as const;
const RELOAD_AFTER_MS = 700;

/**
 * A test account tries the other profiles. The change is real: the base only lets test accounts do
 * it, and never towards administrator. The page starts again as that profile.
 */
export function TestProfilePicker({
  currentRole,
  page = window.location,
}: {
  readonly currentRole: string;
  readonly page?: Pick<Location, "reload">;
}) {
  const { rpc } = useBackend();
  const toast = useToast();
  const headingId = useId();

  const choose = (next: string) => {
    if (next === currentRole) return;
    void rpc("prueba_cambiar_rol", { p_role: next }).then((changed) => {
      if (!changed.ok) {
        toast.show(`No se pudo cambiar: ${changed.error.message}`);
        return;
      }
      toast.show(`Listo: ahora sos ${roleLabel(next)}. Recargando…`);
      setTimeout(() => {
        page.reload();
      }, RELOAD_AFTER_MS);
    });
  };

  return (
    <fieldset aria-labelledby={headingId} className={styles.group}>
      <div id={headingId} className={styles.heading}>
        Probar como (cuenta de prueba)
      </div>
      <div className={styles.profiles}>
        {TRIED_PROFILES.map((profile) => (
          <button
            key={profile}
            type="button"
            className={
              profile === currentRole ? `${styles.profile} ${styles.profileOn}` : styles.profile
            }
            onClick={() => {
              choose(profile);
            }}
          >
            {roleLabel(profile)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
