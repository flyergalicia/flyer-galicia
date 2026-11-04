import type { ReactNode } from "react";
import styles from "./ListRow.module.css";

type PartProps = {
  readonly children: ReactNode;
};

type ListRowProps = PartProps & {
  /** "compact" is the one of the recent activity. */
  readonly density?: "regular" | "compact";
};

export function ListRowRoot({ density = "regular", children }: ListRowProps) {
  return <div className={`${styles.row} ${styles[density]}`}>{children}</div>;
}

export function ListRowMain({ children }: PartProps) {
  return <div className={styles.main}>{children}</div>;
}

export function ListRowTitle({ children }: PartProps) {
  return <strong className={styles.title}>{children}</strong>;
}

export function ListRowMeta({ children }: PartProps) {
  return <small className={styles.meta}>{children}</small>;
}

/** Badges or buttons, on the right. They keep their size: the text gives way first. */
export function ListRowAside({
  tight = false,
  children,
}: PartProps & { readonly tight?: boolean }) {
  return <div className={tight ? `${styles.aside} ${styles.tight}` : styles.aside}>{children}</div>;
}
