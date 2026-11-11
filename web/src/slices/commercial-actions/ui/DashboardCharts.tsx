// What the dashboard draws: signups and prospects by month, the funnel, packages, reasons and the
// rankings.
import type { CompanyFigures } from "../api/dashboard.ts";
import {
  byTypeOrder,
  chartScale,
  funnelWidth,
  hunterPackagesText,
  monthsOfChart,
  type MonthTotals,
  type PackageSignups,
  type PersonFigures,
  ranked,
  signupsPerAction,
  type TypeFigures,
  withAndWithout,
} from "../model/dashboard.ts";
import { MONTHS, number, percent, thisYear } from "../model/formatting.ts";
import {
  ACTION_TYPES,
  DISCARD_REASONS,
  labelOf,
  MODALITIES,
  PACKAGES,
  PACKAGES_SHORT,
} from "../model/labels.ts";
import { taxIdText } from "../model/tax-ids.ts";
import { nameOf, type Who } from "../model/who.ts";
import base from "./CommercialActions.module.css";
import styles from "./Dashboard.module.css";

const WIDTH = 560;
const HEIGHT = 220;
const LEFT = 40;
const BOTTOM = 26;
const TOP = 14;
const RIGHT = 8;
const MIN_FOR_SCALE = 4;
const MIN_BAR = 6;
const MAX_BAR = 22;
const BAR_SHARE = 3.2;
const RANK_ROWS = 12;
const COMPANY_ROWS = 10;

const FEW_MONTHS = 6;

function Bars({
  row,
  center,
  barWidth,
  isFew,
  yOf,
}: {
  readonly row: MonthTotals;
  readonly center: number;
  readonly barWidth: number;
  /** With few months there is room for the year of those that are not of this one. */
  readonly isFew: boolean;
  readonly yOf: (value: number) => number;
}) {
  const { mes, prospectos, altas } = row;
  const [year = "", month = "1"] = mes.split("-");
  const name = MONTHS[Number(month) - 1] ?? "";
  const zero = yOf(0);
  return (
    <>
      <rect
        x={center - barWidth - 1}
        y={yOf(prospectos)}
        width={barWidth}
        height={Math.max(0, zero - yOf(prospectos))}
        rx="3"
        className={styles.chartPeople}
      >
        <title>{`${name}: ${String(prospectos)} prospectos`}</title>
      </rect>
      <rect
        x={center + 1}
        y={yOf(altas)}
        width={barWidth}
        height={Math.max(0, zero - yOf(altas))}
        rx="3"
        className={styles.chartSignups}
      >
        <title>{`${name}: ${String(altas)} altas`}</title>
      </rect>
      {altas > 0 && (
        <text
          x={center + 1 + barWidth / 2}
          y={yOf(altas) - 4}
          textAnchor="middle"
          className={styles.chartValue}
        >
          {altas}
        </text>
      )}
      <text x={center} y={HEIGHT - 8} textAnchor="middle" className={styles.chartAxis}>
        {name}
        {isFew && year !== String(thisYear()) ? ` ${year.slice(2)}` : ""}
      </text>
    </>
  );
}

export function MonthsChart({ rows }: { readonly rows: readonly MonthTotals[] }) {
  const shown = monthsOfChart(rows);
  if (shown.length === 0) return <div className={base.mini}>Sin datos.</div>;
  const highest = Math.max(
    ...shown.flatMap(({ prospectos, altas }) => [prospectos, altas]),
    MIN_FOR_SCALE,
  );
  const { step, top } = chartScale(highest);
  const columnWidth = (WIDTH - LEFT - RIGHT) / shown.length;
  const barWidth = Math.max(MIN_BAR, Math.min(MAX_BAR, columnWidth / BAR_SHARE));
  const yOf = (value: number) => TOP + (HEIGHT - TOP - BOTTOM) * (1 - value / top);
  const marks = Array.from({ length: Math.floor(top / step) + 1 }, (_, index) => index * step);
  return (
    <svg
      className={styles.chart}
      viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
      aria-label="Prospectos y altas por mes"
    >
      {marks.map((value) => (
        <g key={value}>
          <line
            x1={LEFT}
            x2={WIDTH - RIGHT}
            y1={yOf(value)}
            y2={yOf(value)}
            className={styles.chartLine}
          />
          <text x={LEFT - 6} y={yOf(value) + 4} textAnchor="end" className={styles.chartAxis}>
            {value}
          </text>
        </g>
      ))}
      {shown.map((row, index) => (
        <Bars
          key={row.mes}
          row={row}
          center={LEFT + columnWidth * index + columnWidth / 2}
          barWidth={barWidth}
          isFew={shown.length <= FEW_MONTHS}
          yOf={yOf}
        />
      ))}
    </svg>
  );
}

export function Funnel({
  attendees,
  prospects,
  signups,
}: {
  readonly attendees: number;
  readonly prospects: number;
  readonly signups: number;
}) {
  const base100 = attendees || prospects || 1;
  const steps = [
    { label: "Asistentes", value: attendees, kind: "", share: "" },
    {
      label: "Prospectos",
      value: prospects,
      kind: styles.funnelProspects,
      share: percent(prospects, attendees),
    },
    {
      label: "Altas",
      value: signups,
      kind: styles.funnelSignups,
      share: percent(signups, prospects),
    },
  ];
  return (
    <div className={styles.funnel}>
      {steps.map(({ label, value, kind, share }) => (
        <div key={label} className={styles.funnelRow}>
          <span>{label}</span>
          <div>
            <div
              className={`${styles.funnelBar} ${kind ?? ""}`}
              style={{ width: `${String(funnelWidth(value, base100))}%` }}
            >
              {number(value)}
            </div>
          </div>
          <span className={styles.funnelShare}>{share}</span>
        </div>
      ))}
    </div>
  );
}

function ShareRow({
  label,
  value,
  highest,
  total,
}: {
  readonly label: string;
  readonly value: number;
  readonly highest: number;
  readonly total: number;
}) {
  return (
    <div className={styles.funnelRow}>
      <span className={base.mini}>{label}</span>
      <div className={base.bar}>
        <i style={{ width: `${String(Math.round((value * 100) / highest))}%` }} />
      </div>
      <span className={styles.funnelShare}>
        {value} · {percent(value, total)}
      </span>
    </div>
  );
}

export function Packages({ rows }: { readonly rows: readonly PackageSignups[] }) {
  const counts = new Map<string, number>();
  let unknown = 0;
  for (const { paquete, altas } of rows) {
    if (paquete && PACKAGES[paquete]) counts.set(paquete, (counts.get(paquete) ?? 0) + altas);
    else unknown += altas;
  }
  const keys = Object.keys(PACKAGES);
  const values = keys.map((key) => counts.get(key) ?? 0);
  const total = values.reduce((sum, value) => sum + value, 0) + unknown;
  const highest = Math.max(...values, 1);
  const { withPackage, without } = withAndWithout(rows);
  return (
    <>
      <div className={`${base.mini} ${styles.packagesLine}`}>
        <b>Con paquete: {withPackage}</b> ({percent(withPackage, total)}) ·{" "}
        <b>Sin paquete: {without}</b> ({percent(without, total)})
      </div>
      <div className={styles.funnel}>
        {keys.map((key) => (
          <ShareRow
            key={key}
            label={PACKAGES_SHORT[key] ?? ""}
            value={counts.get(key) ?? 0}
            highest={highest}
            total={total}
          />
        ))}
        {unknown > 0 && (
          <div className={base.mini}>
            {unknown} alta{unknown > 1 ? "s" : ""} sin paquete cargado
          </div>
        )}
      </div>
    </>
  );
}

export function Reasons({
  rows,
}: {
  readonly rows: readonly { readonly motivo: string | null; readonly n: number }[];
}) {
  const counts = new Map<string, number>();
  let total = 0;
  for (const { motivo, n } of rows) {
    const key = motivo && DISCARD_REASONS[motivo] ? motivo : "otro";
    counts.set(key, (counts.get(key) ?? 0) + n);
    total += n;
  }
  if (total === 0) return <div className={base.mini}>Todavía no hay descartes con motivo.</div>;
  const highest = Math.max(...counts.values(), 1);
  const keys = Object.keys(DISCARD_REASONS)
    .filter((key) => counts.get(key))
    .toSorted((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  return (
    <div className={styles.funnel}>
      {keys.map((key) => (
        <ShareRow
          key={key}
          label={DISCARD_REASONS[key] ?? ""}
          value={counts.get(key) ?? 0}
          highest={highest}
          total={total}
        />
      ))}
    </div>
  );
}

function RankRow({
  who,
  row,
  highest,
  withPackages,
}: {
  readonly who: Who;
  readonly row: PersonFigures;
  readonly highest: number;
  readonly withPackages: boolean;
}) {
  const { id, visitas, altas, prospectos, paquetes } = row;
  const packages = withPackages ? hunterPackagesText(paquetes ?? null) : "";
  return (
    <tr>
      <td>
        {nameOf(who, id)}
        {packages && <div className={base.mini}>{packages}</div>}
      </td>
      <td className={base.right}>{visitas}</td>
      <td className={base.right}>
        <b>{altas}</b>
      </td>
      <td aria-label={`Conversión: ${percent(altas, prospectos)}`}>
        <div className={`${base.barLine} ${styles.compactBarLine}`}>
          <div className={`${base.bar} ${styles.compactBar}`}>
            <i style={{ width: `${String(Math.round((altas * 100) / highest))}%` }} />
          </div>
          <span>{percent(altas, prospectos)}</span>
        </div>
      </td>
    </tr>
  );
}

export function PeopleRanking({
  who,
  title,
  rows,
  withPackages = false,
}: {
  readonly who: Who;
  readonly title: string;
  readonly rows: readonly PersonFigures[];
  readonly withPackages?: boolean;
}) {
  const shown = ranked(rows);
  const highest = Math.max(...shown.map(({ altas }) => altas), 1);
  return (
    <section className={`${base.card} ${base.padded}`}>
      <div className={styles.head}>
        <span className={styles.title}>{title}</span>
      </div>
      <div className={base.tableBox}>
        <table className={`${base.table} ${styles.compact}`}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th className={base.right}>Acc.</th>
              <th className={base.right}>Altas</th>
              <th>Conv.</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={4} className={base.mini}>
                  Sin datos.
                </td>
              </tr>
            ) : (
              shown
                .slice(0, RANK_ROWS)
                .map((row) => (
                  <RankRow
                    key={row.id}
                    who={who}
                    row={row}
                    highest={highest}
                    withPackages={withPackages}
                  />
                ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CompanyRanking({
  who,
  rows,
}: {
  readonly who: Who;
  readonly rows: readonly CompanyFigures[];
}) {
  return (
    <section className={`${base.card} ${base.padded}`}>
      <div className={styles.head}>
        <span className={styles.title}>Empresas con más altas</span>
      </div>
      <div className={base.tableBox}>
        <table className={`${base.table} ${styles.compact}`}>
          <thead>
            <tr>
              <th>Empresa</th>
              <th className={base.right}>Acc.</th>
              <th className={base.right}>Altas</th>
              <th className={base.right}>Conv.</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className={base.mini}>
                  Sin datos.
                </td>
              </tr>
            ) : (
              rows.slice(0, COMPANY_ROWS).map((row) => (
                <tr key={`${row.dueno ?? ""}|${row.empresa}`}>
                  <td>
                    {row.empresa}
                    <div className={base.mini}>
                      {nameOf(who, row.dueno)}
                      {taxIdText(row.cuit) ? ` · ${taxIdText(row.cuit)}` : ""}
                    </div>
                  </td>
                  <td className={base.right}>{row.visitas}</td>
                  <td className={base.right}>
                    <b>{row.altas}</b>
                  </td>
                  <td className={base.right}>{percent(row.altas, row.prospectos)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ByType({ rows }: { readonly rows: readonly TypeFigures[] }) {
  const shown = byTypeOrder(rows);
  return (
    <div className={base.tableBox}>
      <table className={`${base.table} ${styles.compact}`}>
        <thead>
          <tr>
            <th>Tipo</th>
            <th className={base.right}>Cantidad</th>
            <th className={base.right}>Prosp.</th>
            <th className={base.right}>Altas</th>
            <th className={base.right}>Altas por acción</th>
            <th className={base.right}>Conv.</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr>
              <td colSpan={6} className={base.mini}>
                Sin datos.
              </td>
            </tr>
          ) : (
            shown.map(({ tipo, modalidad, visitas, prospectos, altas }) => (
              <tr key={`${tipo}|${modalidad}`}>
                <td>
                  {labelOf(ACTION_TYPES, tipo)} {labelOf(MODALITIES, modalidad).toLowerCase()}
                </td>
                <td className={base.right}>{visitas}</td>
                <td className={base.right}>{prospectos}</td>
                <td className={base.right}>
                  <b>{altas}</b>
                </td>
                <td className={base.right}>{signupsPerAction(altas, visitas)}</td>
                <td className={base.right}>{percent(altas, prospectos)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
