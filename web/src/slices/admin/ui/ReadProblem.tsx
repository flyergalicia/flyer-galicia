import { Button, Notice } from "@/shared/ui/index.ts";
import styles from "./Panel.module.css";

/** What could not be read is said, with a way to try again: never an empty list (invariant 24). */
export function ReadProblem({
  message,
  detail,
  onRetry,
}: {
  /** "No se pudieron leer los usuarios". */
  readonly message: string;
  /** What went wrong, in words of the server or "sin conexión". */
  readonly detail: string;
  readonly onRetry: () => void;
}) {
  return (
    <div className={styles.problem} data-testid="read-problem">
      <Notice tone="error">
        {message}: {detail}.
      </Notice>
      <Button variant="soft-neutral" size="xs" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}
