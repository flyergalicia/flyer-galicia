import styles from "./ZoomControls.module.css";

interface ZoomControlsProps {
  /** How much it is zoomed, as it reads: 125 means 125%. */
  readonly percent: number;
  readonly onOut: () => void;
  readonly onIn: () => void;
  readonly onReset: () => void;
  /** Where it goes: each screen puts it in its place. */
  readonly className?: string | undefined;
  /** How the tutorial and the tests find it. */
  readonly testId?: string;
}

/** The zoom of a preview with buttons: at the middle of what is seen, not where the mouse is. */
export function ZoomControls({
  percent,
  onOut,
  onIn,
  onReset,
  className,
  testId,
}: ZoomControlsProps) {
  return (
    <div className={className ? `${styles.bar} ${className}` : styles.bar} data-testid={testId}>
      <button
        type="button"
        className={styles.button}
        title="Alejar"
        aria-label="Alejar"
        onClick={onOut}
      >
        −
      </button>
      <span className={styles.percent} data-testid="zoom-percent">
        {percent}%
      </span>
      <button
        type="button"
        className={styles.button}
        title="Acercar"
        aria-label="Acercar"
        onClick={onIn}
      >
        +
      </button>
      <button
        type="button"
        className={`${styles.button} ${styles.reset}`}
        title="Restablecer zoom"
        aria-label="Restablecer zoom"
        onClick={onReset}
      >
        ⟲
      </button>
    </div>
  );
}
