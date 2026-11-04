import type { ReactNode } from "react";
import styles from "./feedback.module.css";

export type NoticeTone = "ok" | "warning" | "error" | "accent";

const ROLES: Readonly<Record<NoticeTone, "status" | "alert">> = {
  ok: "status",
  warning: "status",
  accent: "status",
  error: "alert",
};

export function Notice({
  tone,
  children,
}: {
  readonly tone: NoticeTone;
  readonly children: ReactNode;
}) {
  return (
    <div role={ROLES[tone]} className={[styles.notice, styles[`notice-${tone}`]].join(" ")}>
      {children}
    </div>
  );
}
