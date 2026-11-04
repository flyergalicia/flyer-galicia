import type { ReactNode } from "react";
import { optionLabel } from "@/shared/domain/flyer-options.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { blockReason, useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { usePermissions } from "@/shared/session/index.ts";
import { Icon } from "@/shared/ui/index.ts";
import { useLogoEditorActions, useLogoEditorValue } from "../model/editor-context.ts";
import type { ZoneMode } from "../model/editor-store.ts";
import { CutsChip, WorkChip } from "./SectionsOnFlyer.tsx";
import styles from "./LogoEditor.module.css";

function BaseTip() {
  return (
    <>
      Tocá un logo o un texto para cambiarlo o moverlo. Arrastrá un recuadro en un lugar libre para
      agregar. Con <b>Shift</b> elegís varios y los movés juntos. Con <b>−</b> y <b>+</b> cambiás el
      tamaño. Atajos: <b>V</b> vista previa, <b>R</b> recortar, <b>F</b> armar franja, <b>I</b>{" "}
      insertar, <b>N</b> nuevo borrador.
    </>
  );
}

const MODE_TIPS: Readonly<Record<Exclude<ZoneMode, "none">, ReactNode>> = {
  insert: (
    <>
      Llevá la sección hasta donde va y <b>hacé clic</b>: se acomoda sola entre dos bloques.{" "}
      <b>Escape</b> cancela.
    </>
  ),
  trim: (
    <>
      Arrastrá de arriba hacia abajo sobre la parte que querés <b>quitar</b> (toma todo el ancho).
    </>
  ),
  strip: (
    <>
      Arrastrá un recuadro alrededor de <b>toda la franja</b> de logos.
    </>
  ),
};

function Tip() {
  const on = useLogoEditorValue((state) => state.on);
  const tipGone = useLogoEditorValue((state) => state.tipGone);
  const mode = useLogoEditorValue((state) => state.mode);
  const isPlacing = useLogoEditorValue((state) => state.placement !== null);
  // While marking a zone it stays: it says what has to be done now.
  if (!on || isPlacing || (tipGone && mode === "none")) return null;
  return (
    <span className={styles.tip} data-testid="logo-editor-tip">
      {mode === "none" ? <BaseTip /> : MODE_TIPS[mode]}
    </span>
  );
}

function UndoButtons() {
  const editor = useLogoEditorActions();
  const history = useLogoEditorValue((state) => state.history);
  useLogoEditorValue((state) => state.art);
  const { index, steps } = history;
  const canUndo = editor.canUndo();
  const canRedo = editor.canRedo();
  return (
    <span className={styles.history}>
      <button
        type="button"
        className={`${styles.pill} ${styles.historyButton}`}
        aria-label="Deshacer"
        disabled={!canUndo}
        title={canUndo ? `Deshacer: ${steps[index]?.label ?? ""} (Ctrl+Z)` : "Nada para deshacer"}
        onClick={editor.undo}
      >
        <Icon name="undo" size={14} />
        <span>Deshacer</span>
      </button>
      <button
        type="button"
        className={`${styles.pill} ${styles.historyButton}`}
        aria-label="Rehacer"
        disabled={!canRedo}
        title={canRedo ? `Rehacer: ${steps[index + 1]?.label ?? ""} (Ctrl+Y)` : "Nada para rehacer"}
        onClick={editor.redo}
      >
        <Icon name="redo" size={14} />
        <span>Rehacer</span>
      </button>
    </span>
  );
}

interface ModeButtonProps {
  readonly mode: Exclude<ZoneMode, "none">;
  readonly title: string;
  readonly idle: string;
  readonly cancel: string;
  readonly className?: string | undefined;
  /** Insertar opens a window first. */
  readonly onPress?: () => void;
}

/** They mark a zone of the flyer. */
function ModeButton({ mode, title, idle, cancel, className = "", onPress }: ModeButtonProps) {
  const editor = useLogoEditorActions();
  const isOn = useLogoEditorValue((state) => state.mode === mode);
  return (
    <button
      type="button"
      className={`${styles.pill} ${className}`}
      data-on={isOn}
      title={title}
      onClick={() => {
        if (onPress) onPress();
        else editor.toggleMode(mode);
      }}
    >
      {isOn ? cancel : idle}
    </button>
  );
}

function CleanPreviewButton() {
  const editor = useLogoEditorActions();
  const clean = useLogoEditorValue((state) => state.clean);
  return (
    <button
      type="button"
      className={`${styles.pill} ${styles.seeButton}`}
      aria-pressed={clean}
      data-on={clean}
      title="Ver el flyer tal como se va a descargar, sin marcas (tecla V)"
      onClick={editor.toggleClean}
    >
      <Icon name="eye" size={14} />
      <span>{clean ? "Seguir editando" : "Vista previa"}</span>
    </button>
  );
}

function BackToOriginalButton() {
  const editor = useLogoEditorActions();
  useLogoEditorValue((state) => state.list);
  const count = editor.active().length;
  if (count === 0) return null;
  return (
    <button type="button" className={styles.pill} onClick={editor.backAllToOriginal}>
      {count === 1 ? "Volver el cambio al original" : `Volver los ${count} cambios al original`}
    </button>
  );
}

function EditingButtons() {
  const editor = useLogoEditorActions();
  const { can, isHunter, isLeader } = usePermissions();
  return (
    <>
      <UndoButtons />
      <CleanPreviewButton />
      <button
        type="button"
        className={styles.pill}
        title="Abre otra pestaña con el flyer limpio para armar una versión en paralelo (tecla N)"
        onClick={editor.works.newDraft}
      >
        + Nuevo borrador
      </button>
      <ModeButton
        mode="trim"
        title="Quitar una parte del flyer (por ejemplo, la de los importes): lo de abajo sube y se une (tecla R)"
        idle="Recortar"
        cancel="Cancelar recorte"
        className={styles.trim}
      />
      <ModeButton
        mode="insert"
        title="Agregar una sección copiada de otro flyer: lo de abajo baja y se acomoda solo (tecla I)"
        idle="Insertar"
        cancel="Cancelar inserción"
        className={styles.insert}
        onPress={editor.toggleInsert}
      />
      <CutsChip />
      {can("estudio") && !isHunter && !isLeader && (
        <button
          type="button"
          className={styles.pill}
          title="Guardar las franjas y los logos de este flyer, o aplicar unas que guardaste"
          onClick={editor.openSavedSets}
        >
          Marcas guardadas
        </button>
      )}
      <ModeButton
        mode="strip"
        title="Rehacer toda una franja de logos de una vez, eligiendo marcas de Promociones (tecla F)"
        idle="Armar franja"
        cancel="Cancelar franja"
        className={styles.strip}
      />
      <BackToOriginalButton />
      <WorkChip />
      {/* "Guardar en Estudio" goes here, and arrives with that screen. */}
    </>
  );
}

/** A flyer that did not load is not edited: the changes would fall on the picture of another. */
function useEntering() {
  const editor = useLogoEditorActions();
  const workspace = useFlyerWorkspace();
  const toast = useToast();
  const { isAdminNow } = usePermissions();
  const { options } = useFlyerOptions();
  return () => {
    const { slot } = workspace.getState();
    const reason = blockReason(slot, optionLabel(options, slot.option), isAdminNow);
    if (reason && !editor.getState().on) toast.show(reason);
    else editor.toggleOn();
  };
}

export function LogoEditorBar() {
  const press = useEntering();
  const on = useLogoEditorValue((state) => state.on);
  const clean = useLogoEditorValue((state) => state.clean);
  return (
    <div className={styles.bar} data-testid="logo-editor-bar">
      {on && !clean && <Tip />}
      {on && !clean && <EditingButtons />}
      {on && clean && <CleanPreviewButton />}
      <button
        type="button"
        className={styles.main}
        aria-pressed={on}
        data-on={on}
        title="Cambiar un logo de marca del flyer por otro de Promociones (sólo para este flyer)"
        onClick={press}
      >
        <Icon name="image" size={20} />
        <span>{on ? "Listo" : "Cambiar logos"}</span>
      </button>
    </div>
  );
}
