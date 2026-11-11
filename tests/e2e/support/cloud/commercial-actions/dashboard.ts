// gestiones_tablero: the numbers of the dashboard.
import { type CloudUser } from "../users.ts";
import { type ActionRow, type CommercialDb, type ProspectRow } from "./model.ts";
import { canSee } from "./rules.ts";

export interface DashboardArgs {
  p_desde?: string | null;
  p_hasta?: string | null;
  p_tipo?: string | null;
  p_hunter?: string | null;
  p_dueno?: string | null;
  p_meses?: string[] | null;
  p_solo_mio?: boolean | null;
}

type JoinedProspect = ProspectRow & { action: ActionRow };

function isInPeriod(action: ActionRow, { p_desde, p_hasta, p_meses }: DashboardArgs): boolean {
  return (
    (!p_desde || action.fecha >= p_desde) &&
    (!p_hasta || action.fecha <= p_hasta) &&
    (!p_meses || p_meses.includes(action.fecha.slice(0, 7)))
  );
}

function isMine(user: CloudUser, action: ActionRow): boolean {
  return [action.hunter_id, action.dueno_id, action.creada_por, action.lider_id].includes(user.id);
}

function matchesFilters(user: CloudUser, action: ActionRow, args: DashboardArgs): boolean {
  return (
    canSee(user, action) &&
    isInPeriod(action, args) &&
    (!args.p_tipo || action.tipo === args.p_tipo) &&
    (!args.p_hunter || action.hunter_id === args.p_hunter) &&
    (!args.p_solo_mio || isMine(user, action))
  );
}

function groupBy<T, K>(rows: readonly T[], keyOf: (row: T) => K): [K, T[]][] {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()];
}

function countBy<T>(rows: readonly T[], keyOf: (row: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = keyOf(row);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function isCounted(action: ActionRow): boolean {
  return (
    action.estado === "realizada" || (action.tipo === "datos" && action.estado !== "cancelada")
  );
}

function isPlanned(action: ActionRow): boolean {
  return action.estado === "planificada" && action.tipo !== "datos";
}

function kpis(
  scoped: readonly ActionRow[],
  counted: readonly ActionRow[],
  all: readonly JoinedProspect[],
  contacted: readonly JoinedProspect[],
) {
  const fromData = all.filter((prospect) => prospect.action.tipo === "datos");
  return {
    visitas: counted.length,
    // 048: what nobody assigned yet does not count as planned, it goes apart
    planificadas: scoped.filter((action) => isPlanned(action) && action.hunter_id).length,
    sin_asignar: scoped.filter((action) => isPlanned(action) && !action.hunter_id).length,
    empresas: new Set(counted.map((action) => `${String(action.dueno_id)}|${action.empresa_key}`))
      .size,
    asistentes: counted.reduce((sum, action) => sum + (Number(action.asistentes) || 0), 0),
    prospectos: contacted.length,
    altas: contacted.filter((prospect) => prospect.estado === "alta").length,
    datos: fromData.length,
    contactados: fromData.filter((prospect) => prospect.estado !== "a_contactar").length,
  };
}

export function buildDashboard(db: CommercialDb, user: CloudUser, args: DashboardArgs) {
  const inPeriod = db.actions.filter((action) => matchesFilters(user, action, args));
  const scoped = inPeriod.filter((action) => !args.p_dueno || action.dueno_id === args.p_dueno);
  const counted = scoped.filter(isCounted);
  const byId = new Map(counted.map((action) => [action.id, action]));
  const all: JoinedProspect[] = db.prospects.flatMap((prospect) => {
    const action = byId.get(prospect.gestion_id);
    return action ? [{ ...prospect, action }] : [];
  });
  const contacted = all.filter((prospect) => prospect.estado !== "a_contactar");
  const signups = contacted.filter((prospect) => prospect.estado === "alta");
  const totals = (rows: readonly ActionRow[]) => {
    const own = contacted.filter((prospect) => rows.includes(prospect.action));
    return {
      visitas: rows.length,
      prospectos: own.length,
      altas: own.filter((prospect) => prospect.estado === "alta").length,
    };
  };
  const groups = <K>(keyOf: (action: ActionRow) => K) => groupBy(counted, keyOf);
  return {
    kpis: kpis(scoped, counted, all, contacted),
    por_mes: groups((action) => action.fecha.slice(0, 7))
      .toSorted((a, b) => a[0].localeCompare(b[0]))
      .map(([mes, rows]) => ({ mes, ...totals(rows) })),
    por_hunter: groups((action) => action.hunter_id).map(([id, rows]) => ({
      id,
      ...totals(rows),
      paquetes: countBy(
        signups.filter((prospect) => prospect.action.hunter_id === id && prospect.paquete),
        (prospect) => String(prospect.paquete),
      ),
    })),
    por_dueno: groups((action) => action.dueno_id).map(([id, rows]) => ({
      id,
      ...totals(rows),
    })),
    // 049: every officer that forwards something in the period, ignoring the filter
    duenos: Object.entries(
      countBy(
        inPeriod.filter((action) => action.dueno_id),
        (action) => String(action.dueno_id),
      ),
    )
      .map(([id, n]) => ({ id, n }))
      .toSorted((a, b) => b.n - a.n),
    por_empresa: groups((action) => `${String(action.dueno_id)}|${action.empresa_key}`)
      .map(([, rows]) => ({
        empresa: rows[0]?.empresa,
        dueno: rows[0]?.dueno_id,
        cuit: rows[0]?.cuit,
        ...totals(rows),
      }))
      .toSorted((a, b) => b.altas - a.altas || b.visitas - a.visitas)
      .slice(0, 300),
    por_paquete: Object.entries(countBy(signups, (prospect) => prospect.paquete ?? "")).map(
      ([paquete, altas]) => ({ paquete: paquete || null, altas }),
    ),
    por_motivo: Object.entries(
      countBy(
        contacted.filter((prospect) => prospect.estado === "descartado"),
        (prospect) => prospect.motivo ?? "",
      ),
    ).map(([motivo, n]) => ({ motivo: motivo || null, n })),
    por_tipo: groups((action) => `${action.tipo}|${action.modalidad}`).map(([key, rows]) => {
      const [tipo, modalidad] = key.split("|");
      return { tipo, modalidad, ...totals(rows) };
    }),
    por_estado_pros: countBy(all, (prospect) => prospect.estado),
  };
}
