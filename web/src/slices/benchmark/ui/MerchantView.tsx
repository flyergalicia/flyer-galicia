// Por comercio: "I am at this shop, which promotion do I have?": every bank, the best first.
import { todayWeekday, WEEKDAYS } from "../model/dates.ts";
import { useBenchmark, useBenchmarkActions } from "../model/benchmark-context.ts";
import {
  ANY_DAY,
  bestLine,
  foundLine,
  MAX_MERCHANT_ROWS,
  type MerchantSearch,
  merchantSearch,
} from "../model/merchant.ts";
import { capText, money, promotionLink } from "../model/offers.ts";
import { bankName } from "../model/rows.ts";
import { galiciaClass } from "./galicia-class.ts";
import { Conditions, PromotionLink } from "./WeekView.tsx";
import styles from "./BenchmarkView.module.css";

type Found = Extract<MerchantSearch, { kind: "found" }>;

function BestLine({ found, day }: { readonly found: Found; readonly day: number }) {
  if (!found.best) return null;
  const { lead, rest } = bestLine(found.best, day);
  return (
    <p className={styles.best}>
      <b>{lead}</b>
      {rest}
    </p>
  );
}

function FoundTable({ found, day }: { readonly found: Found; readonly day: number }) {
  const { list, best } = found;
  return (
    <>
      <div className={styles.card}>
        <BestLine found={found} day={day} />
        <p className={`${styles.sub} ${styles.flush}`}>{foundLine(list.length)}</p>
      </div>
      <div className={`${styles.card} ${styles.slides}`} data-slides="table">
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Banco</th>
              <th>Comercio</th>
              <th>Beneficio</th>
              <th>Devuelve</th>
              <th>Días y condiciones</th>
              <th aria-label="Ver promo" />
            </tr>
          </thead>
          <tbody>
            {list.slice(0, MAX_MERCHANT_ROWS).map((ranked, index) => (
              <tr
                key={String(ranked.row.id)}
                className={index === 0 && best ? styles.topRow : undefined}
              >
                <td className={galiciaClass(String(ranked.row.banco))}>
                  <b>{bankName(ranked.row.banco)}</b>
                </td>
                <td>
                  {ranked.row.titulo}
                  <div className={styles.segment}>{ranked.row.rubro}</div>
                </td>
                <td>{ranked.row.beneficio ?? ""}</td>
                <td>
                  {ranked.value > 0 ? <b>{money(ranked.value)}</b> : "—"}
                  <div className={styles.segment}>{capText(ranked.row)}</div>
                </td>
                <td>
                  <Conditions ranked={ranked} />
                  {(ranked.row.cuotas ?? 0) > 0 && (
                    <div className={styles.segment}>
                      {`${String(ranked.row.cuotas)} cuotas sin interés`}
                    </div>
                  )}
                </td>
                <td>
                  <PromotionLink address={promotionLink(ranked.row)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Results({ typed, day }: { readonly typed: string; readonly day: number }) {
  const { filtered, screen } = useBenchmark();
  const search = merchantSearch(filtered, screen.references, typed, day);
  if (search.kind === "too-short") {
    return (
      <div className={styles.empty}>
        <strong>Escribí el nombre de un comercio</strong>
        Aparecen las promos de todos los bancos.
      </div>
    );
  }
  if (search.kind === "none") {
    return (
      <div className={styles.empty}>
        <strong>{`No hay promos para «${typed}»`}</strong>
        {day >= 0
          ? "Probá con «Cualquier día» o cambiá los filtros."
          : "Probá con otro nombre o cambiá los filtros."}
      </div>
    );
  }
  return <FoundTable found={search} day={day} />;
}

export function MerchantView() {
  const { screen } = useBenchmark();
  const { dispatch } = useBenchmarkActions();
  const today = todayWeekday();
  const day = screen.merchantDay ?? today;
  return (
    <>
      <div className={styles.card}>
        <h3>¿Qué promos hay en este comercio?</h3>
        <p className={styles.sub}>
          Escribí el comercio (por ejemplo YPF, Coto o Farmacity) y elegí el día: ves las promos de
          todos los bancos, de la que más devuelve a la que menos, cada una con su link. Usa los
          filtros de arriba (rubro, tarjeta, segmento).
        </p>
        <div className={styles.merchantRow}>
          <label className={`${styles.field} ${styles.merchantField}`}>
            Comercio
            <input
              type="text"
              autoComplete="off"
              placeholder="Ej.: YPF"
              value={screen.merchantText}
              onChange={({ target }) => {
                dispatch({ type: "merchant-text", text: target.value });
              }}
            />
          </label>
          <label className={styles.field}>
            Día
            <select
              aria-label="Día"
              value={day}
              onChange={({ target }) => {
                dispatch({ type: "merchant-day", day: Number(target.value) });
              }}
            >
              <option value={ANY_DAY}>Cualquier día</option>
              {WEEKDAYS.map((name, index) => (
                <option key={name} value={index}>
                  {`${name}${index === today ? " (hoy)" : ""}`}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div data-testid="merchant-results">
        <Results typed={screen.merchantText} day={day} />
      </div>
    </>
  );
}
