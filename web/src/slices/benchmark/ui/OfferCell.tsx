// The cell of a bank: "devuelve $X (Y%)" with its conditions, green when it is the best.
import {
  audienceText,
  capText,
  money,
  type Offer,
  promotionLink,
  scheduleText,
} from "../model/offers.ts";
import { placesOf } from "../model/filters.ts";
import { useBenchmark } from "../model/benchmark-context.ts";
import styles from "./BenchmarkView.module.css";

interface OfferCellProps {
  readonly offer: Offer | null;
  readonly wins: boolean;
}

export function OfferCell({ offer, wins }: OfferCellProps) {
  const { screen, brands, days } = useBenchmark();
  if (!offer) {
    return (
      <div className={styles.offer} data-empty="true">
        Sin promo
      </div>
    );
  }
  const { row, value } = offer;
  const audience = audienceText(row);
  const schedule = scheduleText(row, days.today);
  const link = promotionLink(row);
  const unconfirmed = Boolean(screen.filters.prov) && placesOf(row, brands) === null;
  return (
    <div className={styles.offer} data-wins={wins}>
      <span className={styles.amount}>
        {money(value)} <span className={styles.percent}>({String(row.pct)}%)</span>
      </span>
      <span className={styles.detail}>{row.titulo}</span>
      <span className={styles.detail}>{`${capText(row)} · ${row.dias ?? ""}`}</span>
      {audience && <span className={styles.segment}>{`Sólo ${audience}`}</span>}
      {schedule && <span className={styles.segment}>{schedule}</span>}
      {row.fuente === "manual" && <span className={styles.segment}>Cargada a mano</span>}
      {link && (
        <a className={styles.segment} href={link} target="_blank" rel="noopener noreferrer">
          Ver promo ↗
        </a>
      )}
      {unconfirmed && <span className={styles.segment}>Zona sin confirmar</span>}
    </div>
  );
}

/** The cell of the longest installments. */
export function InstallmentsCell({
  installments,
  wins,
  title,
}: {
  readonly installments: number | null;
  readonly wins: boolean;
  readonly title: string;
}) {
  if (installments === null) {
    return (
      <div className={styles.offer} data-empty="true">
        —
      </div>
    );
  }
  return (
    <div className={styles.offer} data-wins={wins}>
      <span className={styles.amount}>{`${String(installments)} cuotas`}</span>
      <span className={styles.detail}>{title}</span>
    </div>
  );
}
