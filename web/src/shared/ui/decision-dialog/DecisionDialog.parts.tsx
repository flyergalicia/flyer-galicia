import { type ReactNode, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useDialog } from "../modal/use-dialog.ts";
import styles from "./DecisionDialog.module.css";

const nothing = () => undefined;

interface DecisionDialogProps {
  readonly title: ReactNode;
  /** The one that has a form inside: more width and more air. */
  readonly wide?: boolean;
  readonly children: ReactNode;
}

/**
 * The window that asks something and waits for one of its buttons: on purpose it does not close with
 * a click outside or with Escape, so that a change is not lost because of a click to the side.
 */
export function DecisionDialogRoot({ title, wide = false, children }: DecisionDialogProps) {
  const titleId = useId();
  const panel = useRef<HTMLDialogElement>(null);
  useDialog(panel, nothing);
  return createPortal(
    <div className={styles.overlay}>
      <dialog
        ref={panel}
        open
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="decision-dialog"
        className={wide ? `${styles.panel} ${styles.wide}` : styles.panel}
      >
        <h3 id={titleId} className={styles.title}>
          {title}
        </h3>
        {children}
      </dialog>
    </div>,
    document.body,
  );
}

interface PartProps {
  readonly children: ReactNode;
}

export function DecisionText({
  children,
  separated = false,
}: PartProps & { readonly separated?: boolean }) {
  return (
    <p className={separated ? `${styles.text} ${styles.separated}` : styles.text}>{children}</p>
  );
}

/** A list of what changes. */
export function DecisionList({ children }: PartProps) {
  return <ul className={styles.list}>{children}</ul>;
}

export function DecisionItem({
  danger = false,
  children,
}: PartProps & { readonly danger?: boolean }) {
  return (
    <li className={danger ? `${styles.item} ${styles.danger}` : styles.item} data-danger={danger}>
      {children}
    </li>
  );
}

export function DecisionAlert({ children }: PartProps) {
  return (
    <div className={styles.alert} data-testid="decision-alert">
      {children}
    </div>
  );
}

export function DecisionField({
  label,
  id,
  children,
}: PartProps & { readonly label: string; readonly id: string }) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

/** The note under a field. As a warning when there is something to look at. */
export function DecisionHint({ warn = false, children }: PartProps & { readonly warn?: boolean }) {
  return <p className={warn ? styles.warn : styles.hint}>{children}</p>;
}

export function DecisionFoot({ children }: PartProps) {
  return <div className={styles.foot}>{children}</div>;
}

interface ButtonProps extends PartProps {
  readonly onClick: () => void;
  readonly disabled?: boolean;
}

/** The way out: nothing changes. */
export function DecisionNo({ onClick, disabled = false, children }: ButtonProps) {
  return (
    <button
      type="button"
      className={styles.no}
      data-decision="no"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** What is being offered. */
export function DecisionYes({ onClick, disabled = false, children }: ButtonProps) {
  return (
    <button
      type="button"
      className={styles.yes}
      data-decision="yes"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
