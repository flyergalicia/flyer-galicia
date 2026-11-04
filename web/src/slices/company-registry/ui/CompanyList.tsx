import { useMemo } from "react";
import {
  cashbackIndex,
  cashbackName,
  type Company,
  companyCategoryLabel,
  officerCount,
  officersLabel,
  searchCompanies,
  taxIdsLine,
} from "@/shared/domain/company-registry/index.ts";
import { useRegistryContext } from "../model/registry-rules.ts";
import { SEPARATOR } from "./separator.ts";
import styles from "./DatabaseWindow.module.css";

const SHOWN = 25;

function CompanyRow({ company }: { readonly company: Company }) {
  const { options, cashbackNames } = useRegistryContext();
  const category = companyCategoryLabel(company, options);
  return (
    <div className={styles.companyRow} data-testid="company-row">
      <div className={styles.companyMain}>
        <div className={styles.companyName}>{company.empresa || "(sin razón social)"}</div>
        <div className={styles.companyTaxIds}>{taxIdsLine(company) || "sin CUIT"}</div>
      </div>
      <span className={styles.companyAside}>
        {cashbackName(cashbackIndex(company.config, cashbackNames), cashbackNames)}
        {SEPARATOR}
        {officerCount(company) > 0 ? (
          officersLabel(company)
        ) : (
          <span className={styles.warning}>sin oficiales asignados</span>
        )}
        {category && (
          <>
            {SEPARATOR}
            <span className={styles.category} title="Beneficio por rubro (Flyer Rubros)">
              {category}
            </span>
          </>
        )}
      </span>
    </div>
  );
}

/** What the search will find: the first ones, or what matches what is written. */
export function CompanyList({
  rows,
  query,
}: {
  readonly rows: readonly Company[];
  readonly query: string;
}) {
  const found = useMemo(() => searchCompanies(query, rows, SHOWN), [query, rows]);
  if (rows.length === 0) return null;
  if (found.length === 0) return <p className={styles.nothing}>Sin resultados para "{query}".</p>;
  return (
    <div>
      <p className={styles.listNote}>
        {query
          ? `Coincidencias: ${String(found.length)}${found.length >= SHOWN ? "+" : ""}`
          : `Primeras ${String(found.length)} de ${String(rows.length)}`}
      </p>
      {found.map((company, position) => (
        <CompanyRow key={`${company.empresa}-${String(position)}`} company={company} />
      ))}
    </div>
  );
}
