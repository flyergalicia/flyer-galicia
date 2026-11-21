// The globe of the tutorial (`#fg-tour-tip`): the chapters on top, the step, and how to move.
import type { Ref } from "react";
import { GUIDE_TIP_ATTRIBUTE } from "@/shared/ui/index.ts";
import type { ChapterId } from "../model/plan.ts";
import type { TourView } from "../model/tour-controller.ts";
import type { TourText } from "./chapters.tsx";
import styles from "./TourWindow.module.css";

export interface TourMoves {
  readonly onClose: () => void;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly onSkipChapter: () => void;
  readonly onChapter: (chapter: ChapterId) => void;
}

interface TourTipProps extends TourMoves {
  readonly view: TourView<TourText>;
  readonly tipRef: Ref<HTMLElement>;
  readonly arrowRef: Ref<HTMLDivElement>;
}

const GUIDE_TIP = { [GUIDE_TIP_ATTRIBUTE]: "" };

export function TourTip({ view, tipRef, arrowRef, ...moves }: TourTipProps) {
  const { step, index, total, chapters } = view;
  const isLast = index === total - 1;
  return (
    <section
      ref={tipRef}
      aria-label="Tutorial"
      className={styles.tip}
      data-testid="tour-tip"
      {...GUIDE_TIP}
    >
      <button
        type="button"
        className={styles.close}
        title="Cerrar (Esc)"
        aria-label="Cerrar el tutorial"
        onClick={moves.onClose}
      >
        ✕
      </button>
      <div className={styles.chips}>
        {chapters.map(({ id, title }) => {
          const isOn = id === step.chapter;
          return (
            <button
              key={id}
              type="button"
              className={isOn ? `${styles.chip} ${styles.chipOn}` : styles.chip}
              aria-current={isOn ? "step" : undefined}
              data-chip={id}
              onClick={() => {
                moves.onChapter(id);
              }}
            >
              {title}
            </button>
          );
        })}
      </div>
      <h4 className={styles.title}>{step.title}</h4>
      <p className={styles.text}>{step.text}</p>
      <div className={styles.foot}>
        <span className={styles.count} data-testid="tour-count">
          {`${String(index + 1)} / ${String(total)}`}
        </span>
        <button
          type="button"
          className={styles.button}
          disabled={index === 0}
          onClick={moves.onPrevious}
        >
          ← Anterior
        </button>
        <button type="button" className={`${styles.button} ${styles.main}`} onClick={moves.onNext}>
          {isLast ? "Terminar ✓" : "Siguiente →"}
        </button>
        {chapters.length > 1 && !isLast && (
          <button type="button" className={styles.skip} onClick={moves.onSkipChapter}>
            Omitir capítulo
          </button>
        )}
      </div>
      <div ref={arrowRef} className={styles.arrow} />
    </section>
  );
}
