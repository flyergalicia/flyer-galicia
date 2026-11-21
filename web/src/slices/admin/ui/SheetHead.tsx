import type { ReactNode } from "react";
import { SectionLabel } from "@/shared/ui/index.ts";
import styles from "./Panel.module.css";

/** The small title of a sheet, with what it offers on its right. */
export function SheetHead({
  title,
  space = "regular",
  children,
}: {
  readonly title: string;
  /** "tight": the dashboard leaves 4px under it; "users": the list of users, 12px. */
  readonly space?: "regular" | "tight" | "users";
  readonly children: ReactNode;
}) {
  return (
    <div className={`${styles.head} ${styles[space]}`}>
      <SectionLabel>{title}</SectionLabel>
      {children}
    </div>
  );
}
