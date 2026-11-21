// Resumen por rubro: who gives back the most on each rubro, the promotions of each bank, and the
// longest installments apart.
import { Fragment } from "react";
import { useBenchmark } from "../model/benchmark-context.ts";
import { othersNote } from "../model/notes.ts";
import { isTopValue, money } from "../model/offers.ts";
import { referenceOf } from "../model/reference.ts";
import { bankName, GALICIA } from "../model/rows.ts";
import { bankBars, type RubroRow, rubroRows, rubroScore } from "../model/summary.ts";
import { barStyle } from "./bar-style.ts";
import { InstallmentsCell, OfferCell } from "./OfferCell.tsx";
import { galiciaClass } from "./galicia-class.ts";
import { SharedPromotions } from "./SharedPromotions.tsx";
import { BankHeaders, NothingWithFilters } from "./TableParts.tsx";
import styles from "./BenchmarkView.module.css";

const BAR_PX = 260;

function RubroLines({ row }: { readonly row: RubroRow }) {
  const { screen } = useBenchmark();
  const closing = styles.closing;
  return (
    <Fragment>
      <tr>
        <td>
          <strong>{row.rubro}</strong>
          <div className={styles.segment}>
            {`compra de ${money(referenceOf(screen.references, row.rubro))}`}
          </div>
        </td>
        {row.cells.map((cell) => (
          <td key={cell.bank} className={galiciaClass(cell.bank)} data-bank={cell.bank}>
            <OfferCell offer={cell.offer} wins={isTopValue(cell.offer, row.top)} />
            <div className={styles.segment}>
              {`${String(cell.count)} promo${cell.count === 1 ? "" : "s"}`}
            </div>
          </td>
        ))}
      </tr>
      <tr>
        <td className={`${styles.segment} ${closing}`}>Más cuotas sin interés</td>
        {row.cells.map(({ bank, installments }) => (
          <td key={bank} className={[galiciaClass(bank), closing].filter(Boolean).join(" ")}>
            <InstallmentsCell
              installments={installments?.cuotas ?? null}
              wins={(installments?.cuotas ?? 0) >= row.topInstallments}
              title={installments?.titulo ?? ""}
            />
          </td>
        ))}
      </tr>
    </Fragment>
  );
}

function Headline({ rows }: { readonly rows: readonly RubroRow[] }) {
  const { screen } = useBenchmark();
  const other = bankName(screen.versus);
  const score = rubroScore(rows, screen.versus);
  if (score.compared === 0) {
    return (
      <>{`No hay rubros con promos de Galicia y ${other} al mismo tiempo con estos filtros.`}</>
    );
  }
  return (
    <>
      Contra <b>{other}</b>
      {`, en ${String(score.compared)} rubros con promos de los dos: Galicia devuelve más en `}
      <b>{score.galiciaWins}</b>
      {`, ${other} en `}
      <b>{score.otherWins}</b>
      {score.ties ? ` y empatan en ${String(score.ties)}` : ""}.
    </>
  );
}

export function SummaryView() {
  const { filtered, screen, data } = useBenchmark();
  if (filtered.length === 0) {
    return <NothingWithFilters hint="Probá con otra provincia o tarjeta." />;
  }
  const rows = rubroRows(filtered, screen.references);
  return (
    <>
      <div className={styles.card}>
        <div className={styles.summary} data-testid="benchmark-headline">
          <Headline rows={rows} />
        </div>
        <p className={styles.notice}>
          {`Gana el que más devuelve en la compra de referencia (verde). Ojo: de Macro y Santander se ve lo de MODO y lo cargado a mano; pueden tener más promos propias que no se ven acá. ${othersNote(data.rows)}`}
        </p>
      </div>
      <SharedPromotions />
      <div className={styles.card}>
        <h3>Promos vigentes por banco</h3>
        {bankBars(filtered).map(({ bank, name, count, share }) => (
          <div key={bank} className={styles.bar} data-galicia={bank === GALICIA}>
            <span style={{ width: 92 }}>{name}</span>
            <i style={barStyle(Math.max(2, Math.round(share * BAR_PX)), share)} /> {count}
          </div>
        ))}
      </div>
      <div className={`${styles.card} ${styles.slides}`} data-slides="table">
        <table className={styles.table}>
          <thead>
            <BankHeaders first="Rubro" />
          </thead>
          <tbody>
            {rows.map((row) => (
              <RubroLines key={row.rubro} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
