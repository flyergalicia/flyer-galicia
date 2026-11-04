import styles from "./feedback.module.css";

type ProgressBarProps = {
  /** From 0 to 100. */
  readonly value: number;
  readonly label: string;
};

export function ProgressBar({ value, label }: ProgressBarProps) {
  const percent = Math.min(100, Math.max(0, value));
  return <progress aria-label={label} value={percent} max={100} className={styles.progress} />;
}
