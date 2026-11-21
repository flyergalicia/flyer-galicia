// Semana: the best promotion of each bank, day by day, and all those of one bank on one day.
import { useBenchmark, useBenchmarkActions } from "../model/benchmark-context.ts";
import {
  audienceText,
  capText,
  isTopValue,
  money,
  promotionLink,
  scheduleText,
} from "../model/offers.ts";
import {
  dayListing,
  type DayPick,
  listingNote,
  listingTitle,
  MAX_DAY_ROWS,
  type RankedPromotion,
  weekRows,
} from "../model/week.ts";
import { OfferCell } from "./OfferCell.tsx";
import { galiciaClass } from "./galicia-class.ts";
import { BankHeaders, NothingWithFilters } from "./TableParts.tsx";
import styles from "./BenchmarkView.module.css";

export function PromotionLink({ address }: { readonly address: string }) {
  if (!address) return null;
  return (
    <a href={address} target="_blank" rel="noopener noreferrer">
      Ver promo ↗
    </a>
  );
}

/** "Sólo …", "Empieza el …" under the days. */
export function Conditions({ ranked }: { readonly ranked: RankedPromotion }) {
  const { days } = useBenchmark();
  const audience = audienceText(ranked.row);
  const schedule = scheduleText(ranked.row, days.today);
  return (
    <>
      {ranked.row.dias ?? ""}
      {audience && <div className={styles.segment}>{`Sólo ${audience}`}</div>}
      {schedule && <div className={styles.segment}>{schedule}</div>}
    </>
  );
}

function DayListing({ pick }: { readonly pick: DayPick }) {
  const { filtered, screen } = useBenchmark();
  const { dispatch } = useBenchmarkActions();
  const listing = dayListing(filtered, screen.references, pick);
  return (
    <div className={styles.card} data-testid="benchmark-day-listing">
      <h3>{listingTitle(pick, listing.length)}</h3>
      <p className={styles.sub}>{listingNote(listing.length)}</p>
      <div className={styles.slides} data-slides="table">
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Marca</th>
              <th>Rubro</th>
              <th>Beneficio</th>
              <th>Devuelve</th>
              <th>Condiciones</th>
              <th aria-label="Ver promo" />
            </tr>
          </thead>
          <tbody>
            {listing.slice(0, MAX_DAY_ROWS).map((ranked) => (
              <tr key={String(ranked.row.id)}>
                <td>
                  <b>{ranked.row.titulo}</b>
                </td>
                <td>{ranked.row.rubro}</td>
                <td>{ranked.row.beneficio ?? ""}</td>
                <td>
                  {ranked.value > 0 ? money(ranked.value) : "—"}
                  <div className={styles.segment}>{capText(ranked.row)}</div>
                </td>
                <td>
                  <Conditions ranked={ranked} />
                </td>
                <td>
                  <PromotionLink address={promotionLink(ranked.row)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className={`${styles.button} ${styles.closeButton}`}
        onClick={() => {
          dispatch({ type: "day-pick", pick });
        }}
      >
        Cerrar
      </button>
    </div>
  );
}

export function WeekView() {
  const { filtered, screen } = useBenchmark();
  const { dispatch } = useBenchmarkActions();
  if (filtered.length === 0) return <NothingWithFilters />;
  return (
    <>
      <div className={styles.card}>
        <h3>La mejor promo de cada banco, día por día</h3>
        <p className={styles.sub}>
          Con los filtros de arriba. Conviene elegir un rubro (por ejemplo Supermercados) para que
          la compra de referencia sea la misma en toda la tabla.
        </p>
      </div>
      <div className={`${styles.card} ${styles.slides}`} data-slides="table">
        <table className={styles.table}>
          <thead>
            <BankHeaders first="Día" />
          </thead>
          <tbody>
            {weekRows(filtered, screen.references).map((row) => (
              <tr key={row.day}>
                <td>
                  <strong>{row.name}</strong>
                </td>
                {row.cells.map((cell) => (
                  <td key={cell.bank} className={galiciaClass(cell.bank)}>
                    <OfferCell offer={cell.offer} wins={isTopValue(cell.offer, row.top)} />
                    {cell.count > 1 && (
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => {
                          dispatch({ type: "day-pick", pick: { day: row.day, bank: cell.bank } });
                        }}
                      >
                        {`Ver las ${String(cell.count)} promos`}
                      </button>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {screen.dayPick && <DayListing pick={screen.dayPick} />}
    </>
  );
}
