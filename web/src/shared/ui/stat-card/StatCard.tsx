import type { ReactNode } from "react";
import styles from "./StatCard.module.css";

export type StatCardTone = "neutral" | "green" | "red" | "blue" | "yellow";

type StatCardProps = {
  readonly label: string;
  readonly value: ReactNode;
  readonly tone?: StatCardTone;
};

export function StatCard({ label, value, tone = "neutral" }: StatCardProps) {
  return (
    <div className={`${styles.card} ${styles[tone]}`}>
      <span className={styles.label}>{label}</span>
      <strong className={styles.value}>{value}</strong>
    </div>
  );
}
