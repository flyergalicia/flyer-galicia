// Mis empresas: what happened with each company of the officer, and where they forward from.
import { Button } from "@/shared/ui/index.ts";
import { number, percent } from "../model/formatting.ts";
import {
  type CompanyLine,
  companiesCountText,
  companiesTable,
  COMPANY_FILTERS,
  filteredCompanies,
  MAX_COMPANIES,
} from "../model/my-companies.ts";
import { useActionList, useMyCompanies } from "../model/use-actions-data.ts";
import { nameOf, type Who } from "../model/who.ts";
import { ConnectionProblem, Figure, Loading, TaxId } from "./parts.tsx";
import styles from "./CommercialActions.module.css";

function CompanyRowLine({
  who,
  line,
  onForward,
}: {
  readonly who: Who;
  readonly line: CompanyLine;
  readonly onForward: (line: CompanyLine) => void;
}) {
  const { empresa, cuits, stats } = line;
  const { news, planned, done, people, signups, lastHunter } = stats;
  const conversion = people ? signups / people : 0;
  return (
    <tr className={news ? styles.rowWithNews : undefined} data-testid="company-row">
      <td className={styles.companyName}>
        <b>{empresa}</b>
        {news > 0 && (
          <>
            {" "}
            <span className={styles.news} title="Hay novedades: abrilas en la solapa Gestiones">
              Novedad
            </span>
          </>
        )}
        {cuits.length > 0 && (
          <div>
            <TaxId value={cuits} />
          </div>
        )}
        {planned > 0 && (
          <div className={styles.mini}>
            {planned} planificada{planned > 1 ? "s" : ""}
          </div>
        )}
      </td>
      <td className={styles.right} data-l="Acciones">
        {done}
      </td>
      <td className={styles.right} data-l="Prospectos">
        {people}
      </td>
      <td className={styles.right} data-l="Altas">
        <b>{signups}</b>
      </td>
      <td data-l="Conversión" aria-label={`Conversión: ${percent(signups, people)}`}>
        <div className={styles.barLine}>
          <div className={styles.bar}>
            <i style={{ width: `${String(Math.round(conversion * 100))}%` }} />
          </div>
          <span>{percent(signups, people)}</span>
        </div>
      </td>
      <td className={styles.companyHunter} data-l="Último hunter">
        {lastHunter ? nameOf(who, lastHunter) : <span className={styles.mini}>—</span>}
      </td>
      <td className={`${styles.right} ${styles.companyButton}`}>
        <Button
          variant="ghost"
          className={styles.small}
          onClick={() => {
            onForward(line);
          }}
        >
          Derivar
        </Button>
      </td>
    </tr>
  );
}

function CompaniesTable({
  who,
  lines,
  search,
  filter,
  onSearch,
  onFilter,
  onForward,
}: {
  readonly who: Who;
  readonly lines: readonly CompanyLine[];
  readonly search: string;
  readonly filter: string;
  readonly onSearch: (text: string) => void;
  readonly onFilter: (filter: string) => void;
  readonly onForward: (line: CompanyLine) => void;
}) {
  const shown = filteredCompanies(lines, search, filter);
  return (
    <>
      <div className={`${styles.tool} ${styles.toolCompanies}`}>
        <input
          type="search"
          className={styles.input}
          placeholder="Buscar en tus empresas (nombre o CUIT)"
          autoComplete="off"
          value={search}
          onChange={({ target }) => {
            onSearch(target.value);
          }}
        />
        <select
          className={styles.input}
          aria-label="Filtrar empresas"
          value={filter}
          onChange={({ target }) => {
            onFilter(target.value);
          }}
        >
          {COMPANY_FILTERS.map(({ id, label, matches }) => (
            <option key={id} value={id}>
              {label} ({lines.filter(({ stats }) => matches(stats)).length})
            </option>
          ))}
        </select>
        <span className={`${styles.mini} ${styles.companiesCount}`}>
          {companiesCountText(shown.length, lines.length)}
        </span>
      </div>
      <div className={styles.card}>
        <div className={styles.tableBox}>
          <table className={`${styles.table} ${styles.companies}`}>
            <thead>
              <tr>
                <th>Empresa</th>
                <th className={styles.right}>Acciones</th>
                <th className={styles.right}>Prospectos</th>
                <th className={styles.right}>Altas</th>
                <th>Conversión</th>
                <th>Último hunter</th>
                <th aria-label="Derivar" />
              </tr>
            </thead>
            <tbody data-testid="companies-table">
              {shown.length > 0 ? (
                shown
                  .slice(0, MAX_COMPANIES)
                  .map((line) => (
                    <CompanyRowLine key={line.key} who={who} line={line} onForward={onForward} />
                  ))
              ) : (
                <tr>
                  <td colSpan={7} className={`${styles.mini} ${styles.tableEmpty}`}>
                    Ninguna empresa coincide con ese filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

interface CompaniesTabProps {
  readonly who: Who;
  readonly onlyMine: boolean;
  readonly search: string;
  readonly filter: string;
  readonly onSearch: (text: string) => void;
  readonly onFilter: (filter: string) => void;
  readonly onForward: (line: CompanyLine) => void;
}

export function CompaniesTab({
  who,
  onlyMine,
  search,
  filter,
  onSearch,
  onFilter,
  onForward,
}: CompaniesTabProps) {
  const { companies, error: companiesError, retry: retryCompanies } = useMyCompanies(who.me);
  const { actions, loaded, error: listError, retry: retryList } = useActionList(onlyMine);
  const problem = companiesError ?? listError;
  if (!companies || !loaded) {
    return problem ? (
      <ConnectionProblem
        cause={problem}
        onRetry={() => {
          if (companiesError) retryCompanies();
          if (listError) retryList();
        }}
      />
    ) : (
      <Loading />
    );
  }
  const { lines, totals } = companiesTable(companies, actions, who.me);
  return (
    <>
      <div className={`${styles.figures} ${styles.figures4}`}>
        <Figure label="Acciones realizadas" value={number(totals.done)} detail="en tus empresas" />
        <Figure label="Prospectos" value={number(totals.people)} detail="" />
        <Figure label="Altas" value={number(totals.signups)} detail="sueldos en Galicia" isHigh />
        <Figure
          label="Conversión"
          value={percent(totals.signups, totals.people)}
          detail="altas ÷ prospectos"
        />
      </div>
      {lines.length === 0 ? (
        <div className={styles.empty}>
          Todavía no tenés empresas cargadas. Cargalas en tu nombre → <b>Base de datos</b> → Mis
          empresas y vuelven a aparecer acá para derivarlas.
        </div>
      ) : (
        <CompaniesTable
          who={who}
          lines={lines}
          search={search}
          filter={filter}
          onSearch={onSearch}
          onFilter={onFilter}
          onForward={onForward}
        />
      )}
    </>
  );
}
