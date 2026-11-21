// The Excel of the dashboard: the numbers on screen, and the detail of the actions that the filters
// leave. The dashboard does not count what is still to come, and neither does this.
import type { SheetApi, SheetValues } from "@/shared/lib/sheet-library.ts";
import type { ListedAction } from "../api/rows.ts";
import type { DashboardData } from "../api/dashboard.ts";
import { repetitionText } from "./action-list.ts";
import {
  type DashboardFilters,
  periodMonths,
  periodStart,
  type PersonFigures,
  quartersText,
  withAndWithout,
} from "./dashboard.ts";
import { timeRange, today } from "./formatting.ts";
import {
  ACTION_STATES,
  ACTION_TYPES,
  DATA_LIST_STATES,
  DISCARD_REASONS,
  labelOf,
  MODALITIES,
  PACKAGES,
} from "./labels.ts";
import { formatCuil, taxIdList } from "./tax-ids.ts";
import { nameOf, type Who } from "./who.ts";

type SheetRow = Readonly<Record<string, unknown>>;

export interface BookSheet {
  readonly name: string;
  readonly lines?: SheetValues;
  readonly rows?: readonly SheetRow[];
}

export function actionsOfSheet(
  actions: readonly ListedAction[],
  filters: DashboardFilters,
  withTrials: boolean,
): readonly ListedAction[] {
  const from = periodStart(filters.period);
  const months = periodMonths(filters);
  const now = today();
  return actions.filter((action) => {
    const { fecha, tipo, hunter_id: hunter, dueno_id: owner, prueba } = action;
    if (from && fecha < from) return false;
    if (months && !months.includes(fecha.slice(0, 7))) return false;
    if (fecha > now) return false;
    if (filters.type && tipo !== filters.type) return false;
    if (filters.hunter && hunter !== filters.hunter) return false;
    if (filters.officer && owner !== filters.officer) return false;
    return !prueba || withTrials;
  });
}

function reasonsOf({ byReason }: DashboardData): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const { motivo, n } of byReason) {
    const key = motivo && DISCARD_REASONS[motivo] ? motivo : "otro";
    counts[key] = (counts[key] ?? 0) + n;
  }
  return counts;
}

function summaryLines(data: DashboardData, filters: DashboardFilters): SheetValues {
  const { kpis, byPackage } = data;
  const from = periodStart(filters.period);
  const period = periodMonths(filters) ? quartersText(filters) : from ? `Desde ${from}` : "Todo";
  const { withPackage, without, notLoaded } = withAndWithout(byPackage);
  const signupsOf = (key: string) => byPackage.find(({ paquete }) => paquete === key)?.altas ?? 0;
  const reasons = reasonsOf(data);
  const reasonKeys = Object.keys(DISCARD_REASONS).filter((key) => reasons[key]);
  return [
    ["Gestiones comerciales"],
    ["Período", period],
    ["Generado", new Date().toLocaleString("es-AR")],
    [],
    ["Acciones realizadas", kpis.visitas],
    ["Planificadas", kpis.planificadas],
    ["Empresas", kpis.empresas],
    ["Asistentes", kpis.asistentes],
    ["Prospectos", kpis.prospectos],
    ["Altas", kpis.altas],
    ["Conversión", kpis.prospectos ? kpis.altas / kpis.prospectos : 0],
    [],
    ["Altas con paquete", withPackage],
    ["Altas sin paquete (Caja de Ahorro)", without],
    ...(notLoaded ? [["Altas sin paquete cargado", notLoaded]] : []),
    [],
    ["Altas por paquete"],
    ...Object.entries(PACKAGES).map(([key, label]) => [label, signupsOf(key)]),
    ...(kpis.datos
      ? [
          [],
          ["Bases de datos: personas", kpis.datos],
          ["Bases de datos: contactadas", kpis.contactados],
        ]
      : []),
    ...(reasonKeys.length > 0
      ? [
          [],
          ["Descartes por motivo"],
          ...reasonKeys.map((key) => [DISCARD_REASONS[key] ?? "", reasons[key] ?? 0]),
        ]
      : []),
  ];
}

function packageColumns(packages: Readonly<Record<string, number>> | null | undefined): SheetRow {
  const counts = packages ?? {};
  const named = Object.keys(PACKAGES).filter((key) => key !== "caja");
  return {
    "Con paquete": named.reduce((total, key) => total + (counts[key] ?? 0), 0),
    "Sin paquete": counts.caja ?? 0,
    ...Object.fromEntries(named.map((key) => [PACKAGES[key] ?? "", counts[key] ?? 0])),
  };
}

function personRow(
  who: Who,
  { id, visitas, prospectos, altas, paquetes }: PersonFigures,
  withPackages: boolean,
): SheetRow {
  return {
    Nombre: nameOf(who, id),
    Acciones: visitas,
    Prospectos: prospectos,
    Altas: altas,
    Conversión: prospectos ? altas / prospectos : 0,
    ...(withPackages ? packageColumns(paquetes) : {}),
  };
}

function peopleRows(
  who: Who,
  rows: readonly PersonFigures[],
  withPackages: boolean,
): readonly SheetRow[] {
  return rows.filter(({ id }) => id).map((row) => personRow(who, row, withPackages));
}

function taxIdsOf(value: string | null): string {
  return taxIdList(value)
    .map((id) => formatCuil(id))
    .join(", ");
}

function actionRow(who: Who, action: ListedAction): SheetRow {
  const isDataList = action.tipo === "datos";
  return {
    Fecha: action.fecha,
    Hasta: action.vence ?? "",
    Horario: timeRange(action),
    Empresa: action.empresa,
    CUIT: taxIdsOf(action.cuit),
    Lugar: action.lugar ?? "",
    Tipo: labelOf(ACTION_TYPES, action.tipo),
    Modalidad: isDataList ? "" : labelOf(MODALITIES, action.modalidad),
    "Se repite": repetitionText(action),
    Estado: labelOf(isDataList ? DATA_LIST_STATES : ACTION_STATES, action.estado),
    Hunter: action.hunter_id ? nameOf(who, action.hunter_id) : "Por asignar",
    "Oficial Payroll": nameOf(who, action.dueno_id),
    Origen: action.origen === "derivada" ? "Derivada" : "Propia",
    "Pidió reasignación": action.no_puede_at ? "Sí" : "",
    Dotación: action.dotacion,
    Asistentes: action.asistentes,
    Personas: isDataList ? action.n_datos : "",
    Prospectos: action.n_pros,
    Altas: action.n_altas,
    Nota: action.nota ?? "",
    Prueba: action.prueba ? "Sí" : "",
  };
}

export function dashboardBook(
  who: Who,
  data: DashboardData,
  filters: DashboardFilters,
  actions: readonly ListedAction[],
): readonly BookSheet[] {
  return [
    { name: "Resumen", lines: summaryLines(data, filters) },
    { name: "Por hunter", rows: peopleRows(who, data.byHunter, true) },
    { name: "Por oficial", rows: peopleRows(who, data.byOfficer, false) },
    {
      name: "Por empresa",
      rows: data.byCompany.map(({ empresa, cuit, dueno, visitas, prospectos, altas }) => ({
        Empresa: empresa,
        CUIT: taxIdsOf(cuit),
        Oficial: nameOf(who, dueno),
        Acciones: visitas,
        Prospectos: prospectos,
        Altas: altas,
      })),
    },
    { name: "Gestiones", rows: actions.map((action) => actionRow(who, action)) },
  ];
}

export function writeBook(library: SheetApi, sheets: readonly BookSheet[], fileName: string): void {
  const book = library.utils.book_new();
  for (const { name, lines, rows } of sheets) {
    const content = lines
      ? library.utils.aoa_to_sheet(lines)
      : library.utils.json_to_sheet(rows ?? []);
    library.utils.book_append_sheet(book, content, name);
  }
  library.writeFile(book, fileName);
}
