// The drafts and designs open, in a row of their own under the flyers: among them they squeezed the
// bar and mixed what stays with what is temporary. Each one says which flyer it is on.
import { optionLabel } from "@/shared/domain/flyer-options.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { ConfirmDialog } from "@/shared/ui/index.ts";
import { useLogoEditorActions, useLogoEditorValue } from "../model/editor-context.ts";
import type { OpenWork } from "../model/open-work.ts";
import styles from "./Sections.module.css";

function WorkTab({ work }: { readonly work: OpenWork }) {
  const editor = useLogoEditorActions();
  const isActive = useLogoEditorValue((state) => state.activeWork === work.id);
  const { options } = useFlyerOptions();
  const base = optionLabel(options, work.option);
  return (
    <div
      className={styles.work}
      data-testid="open-work"
      data-draft={work.temp}
      data-active={isActive}
      data-work={work.id}
    >
      <button
        type="button"
        className={styles.workOpen}
        title={
          work.temp
            ? `Borrador sin guardar sobre «${base}». Queda hasta que recargues la página o lo cierres; para conservarlo, tocá «Guardar en Estudio».`
            : `Prototipo de Estudio sobre «${base}». Queda acá hasta que recargues la página; el diseño sigue guardado en Estudio.`
        }
        onClick={() => {
          void editor.works.open(work.id);
        }}
      >
        <svg className={styles.workIcon} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
        <span className={styles.workName}>{work.name}</span>
        <span className={styles.workBase} data-base={base} />
      </button>
      <button
        type="button"
        className={styles.workClose}
        aria-label="Cerrar"
        title={work.temp ? "Cerrar borrador" : "Cerrar (sigue guardado en Estudio)"}
        onClick={() => {
          editor.works.askToClose(work.id);
        }}
      >
        ×
      </button>
    </div>
  );
}

function CloseQuestion() {
  const editor = useLogoEditorActions();
  const closing = useLogoEditorValue((state) =>
    state.works.find(({ id }) => id === state.closingWork),
  );
  if (!closing) return null;
  return (
    <ConfirmDialog
      title={`¿Cerrar «${closing.name}»?`}
      confirmLabel="Cerrar borrador"
      cancelLabel="Volver"
      danger
      onConfirm={editor.works.confirmClose}
      onCancel={editor.works.cancelClose}
    >
      Es un borrador sin guardar: se pierden sus cambios. Si lo querés conservar, primero tocá
      «Guardar en Estudio».
    </ConfirmDialog>
  );
}

export function OpenWorksRow({ allowed }: { readonly allowed: readonly number[] }) {
  const works = useLogoEditorValue((state) => state.works);
  const shown = works.filter(({ option }) => allowed.includes(option));
  return (
    <>
      {shown.length > 0 && (
        <fieldset className={styles.worksRow} aria-label="Borradores y diseños abiertos">
          <span className={styles.worksLabel}>Abiertos</span>
          {shown.map((work) => (
            <WorkTab key={work.id} work={work} />
          ))}
        </fieldset>
      )}
      <CloseQuestion />
    </>
  );
}
