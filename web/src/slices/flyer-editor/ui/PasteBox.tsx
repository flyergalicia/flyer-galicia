import { useEffect, useRef, useState } from "react";
import { useFlyerForm } from "../model/form-context.ts";
import {
  type OfficerDraft,
  withOfficerRestored,
  withPastedOfficer,
  withPastedPhone,
} from "../model/form-state.ts";
import { NOTHING_RECOGNIZED, pasteOutcome, type PasteOutcome } from "../model/paste-officer.ts";
import styles from "./FlyerForm.module.css";

const WAIT_TO_READ_MS = 180;

type Shown =
  | { readonly kind: "none" }
  | { readonly kind: "problem" }
  | { readonly kind: "undone" }
  | { readonly kind: "outcome"; readonly outcome: PasteOutcome };

type Snapshot = Pick<OfficerDraft, "nombre" | "celular" | "email" | "mailByHand">;

function Chip({ on, children }: { readonly on: boolean; readonly children: string }) {
  return (
    <span
      className={on ? `${styles.pasteChip} ${styles.pasteChipOn}` : styles.pasteChip}
      data-paste-chip=""
    >
      {on ? "✓" : "—"} {children}
    </span>
  );
}

function Outcome({
  outcome: { recognized, lines, ignored },
  onUndo,
}: {
  readonly outcome: PasteOutcome;
  readonly onUndo: () => void;
}) {
  return (
    <>
      <div className={styles.pasteChips}>
        <Chip on={recognized.nombre}>Nombre</Chip>
        <Chip on={recognized.celular}>Celular</Chip>
        <Chip on={recognized.email}>Mail</Chip>
      </div>
      {lines.length > 0 && (
        <div className={styles.pasteLines}>
          {lines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}
      {ignored.length > 0 && (
        <div className={styles.pasteIgnored}>Ignoré: {ignored.join(", ")}</div>
      )}
      <button type="button" className={styles.pasteUndo} onClick={onUndo}>
        Deshacer
      </button>
    </>
  );
}

/** Each time it opens it starts clean: what was there before is what Deshacer brings back. */
export function PasteBox({ position }: { readonly position: number }) {
  const form = useFlyerForm();
  const [text, setText] = useState("");
  const [shown, setShown] = useState<Shown>({ kind: "none" });
  const field = useRef<HTMLTextAreaElement>(null);
  const snapshot = useRef<Snapshot | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    field.current?.focus();
    return () => {
      clearTimeout(timer.current);
    };
  }, []);

  const read = (pasted: string) => {
    if (!pasted.trim()) {
      setShown({ kind: "none" });
      return;
    }
    const before = form.getState().officers[position];
    if (!before) return;
    snapshot.current ??= {
      nombre: before.nombre,
      celular: before.celular,
      email: before.email,
      mailByHand: before.mailByHand,
    };
    const outcome = pasteOutcome(pasted, before);
    const { change } = outcome;
    if (change.kind === "nothing") {
      setShown({ kind: "problem" });
      return;
    }
    form.update((state) =>
      change.kind === "person"
        ? withPastedOfficer(state, position, change)
        : withPastedPhone(state, position, change.celular),
    );
    setShown({ kind: "outcome", outcome });
  };

  const undo = () => {
    const before = snapshot.current;
    if (!before) return;
    form.update((state) => withOfficerRestored(state, position, before));
    snapshot.current = null;
    setText("");
    setShown({ kind: "undone" });
  };

  return (
    <div className={styles.pasteBox} data-testid={`paste-box-${String(position + 1)}`}>
      <div className={styles.pasteHint}>
        Pegá acá el mensaje, la firma o los datos sueltos del oficial.
      </div>
      <textarea
        ref={field}
        className={styles.pasteField}
        rows={3}
        aria-label="Datos del oficial para pegar"
        placeholder="Ej: Julieta A. De Santis, 11 3617-9603, julieta.desantis@bancogalicia.com.ar"
        value={text}
        onChange={({ target }) => {
          const { value } = target;
          setText(value);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            read(value);
          }, WAIT_TO_READ_MS);
        }}
      />
      <div className={styles.pasteResult} data-testid="paste-result">
        {shown.kind === "problem" && (
          <div className={styles.pasteWarn} data-paste-problem="">
            ⚠ {NOTHING_RECOGNIZED}
          </div>
        )}
        {shown.kind === "undone" && (
          <div className={styles.pasteUndone}>Deshecho — volviste a los datos de antes.</div>
        )}
        {shown.kind === "outcome" && <Outcome outcome={shown.outcome} onUndo={undo} />}
      </div>
    </div>
  );
}
