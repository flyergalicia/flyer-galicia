// The dashboard: what was done on the period, by hunter, by officer and by company. Who sees what is
// decided by the database; what nobody has been assigned does not count, and goes apart as a reminder.
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useSheetLibrary } from "@/shared/lib/use-sheet-library.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button } from "@/shared/ui/index.ts";
import { readActionList } from "../api/actions.ts";
import type { DashboardArguments, DashboardData } from "../api/dashboard.ts";
import { messageOf } from "../model/failure-text.ts";
import { actionsOfSheet, dashboardBook, writeBook } from "../model/dashboard-sheet.ts";
import {
  type DashboardFilters,
  PERIOD_CHOICES,
  periodMonths,
  periodStart,
  periodText,
  withAndWithout,
  withPeriod,
} from "../model/dashboard.ts";
import { number, percent, today } from "../model/formatting.ts";
import { useDashboardData } from "../model/use-dashboard-data.ts";
import { nameOf, type Who } from "../model/who.ts";
import {
  ByType,
  CompanyRanking,
  Funnel,
  MonthsChart,
  Packages,
  PeopleRanking,
  Reasons,
} from "./DashboardCharts.tsx";
import { ConnectionProblem, Figure, Loading } from "./parts.tsx";
import { QuarterPanel } from "./QuarterPanel.tsx";
import base from "./CommercialActions.module.css";
import styles from "./Dashboard.module.css";

const TYPE_CHOICES: readonly (readonly [string, string])[] = [
  ["accion", "Acciones"],
  ["feria", "Ferias"],
  ["posicion", "Posiciones comerciales"],
  ["datos", "Bases de datos"],
];

export interface DashboardTabProps {
  readonly who: Who;
  readonly onlyMine: boolean;
  /** The administrator and the test accounts can count what is marked as a test. */
  readonly canSeeTrials: boolean;
  readonly filters: DashboardFilters;
  readonly onFilters: (filters: DashboardFilters) => void;
}

function SelectField({
  label,
  value,
  onChange,
  choices,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly choices: readonly (readonly [string, string])[];
}) {
  return (
    <label>
      <span className={base.label}>{label}</span>
      <select
        className={`${base.input} ${base.select}`}
        value={value}
        onChange={({ target }) => {
          onChange(target.value);
        }}
      >
        {choices.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Everybody who forwards something on the period, or choosing one would leave only that one. */
function officerChoices(who: Who, data: DashboardData, chosen: string) {
  const ids =
    data.officers.includes(chosen) || !chosen ? data.officers : [...data.officers, chosen];
  return ids
    .map((id): readonly [string, string] => [id, nameOf(who, id)])
    .toSorted((a, b) => a[1].localeCompare(b[1]));
}

function Filters({
  who,
  data,
  canSeeTrials,
  filters,
  onFilters,
  onExcel,
}: Pick<DashboardTabProps, "who" | "canSeeTrials" | "filters" | "onFilters"> & {
  readonly data: DashboardData;
  readonly onExcel: () => void;
}) {
  const hunters = Object.values(who.people).filter(({ rol }) => rol === "hunter");
  return (
    <div className={base.filters} data-testid="dashboard-filters">
      <SelectField
        label="Período"
        value={filters.period}
        choices={PERIOD_CHOICES}
        onChange={(period) => {
          onFilters(withPeriod(filters, period));
        }}
      />
      <SelectField
        label="Tipo"
        value={filters.type}
        choices={[["", "Todos"], ...TYPE_CHOICES]}
        onChange={(type) => {
          onFilters({ ...filters, type });
        }}
      />
      {who.role !== "hunter" && (
        <SelectField
          label="Hunter"
          value={filters.hunter}
          choices={[["", "Todos"], ...hunters.map(({ id, nombre }) => [id, nombre] as const)]}
          onChange={(hunter) => {
            onFilters({ ...filters, hunter });
          }}
        />
      )}
      <SelectField
        label="Oficial Payroll"
        value={filters.officer}
        choices={[["", "Todos"], ...officerChoices(who, data, filters.officer)]}
        onChange={(officer) => {
          onFilters({ ...filters, officer });
        }}
      />
      {canSeeTrials && (
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={filters.trials}
            onChange={({ target }) => {
              onFilters({ ...filters, trials: target.checked });
            }}
          />{" "}
          Incluir pruebas
        </label>
      )}
      <Button variant="ghost" className={styles.excel} onClick={onExcel}>
        Descargar Excel
      </Button>
    </div>
  );
}

function listTabName(role: string): string {
  if (role === "lider") return "Gestiones del equipo";
  return role === "hunter" ? "Mis gestiones" : "Gestiones";
}

function Figures({
  data,
  filters,
  who,
}: {
  readonly data: DashboardData;
  readonly filters: DashboardFilters;
  readonly who: Who;
}) {
  const { kpis, byPackage } = data;
  const {
    visitas,
    planificadas,
    empresas,
    asistentes,
    prospectos,
    altas,
    sin_asignar: unassigned,
    datos,
    contactados,
  } = kpis;
  const { withPackage, without } = withAndWithout(byPackage);
  return (
    <>
      <div className={base.figures}>
        <Figure
          label="Acciones"
          value={number(visitas)}
          detail={planificadas ? `${number(planificadas)} planificadas` : "realizadas"}
        />
        <Figure label="Empresas" value={number(empresas)} detail="distintas" />
        <Figure label="Asistentes" value={number(asistentes)} detail="contactados" />
        <Figure
          label="Prospectos"
          value={number(prospectos)}
          detail={asistentes ? `${percent(prospectos, asistentes)} de los asistentes` : ""}
        />
        <Figure
          label="Altas"
          value={number(altas)}
          detail={
            altas
              ? `${number(withPackage)} con paquete · ${number(without)} sin`
              : "sueldos en Galicia"
          }
        />
        <Figure
          label="Conversión"
          value={percent(altas, prospectos)}
          detail="altas ÷ prospectos"
          isHigh
        />
      </div>
      {unassigned > 0 && (
        <div className={`${base.info} ${styles.warning}`} data-testid="dashboard-unassigned">
          <span>
            <b>
              {number(unassigned)}
              {unassigned === 1
                ? " acción derivada sin asignar"
                : " acciones derivadas sin asignar"}
              .
            </b>{" "}
            No cuenta en los números de arriba hasta que tenga hunter. Está en la bandeja{" "}
            <b>Por asignar</b> de la agenda.
          </span>
        </div>
      )}
      {datos > 0 && (
        <div className={base.info}>
          <span>
            <b>Bases de datos:</b> {number(datos)} personas, {number(contactados)} ya contactadas (
            {percent(contactados, datos)}).
          </span>
        </div>
      )}
      <p className={`${base.note} ${styles.explanation}`}>
        El tablero cuenta <b>{periodText(filters)}</b> y sólo acciones con hunter: no entran las
        bases de datos, lo cancelado ni lo que todavía está por asignar. En la solapa{" "}
        <b>{listTabName(who.role)}</b> se ve todo, sin período.
      </p>
    </>
  );
}

function Content({ who, data }: { readonly who: Who; readonly data: DashboardData }) {
  const { kpis, byMonth, byPackage, byHunter, byOfficer, byCompany, byType, byReason } = data;
  return (
    <>
      <div className={styles.two} data-testid="dashboard-content">
        <section className={`${base.card} ${base.padded}`}>
          <div className={styles.head}>
            <span className={styles.title}>Evolución mensual</span>
            <span className={styles.key}>
              <span>
                <i className={styles.keyPeople} />
                Prospectos
              </span>
              <span>
                <i className={styles.keySignups} />
                Altas
              </span>
            </span>
          </div>
          <MonthsChart rows={byMonth} />
        </section>
        <section className={`${base.card} ${base.padded}`}>
          <div className={styles.head}>
            <span className={styles.title}>Embudo</span>
          </div>
          <Funnel attendees={kpis.asistentes} prospects={kpis.prospectos} signups={kpis.altas} />
          <div className={`${styles.head} ${styles.headLater}`}>
            <span className={styles.title}>Altas por paquete</span>
          </div>
          <Packages rows={byPackage} />
        </section>
      </div>
      <div className={styles.three}>
        <PeopleRanking
          who={who}
          title={who.role === "hunter" ? "Por hunter" : "Hunters"}
          rows={byHunter}
          withPackages
        />
        <PeopleRanking who={who} title="Oficiales Payroll" rows={byOfficer} />
        <CompanyRanking who={who} rows={byCompany} />
      </div>
      <div className={`${styles.two} ${styles.twoLast}`}>
        <section className={`${base.card} ${base.padded}`}>
          <div className={styles.head}>
            <span className={styles.title}>Por tipo de acción</span>
          </div>
          <ByType rows={byType} />
        </section>
        <section className={`${base.card} ${base.padded}`}>
          <div className={styles.head}>
            <span className={styles.title}>Por qué se descartan</span>
          </div>
          <Reasons rows={byReason} />
        </section>
      </div>
    </>
  );
}

function argumentsOf(
  filters: DashboardFilters,
  onlyMine: boolean,
  canSeeTrials: boolean,
): DashboardArguments {
  return {
    p_desde: periodStart(filters.period),
    p_hasta: null,
    p_tipo: filters.type || null,
    p_hunter: filters.hunter || null,
    p_dueno: filters.officer || null,
    p_prueba: canSeeTrials && filters.trials,
    p_solo_mio: onlyMine,
    p_meses: periodMonths(filters),
  };
}

export function DashboardTab({
  who,
  onlyMine,
  canSeeTrials,
  filters,
  onFilters,
}: DashboardTabProps) {
  const backend = useBackend();
  const { show } = useToast();
  const withLibrary = useSheetLibrary();
  const { data, error, retry } = useDashboardData(argumentsOf(filters, onlyMine, canSeeTrials));
  if (error) return <ConnectionProblem cause={error} onRetry={retry} />;
  if (!data) return <Loading />;

  const downloadExcel = async () => {
    show("Preparando el Excel…");
    await withLibrary(async (library) => {
      try {
        const actions = await readActionList(backend, onlyMine);
        const shown = actionsOfSheet(actions, filters, canSeeTrials && filters.trials);
        writeBook(library, dashboardBook(who, data, filters, shown), `Gestiones_${today()}.xlsx`);
      } catch (cause) {
        show(`No se pudo armar el Excel: ${messageOf(cause)}`);
      }
    });
  };

  const { visitas, planificadas } = data.kpis;
  const hasNothing = !visitas && !planificadas;
  return (
    <>
      <Filters
        who={who}
        data={data}
        canSeeTrials={canSeeTrials}
        filters={filters}
        onFilters={onFilters}
        onExcel={() => void downloadExcel()}
      />
      {filters.period === "q" && <QuarterPanel filters={filters} onFilters={onFilters} />}
      <Figures data={data} filters={filters} who={who} />
      {hasNothing ? (
        <div className={base.empty}>
          No hay gestiones en este período. Probá con un período más largo
          {canSeeTrials && !filters.trials ? " o tildá «Incluir pruebas»" : ""}.
        </div>
      ) : (
        <Content who={who} data={data} />
      )}
    </>
  );
}
