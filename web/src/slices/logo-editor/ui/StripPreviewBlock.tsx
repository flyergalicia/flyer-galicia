import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { Icon, Select } from "@/shared/ui/index.ts";
import { useLogoEditorActions } from "../model/editor-context.ts";
import { attachStripPreview, type StripPreview } from "../model/strip-preview.ts";
import { backToPlace, chosenOf, grown, sizedChosen } from "../model/strip-selection.ts";
import type { StripSession } from "../model/strip-session.ts";
import styles from "./StripWindow.module.css";

const SMALLEST_COLUMNS = 2;
const MOST_COLUMNS = 10;
const STEP = 0.1;

function useSessionValue<Value>(session: StripSession, read: () => Value): Value {
  return useSyncExternalStore(session.subscribe, read);
}

function percent(size: number): number {
  return Math.round(size * 100);
}

function ChosenControls({ session }: { readonly session: StripSession }) {
  const selection = useSessionValue(session, () => session.getState().selection);
  const marked = useSessionValue(session, () => session.getState().marked);
  const count = useSessionValue(session, () => chosenOf(session.getState()).length);
  const pick = selection[marked];
  if (!pick) {
    return (
      <div className={styles.adjustTip}>
        Tocá un logo de la vista previa y arrastralo para acomodarlo (con <b>Shift</b> elegís
        varios); acá abajo le cambiás el tamaño.
      </div>
    );
  }
  const size = percent(pick.k ?? 1);
  return (
    <div className={`${styles.adjustRow} ${styles.adjustOne}`}>
      <span className={styles.adjustLabel}>
        {count > 1 ? (
          <b>{count} elegidos</b>
        ) : (
          <>
            <b>{marked + 1}.</b> {pick.t}
          </>
        )}
      </span>
      <button
        type="button"
        title="Más chico (tecla −)"
        aria-label="Más chico"
        onClick={() => {
          session.change((choice) => grown(choice, -STEP));
        }}
      >
        −
      </button>
      <input
        type="range"
        min="40"
        max="250"
        step="5"
        aria-label="Tamaño de este logo"
        value={size}
        onChange={(event) => {
          const { value } = event.target;
          session.change((choice) => sizedChosen(choice, Number(value)));
        }}
      />
      <button
        type="button"
        title="Más grande (tecla +)"
        aria-label="Más grande"
        onClick={() => {
          session.change((choice) => grown(choice, STEP));
        }}
      >
        +
      </button>
      <span className={styles.adjustValue}>{size}%</span>
      <button
        type="button"
        className={styles.adjustPlace}
        title="Vuelve a su lugar y a su tamaño"
        onClick={() => {
          session.change(backToPlace);
        }}
      >
        Volver a su lugar
      </button>
    </div>
  );
}

function SizeOfAll({ session }: { readonly session: StripSession }) {
  const size = percent(useSessionValue(session, () => session.getState().sizeOfAll));
  return (
    <div className={styles.adjustRow}>
      <span className={styles.adjustLabel}>Tamaño de todos</span>
      <input
        type="range"
        min="60"
        max="150"
        step="5"
        aria-label="Tamaño de todos los logos"
        value={size}
        onChange={(event) => {
          session.setSizeOfAll(Number(event.target.value));
        }}
      />
      <span className={styles.adjustValue}>{size}%</span>
    </div>
  );
}

function PerRow({ session }: { readonly session: StripSession }) {
  const perRow = useSessionValue(session, () => session.getState().perRow);
  const columns = Array.from(
    { length: MOST_COLUMNS - SMALLEST_COLUMNS + 1 },
    (_column, index) => index + SMALLEST_COLUMNS,
  );
  return (
    <div className={styles.perRow}>
      <label htmlFor="strip-per-row">Por fila</label>
      <Select
        id="strip-per-row"
        appearance="native"
        className={styles.perRowSelect}
        value={String(perRow)}
        onChange={(event) => {
          session.setPerRow(Number(event.target.value));
        }}
      >
        <option value="0">Automático (como el original)</option>
        {columns.map((column) => (
          <option key={column} value={column}>
            {column}
          </option>
        ))}
      </Select>
    </div>
  );
}

function HistoryButtons({ session }: { readonly session: StripSession }) {
  useSessionValue(session, () => session.getState().history);
  return (
    <span className={styles.history}>
      <button
        type="button"
        className={styles.topButton}
        disabled={!session.canUndo()}
        title="Deshacer (Ctrl+Z)"
        onClick={session.undo}
      >
        ↶ Deshacer
      </button>
      <button
        type="button"
        className={styles.topButton}
        disabled={!session.canRedo()}
        title="Rehacer (Ctrl+Y)"
        onClick={session.redo}
      >
        ↷ Rehacer
      </button>
    </span>
  );
}

interface StripPreviewBlockProps {
  readonly session: StripSession;
  readonly withDays: boolean;
  readonly daysOf: (logo: string) => string;
  /** The step of the phone on screen: on coming into sight, it measures itself again. */
  readonly step: number;
}

/** What is over the columns: how it is going to look, and how to adjust it. */
export function StripPreviewBlock({ session, withDays, daysOf, step }: StripPreviewBlockProps) {
  const editor = useLogoEditorActions();
  const { logos } = useFlyerWorkspace();
  const canvas = useRef<HTMLCanvasElement>(null);
  const preview = useRef<StripPreview | null>(null);
  const days = useRef({ withDays, daysOf });
  const [canGrow, setCanGrow] = useState(true);
  const isLarge = useSessionValue(session, () => session.getState().isLarge);

  const logoImage = useCallback(
    (logo: string) => {
      const art = editor.picture();
      const image = art && logos.imageFor(logo, art, editor.currentArt());
      return image instanceof HTMLCanvasElement ? image : null;
    },
    [editor, logos],
  );

  useEffect(() => {
    if (!canvas.current) return undefined;
    const attached = attachStripPreview(canvas.current, session, {
      picture: editor.picture,
      logoImage,
      withDays: () => days.current.withDays,
      daysOf: (logo) => days.current.daysOf(logo),
      onMeasured: setCanGrow,
    });
    preview.current = attached;
    return attached.detach;
  }, [editor, logoImage, session]);

  useEffect(() => {
    days.current = { withDays, daysOf };
    preview.current?.draw();
  }, [daysOf, withDays]);

  useEffect(() => {
    if (step === 2) preview.current?.remeasure();
  }, [step]);

  return (
    <div className={styles.top} data-part="preview-block">
      <div className={styles.topHeader}>
        <div className={styles.label}>
          Así va a quedar <span>(tocá un logo para moverlo; el número es su orden)</span>
        </div>
        <HistoryButtons session={session} />
        {canGrow && (
          <button
            type="button"
            className={styles.topButton}
            aria-pressed={isLarge}
            onClick={session.toggleLarge}
          >
            <Icon name="expand" size={14} />
            <span>{isLarge ? "Achicar vista previa" : "Ampliar vista previa"}</span>
          </button>
        )}
      </div>
      <div className={styles.previewBox}>
        <canvas
          ref={canvas}
          className={styles.previewCanvas}
          aria-label="Vista previa de la franja: tocá un logo para acomodarlo"
          data-testid="strip-preview"
        />
      </div>
      <div className={styles.controls}>
        <div className={styles.adjust} data-testid="strip-adjust">
          <ChosenControls session={session} />
          <SizeOfAll session={session} />
        </div>
        <PerRow session={session} />
      </div>
    </div>
  );
}
