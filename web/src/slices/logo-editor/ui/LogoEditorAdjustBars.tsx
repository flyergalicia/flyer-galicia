import { Button, Icon } from "@/shared/ui/index.ts";
import { boxOf, isAdjustable, isText, percentOf, type FlyerPlace } from "../model/change.ts";
import { useLogoEditorActions, useLogoEditorValue } from "../model/editor-context.ts";
import type { LogoEditor } from "../model/editor-store.ts";
import { DraftsRecovery } from "./DraftsRecovery.tsx";
import { LogoPicker } from "./LogoPicker.tsx";
import { PlacementBar } from "./PlacementBar.tsx";
import { SavedSetsWindows } from "./SavedSetsWindows.tsx";
import { SectionPicker } from "./SectionPicker.tsx";
import { InsertConfirm, TrimConfirm } from "./SectionsOnFlyer.tsx";
import { StripWindow } from "./StripWindow.tsx";
import styles from "./LogoEditor.module.css";

const MOVE_STEP = 3;

function isCoarsePointer(): boolean {
  return window.matchMedia("(pointer:coarse)").matches;
}

function Arrows() {
  const editor = useLogoEditorActions();
  const nudge = (dx: number, dy: number) => () => {
    editor.nudge(dx, dy);
  };
  return (
    <span className={styles.arrows}>
      <button type="button" aria-label="Mover a la izquierda" onClick={nudge(-MOVE_STEP, 0)}>
        ←
      </button>
      <button type="button" aria-label="Mover arriba" onClick={nudge(0, -MOVE_STEP)}>
        ↑
      </button>
      <button type="button" aria-label="Mover abajo" onClick={nudge(0, MOVE_STEP)}>
        ↓
      </button>
      <button type="button" aria-label="Mover a la derecha" onClick={nudge(MOVE_STEP, 0)}>
        →
      </button>
    </span>
  );
}

function Aligning({ canSpread }: { readonly canSpread: boolean }) {
  const editor = useLogoEditorActions();
  return (
    <span className={styles.aligning}>
      <button
        type="button"
        title="Alinear arriba (con el último tocado)"
        onClick={() => {
          editor.align("top");
        }}
      >
        <Icon name="align-top" size={15} />
        <span>Arriba</span>
      </button>
      <button
        type="button"
        title="Alinear al medio (con el último tocado)"
        onClick={() => {
          editor.align("middle");
        }}
      >
        <Icon name="align-middle" size={15} />
        <span>Al medio</span>
      </button>
      <button
        type="button"
        title="Alinear abajo (con el último tocado)"
        onClick={() => {
          editor.align("bottom");
        }}
      >
        <Icon name="align-bottom" size={15} />
        <span>Abajo</span>
      </button>
      {canSpread && (
        <button type="button" title="Mismo espacio entre uno y otro" onClick={editor.spreadChosen}>
          <Icon name="spread" size={15} />
          <span>Repartir</span>
        </button>
      )}
      <button type="button" title="Mismo alto que el último tocado" onClick={editor.sameSizeChosen}>
        <Icon name="same-size" size={15} />
        <span>Mismo tamaño</span>
      </button>
    </span>
  );
}

function barLabel(editor: LogoEditor, count: number): string {
  if (count > 1) return `${count} elegidos`;
  const entry = editor.active()[editor.getState().selected];
  return `${isText(entry) ? "Texto: " : ""}${entry?.t || "Logo"}`;
}

/** The bar for what is chosen. It lives at the foot of the preview: beside the logo it hid neighbors. */
function AdjustBar() {
  const editor = useLogoEditorActions();
  const selected = useLogoEditorValue((state) => state.selected);
  useLogoEditorValue((state) => state.group);
  useLogoEditorValue((state) => state.list);
  const entry = editor.active()[selected];
  if (!isAdjustable(entry)) return null;
  const count = editor.chosen().length;
  const percent = percentOf(entry);
  return (
    <div
      className={styles.adjust}
      role="toolbar"
      tabIndex={-1}
      aria-label="Ajustar el elemento elegido"
      onMouseDown={(event) => {
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <span
        className={styles.adjustName}
        title={count > 1 ? "Shift + clic suma o saca un logo" : ""}
      >
        {barLabel(editor, count)}
      </span>
      <button
        type="button"
        className={styles.sizeButton}
        title="Más chico (tecla −)"
        aria-label="Más chico"
        onClick={() => {
          editor.resizeBy(-10);
        }}
      >
        −
      </button>
      <input
        type="range"
        min="30"
        max="250"
        step="5"
        aria-label="Tamaño del logo"
        value={percent}
        onChange={(event) => {
          editor.resizeChosen(Number(event.target.value));
        }}
      />
      <button
        type="button"
        className={styles.sizeButton}
        title="Más grande (tecla +)"
        aria-label="Más grande"
        onClick={() => {
          editor.resizeBy(10);
        }}
      >
        +
      </button>
      <span className={styles.percent}>{percent}%</span>
      {isCoarsePointer() && <Arrows />}
      <button
        type="button"
        title="Volver a ponerlo en el medio de su lugar"
        onClick={editor.center}
      >
        Centrar
      </button>
      {count >= 2 && <Aligning canSpread={count >= 3} />}
      <button
        type="button"
        className={styles.withIcon}
        title="Duplicar (Ctrl+C y Ctrl+V)"
        onClick={() => {
          if (editor.copyChosen(true)) editor.paste();
        }}
      >
        <Icon name="duplicate" size={15} />
        <span>Duplicar</span>
      </button>
      <button type="button" title="Volver a como venía en el flyer" onClick={editor.backToOriginal}>
        Original
      </button>
      <button
        type="button"
        className={styles.trash}
        title="Borrar (Supr)"
        aria-label="Borrar"
        onClick={() => {
          editor.deleteChosen();
        }}
      >
        <Icon name="trash" size={15} />
      </button>
      {count < 2 && (
        <button type="button" onClick={editor.changeChosen}>
          {isText(entry) ? "Editar texto" : "Cambiar"}
        </button>
      )}
      {entry.franja && count === 1 && (
        <button
          type="button"
          title="Volver al editor de la franja de este logo"
          onClick={() => {
            editor.editStrip(entry.franja);
          }}
        >
          Editar franja
        </button>
      )}
      <button
        type="button"
        className={styles.letGo}
        title="Listo con este"
        aria-label="Listo con este"
        onClick={editor.letGo}
      >
        ×
      </button>
    </div>
  );
}

function sortedForReading(places: readonly FlyerPlace[]): readonly FlyerPlace[] {
  return places.toSorted((one, other) => {
    const [first, second] = [one.y + one.h / 2, other.y + other.h / 2];
    // The same row if their centers are less than half a height apart.
    if (Math.abs(first - second) < Math.min(one.h, other.h) / 2) {
      return one.x + one.w / 2 - (other.x + other.w / 2);
    }
    return first - second;
  });
}

/** Changes chosen go on their place, and those of the flyer as they were found. */
function placesToReplace(editor: LogoEditor): readonly FlyerPlace[] {
  const list = editor.active();
  const fromChanges = editor.chosen().flatMap((index) => {
    const entry = list[index];
    if (!entry) return [];
    const { tx, ty, tw, th } = boxOf(entry);
    const place =
      entry.dup || !(entry.ow > 0)
        ? { x: tx, y: ty, w: tw, h: th }
        : { x: entry.ox, y: entry.oy, w: entry.ow, h: entry.oh };
    return [{ ...place, bg: entry.bg, manual: true }];
  });
  return sortedForReading([...fromChanges, ...editor.getState().places]);
}

/** For logos of the flyer chosen with Shift, that have not been changed. */
function GroupBar() {
  const editor = useLogoEditorActions();
  const places = useLogoEditorValue((state) => state.places);
  useLogoEditorValue((state) => state.selected);
  useLogoEditorValue((state) => state.group);
  if (places.length === 0) return null;
  const changes = editor.chosen().length;
  const count = places.length + changes;
  return (
    <div
      className={styles.group}
      role="toolbar"
      tabIndex={-1}
      aria-label="Varios elegidos"
      onMouseDown={(event) => {
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <span className={styles.groupCount}>
        <b>
          {count}
          {count === 1 ? " elegido" : " elegidos"}
        </b>{" "}
        <span>(Shift + clic suma o saca)</span>
      </span>
      <Button
        size="sm"
        onClick={() => {
          editor.openSeveral(placesToReplace(editor));
        }}
      >
        Reemplazar
      </Button>
      <Button size="sm" variant="ghost" onClick={editor.deleteGroup}>
        Borrar
      </Button>
      {changes > 0 && (
        <Button
          size="sm"
          variant="ghost"
          title="Volver a como venían en el flyer"
          onClick={editor.groupOriginal}
        >
          Original
        </Button>
      )}
      <button
        type="button"
        className={styles.letGo}
        aria-label="Soltar lo elegido"
        title="Soltar lo elegido"
        onClick={editor.letAllGo}
      >
        ×
      </button>
    </div>
  );
}

/** What floats at the foot of the preview, and the window of a logo. */
export function LogoEditorAdjustBars() {
  const on = useLogoEditorValue((state) => state.on);
  const clean = useLogoEditorValue((state) => state.clean);
  const picker = useLogoEditorValue((state) => state.picker);
  const strip = useLogoEditorValue((state) => state.strip);
  const sectionPicker = useLogoEditorValue((state) => state.sectionPicker);
  const isPlacing = useLogoEditorValue((state) => state.placement !== null);
  return (
    <>
      {on && !clean && !isPlacing && <AdjustBar />}
      {on && !clean && !isPlacing && <GroupBar />}
      <TrimConfirm />
      <InsertConfirm />
      <PlacementBar />
      <DraftsRecovery />
      {picker && <LogoPicker key={`${picker.place.x},${picker.place.y}`} request={picker} />}
      {strip && <StripWindow key={strip.id} session={strip} />}
      {sectionPicker && <SectionPicker />}
      <SavedSetsWindows />
    </>
  );
}
