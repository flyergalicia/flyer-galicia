// Galicia vs X, in words: where we are strong, where they beat us, rubro by rubro and installments.
import { useBenchmark } from "../model/benchmark-context.ts";
import { othersNote } from "../model/notes.ts";
import { money } from "../model/offers.ts";
import { referenceOf } from "../model/reference.ts";
import { bankName } from "../model/rows.ts";
import {
  offerLine,
  SHOWN_BRANDS,
  type Versus,
  type VersusBrand,
  type VersusRubro,
  versusOf,
} from "../model/versus.ts";
import { SharedPromotions } from "./SharedPromotions.tsx";
import { NothingWithFilters } from "./TableParts.tsx";
import styles from "./BenchmarkView.module.css";

function Opening({ versus, other }: { readonly versus: Versus; readonly other: string }) {
  const { galiciaCount, otherCount, brands, wins, losses, ties, rubrosWon, rubrosLost } = versus;
  return (
    <div className={styles.card}>
      <h3>{`Galicia vs ${other}`}</h3>
      <div className={styles.summary}>
        Con los filtros de arriba, Galicia tiene <b>{galiciaCount}</b>
        {` promos y ${other} `}
        <b>{otherCount}</b>.{" "}
        {brands > 0 ? (
          <>
            En las <b>{brands}</b>
            {" marcas que tienen las dos, Galicia devuelve más en "}
            <b>{wins.length}</b>
            {`, ${other} en `}
            <b>{losses.length}</b>
            {ties ? ` y empatan en ${String(ties)}` : ""}.{" "}
          </>
        ) : (
          "No hay marcas con promo de los dos bancos a la vez. "
        )}
        {rubrosWon + rubrosLost > 0 && (
          <>
            Por rubro, Galicia gana en <b>{rubrosWon}</b>
            {` y ${other} en `}
            <b>{rubrosLost}</b>.
          </>
        )}
      </div>
    </div>
  );
}

function BrandLines({
  title,
  brands,
  more,
  none,
  other,
}: {
  readonly title: string;
  readonly brands: readonly VersusBrand[];
  readonly more: string;
  readonly none: string;
  readonly other: string;
}) {
  const { days } = useBenchmark();
  return (
    <div className={styles.card}>
      <h3>{title}</h3>
      {brands.length > 0 ? (
        <>
          <ul className={styles.list}>
            {brands.slice(0, SHOWN_BRANDS).map((brand) => (
              <li key={brand.key}>
                <b>{brand.name}</b>
                {`: Galicia devuelve ${offerLine(brand.galicia, days.today)} contra ${offerLine(brand.other, days.today)} de ${other}.`}
              </li>
            ))}
          </ul>
          {brands.length > SHOWN_BRANDS && (
            <p
              className={styles.sub}
            >{`Y ${String(brands.length - SHOWN_BRANDS)} marcas más.${more}`}</p>
          )}
        </>
      ) : (
        <p className={styles.sub}>{none}</p>
      )}
    </div>
  );
}

function RubroLine({ rubro, other }: { readonly rubro: VersusRubro; readonly other: string }) {
  const { screen } = useBenchmark();
  const purchase = money(referenceOf(screen.references, rubro.rubro));
  const { galicia, other: theirs } = rubro;
  if (galicia && theirs) {
    const tie = Math.abs(galicia.value - theirs.value) < 1;
    return (
      <li>
        <b>{rubro.rubro}</b>
        {` (compra de ${purchase}): `}
        {tie && "empatan"}
        {!tie && galicia.value > theirs.value && <span className={styles.up}>gana Galicia</span>}
        {!tie && galicia.value <= theirs.value && (
          <span className={styles.down}>{`gana ${other}`}</span>
        )}
        {` · Galicia ${money(galicia.value)} (${galicia.row.titulo ?? ""}) contra ${other} ${money(theirs.value)} (${theirs.row.titulo ?? ""}).`}
      </li>
    );
  }
  const only = galicia ?? theirs;
  return (
    <li>
      <b>{rubro.rubro}</b>
      {`: sólo ${galicia ? "Galicia" : other} tiene promos con reintegro en este rubro (${money(only?.value ?? 0)} en una compra de ${purchase}).`}
    </li>
  );
}

function InstallmentsLine({
  rubro,
  other,
}: {
  readonly rubro: VersusRubro;
  readonly other: string;
}) {
  const ours = rubro.galiciaInstallments;
  const theirs = rubro.otherInstallments;
  const text = (row: typeof ours) =>
    row ? `${String(row.cuotas)} cuotas (${row.titulo ?? ""})` : "ninguna";
  const difference = (ours?.cuotas ?? 0) - (theirs?.cuotas ?? 0);
  return (
    <li>
      <b>{rubro.rubro}</b>
      {`: Galicia ${text(ours)}, ${other} ${text(theirs)}`}
      {difference > 0 && (
        <>
          {" · "}
          <span className={styles.up}>más cuotas Galicia</span>
        </>
      )}
      {difference < 0 && (
        <>
          {" · "}
          <span className={styles.down}>{`más cuotas ${other}`}</span>
        </>
      )}
    </li>
  );
}

function RubroLists({ versus, other }: { readonly versus: Versus; readonly other: string }) {
  const withRefund = versus.rubros.filter(({ galicia, other: theirs }) => galicia ?? theirs);
  const withInstallments = versus.rubros.filter(
    ({ galiciaInstallments, otherInstallments }) => galiciaInstallments ?? otherInstallments,
  );
  return (
    <>
      <div className={styles.card}>
        <h3>Rubro por rubro</h3>
        {withRefund.length > 0 ? (
          <ul className={styles.list}>
            {withRefund.map((rubro) => (
              <RubroLine key={rubro.rubro} rubro={rubro} other={other} />
            ))}
          </ul>
        ) : (
          <p className={styles.sub}>Sin rubros con reintegro.</p>
        )}
      </div>
      <div className={styles.card}>
        <h3>Cuotas sin interés</h3>
        {withInstallments.length > 0 ? (
          <ul className={styles.list}>
            {withInstallments.map((rubro) => (
              <InstallmentsLine key={rubro.rubro} rubro={rubro} other={other} />
            ))}
          </ul>
        ) : (
          <p className={styles.sub}>Sin promos de cuotas con estos filtros.</p>
        )}
      </div>
    </>
  );
}

export function VersusView() {
  const { filtered, screen, data } = useBenchmark();
  if (filtered.length === 0) return <NothingWithFilters />;
  const other = bankName(screen.versus);
  const versus = versusOf(filtered, screen.versus, screen.references);
  return (
    <>
      <Opening versus={versus} other={other} />
      <BrandLines
        title="Dónde somos fuertes"
        brands={versus.wins}
        more=" Están todas en «Cara a cara por marca»."
        none="Con estos filtros no hay una marca donde Galicia devuelva más."
        other={other}
      />
      <BrandLines
        title="Dónde nos ganan"
        brands={versus.losses}
        more=""
        none={`Con estos filtros no hay una marca donde ${other} devuelva más.`}
        other={other}
      />
      <RubroLists versus={versus} other={other} />
      <p className={styles.notice}>
        {`Es un borrador armado con los datos de hoy y la compra de referencia de arriba: sirve para preparar la charla, no para repetirlo tal cual. Los topes de MODO suelen ser mensuales y no se consideran gastados. Antes de mostrarle algo a un cliente, conviene revisar la promo en la web del banco. ${othersNote(data.rows)}`}
      </p>
      <SharedPromotions />
    </>
  );
}
