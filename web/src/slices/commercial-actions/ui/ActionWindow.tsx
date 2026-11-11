// A window of Gestiones: over everything, with no header of its own, and it closes with Escape or by
// touching outside. It leaves the cursor on the first thing that can be touched.
import { type ReactNode, useEffect, useRef } from "react";
import { Modal } from "@/shared/ui/index.ts";
import styles from "./CommercialActions.module.css";

const FIRST_CONTROL = "input:not([type=hidden]),select,textarea,button";

interface ActionWindowProps {
  readonly title: string;
  readonly subtitle?: ReactNode;
  readonly isWide?: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

export function ActionWindow({
  title,
  subtitle,
  isWide = false,
  onClose,
  children,
}: ActionWindowProps) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // After the window took the focus for itself.
    const frame = requestAnimationFrame(() => {
      body.current?.querySelector<HTMLElement>(FIRST_CONTROL)?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <Modal
      look="sheet"
      className={`${styles.window}${isWide ? ` ${styles.windowWide}` : ""}`}
      onClose={onClose}
    >
      <div ref={body} data-testid="action-window">
        <Modal.Title className={styles.windowTitle}>{title}</Modal.Title>
        {subtitle && <p className={styles.windowSubtitle}>{subtitle}</p>}
        {children}
      </div>
    </Modal>
  );
}
