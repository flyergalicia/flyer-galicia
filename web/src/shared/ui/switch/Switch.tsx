import type { ReactNode } from "react";
import styles from "./Switch.module.css";

type SwitchProps = {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  /** What it turns on and off. With children, the whole row can be pressed. */
  readonly children?: ReactNode;
  /** The name for readers, when there are no children. */
  readonly label?: string;
  readonly disabled?: boolean;
  /** Its text and its track on the line of a title, without a box around them. */
  readonly inline?: boolean;
  readonly title?: string;
  /** For a switch on the line of something else: a menu, for example. */
  readonly className?: string | undefined;
};

export function Switch({
  checked,
  onChange,
  children,
  label,
  disabled = false,
  inline = false,
  title,
  className,
}: SwitchProps) {
  const track = <span className={checked ? `${styles.track} ${styles.on}` : styles.track} />;
  const press = () => {
    onChange(!checked);
  };
  if (children === undefined) {
    return (
      <button
        type="button"
        role="switch"
        className={styles.bare}
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={press}
      >
        {track}
      </button>
    );
  }
  if (inline) {
    return (
      <button
        type="button"
        role="switch"
        className={className ? `${styles.inline} ${className}` : styles.inline}
        aria-checked={checked}
        disabled={disabled}
        title={title}
        onClick={press}
      >
        {children}
        {track}
      </button>
    );
  }
  return (
    <button
      type="button"
      role="switch"
      className={styles.row}
      aria-checked={checked}
      disabled={disabled}
      title={title}
      onClick={press}
    >
      <span className={styles.rowText}>{children}</span>
      {track}
    </button>
  );
}
