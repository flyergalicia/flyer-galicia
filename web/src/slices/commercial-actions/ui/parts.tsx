// What the screens of Gestiones have in common.
import type { ReactNode } from "react";
import { Button } from "@/shared/ui/index.ts";
import { messageOf } from "../model/failure-text.ts";
import { taxIdText } from "../model/tax-ids.ts";
import styles from "./CommercialActions.module.css";

export function Loading() {
  return <div className={styles.loading}>Cargando…</div>;
}

export function TaxId({ value }: { readonly value: string | readonly string[] | null }) {
  const text = taxIdText(value);
  return text ? <span className={styles.taxId}>{text}</span> : null;
}

/** A failure to read says so and offers to try again: it is never an empty list (invariant 24). */
export function ConnectionProblem({
  cause,
  onRetry,
}: {
  readonly cause: unknown;
  readonly onRetry: () => void;
}) {
  return (
    <div className={styles.empty} data-testid="commercial-problem">
      <span>No se pudo cargar. {messageOf(cause)}</span>
      <Button variant="ghost" className={styles.retry} onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}

export function Figure({
  label,
  value,
  detail,
  isHigh = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly isHigh?: boolean;
}) {
  return (
    <div className={`${styles.card} ${styles.figure}${isHigh ? ` ${styles.figureHigh}` : ""}`}>
      <div className={styles.label}>{label}</div>
      <div className={styles.figureValue}>{value}</div>
      {detail && <div className={styles.figureDetail}>{detail}</div>}
    </div>
  );
}

export type ChipTone = "info" | "ok" | "bad" | "warn" | "type";

const CHIP_CLASS: Readonly<Record<ChipTone, string | undefined>> = {
  info: styles.chipInfo,
  ok: styles.chipOk,
  bad: styles.chipBad,
  warn: styles.chipWarn,
  type: styles.chipType,
};

export function Chip({
  tone,
  title,
  children,
}: {
  readonly tone: ChipTone;
  readonly title?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <span className={`${styles.chip} ${CHIP_CLASS[tone] ?? ""}`} title={title}>
      {children}
    </span>
  );
}
