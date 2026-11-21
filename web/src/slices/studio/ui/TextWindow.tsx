// The little window that asks for a text.
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Button, Modal } from "@/shared/ui/index.ts";
import styles from "./StudioView.module.css";

const ANGLE_BRACKETS = /[<>]/g;

export interface TextQuestion {
  readonly title: string;
  readonly text: string;
  readonly initial?: string;
  readonly confirmLabel: string;
  readonly maxLength: number;
  /** A long text: Enter is a new line. */
  readonly isLong?: boolean;
}

interface TextWindowProps extends TextQuestion {
  /** Null: it was cancelled. */
  readonly onAnswer: (answer: string | null) => void;
}

export function TextWindow({
  title,
  text,
  initial = "",
  confirmLabel,
  maxLength,
  isLong = false,
  onAnswer,
}: TextWindowProps) {
  const [value, setValue] = useState(initial);
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => {
    // After the window took the focus for itself.
    const frame = requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.select();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);
  const accept = () => {
    onAnswer(value.replaceAll(ANGLE_BRACKETS, "").trim());
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      accept();
    }
  };
  const shared = {
    className: styles.windowField,
    "aria-label": title,
    "data-testid": "text-window-field",
    maxLength,
    value,
    onChange: ({ target }: { readonly target: { readonly value: string } }) => {
      setValue(target.value);
    },
  };
  return (
    <Modal
      look="dialog"
      closeOnBackdrop={false}
      className={styles.window}
      onClose={() => {
        onAnswer(null);
      }}
    >
      <Modal.Title className={styles.windowTitle}>{title}</Modal.Title>
      <div className={styles.windowText}>{text}</div>
      {isLong ? (
        <textarea ref={field} rows={3} {...shared} />
      ) : (
        <input ref={field} type="text" autoComplete="off" onKeyDown={onKey} {...shared} />
      )}
      <div className={styles.windowActions}>
        <Button
          variant="ghost"
          size="dialog"
          onClick={() => {
            onAnswer(null);
          }}
        >
          Cancelar
        </Button>
        <Button size="dialog" onClick={accept}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
