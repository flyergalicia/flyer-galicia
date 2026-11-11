import { Button, useShortcutTip } from "@/shared/ui/index.ts";
import type { CompanyBatchProgress } from "@/shared/lib/flyer-workspace/company-batch/company-batch.ts";
import styles from "./HunterView.module.css";

interface MultipleBarProps {
  readonly isOn: boolean;
  readonly count: number;
  readonly isGenerating: boolean;
  readonly progress: CompanyBatchProgress | null;
  readonly onTickAll: (on: boolean) => void;
  readonly onDownload: () => void;
  readonly onCancel: () => void;
}

/** The tick of "Tildar todas" keeps what it had when the bar comes back, as it does today. */
export function MultipleBar({
  isOn,
  count,
  isGenerating,
  progress,
  onTickAll,
  onDownload,
  onCancel,
}: MultipleBarProps) {
  const tip = useShortcutTip("Enter");
  return (
    <div className={styles.multipleBar} hidden={!isOn} data-testid="hunter-multiple-bar">
      <label className={styles.tickAll}>
        <input
          type="checkbox"
          onChange={({ target }) => {
            onTickAll(target.checked);
          }}
        />{" "}
        Tildar todas
      </label>
      <span className={styles.tickCount} data-testid="hunter-ticked-count">
        {count} {count === 1 ? "empresa tildada" : "empresas tildadas"}
      </span>
      {progress && (
        <progress
          className={styles.progress}
          aria-label={progress.text}
          value={progress.percent}
          max={100}
        />
      )}
      <span className={styles.progressText} data-testid="hunter-batch-progress">
        {progress?.text}
      </span>
      <Button
        {...tip.target}
        className={styles.zipButton}
        data-testid="hunter-zip"
        disabled={count === 0 || isGenerating}
        onClick={onDownload}
      >
        {count > 0 ? `Descargar ZIP (${String(count)})` : "Descargar ZIP"}
      </Button>
      {tip.element}
      <button type="button" className={styles.cancelMultiple} onClick={onCancel}>
        Cancelar
      </button>
    </div>
  );
}
