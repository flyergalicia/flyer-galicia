import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "../icon/Icon.tsx";
import styles from "./Button.module.css";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "blue"
  | "green"
  | "soft-danger"
  | "soft-ok"
  | "soft-neutral"
  | "soft-muted"
  | "link";

export type ButtonSize = "lg" | "md" | "dialog" | "sm" | "xs" | "icon";

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Takes the whole width of its container. */
  readonly fullWidth?: boolean;
  /** Working: it cannot be pressed again, and readers hear that it is busy. */
  readonly busy?: boolean;
  readonly icon?: IconName;
  readonly type?: "button" | "submit" | "reset";
  readonly children: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  busy = false,
  icon,
  type = "button",
  className,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    styles.button,
    styles[variant],
    size === "icon" ? styles["icon-size"] : styles[size],
    fullWidth && styles.fullWidth,
    busy && styles.busy,
    className,
  ];
  return (
    <button
      {...rest}
      type={type}
      className={classes.filter(Boolean).join(" ")}
      disabled={disabled === true || busy}
      aria-busy={busy || undefined}
    >
      {icon && <Icon name={icon} className={styles.icon} />}
      {children}
    </button>
  );
}
