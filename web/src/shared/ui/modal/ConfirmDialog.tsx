import { type ReactNode, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "../button/Button.tsx";
import { Icon } from "../icon/Icon.tsx";
import { useDialog } from "./use-dialog.ts";
import styles from "./ConfirmDialog.module.css";

type ConfirmDialogProps = {
  readonly title: string;
  readonly children: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  /** For what cannot be undone: the confirm button goes red. */
  readonly danger?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
};

/** The window that replaces confirm() of the browser. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancelar",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useDialog(panel, onCancel);
  return createPortal(
    <div className={styles.overlay}>
      <div
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.panel}
      >
        <div className={styles.head}>
          <span className={danger ? `${styles.icon} ${styles.iconDanger}` : styles.icon}>
            <Icon name={danger ? "warning" : "help"} size={18} />
          </span>
          <div>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <div className={styles.body}>{children}</div>
          </div>
        </div>
        <div className={styles.actions}>
          <Button variant="ghost" size="dialog" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            size="dialog"
            className={danger ? styles.confirmDanger : undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
