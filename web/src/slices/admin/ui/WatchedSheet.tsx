import { optionLabel } from "@/shared/domain/flyer-options.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { SectionLabel, Skeleton } from "@/shared/ui/index.ts";
import { useWatchedSheet } from "../model/use-watched-sheet.ts";
import {
  stateText,
  type WatchedRow,
  type WatchedSection,
  type WatchedState,
} from "../model/watched-sheet.ts";
import { ReadProblem } from "./ReadProblem.tsx";
import styles from "./Config.module.css";
import panel from "./Panel.module.css";

const STATE_LOOK: Readonly<Record<WatchedState["kind"], string>> = {
  ok: styles.stateOk ?? "",
  soon: styles.stateSoon ?? "",
  expired: styles.stateExpired ?? "",
};

function Brand({ row, onStop }: { readonly row: WatchedRow; readonly onStop: () => void }) {
  return (
    <div className={styles.brand} data-testid="watched-row">
      <span className={styles.brandName} data-testid="watched-brand">
        {row.name}
        {row.title && (
          <>
            {" "}
            <small>({row.title})</small>
          </>
        )}
        {row.fromStudio && (
          <>
            {" "}
            <small className={styles.studio}>Estudio</small>
          </>
        )}
      </span>
      <span className={`${styles.state} ${STATE_LOOK[row.state.kind]}`} data-testid="watched-state">
        {stateText(row.state)}
      </span>
      <button type="button" className={styles.stop} aria-label="Dejar de vigilar" onClick={onStop}>
        ×
      </button>
    </div>
  );
}

function Section({
  section,
  title,
  onStop,
}: {
  readonly section: WatchedSection;
  readonly title: string;
  readonly onStop: (key: string) => void;
}) {
  const { rows, toReview } = section;
  return (
    <section className={styles.section} data-testid="watched-section">
      <h4 className={styles.sectionTitle}>
        {title}{" "}
        <small>
          {rows.length} marcas
          {toReview > 0 && (
            <>
              {" · "}
              <b className={styles.review}>{toReview} para revisar</b>
            </>
          )}
        </small>
      </h4>
      {rows.map((row, at) => (
        <Brand
          // The same brand can be twice in a list written by hand: its place tells them apart.
          key={`${row.key}#${String(at)}`}
          row={row}
          onStop={() => {
            onStop(row.key);
          }}
        />
      ))}
    </section>
  );
}

/** Config → Marcas vigiladas: the brands of each flyer and how they stand today. */
export function WatchedSheet() {
  const sheet = useWatchedSheet();
  const { options } = useFlyerOptions();
  const titleOf = (option: string) =>
    options.some(({ n }) => n === Number(option))
      ? optionLabel(options, option)
      : `Opción ${option} (ya no está)`;

  return (
    <div data-testid="admin-watched">
      <SectionLabel className={panel.label}>Marcas vigiladas</SectionLabel>
      <p className={`${styles.intro} ${styles.close12}`}>
        Todos los días a las 9, después de actualizar las promociones, se revisan estas marcas y te
        llega un mail <strong>sólo si alguna se venció o vence en 7 días o menos</strong>. Para
        cargar las de un flyer: en <strong>Promociones → Buscar</strong> pegá sus marcas, tocá{" "}
        <strong>Validar vigencia</strong> y después <strong>Vigilar estas marcas</strong>. Las que
        se ponen con Cambiar logos y se publican desde Estudio se suman solas.
      </p>
      <div data-testid="watched-body">
        {sheet.failure && (
          <ReadProblem
            message={sheet.failure.what}
            detail={sheet.failure.detail}
            onRetry={sheet.retry}
          />
        )}
        {!sheet.failure && !sheet.sections && (
          <>
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </>
        )}
        {sheet.sections?.length === 0 && (
          <p className={styles.empty}>Todavía no hay marcas vigiladas.</p>
        )}
        {sheet.sections?.map((section) => (
          <Section
            key={section.option}
            section={section}
            title={titleOf(section.option)}
            onStop={(key) => void sheet.remove(section.option, key)}
          />
        ))}
      </div>
    </div>
  );
}
