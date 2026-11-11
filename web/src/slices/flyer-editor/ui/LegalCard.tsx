import { type ClipboardEvent, type KeyboardEvent, useLayoutEffect, useRef, useState } from "react";
import { htmlBoldToMarks } from "@/shared/domain/legal-markup.ts";
import { optionLabel } from "@/shared/domain/flyer-options.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { useFlyerWorkspace, useWorkspaceValue } from "@/shared/lib/flyer-workspace/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { Card, Textarea } from "@/shared/ui/index.ts";
import { isInsideBold, toggleBold } from "../model/legal-editing.ts";
import styles from "./FlyerForm.module.css";

interface PendingSelection {
  readonly start: number;
  readonly end: number;
}

export function LegalCard() {
  const workspace = useFlyerWorkspace();
  const { show } = useToast();
  const { options } = useFlyerOptions();
  const legal = useWorkspaceValue((state) => state.legal);
  const loading = useWorkspaceValue((state) => state.slot.loading);
  const option = useWorkspaceValue((state) => state.slot.option);
  const [isBold, setIsBold] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const pending = useRef<PendingSelection | null>(null);

  // What was selected stays selected once the new text is on the field.
  useLayoutEffect(() => {
    const selection = pending.current;
    if (!selection) return;
    pending.current = null;
    field.current?.setSelectionRange(selection.start, selection.end);
  });

  const lookAtCursor = () => {
    const area = field.current;
    if (area) setIsBold(isInsideBold(area.value, area.selectionStart));
  };

  const pressBold = () => {
    const area = field.current;
    if (!area) return;
    area.focus();
    const next = toggleBold({
      value: area.value,
      start: area.selectionStart,
      end: area.selectionEnd,
    });
    if (!next) {
      show("Seleccioná el texto que querés en negrita");
      return;
    }
    pending.current = { start: next.start, end: next.end };
    workspace.setLegal(next.value);
    setIsBold(isInsideBold(next.value, next.start));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const isCommand = (event.ctrlKey || event.metaKey) && !event.altKey;
    if (isCommand && event.key.toLowerCase() === "b") {
      event.preventDefault();
      pressBold();
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const html = event.clipboardData.getData("text/html");
    // Without format, it is a common paste.
    if (!html) return;
    event.preventDefault();
    const marks = htmlBoldToMarks(html);
    const { value, selectionStart, selectionEnd } = event.currentTarget;
    const after = selectionStart + marks.length;
    pending.current = { start: after, end: after };
    workspace.setLegal(value.slice(0, selectionStart) + marks + value.slice(selectionEnd));
  };

  return (
    <Card>
      <Card.Title>Texto Legal</Card.Title>
      <div className={styles.legalHint}>
        Editá el texto legal completo. Seleccioná un tramo y tocá <strong>B</strong> (o Ctrl+B) para
        ponerlo en negrita: en el flyer sale con el formato correcto.
      </div>
      <div className={styles.legalBar} role="toolbar" aria-label="Formato del legal">
        <button
          type="button"
          className={styles.legalBold}
          title="Negrita (Ctrl+B)"
          aria-label="Negrita"
          data-testid="legal-bold"
          aria-pressed={isBold}
          onMouseDown={(event) => {
            // The selection of the field is what is being pressed for.
            event.preventDefault();
          }}
          onClick={pressBold}
        >
          B
        </button>
        <span className={styles.legalBarHint}>Seleccioná texto y tocá B</span>
      </div>
      <Textarea
        ref={field}
        value={legal}
        aria-label="Legal del flyer"
        data-testid="legal-text"
        placeholder={loading ? `Cargando el legal de ${optionLabel(options, option)}…` : ""}
        onChange={({ target }) => {
          workspace.setLegal(target.value);
          lookAtCursor();
        }}
        onKeyDown={onKeyDown}
        onKeyUp={lookAtCursor}
        onClick={lookAtCursor}
        onSelect={lookAtCursor}
        onPaste={onPaste}
      />
    </Card>
  );
}
