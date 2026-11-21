// Where each bank comes from and when it was read; red when it is too old.
import type { HandLoadedPromotion, SourceMeta } from "../model/rows.ts";
import { sourceLabels } from "../model/sources.ts";
import styles from "./BenchmarkView.module.css";

interface SourceLabelsProps {
  readonly meta: readonly SourceMeta[];
  readonly handLoaded: readonly HandLoadedPromotion[];
  readonly today: string;
}

export function SourceLabels({ meta, handLoaded, today }: SourceLabelsProps) {
  return (
    <div className={styles.sources} data-testid="benchmark-sources">
      {sourceLabels(meta, handLoaded, today).map((label) => (
        <span
          key={label.bank}
          className={styles.chip}
          data-stale={label.stale}
          data-bank={label.bank}
          title={label.title}
        >
          <b>{label.name}</b>
          {label.detail}
        </span>
      ))}
    </div>
  );
}
