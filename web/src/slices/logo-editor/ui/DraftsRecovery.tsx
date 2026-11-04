import { optionLabel } from "@/shared/domain/flyer-options.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { Button } from "@/shared/ui/index.ts";
import { useLogoEditorActions, useLogoEditorValue } from "../model/editor-context.ts";
import styles from "./Sections.module.css";

/** The drafts of last time: on entering, they are offered back. */
export function DraftsRecovery() {
  const editor = useLogoEditorActions();
  const drafts = useLogoEditorValue((state) => state.recoverable);
  const { options } = useFlyerOptions();
  if (!drafts) return null;
  const names = drafts
    .map(({ opcion, nombre }) => `${optionLabel(options, opcion)} · ${nombre || "Borrador"}`)
    .join(", ");
  return (
    <dialog open className={styles.recovery} aria-label="Borradores de la última vez">
      <div className={styles.recoveryTitle}>
        Tenés {drafts.length === 1 ? "un borrador" : `${String(drafts.length)} borradores`} de la
        última vez
      </div>
      <div className={styles.recoveryNames}>{names}</div>
      <div className={styles.recoveryActions}>
        <Button variant="ghost" size="dialog" onClick={editor.works.discard}>
          Descartar
        </Button>
        <Button size="dialog" onClick={editor.works.recover}>
          Recuperar
        </Button>
      </div>
    </dialog>
  );
}
