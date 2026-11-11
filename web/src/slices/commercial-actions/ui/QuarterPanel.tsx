// The period by quarter: a year and, inside it, quarters and months. One touch chooses only that; with
// Shift it adds, or takes away if it was already there.
import { MONTHS, thisYear } from "../model/formatting.ts";
import { MONTHS_LONG } from "../model/agenda-dates.ts";
import {
  chosenMonths,
  type DashboardFilters,
  isWholeQuarter,
  QUARTERS,
  quarterMonths,
  touchedMonths,
} from "../model/dashboard.ts";
import base from "./CommercialActions.module.css";
import styles from "./Dashboard.module.css";

const YEARS_BACK = [0, 1, 2];
const MONTHS_PER_QUARTER = 3;

function capitalized(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

interface QuarterPanelProps {
  readonly filters: DashboardFilters;
  readonly onFilters: (filters: DashboardFilters) => void;
}

function Quarter({
  quarter,
  filters,
  onFilters,
}: QuarterPanelProps & { readonly quarter: number }) {
  const chosen = chosenMonths(filters);
  const months = quarterMonths(quarter);
  const isOpen = filters.openQuarters.includes(quarter);
  const isWhole = isWholeQuarter(quarter, chosen);
  const isPart = months.some((month) => chosen.includes(month));
  const name = `${String(quarter)}Q`;
  const firstMonth = MONTHS[(quarter - 1) * MONTHS_PER_QUARTER] ?? "";
  const lastMonth = MONTHS[quarter * MONTHS_PER_QUARTER - 1] ?? "";
  const stateClass = isWhole ? styles.quarterOn : isPart ? styles.quarterPart : "";
  return (
    <div className={styles.quarter} data-testid="quarter" data-quarter={quarter}>
      <div className={styles.quarterHead}>
        <button
          type="button"
          className={`${styles.quarterButton} ${stateClass ?? ""}`}
          aria-pressed={isWhole}
          title="Un clic elige este trimestre; con Shift se suma a lo ya elegido"
          data-testid="quarter-button"
          onClick={({ shiftKey }) => {
            onFilters(touchedMonths(filters, months, shiftKey));
          }}
        >
          {name} <span>{`${firstMonth}–${lastMonth}`}</span>
        </button>
        <button
          type="button"
          className={styles.quarterArrow}
          aria-expanded={isOpen}
          aria-label={`${isOpen ? "Cerrar" : "Abrir"} los meses del ${name}`}
          title={`${isOpen ? "Cerrar" : "Elegir"} meses del ${name}`}
          data-testid="quarter-arrow"
          onClick={() => {
            const openQuarters = isOpen
              ? filters.openQuarters.filter((other) => other !== quarter)
              : [...filters.openQuarters, quarter];
            onFilters({ ...filters, openQuarters });
          }}
        >
          {isOpen ? "▾" : "▸"}
        </button>
      </div>
      {isOpen && (
        <div className={styles.quarterMonths}>
          {months.map((month) => {
            const isOn = chosen.includes(month);
            return (
              <button
                key={month}
                type="button"
                className={`${styles.quarterButton}${isOn ? ` ${styles.quarterOn}` : ""}`}
                aria-pressed={isOn}
                data-testid="quarter-month"
                onClick={({ shiftKey }) => {
                  onFilters(touchedMonths(filters, [month], shiftKey));
                }}
              >
                {capitalized(MONTHS_LONG[Number(month) - 1] ?? "")}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function QuarterPanel({ filters, onFilters }: QuarterPanelProps) {
  const current = thisYear();
  const years = YEARS_BACK.map((back) => current - back);
  const shown = years.includes(filters.year) ? years : [...years, filters.year];
  return (
    <div
      className={styles.quarters}
      data-testid="quarter-panel"
      data-months={chosenMonths(filters).join(",")}
    >
      <label className={styles.year}>
        <span className={base.label}>Año</span>
        <select
          className={`${base.input} ${base.select}`}
          value={filters.year}
          onChange={({ target }) => {
            onFilters({ ...filters, year: Number(target.value) });
          }}
        >
          {shown.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.quarterList}>
        {QUARTERS.map((quarter) => (
          <Quarter key={quarter} quarter={quarter} filters={filters} onFilters={onFilters} />
        ))}
      </div>
      <span className={`${base.mini} ${styles.quartersHelp}`}>
        Un clic elige uno; con <b>Shift</b> sumás (o sacás) otros.
      </span>
    </div>
  );
}
