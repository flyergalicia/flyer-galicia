import type { ReactNode } from "react";
import styles from "./SectionLabel.module.css";

type SectionLabelProps = {
  /** "section" names a part of a screen; "panel" is the name on top of a side panel. */
  readonly kind?: "section" | "panel";
  readonly children: ReactNode;
};

/** A small title in capitals. */
export function SectionLabel({ kind = "section", children }: SectionLabelProps) {
  return <p className={`${styles.label} ${styles[kind]}`}>{children}</p>;
}
