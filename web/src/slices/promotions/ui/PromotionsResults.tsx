// The right side: the counters, the table and what can be done with it.
import { usePromotionPicking } from "@/shared/lib/promotions/promotion-picking.ts";
import { useMemo, useState } from "react";
import { STATUS_LABEL } from "@/shared/domain/promotions/index.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { useOptionOnScreen } from "@/shared/lib/option-on-screen/option-on-screen-context.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { usePermissions } from "@/shared/session/index.ts";
import { Badge, Button, ConfirmDialog, DataTable, Input } from "@/shared/ui/index.ts";
import { useCatalogView } from "../model/catalog-view.ts";
import { usePromotionsActions, usePromotionsState } from "../model/promotions-context.ts";
import type { PromotionsState } from "../model/promotions-state.ts";
import { watchableRows } from "../model/result-rows.ts";
import { STATUS_TONE } from "../model/row-cells.ts";
import {
  categoriesPresent,
  hasFilters,
  ORDER_OPTIONS,
  orderKey,
  type SortField,
  statusChips,
  statusesPresent,
  type TableFilters,
  type VisibleRow,
  visibleRows,
} from "../model/table.ts";
import { PromotionRow } from "./PromotionRow.tsx";
import styles from "./PromotionsView.module.css";

const NOTHING_TO_WATCH =
  "No hay marcas encontradas para vigilar. Revisá las que dicen «Revisar» o «No encontrada».";
const START_DATE_HINT =
  "La fecha de inicio no viene en el listado: hay que pedirla promoción por promoción, así que se trae sólo cuando la pedís.";

function StatusCounters({ rows }: { readonly rows: NonNullable<PromotionsState["rows"]> }) {
  const { province, tab, filters } = usePromotionsState();
  const { dispatch } = usePromotionsActions();
  return (
    <div className={styles.summary}>
      {statusChips(rows, province, tab === "active").map(({ status, label, count }) => (
        <Badge
          key={status}
          tone={STATUS_TONE[status]}
          size="chip"
          title={`Filtrar por ${label}`}
          pressed={filters.status === status}
          data-testid="status-counter"
          onClick={() => {
            dispatch({
              type: "filters",
              change: { status: filters.status === status ? "" : status },
            });
          }}
        >
          {label}: {count}
        </Badge>
      ))}
    </div>
  );
}

function ResultsSearchBox() {
  const { order, tab, filters } = usePromotionsState();
  const { dispatch } = usePromotionsActions();
  return (
    <div className={styles.searchBox}>
      <span className={styles.sortLabel}>Ordenar por</span>
      <select
        className={styles.sortSelect}
        aria-label="Ordenar por"
        value={orderKey(order)}
        onChange={(event) => {
          dispatch({ type: "order", key: event.target.value });
        }}
      >
        {ORDER_OPTIONS.map(([key, label]) => (
          <option key={key} value={key}>
            {!key && tab === "active" ? "Como vienen" : label}
          </option>
        ))}
      </select>
      <input
        type="search"
        className={styles.searchInput}
        placeholder="Buscar en los resultados..."
        data-testid="promotions-results-search"
        value={filters.global}
        onChange={(event) => {
          dispatch({ type: "filters", change: { global: event.target.value } });
        }}
      />
    </div>
  );
}

function SortableHeader({ field, title }: { readonly field: SortField; readonly title: string }) {
  const { order } = usePromotionsState();
  const { dispatch } = usePromotionsActions();
  let sort: "none" | "ascending" | "descending" = "none";
  if (order.field === field) sort = order.direction === 1 ? "ascending" : "descending";
  return (
    <DataTable.Header
      title={`Ordenar por ${title}`}
      sort={sort}
      onSort={() => {
        dispatch({ type: "sort-by", field });
      }}
    >
      {title}
    </DataTable.Header>
  );
}

function TextFilter({
  field,
  hint,
  label,
}: {
  readonly field: "brand" | "match" | "where" | "startDate" | "endDate";
  readonly hint: string;
  readonly label: string;
}) {
  const { filters } = usePromotionsState();
  const { dispatch } = usePromotionsActions();
  return (
    <th className={styles.filterCell}>
      <Input
        className={styles.filterInput}
        aria-label={`Filtrar por ${label}`}
        placeholder={hint}
        value={filters[field]}
        onChange={(event) => {
          dispatch({ type: "filters", change: { [field]: event.target.value } });
        }}
      />
    </th>
  );
}

function isLogoFilter(value: string): value is TableFilters["logo"] {
  return value === "" || value === "con" || value === "sin";
}

function isStatusFilter(value: string): value is TableFilters["status"] {
  return value === "" || value in STATUS_LABEL;
}

function FilterRow({
  rows,
  isActiveTab,
}: {
  readonly rows: NonNullable<PromotionsState["rows"]>;
  readonly isActiveTab: boolean;
}) {
  const { filters } = usePromotionsState();
  const { dispatch } = usePromotionsActions();
  return (
    <tr className={styles.filterRow}>
      <th className={styles.filterCell} aria-label="Excluir" />
      <th className={styles.filterCell}>
        <select
          className={styles.filterSelect}
          aria-label="Filtrar por logo"
          value={filters.logo}
          onChange={({ target: { value } }) => {
            if (isLogoFilter(value)) dispatch({ type: "filters", change: { logo: value } });
          }}
        >
          <option value="">Todos</option>
          <option value="con">Con logo</option>
          <option value="sin">Sin logo</option>
        </select>
      </th>
      {!isActiveTab && <TextFilter field="brand" hint="Filtrar..." label="marca" />}
      <TextFilter field="match" hint="Filtrar..." label="promoción" />
      <th className={styles.filterCell}>
        <select
          className={styles.filterSelect}
          aria-label="Filtrar por categoría"
          value={filters.category}
          onChange={(event) => {
            dispatch({ type: "filters", change: { category: event.target.value } });
          }}
        >
          <option value="">Todas</option>
          {categoriesPresent(rows).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </th>
      <TextFilter field="where" hint="Provincia..." label="dónde" />
      <TextFilter field="startDate" hint="dd/mm" label="desde" />
      <TextFilter field="endDate" hint="dd/mm" label="hasta" />
      <th className={styles.filterCell}>
        <select
          className={styles.filterSelect}
          aria-label="Filtrar por estado"
          value={filters.status}
          onChange={({ target: { value } }) => {
            if (isStatusFilter(value)) dispatch({ type: "filters", change: { status: value } });
          }}
        >
          <option value="">Todos</option>
          {statusesPresent(rows, filters.status).map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </select>
      </th>
      <th className={styles.filterCell} aria-label="Filtro de la columna En Galicia" />
    </tr>
  );
}

function ResultsTable({
  rows,
  visible,
}: {
  readonly rows: NonNullable<PromotionsState["rows"]>;
  readonly visible: readonly VisibleRow[];
}) {
  const { tab } = usePromotionsState();
  const { provinces } = useCatalogView();
  const isActiveTab = tab === "active";
  return (
    <DataTable caption="Promociones" className={styles.table} scrollClassName={styles.tableScroll}>
      <DataTable.Head>
        <tr>
          <DataTable.Header aria-label="Excluir">{null}</DataTable.Header>
          <SortableHeader field="logo" title="Logo" />
          {!isActiveTab && <SortableHeader field="brand" title="Marca (flyer)" />}
          <SortableHeader
            field="match"
            title={isActiveTab ? "Promoción" : "Coincidencia en Galicia"}
          />
          <SortableHeader field="category" title="Categoría" />
          <SortableHeader field="where" title="Dónde" />
          <SortableHeader field="startDate" title="Desde" />
          <SortableHeader field="endDate" title="Hasta" />
          <SortableHeader field="status" title="Estado" />
          <DataTable.Header
            className={styles.linkHeader}
            title="Abre la promoción en el sitio de Galicia"
          >
            En Galicia
          </DataTable.Header>
        </tr>
        <FilterRow rows={rows} isActiveTab={isActiveTab} />
      </DataTable.Head>
      <DataTable.Body>
        {visible.map(({ row, hidden, joinedNames }) => (
          <PromotionRow
            key={row.key}
            row={row}
            hidden={hidden}
            joinedNames={joinedNames}
            isActiveTab={isActiveTab}
            totalProvinces={provinces.length}
          />
        ))}
        {visible.length === 0 && (
          <tr>
            <td colSpan={isActiveTab ? 9 : 10} className={styles.noRowLeft}>
              Ninguna fila coincide con el filtro.
            </td>
          </tr>
        )}
      </DataTable.Body>
    </DataTable>
  );
}

function WatchBar({ rows }: { readonly rows: NonNullable<PromotionsState["rows"]> }) {
  const { options } = useFlyerOptions();
  const { watchFoundBrands } = usePromotionsActions();
  const toast = useToast();
  const onScreen = useOptionOnScreen();
  const [chosen, setChosen] = useState<number | null>(null);
  const open = onScreen.get();
  // It starts on the flyer open in the editor, if that one is on the list.
  const starting = options.some(({ n }) => n === open) ? open : null;
  const option = chosen ?? starting ?? options[0]?.n ?? 1;
  const [isAsking, setIsAsking] = useState(false);
  const optionName = options.find(({ n }) => n === option)?.nombre ?? `Opción ${String(option)}`;
  const { found, left } = watchableRows(rows);
  return (
    <span className={styles.watchBar}>
      <label htmlFor="promotions-watch-option">Vigilar estas marcas en</label>
      <select
        id="promotions-watch-option"
        value={option}
        onChange={(event) => {
          setChosen(Number(event.target.value));
        }}
      >
        {options.map(({ n, nombre }) => (
          <option key={n} value={n}>
            {nombre}
          </option>
        ))}
      </select>
      <Button
        variant="ghost"
        title="Todos los días se revisan y te llega un mail si alguna se vence"
        onClick={() => {
          if (found.length > 0) setIsAsking(true);
          else toast.show(NOTHING_TO_WATCH);
        }}
      >
        Guardar
      </Button>
      {isAsking && (
        <ConfirmDialog
          title={`¿Vigilar ${String(found.length)} marcas en «${optionName}»?`}
          confirmLabel="Vigilar"
          onCancel={() => {
            setIsAsking(false);
          }}
          onConfirm={() => {
            setIsAsking(false);
            void watchFoundBrands(option, optionName);
          }}
        >
          {watchQuestionText(left)}
        </ConfirmDialog>
      )}
    </span>
  );
}

function watchQuestionText(left: readonly string[]): string {
  const names = left.slice(0, 5).join(", ");
  const out =
    left.length > 0
      ? ` Quedan afuera ${String(left.length)} que no se encontraron o hay que revisar: ${names}${left.length > 5 ? "…" : ""}.`
      : "";
  return `Reemplaza la lista cargada a mano de ese flyer (las que se sumaron desde Estudio se conservan).${out}`;
}

function ResultsActions({
  rows,
  visible,
}: {
  readonly rows: NonNullable<PromotionsState["rows"]>;
  readonly visible: readonly VisibleRow[];
}) {
  const { filters, tab, isDownloading } = usePromotionsState();
  const { downloadSheet, fillStartDates, dispatch } = usePromotionsActions();
  const { isAdminNow } = usePermissions();
  const toExport = visible.filter(({ row }) => !row.excluded).length;
  const isActiveTab = tab === "active";
  const missingDates = isActiveTab
    ? visible.filter(({ row }) => row.promotion && !row.excluded && row.startDate === undefined)
        .length
    : 0;
  const filtered = hasFilters(filters);
  return (
    <div className={styles.actions}>
      <Button
        disabled={isDownloading}
        data-testid="promotions-download"
        onClick={() => {
          void downloadSheet();
        }}
      >
        {isDownloading ? "Generando..." : `⬇ Descargar Excel (${String(toExport)})`}
      </Button>
      {missingDates > 0 && (
        <Button variant="ghost" title={START_DATE_HINT} onClick={fillStartDates}>
          📅 Completar fechas "Desde" ({missingDates})
        </Button>
      )}
      {filtered && (
        <Button
          variant="ghost"
          onClick={() => {
            dispatch({ type: "clear-filters" });
          }}
        >
          ✕ Limpiar filtros
        </Button>
      )}
      <span className={styles.count}>
        {filtered ? `Mostrando ${String(visible.length)} de ${String(rows.length)}` : ""}
      </span>
      {isAdminNow && !isActiveTab && <WatchBar rows={rows} />}
    </div>
  );
}

function StartDatesQuestion() {
  const { startDatesToConfirm } = usePromotionsState();
  const { confirmStartDates, dispatch } = usePromotionsActions();
  if (startDatesToConfirm === null) return null;
  return (
    <ConfirmDialog
      title="¿Traemos las fechas de inicio?"
      confirmLabel="Confirmar"
      onConfirm={confirmStartDates}
      onCancel={() => {
        dispatch({ type: "confirm-start-dates", count: null });
      }}
    >
      Hay que consultarle a Galicia {startDatesToConfirm} promociones, de a 80 por vez. Puede tardar
      unos segundos.
    </ConfirmDialog>
  );
}

export function PromotionsResults() {
  const { rows, tab, filters, order } = usePromotionsState();
  const picking = usePromotionPicking();
  const hasRows = rows !== null && rows.length > 0;
  const visible = useMemo(() => visibleRows(rows ?? [], filters, order), [rows, filters, order]);
  return (
    <div
      className={picking ? `${styles.results} ${styles.resultsPicking}` : styles.results}
      data-testid="promotions-results"
    >
      {picking?.bar}
      <div className={styles.resultsHead}>
        {hasRows && <StatusCounters rows={rows} />}
        {hasRows && <ResultsSearchBox />}
      </div>
      {hasRows ? (
        <>
          <ResultsTable rows={rows} visible={visible} />
          <ResultsActions rows={rows} visible={visible} />
        </>
      ) : (
        <p className={styles.empty}>
          {tab === "active"
            ? 'Elegí una provincia a la izquierda y tocá "Ver promociones" para ver todo lo vigente ahí.'
            : 'Pegá las marcas a la izquierda y tocá "Validar vigencia" para ver el resultado acá.'}
        </p>
      )}
      <StartDatesQuestion />
    </div>
  );
}
