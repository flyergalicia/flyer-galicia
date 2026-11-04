import type { ReactNode } from "react";
import styles from "./Badge.module.css";

export type BadgeTone =
  | "green"
  | "red"
  | "blue"
  | "purple"
  | "gold"
  | "amber"
  | "teal"
  | "violet"
  | "navy"
  | "valid"
  | "ending"
  | "expired"
  | "review"
  | "none"
  | "outside"
  | "soon";

type BadgeProps = {
  readonly tone: BadgeTone;
  /** The name of a person's role, in the menu. */
  readonly uppercase?: boolean;
  /** "chip" is the larger one, for a summary that can be pressed to filter. */
  readonly size?: "badge" | "chip";
  readonly children: ReactNode;
};

export function Badge({ tone, uppercase = false, size = "badge", children }: BadgeProps) {
  const classes = [
    styles.badge,
    styles[tone],
    size === "chip" && styles.chip,
    uppercase && styles.uppercase,
  ];
  return <span className={classes.filter(Boolean).join(" ")}>{children}</span>;
}
