import type { ReactNode } from "react";
import styles from "./SectionLabel.module.css";

type SectionLabelProps = {
  /** "section" names a part of a screen; "panel" is the name on top of a side panel. */
  readonly kind?: "section" | "panel";
  /** Where it sits: the space around it is of the screen that uses it. */
  readonly className?: string | undefined;
  readonly children: ReactNode;
};

/** A small title in capitals. */
export function SectionLabel({ kind = "section", className = "", children }: SectionLabelProps) {
  return <p className={`${styles.label} ${styles[kind]} ${className}`.trim()}>{children}</p>;
}
