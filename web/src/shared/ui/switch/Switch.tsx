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
};

export function Switch({ checked, onChange, children, label, disabled = false }: SwitchProps) {
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
  return (
    <button
      type="button"
      role="switch"
      className={styles.row}
      aria-checked={checked}
      disabled={disabled}
      onClick={press}
    >
      <span className={styles.rowText}>{children}</span>
      {track}
    </button>
  );
}
