// The policies (migrations 014/045) and triggers of commercial actions, as plain functions.
import { type CloudUser } from "../users.ts";
import {
  type ActionRow,
  type CommercialDb,
  type ProspectRow,
  clockTime,
  endMinutes,
  fail,
  leaderOf,
  minutes,
  nextId,
  nowIso,
  today,
  withSeconds,
} from "./model.ts";

export type ProfileLookup = (id: string | null) => { rol: string } | null;

export function leads(user: CloudUser, personId: string | null): boolean {
  return Boolean(personId) && leaderOf(personId) === user.id;
}

function isParty(user: CloudUser, action: ActionRow): boolean {
  return [action.hunter_id, action.dueno_id, action.creada_por, action.lider_id].includes(user.id);
}

export function canSee(user: CloudUser, action: ActionRow): boolean {
  return (
    user.role === "admin" ||
    isParty(user, action) ||
    leads(user, action.hunter_id) ||
    leads(user, action.dueno_id) ||
    leads(user, action.creada_por)
  );
}

export function canEdit(user: CloudUser, action: ActionRow): boolean {
  return (
    user.role === "admin" ||
    [action.hunter_id, action.creada_por, action.lider_id].includes(user.id) ||
    leads(user, action.hunter_id)
  );
}

export function canWriteProspects(user: CloudUser, action: ActionRow): boolean {
  return user.role === "admin" || action.hunter_id === user.id || action.creada_por === user.id;
}

export function participates(user: CloudUser, action: ActionRow): boolean {
  return isParty(user, action) || leads(user, action.hunter_id);
}

export function actionById(db: CommercialDb, id: string | undefined): ActionRow | undefined {
  return db.actions.find((action) => action.id === id);
}

function scheduleChanged(next: ActionRow, previous: ActionRow | null): boolean {
  return (
    !previous ||
    next.hunter_id !== previous.hunter_id ||
    next.fecha !== previous.fecha ||
    withSeconds(next.hora_desde) !== withSeconds(previous.hora_desde) ||
    withSeconds(next.hora_hasta) !== withSeconds(previous.hora_hasta) ||
    previous.estado === "cancelada"
  );
}

function isExemptFromOverlap(user: CloudUser, action: ActionRow): boolean {
  return (
    action.estado === "cancelada" ||
    !action.hunter_id ||
    !action.hora_desde ||
    action.tipo === "datos" ||
    user.role === "admin" ||
    leads(user, action.hunter_id)
  );
}

function overlaps(a: ActionRow, b: ActionRow): boolean {
  return (
    (minutes(b.hora_desde) ?? 0) < endMinutes(a.hora_desde, a.hora_hasta) &&
    (minutes(a.hora_desde) ?? 0) < endMinutes(b.hora_desde, b.hora_hasta)
  );
}

/** A hunter's schedule cannot overlap, unless an administrator or their leader decides it. */
function rejectOverlap(
  db: CommercialDb,
  user: CloudUser,
  next: ActionRow,
  previous: ActionRow | null,
): void {
  if (!scheduleChanged(next, previous) || isExemptFromOverlap(user, next)) return;
  const other = db.actions.find(
    (candidate) =>
      candidate.hunter_id === next.hunter_id &&
      candidate.fecha === next.fecha &&
      candidate.estado !== "cancelada" &&
      candidate.id !== next.id &&
      candidate.hora_desde &&
      candidate.tipo !== "datos" &&
      overlaps(next, candidate),
  );
  if (!other) return;
  const from = clockTime(minutes(other.hora_desde) ?? 0);
  const to = clockTime(endMinutes(other.hora_desde, other.hora_hasta));
  fail(`GES_PISA: ese hunter ya tiene algo de ${from} a ${to} ese día`);
}

function assignOwnAction(user: CloudUser, action: ActionRow): void {
  action.hunter_id = user.id;
  action.lider_id = null;
  action.visto_hunter = true;
}

function assignForwardedAction(lookup: ProfileLookup, user: CloudUser, action: ActionRow): void {
  const mayAssignForOther =
    action.dueno_id &&
    action.dueno_id !== user.id &&
    (user.role === "admin" || leads(user, action.hunter_id));
  if (!mayAssignForOther) action.dueno_id = user.id;
  if (!action.hunter_id) {
    if (lookup(action.lider_id)?.rol !== "lider") {
      fail("Elegí el hunter o el líder que la va a asignar");
    }
    if (action.estado !== "planificada") fail("Una acción sin hunter tiene que quedar planificada");
    action.visto_hunter = true;
    return;
  }
  if (!lookup(action.hunter_id)) fail("Ese hunter no existe o no está activo");
  action.lider_id = null; // 046: with a hunter there is no leader left to assign it
  action.visto_hunter = action.hunter_id === user.id;
}

function companyOf(db: CommercialDb, owner: string | null, companyKey: string) {
  return db.companies.find(
    (company) => company.user_id === owner && company.empresa.trim().toLowerCase() === companyKey,
  );
}

export function beforeInsertAction(
  db: CommercialDb,
  lookup: ProfileLookup,
  user: CloudUser,
  body: Partial<ActionRow>,
): ActionRow {
  const now = nowIso();
  const empresa = (body.empresa ?? "").trim();
  const action: ActionRow = {
    origen: "propia",
    tipo: "accion",
    modalidad: "presencial",
    frecuencia: "unica",
    estado: "realizada",
    fecha: today(),
    lugar: null,
    nota: null,
    dotacion: null,
    asistentes: null,
    cada_dias: null,
    veces: null,
    vez: null,
    serie_id: null,
    vence: null,
    lider_id: null,
    hunter_id: null,
    dueno_id: null,
    cuit: null,
    visto_hunter: false,
    visto_dueno: false,
    ...body,
    id: nextId(db),
    creada_por: user.id,
    empresa,
    empresa_key: empresa.toLowerCase(),
    no_puede_at: null,
    no_puede_motivo: null,
    prueba: false,
    created_at: now,
    updated_at: now,
    hora_desde: withSeconds(body.hora_desde),
    hora_hasta: withSeconds(body.hora_hasta),
  };
  if (action.origen === "propia") assignOwnAction(user, action);
  else assignForwardedAction(lookup, user, action);
  const company = companyOf(db, action.dueno_id, action.empresa_key);
  if (!company) fail("Esa empresa no está en la base de ese oficial");
  action.cuit = company.cuits.join(",") || null;
  action.visto_dueno = action.dueno_id === user.id;
  action.serie_id ??= nextId(db);
  if (action.hora_hasta && !action.hora_desde) {
    fail('violates check constraint "gestiones_horario_ok"');
  }
  rejectOverlap(db, user, action, null);
  return action;
}

function mayChangeHunter(user: CloudUser, previous: ActionRow, hunterId: string | null): boolean {
  if (!hunterId) return false;
  if (user.role === "admin") return true;
  const isForwardingOfficer =
    user.id === previous.creada_por &&
    previous.origen === "derivada" &&
    previous.estado !== "realizada";
  if (isForwardingOfficer) return true;
  return (
    (leads(user, previous.hunter_id) || previous.lider_id === user.id) && leads(user, hunterId)
  );
}

function applyHunterChange(user: CloudUser, previous: ActionRow, next: ActionRow): void {
  if (next.hunter_id === previous.hunter_id) return;
  if (mayChangeHunter(user, previous, next.hunter_id)) {
    next.visto_hunter = next.hunter_id === user.id;
    next.no_puede_at = null;
    next.no_puede_motivo = null;
  } else {
    next.hunter_id = previous.hunter_id;
  }
}

function keepImmutableColumns(next: ActionRow, previous: ActionRow): void {
  next.id = previous.id;
  next.empresa = previous.empresa;
  next.empresa_key = previous.empresa_key;
  next.dueno_id = previous.dueno_id;
  next.creada_por = previous.creada_por;
  next.origen = previous.origen;
  next.serie_id = previous.serie_id;
  next.created_at = previous.created_at;
  next.cuit = previous.cuit;
}

export interface UpdateFlags {
  /** Set by the functions that are allowed to report "No puedo ir". */
  cannotAttend?: boolean;
}

export function beforeUpdateAction(
  db: CommercialDb,
  user: CloudUser,
  previous: ActionRow,
  changes: Partial<ActionRow>,
  flags: UpdateFlags = {},
): ActionRow {
  const next: ActionRow = { ...previous, ...changes };
  keepImmutableColumns(next, previous);
  next.hora_desde = withSeconds(next.hora_desde);
  next.hora_hasta = withSeconds(next.hora_hasta);
  // 046: an action without a CUIT takes it from the registry when edited
  next.cuit ??= companyOf(db, previous.dueno_id, previous.empresa_key)?.cuits.join(",") || null;
  if (user.role !== "admin") next.lider_id = previous.lider_id;
  next.visto_hunter = previous.visto_hunter;
  next.visto_dueno = previous.visto_dueno;
  if (!flags.cannotAttend) {
    next.no_puede_at = previous.no_puede_at;
    next.no_puede_motivo = previous.no_puede_motivo;
  }
  applyHunterChange(user, previous, next);
  if (
    next.estado === "realizada" &&
    previous.estado !== "realizada" &&
    user.id !== previous.dueno_id
  ) {
    next.visto_dueno = false;
  }
  next.updated_at = nowIso();
  rejectOverlap(db, user, next, previous);
  return next;
}

export function addEvent(
  db: CommercialDb,
  actionId: string,
  user: CloudUser,
  what: string,
  detail: Record<string, unknown> = {},
): void {
  db.events.push({
    id: nextId(db),
    gestion_id: actionId,
    quien: user.id,
    que: what,
    detalle: detail,
    at: nowIso(),
  });
}

function hourAndMinute(time: string | null): string | null {
  return (time ?? "").slice(0, 5) || null;
}

function creationEvent(action: ActionRow): string {
  if (action.origen === "propia") return "registrada";
  return action.hunter_id ? "derivada" : "por_asignar";
}

export function afterInsertAction(db: CommercialDb, user: CloudUser, action: ActionRow): void {
  addEvent(db, action.id, user, creationEvent(action), {
    hunter: action.hunter_id,
    lider: action.lider_id,
    estado: action.estado,
  });
}

export function afterUpdateAction(
  db: CommercialDb,
  user: CloudUser,
  next: ActionRow,
  previous: ActionRow,
): void {
  if (next.hunter_id !== previous.hunter_id) {
    addEvent(db, next.id, user, "hunter", { de: previous.hunter_id, a: next.hunter_id });
  }
  const moved =
    next.fecha !== previous.fecha ||
    next.hora_desde !== previous.hora_desde ||
    next.hora_hasta !== previous.hora_hasta;
  if (moved) {
    addEvent(db, next.id, user, "horario", {
      fecha_de: previous.fecha,
      fecha_a: next.fecha,
      desde_de: hourAndMinute(previous.hora_desde),
      hasta_de: hourAndMinute(previous.hora_hasta),
      desde_a: hourAndMinute(next.hora_desde),
      hasta_a: hourAndMinute(next.hora_hasta),
    });
  }
  if (next.estado !== previous.estado) {
    addEvent(db, next.id, user, "estado", { de: previous.estado, a: next.estado });
  }
  if (next.no_puede_at && !previous.no_puede_at) {
    addEvent(db, next.id, user, "no_puede", { motivo: next.no_puede_motivo });
  }
}

function checkProspectName(nombre: string): void {
  if (!nombre) fail('violates check constraint "gestion_prospectos_nombre_check"');
}

function normalizedCuil(cuil: string | null): string | null {
  if (!cuil) return null;
  const digits = cuil.replace(/\D/g, "");
  if (digits && !/^\d{11}$/.test(digits)) {
    fail('violates check constraint "gestion_prospectos_cuil_check"');
  }
  return digits || null;
}

function trimmedOrNull(text: string | null): string | null {
  return text?.trim() || null;
}

function rejectIncompleteProspect(next: ProspectRow, previous: ProspectRow | null): void {
  const previousState = previous?.estado ?? null;
  if (next.estado === "alta" && !next.paquete && (previousState !== "alta" || previous?.paquete)) {
    fail("GES_PAQ: elegí con qué paquete fue el alta");
  }
  if (next.estado === "descartado" && !next.motivo && previousState !== "descartado") {
    fail("GES_MOT: elegí por qué se descarta");
  }
}

function applyProspectStatusRules(next: ProspectRow, previous: ProspectRow | null): void {
  rejectIncompleteProspect(next, previous);
  if (next.estado !== "descartado") next.motivo = null;
  if (next.estado === "alta" || next.estado === "descartado") next.proximo = null;
  if (next.estado === "alta") next.fecha_alta ??= today();
  else next.fecha_alta = null;
}

export function beforeWriteProspect(
  db: CommercialDb,
  user: CloudUser,
  body: Partial<ProspectRow>,
  previous: ProspectRow | null,
): ProspectRow {
  const now = nowIso();
  const defaults: ProspectRow = {
    id: previous ? "" : nextId(db),
    gestion_id: "",
    nombre: "",
    estado: "prospecto",
    cuil: null,
    paquete: null,
    contacto: null,
    referencia: null,
    motivo: null,
    proximo: null,
    fecha_alta: null,
    renta: null,
    creado_por: user.id,
    created_at: now,
    updated_at: now,
  };
  const next: ProspectRow = { ...(previous ?? defaults), ...body };
  next.nombre = (next.nombre || "").trim();
  checkProspectName(next.nombre);
  next.cuil = normalizedCuil(next.cuil);
  next.contacto = trimmedOrNull(next.contacto);
  next.referencia = trimmedOrNull(next.referencia);
  if (previous) {
    next.id = previous.id;
    next.gestion_id = previous.gestion_id;
    next.creado_por = previous.creado_por;
    next.created_at = previous.created_at;
  } else {
    next.creado_por = user.id;
  }
  next.updated_at = now;
  applyProspectStatusRules(next, previous);
  return next;
}

export function afterWriteProspect(
  db: CommercialDb,
  user: CloudUser,
  next: ProspectRow,
  previous: ProspectRow | null,
): void {
  const previousState = previous?.estado ?? null;
  if (next.estado === "alta" && previousState !== "alta") {
    addEvent(db, next.gestion_id, user, "alta", { nombre: next.nombre, paquete: next.paquete });
  } else if (next.estado === "descartado" && previousState !== "descartado") {
    addEvent(db, next.gestion_id, user, "descarte", { nombre: next.nombre, motivo: next.motivo });
  }
}
