// What Recortar and Insertar show over the flyer and at its foot.
import { Button } from "@/shared/ui/index.ts";
import { cutsSign } from "../model/cuts.ts";
import { useLogoEditorActions, useLogoEditorValue } from "../model/editor-context.ts";
import styles from "./Sections.module.css";

/** The band being dragged, or the one about to be taken out. */
export function TrimBands() {
  const editor = useLogoEditorActions();
  const dragged = useLogoEditorValue((state) => state.trimBand);
  const pending = useLogoEditorValue((state) => state.pendingTrim);
  const coordinates = editor.coordinates();
  if (dragged) {
    return (
      <div
        className={styles.trimBand}
        data-testid="trim-band"
        style={{
          top: Math.min(dragged.y0, dragged.y1),
          height: Math.abs(dragged.y1 - dragged.y0),
        }}
      />
    );
  }
  if (!pending || !coordinates) return null;
  const { top, height } = coordinates.toLayer(0, pending.y, 10, pending.h);
  return (
    <div
      className={styles.trimBand}
      data-testid="trim-band"
      style={{ top, height: Math.max(2, height) }}
    >
      <span>Se quita esta parte</span>
    </div>
  );
}

export function TrimConfirm() {
  const editor = useLogoEditorActions();
  const pending = useLogoEditorValue((state) => state.pendingTrim);
  if (!pending) return null;
  return (
    <dialog open className={styles.confirm} aria-label="Quitar una parte del flyer">
      <span className={styles.confirmText}>
        Se quita la parte marcada en rojo y lo de abajo sube a unirse. Los oficiales y los legales
        se acomodan solos.
      </span>
      <Button variant="ghost" size="dialog" onClick={editor.cancelTrim}>
        Cancelar
      </Button>
      <Button size="dialog" autoFocus onClick={editor.confirmTrim}>
        Quitar esta parte
      </Button>
    </dialog>
  );
}

/** The line "Va acá", with the section under it. */
export function InsertLine() {
  const editor = useLogoEditorActions();
  const line = useLogoEditorValue((state) => state.insertLine);
  const mode = useLogoEditorValue((state) => state.mode);
  const section = useLogoEditorValue((state) => state.section);
  const thumbnail = useLogoEditorValue((state) => state.sectionThumbnail);
  const coordinates = editor.coordinates();
  const art = editor.picture();
  if (mode !== "insert" || !line || !section || !coordinates || !art) return null;
  const tall = Math.max(1, Math.round((section.sh * art.width) / section.sw));
  const { top, height } = coordinates.toLayer(0, line.y, 10, tall);
  const factor = height / tall;
  return (
    <div className={styles.insertLine} data-testid="insert-line" style={{ top }}>
      <span className={styles.goesHere}>Va acá</span>
      <div
        className={styles.ghost}
        style={{
          top: line.pad * factor,
          height,
          ...(thumbnail ? { backgroundImage: `url("${thumbnail}")` } : {}),
        }}
      />
    </div>
  );
}

export function InsertConfirm() {
  const editor = useLogoEditorActions();
  const spot = useLogoEditorValue((state) => state.insertConfirm);
  if (!spot) return null;
  return (
    <dialog
      open
      className={`${styles.confirm} ${styles.confirmInsert}`}
      aria-label="Insertar la sección"
    >
      <span className={styles.confirmText}>
        La sección entra donde está la línea azul. Lo de abajo baja solo.
      </span>
      <Button variant="ghost" size="dialog" onClick={editor.otherPlace}>
        Otro lugar
      </Button>
      <Button size="dialog" onClick={editor.confirmPlacing}>
        Insertar acá
      </Button>
    </dialog>
  );
}

/** "Recortado: 1 parte", with the way back. */
export function CutsChip() {
  const editor = useLogoEditorActions();
  const on = useLogoEditorValue((state) => state.on);
  useLogoEditorValue((state) => state.art);
  useLogoEditorValue((state) => state.history);
  const cuts = editor.cuts();
  if (!on || cuts.length === 0) return null;
  return (
    <span className={styles.chip} data-testid="cuts-sign">
      {cutsSign(cuts)}{" "}
      <button type="button" className={styles.backToWhole} onClick={editor.backToWhole}>
        Volver a como estaba
      </button>
    </span>
  );
}

/** Which draft or design is open, over the flyer. */
export function WorkChip() {
  const editor = useLogoEditorActions();
  const on = useLogoEditorValue((state) => state.on);
  useLogoEditorValue((state) => state.activeWork);
  const work = editor.works.activeWork();
  if (!on || !work) return null;
  if (work.temp) {
    return (
      <span className={styles.chip} data-testid="work-chip">
        <b>{work.name}</b> (sin guardar)
      </span>
    );
  }
  return (
    <span className={styles.chip} data-testid="work-chip">
      Diseño: <b>{work.name}</b>
      <button
        type="button"
        className={styles.letGoDesign}
        aria-label="Dejar de editar este diseño"
        title="Dejar de editar este diseño"
        onClick={editor.works.letGoDesign}
      >
        ×
      </button>
    </span>
  );
}
