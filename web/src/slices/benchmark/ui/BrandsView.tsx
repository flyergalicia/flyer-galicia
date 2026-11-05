// Cara a cara por marca: each brand with the best of each bank, the losses first.
import { useEffect, useRef, useState } from "react";
import { usePromotionLogoSource } from "@/shared/lib/promotions/logo-file.ts";
import { useBenchmark, useBenchmarkActions } from "../model/benchmark-context.ts";
import { brandRows, type BrandResult, MAX_BRAND_ROWS, outcomeCounts } from "../model/brands.ts";
import type { Outcome } from "../model/filters.ts";
import { isTopValue } from "../model/offers.ts";
import { BANKS, bankName } from "../model/rows.ts";
import { OfferCell } from "./OfferCell.tsx";
import { galiciaClass } from "./galicia-class.ts";
import { BankHeaders } from "./TableParts.tsx";
import styles from "./BenchmarkView.module.css";

/** The search waits a moment after the last key, as the current app does. */
const SEARCH_WAIT_MS = 180;

function resultLabel(result: BrandResult, other: string): string {
  if (result === "gana") return "Galicia gana";
  if (result === "pierde") return `${other} gana`;
  if (result === "empate") return "Empate";
  return result === "solo" ? "Sólo Galicia" : "";
}

function BrandLogo({ brandKey }: { readonly brandKey: string }) {
  const { brands } = useBenchmark();
  const logoSource = usePromotionLogoSource();
  const image = brands.get(brandKey)?.imagen;
  if (!image) return null;
  return <img className={styles.logo} loading="lazy" alt="" src={logoSource(image)} />;
}

function SearchBox() {
  const { screen } = useBenchmark();
  const { dispatch } = useBenchmarkActions();
  const [typed, setTyped] = useState(screen.filters.q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  return (
    <input
      type="search"
      className={styles.search}
      placeholder="Buscar una marca…"
      aria-label="Buscar una marca"
      value={typed}
      onChange={({ target }) => {
        setTyped(target.value);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          dispatch({ type: "filter", change: { q: target.value } });
        }, SEARCH_WAIT_MS);
      }}
    />
  );
}

function OutcomePills({ counts }: { readonly counts: ReturnType<typeof outcomeCounts> }) {
  const { screen } = useBenchmark();
  const { dispatch } = useBenchmarkActions();
  const pills: readonly [Outcome, string][] = [
    ["", "Todas"],
    ["gana", `Ganamos (${String(counts.gana)})`],
    ["pierde", `Perdemos (${String(counts.pierde)})`],
    ["empate", `Empatamos (${String(counts.empate)})`],
  ];
  return (
    <div className={styles.pills}>
      {pills.map(([outcome, label]) => (
        <button
          key={outcome}
          type="button"
          className={styles.pill}
          aria-pressed={screen.filters.resultado === outcome}
          onClick={() => {
            dispatch({ type: "filter", change: { resultado: outcome } });
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function BrandTable({ rows }: { readonly rows: ReturnType<typeof brandRows> }) {
  const { screen } = useBenchmark();
  const shown = rows.slice(0, MAX_BRAND_ROWS);
  const other = bankName(screen.versus);
  return (
    <div className={`${styles.card} ${styles.slides}`} data-slides="table">
      <table className={styles.table}>
        <thead>
          <BankHeaders first="Marca" />
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.key}>
              <td>
                <div className={styles.brand} data-part="brand">
                  <BrandLogo brandKey={row.key} />
                  {row.name}
                </div>
                <div className={styles.segment}>{resultLabel(row.result, other)}</div>
              </td>
              {BANKS.map(({ code }) => {
                const offer = row.offers.get(code) ?? null;
                return (
                  <td key={code} className={galiciaClass(code)}>
                    <OfferCell offer={offer} wins={isTopValue(offer, row.top)} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length && (
        <p className={styles.notice}>
          {`Se muestran las primeras ${String(shown.length)} de ${String(rows.length)} marcas. Filtrá por rubro, provincia o buscá una marca para ver el resto.`}
        </p>
      )}
    </div>
  );
}

export function BrandsView() {
  const { filtered, screen } = useBenchmark();
  const { dispatch } = useBenchmarkActions();
  const { filters } = screen;
  const rows = brandRows(filtered, screen.references, {
    versus: screen.versus,
    search: filters.q,
    comparableOnly: filters.solo2,
    outcome: filters.resultado,
  });
  return (
    <>
      <div className={styles.card}>
        <div className={styles.searchRow}>
          <SearchBox />
          <label className={styles.comparable}>
            <input
              type="checkbox"
              checked={filters.solo2}
              onChange={({ target }) => {
                dispatch({ type: "filter", change: { solo2: target.checked } });
              }}
            />{" "}
            Sólo marcas donde se puede comparar
          </label>
        </div>
        <OutcomePills counts={outcomeCounts(rows)} />
      </div>
      {rows.length > 0 ? (
        <BrandTable rows={rows} />
      ) : (
        <div className={styles.empty}>
          <strong>No hay marcas para comparar con estos filtros</strong>
          Probá sacando «Sólo marcas donde se puede comparar» o cambiando de rubro o provincia.
        </div>
      )}
    </>
  );
}
