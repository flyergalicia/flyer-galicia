import type { ReactNode } from "react";
import styles from "./feedback.module.css";

type ToastProps = {
  readonly visible: boolean;
  readonly children: ReactNode;
};

/** The short message at the bottom. It does not take the focus or stop any press. */
export function Toast({ visible, children }: ToastProps) {
  return (
    <output
      data-visible={visible}
      className={visible ? `${styles.toast} ${styles.toastOn}` : styles.toast}
    >
      {children}
    </output>
  );
}
