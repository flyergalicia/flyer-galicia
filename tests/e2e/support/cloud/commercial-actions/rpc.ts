// Database functions of commercial actions, with the same rules as the real ones.
import { type CloudState } from "../state.ts";
import { type CloudUser } from "../users.ts";
import { buildDashboard, type DashboardArgs } from "./dashboard.ts";
import {
  type ActionRow,
  type CommercialDb,
  type CompanyRow,
  fail,
  minutes,
  nextId,
  nowIso,
  profileSummaries,
} from "./model.ts";
import {
  actionById,
  afterUpdateAction,
  beforeUpdateAction,
  canSee,
  leads,
  participates,
} from "./rules.ts";

export interface RpcArgs extends DashboardArgs {
  p_limit?: number;
  p_q?: string;
  p_fecha?: string;
  p_serie?: string;
  p_gestion?: string;
  p_texto?: string;
  p_motivo?: string;
}

export interface RpcCall {
  state: CloudState;
  db: CommercialDb;
  user: CloudUser;
  args: RpcArgs;
}

function isParty(user: CloudUser, action: ActionRow): boolean {
  return [action.hunter_id, action.dueno_id, action.creada_por, action.lider_id].includes(user.id);
}

function withCounts(db: CommercialDb, action: ActionRow) {
  const prospects = db.prospects.filter((prospect) => prospect.gestion_id === action.id);
  return {
    ...action,
    n_pros: prospects.filter((prospect) => prospect.estado !== "a_contactar").length,
    n_altas: prospects.filter((prospect) => prospect.estado === "alta").length,
    n_datos: prospects.length,
  };
}

function listActions({ db, user, args }: RpcCall) {
  return db.actions
    .filter((action) => canSee(user, action) && (!args.p_solo_mio || isParty(user, action)))
    .toSorted((a, b) => (b.fecha + b.created_at).localeCompare(a.fecha + a.created_at))
    .slice(0, args.p_limit || 300)
    .map((action) => withCounts(db, action));
}

function isCompanyVisible(user: CloudUser, company: CompanyRow): boolean {
  return (
    user.role === "admin" ||
    user.role === "hunter" ||
    company.user_id === user.id ||
    leads(user, company.user_id)
  );
}

function listCompanies({ db, user, args }: RpcCall) {
  const search = (args.p_q ?? "").trim().toLowerCase();
  const digits = (args.p_q ?? "").replace(/\D/g, "");
  const matchesSearch = (company: CompanyRow): boolean =>
    !search ||
    company.empresa.toLowerCase().includes(search) ||
    (digits.length >= 4 && company.cuits.some((cuit) => cuit.includes(digits)));
  return db.companies
    .filter((company) => isCompanyVisible(user, company) && matchesSearch(company))
    .toSorted((a, b) => a.empresa.localeCompare(b.empresa))
    .slice(0, args.p_limit || 30)
    .map((company) => ({
      empresa: company.empresa,
      dueno_id: company.user_id,
      cuits: company.cuits,
    }));
}

function byStartTime(a: ActionRow, b: ActionRow): number {
  return (minutes(a.hora_desde) ?? -1) - (minutes(b.hora_desde) ?? -1);
}

function hunterBusy({ db, user, args }: RpcCall) {
  return db.actions
    .filter(
      (action) =>
        action.hunter_id === args.p_hunter &&
        action.fecha === args.p_fecha &&
        action.estado !== "cancelada" &&
        action.tipo !== "datos",
    )
    .toSorted(byStartTime)
    .map((action) => ({
      id: action.id,
      hora_desde: action.hora_desde,
      hora_hasta: action.hora_hasta,
      tipo: action.tipo,
      empresa: canSee(user, action) ? action.empresa : null,
    }));
}

/** 046: not for hunters; a leader only sees their team. */
function isOccupancyVisible(user: CloudUser, action: ActionRow): boolean {
  if (user.role === "hunter") return false;
  return user.role !== "lider" || leads(user, action.hunter_id);
}

function occupiesSchedule(action: ActionRow): boolean {
  return (
    action.estado !== "cancelada" &&
    Boolean(action.hunter_id) &&
    Boolean(action.hora_desde) &&
    action.tipo !== "datos"
  );
}

function dayOccupancy({ db, user, args }: RpcCall) {
  return db.actions
    .filter(
      (action) =>
        isOccupancyVisible(user, action) &&
        action.fecha === args.p_fecha &&
        occupiesSchedule(action),
    )
    .map((action) => ({
      hunter_id: action.hunter_id,
      hora_desde: action.hora_desde,
      hora_hasta: action.hora_hasta,
    }));
}

function daysBetween(from: string, to: string): number {
  const dayMs = 86_400_000;
  return Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / dayMs);
}

/** 047: busy hours of a whole week, with the company hidden for those who cannot see it. */
function occupancy({ db, user, args }: RpcCall) {
  const { p_desde: from, p_hasta: to } = args;
  if (!from || !to) return [];
  const days = daysBetween(from, to);
  if (days < 0 || days > 45) return [];
  return db.actions
    .filter(
      (action) =>
        isOccupancyVisible(user, action) &&
        action.fecha >= from &&
        action.fecha <= to &&
        occupiesSchedule(action),
    )
    .toSorted((a, b) => a.fecha.localeCompare(b.fecha) || byStartTime(a, b))
    .map((action) => ({
      id: action.id,
      hunter_id: action.hunter_id,
      fecha: action.fecha,
      hora_desde: action.hora_desde,
      hora_hasta: action.hora_hasta,
      tipo: action.tipo,
      empresa: canSee(user, action) ? action.empresa : null,
    }));
}

function markSeen(user: CloudUser, action: ActionRow): number {
  let changed = 0;
  if (action.hunter_id === user.id && !action.visto_hunter) {
    action.visto_hunter = true;
    changed += 1;
  }
  if (action.dueno_id === user.id && !action.visto_dueno) {
    action.visto_dueno = true;
    changed += 1;
  }
  return changed;
}

function markSeriesSeen({ db, user, args }: RpcCall): number {
  return db.actions
    .filter((action) => action.serie_id === args.p_serie)
    .reduce((total, action) => total + markSeen(user, action), 0);
}

function touchReadMark(db: CommercialDb, user: CloudUser, actionId: string): void {
  const mark = db.readMarks.find((row) => row.gestion_id === actionId && row.user_id === user.id);
  if (mark) mark.at = nowIso();
  else db.readMarks.push({ gestion_id: actionId, user_id: user.id, at: nowIso() });
}

function markRead({ db, user, args }: RpcCall): null {
  const action = actionById(db, args.p_gestion);
  if (action && canSee(user, action)) touchReadMark(db, user, action.id);
  return null;
}

function sendMessage({ db, user, args }: RpcCall): string {
  const text = (args.p_texto ?? "").trim();
  if (!text) fail("Escribí el mensaje");
  const action = actionById(db, args.p_gestion);
  if (!action || !canSee(user, action)) fail("No tenés acceso a esa acción");
  const id = nextId(db);
  db.messages.push({
    id,
    gestion_id: action.id,
    autor: user.id,
    tipo: "msg",
    texto: text.slice(0, 1000),
    created_at: nowIso(),
  });
  touchReadMark(db, user, action.id);
  return id;
}

function reportCannotAttend({ db, user, args }: RpcCall): null {
  const action = actionById(db, args.p_gestion);
  if (action?.hunter_id !== user.id) {
    fail("Sólo el hunter de esa acción puede avisar que no puede");
  }
  if (action.estado !== "planificada") fail("Sólo se avisa en una acción planificada");
  const reason = (args.p_motivo ?? "").trim().slice(0, 500) || null;
  const next = beforeUpdateAction(
    db,
    user,
    action,
    { no_puede_at: nowIso(), no_puede_motivo: reason },
    { cannotAttend: true },
  );
  afterUpdateAction(db, user, next, action);
  Object.assign(action, next);
  db.messages.push({
    id: nextId(db),
    gestion_id: action.id,
    autor: user.id,
    tipo: "no_puedo",
    texto: reason ?? "No puedo ir",
    created_at: nowIso(),
  });
  touchReadMark(db, user, action.id);
  return null;
}

interface UnreadGroup {
  gestion_id: string;
  serie_id: string | null;
  empresa: string;
  n: number;
  ultimo_autor: string | null;
  ultimo_at: string;
  no_puedo: boolean;
}

function unreadMessages({ db, user }: RpcCall): UnreadGroup[] {
  const groups = new Map<string, UnreadGroup>();
  for (const message of db.messages) {
    const action = actionById(db, message.gestion_id);
    if (!action || message.autor === user.id) continue;
    if (!canSee(user, action) || !participates(user, action)) continue;
    const mark = db.readMarks.find(
      (row) => row.gestion_id === action.id && row.user_id === user.id,
    );
    if (mark && message.created_at <= mark.at) continue;
    const group = groups.get(action.id) ?? {
      gestion_id: action.id,
      serie_id: action.serie_id,
      empresa: action.empresa,
      n: 0,
      ultimo_autor: null,
      ultimo_at: "",
      no_puedo: false,
    };
    group.n += 1;
    if (message.created_at > group.ultimo_at) {
      group.ultimo_at = message.created_at;
      group.ultimo_autor = message.autor;
    }
    if (message.tipo === "no_puedo") group.no_puedo = true;
    groups.set(action.id, group);
  }
  return [...groups.values()].toSorted((a, b) => b.ultimo_at.localeCompare(a.ultimo_at));
}

/** 049: leave it unread again, so that the notice comes back. */
function markUnread({ db, user, args }: RpcCall): null {
  const action = actionById(db, args.p_gestion);
  if (!action || !canSee(user, action)) return null;
  db.readMarks = db.readMarks.filter(
    (row) => !(row.gestion_id === action.id && row.user_id === user.id),
  );
  if (action.hunter_id === user.id) action.visto_hunter = false;
  if (action.dueno_id === user.id) action.visto_dueno = false;
  return null;
}

function markAllRead({ db, user }: RpcCall): number {
  let changed = db.actions.reduce((total, action) => total + markSeen(user, action), 0);
  for (const message of db.messages) {
    const action = actionById(db, message.gestion_id);
    if (!action || message.autor === user.id || !participates(user, action)) continue;
    if (canSee(user, action)) touchReadMark(db, user, action.id);
    changed += 1;
  }
  return changed;
}

export const COMMERCIAL_RPC: Readonly<Record<string, (call: RpcCall) => unknown>> = {
  gestiones_personas: ({ state }) => profileSummaries(state),
  gestiones_lista: listActions,
  gestiones_empresas: listCompanies,
  gestiones_ocupado: hunterBusy,
  gestiones_dia: dayOccupancy,
  gestiones_ocupacion: occupancy,
  gestion_marcar_vista: markSeriesSeen,
  gestion_marcar_leida: markRead,
  gestion_mensaje_enviar: sendMessage,
  gestion_no_puedo: reportCannotAttend,
  gestiones_mensajes_nuevos: unreadMessages,
  gestion_marcar_no_leida: markUnread,
  gestiones_marcar_todas_leidas: markAllRead,
  gestiones_tablero: ({ db, user, args }) => buildDashboard(db, user, args),
};
