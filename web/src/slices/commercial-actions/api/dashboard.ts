// What gestiones_tablero answers: the same numbers, read so that nothing missing prints as NaN.
import type { Backend } from "@/shared/supabase/index.ts";
import type {
  MonthTotals,
  PackageSignups,
  PersonFigures,
  TypeFigures,
} from "../model/dashboard.ts";
import { CommercialError } from "./actions.ts";

export interface DashboardArguments {
  readonly p_desde: string | null;
  readonly p_hasta: null;
  readonly p_tipo: string | null;
  readonly p_hunter: string | null;
  readonly p_dueno: string | null;
  readonly p_prueba: boolean;
  readonly p_solo_mio: boolean;
  /** Always there: null if the period does not go by quarter (migration 050). */
  readonly p_meses: readonly string[] | null;
}

export interface DashboardFigures {
  readonly visitas: number;
  readonly planificadas: number;
  readonly sin_asignar: number;
  readonly empresas: number;
  readonly asistentes: number;
  readonly prospectos: number;
  readonly altas: number;
  readonly datos: number;
  readonly contactados: number;
}

export interface CompanyFigures {
  readonly empresa: string;
  readonly dueno: string | null;
  readonly cuit: string | null;
  readonly visitas: number;
  readonly prospectos: number;
  readonly altas: number;
}

export interface DashboardData {
  readonly kpis: DashboardFigures;
  readonly byMonth: readonly MonthTotals[];
  readonly byHunter: readonly PersonFigures[];
  readonly byOfficer: readonly PersonFigures[];
  /** Everybody who forwards something on the period, whatever is filtered. */
  readonly officers: readonly string[];
  readonly byCompany: readonly CompanyFigures[];
  readonly byPackage: readonly PackageSignups[];
  readonly byReason: readonly { readonly motivo: string | null; readonly n: number }[];
  readonly byType: readonly TypeFigures[];
}

type Fields = Readonly<Record<string, unknown>>;

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null;
}

function figure(value: unknown): number {
  return Number(value) || 0;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function rowsOf(value: unknown): readonly Fields[] {
  return Array.isArray(value) ? value.filter(isFields) : [];
}

function totalsOf({ visitas, prospectos, altas }: Fields) {
  return { visitas: figure(visitas), prospectos: figure(prospectos), altas: figure(altas) };
}

function packagesOf(value: unknown): Readonly<Record<string, number>> | null {
  if (!isFields(value)) return null;
  return Object.fromEntries(Object.entries(value).map(([key, count]) => [key, figure(count)]));
}

function companyOf(row: Fields): CompanyFigures {
  return {
    empresa: text(row.empresa) ?? "",
    dueno: text(row.dueno),
    cuit: text(row.cuit),
    ...totalsOf(row),
  };
}

function typeOf(row: Fields): TypeFigures {
  return { tipo: text(row.tipo) ?? "", modalidad: text(row.modalidad) ?? "", ...totalsOf(row) };
}

function personOf(row: Fields): PersonFigures {
  return { id: text(row.id), ...totalsOf(row), paquetes: packagesOf(row.paquetes) };
}

function figuresOf(value: unknown): DashboardFigures {
  const kpis = isFields(value) ? value : {};
  return {
    visitas: figure(kpis.visitas),
    planificadas: figure(kpis.planificadas),
    sin_asignar: figure(kpis.sin_asignar),
    empresas: figure(kpis.empresas),
    asistentes: figure(kpis.asistentes),
    prospectos: figure(kpis.prospectos),
    altas: figure(kpis.altas),
    datos: figure(kpis.datos),
    contactados: figure(kpis.contactados),
  };
}

function dashboardOf(value: unknown): DashboardData {
  const data = isFields(value) ? value : {};
  const byOfficer = rowsOf(data.por_dueno).map((row) => personOf(row));
  const everybody = rowsOf(data.duenos);
  const officers = (everybody.length > 0 ? everybody : byOfficer).flatMap(({ id }) => {
    const officer = typeof id === "string" ? id : null;
    return officer ? [officer] : [];
  });
  return {
    kpis: figuresOf(data.kpis),
    byMonth: rowsOf(data.por_mes).map((row) => ({
      mes: text(row.mes) ?? "",
      prospectos: figure(row.prospectos),
      altas: figure(row.altas),
    })),
    byHunter: rowsOf(data.por_hunter).map((row) => personOf(row)),
    byOfficer,
    officers,
    byCompany: rowsOf(data.por_empresa).map((row) => companyOf(row)),
    byPackage: rowsOf(data.por_paquete).map((row) => ({
      paquete: text(row.paquete),
      altas: figure(row.altas),
    })),
    byReason: rowsOf(data.por_motivo).map((row) => ({
      motivo: text(row.motivo),
      n: figure(row.n),
    })),
    byType: rowsOf(data.por_tipo).map((row) => typeOf(row)),
  };
}

export async function readDashboard(
  { rpc }: Pick<Backend, "rpc">,
  { p_meses: months, ...others }: DashboardArguments,
): Promise<DashboardData> {
  const answer = await rpc("gestiones_tablero", {
    ...others,
    p_meses: months ? [...months] : null,
  });
  if (!answer.ok) throw new CommercialError(answer.error);
  return dashboardOf(answer.value);
}
