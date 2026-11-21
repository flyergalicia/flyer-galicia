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
  /** With it, the badge can be pressed. */
  readonly onClick?: () => void;
  /** It is pressed: what it filters by is on. */
  readonly pressed?: boolean;
  readonly title?: string;
  readonly "data-testid"?: string;
  readonly children: ReactNode;
};

export function Badge({
  tone,
  uppercase = false,
  size = "badge",
  onClick,
  pressed = false,
  title,
  children,
  ...rest
}: BadgeProps) {
  const classes = [
    styles.badge,
    styles[tone],
    size === "chip" && styles.chip,
    uppercase && styles.uppercase,
  ];
  const className = classes.filter(Boolean).join(" ");
  if (onClick) {
    return (
      <button
        {...rest}
        type="button"
        className={className}
        title={title}
        aria-pressed={pressed}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }
  return (
    <span {...rest} className={className} title={title}>
      {children}
    </span>
  );
}
