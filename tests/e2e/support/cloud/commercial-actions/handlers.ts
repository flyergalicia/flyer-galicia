import {
  type CloudHandler,
  type CloudReply,
  type CloudRequest,
  contentRange,
  databaseError,
  emptyReply,
  jsonBody,
  jsonReply,
  noRowsReply,
  requestedWindow,
} from "../http.ts";
import { filterRows, selectColumns } from "../postgrest.ts";
import { type CloudState, type Row } from "../state.ts";
import { type CloudUser } from "../users.ts";
import {
  type ActionRow,
  type CommercialDb,
  DatabaseFailure,
  type ProspectRow,
  fail,
  leaderOf,
  profileSummaries,
} from "./model.ts";
import {
  actionById,
  afterInsertAction,
  afterUpdateAction,
  afterWriteProspect,
  beforeInsertAction,
  beforeUpdateAction,
  beforeWriteProspect,
  canEdit,
  canSee,
  canWriteProspects,
  type ProfileLookup,
} from "./rules.ts";
import { COMMERCIAL_RPC, type RpcArgs } from "./rpc.ts";

const NO_LIMIT = 100_000;

interface TableCall {
  request: CloudRequest;
  db: CommercialDb;
  user: CloudUser;
}

function selected(request: CloudRequest, row: object): Row {
  return selectColumns(row, request.query.get("select"));
}

function listRows(request: CloudRequest, rows: readonly object[]): CloudReply {
  const { start, limit } = requestedWindow(request, NO_LIMIT);
  const page = rows.slice(start, start + limit).map((row) => selected(request, row));
  if (request.wantsObject) return page.length === 1 ? jsonReply(page[0]) : noRowsReply();
  return jsonReply(page, 200, { "Content-Range": contentRange(start, page.length, rows.length) });
}

function changedRows(request: CloudRequest, rows: readonly Row[]): CloudReply {
  if (request.wantsObject) return rows.length === 1 ? jsonReply(rows[0]) : noRowsReply();
  return jsonReply(rows);
}

function asArray<T>(body: T | T[]): T[] {
  return Array.isArray(body) ? body : [body];
}

function profileLookup(state: CloudState): ProfileLookup {
  return (id) => profileSummaries(state).find((profile) => profile.id === id) ?? null;
}

/** One by one, as the database does, and all or nothing: a row can overlap one of its batch. */
function insertActions({ request, db, user }: TableCall): CloudReply {
  const before = db.actions;
  db.actions = [...before];
  const inserted: ActionRow[] = [];
  try {
    for (const body of asArray(jsonBody<Partial<ActionRow> | Partial<ActionRow>[]>(request))) {
      const action = beforeInsertAction(db, profileLookup(request.state), user, body);
      db.actions.push(action);
      inserted.push(action);
    }
  } catch (error) {
    db.actions = before;
    throw error;
  }
  for (const action of inserted) afterInsertAction(db, user, action);
  const rows = inserted.map((action) => selected(request, action));
  return jsonReply(request.wantsObject ? rows[0] : rows, 201);
}

function updateActions({ request, db, user }: TableCall): CloudReply {
  const changes = jsonBody<Partial<ActionRow>>(request);
  const editable = db.actions.filter((action) => canEdit(user, action));
  const rows: Row[] = [];
  for (const previous of filterRows(editable, request.query)) {
    const next = beforeUpdateAction(db, user, previous, changes);
    if (!canEdit(user, next)) {
      fail('new row violates row-level security policy for table "gestiones"');
    }
    afterUpdateAction(db, user, next, previous);
    Object.assign(previous, next);
    if (canSee(user, previous)) rows.push(selected(request, previous));
  }
  return changedRows(request, rows);
}

function deleteActions({ request, db, user }: TableCall): CloudReply {
  const deletable = db.actions.filter(
    (action) => user.role === "admin" || action.creada_por === user.id,
  );
  const ids = new Set(filterRows(deletable, request.query).map((action) => action.id));
  db.actions = db.actions.filter((action) => !ids.has(action.id));
  db.prospects = db.prospects.filter((row) => !ids.has(row.gestion_id));
  db.messages = db.messages.filter((row) => !ids.has(row.gestion_id));
  db.readMarks = db.readMarks.filter((row) => !ids.has(row.gestion_id));
  db.events = db.events.filter((row) => !ids.has(row.gestion_id));
  return emptyReply(204);
}

const ACTION_METHODS: Readonly<Record<string, (call: TableCall) => CloudReply>> = {
  GET: ({ request, db, user }) =>
    listRows(
      request,
      filterRows(
        db.actions.filter((action) => canSee(user, action)),
        request.query,
      ),
    ),
  POST: insertActions,
  PATCH: updateActions,
  DELETE: deleteActions,
};

function canSeeProspect({ db, user }: TableCall, prospect: ProspectRow): boolean {
  const action = actionById(db, prospect.gestion_id);
  return Boolean(action && canSee(user, action));
}

function canWriteProspect({ db, user }: TableCall, prospect: ProspectRow): boolean {
  const action = actionById(db, prospect.gestion_id);
  return Boolean(action && canWriteProspects(user, action));
}

function insertProspects({ request, db, user }: TableCall): CloudReply {
  const bodies = asArray(jsonBody<Partial<ProspectRow> | Partial<ProspectRow>[]>(request));
  const inserted = bodies.map((body) => {
    const action = actionById(db, body.gestion_id);
    if (!action || !canWriteProspects(user, action)) {
      fail('new row violates row-level security policy for table "gestion_prospectos"');
    }
    return beforeWriteProspect(db, user, body, null);
  });
  for (const prospect of inserted) {
    db.prospects.push(prospect);
    afterWriteProspect(db, user, prospect, null);
  }
  const rows = inserted.map((prospect) => selected(request, prospect));
  return jsonReply(request.wantsObject ? rows[0] : rows, 201);
}

function updateProspects(call: TableCall): CloudReply {
  const { request, db, user } = call;
  const changes = jsonBody<Partial<ProspectRow>>(request);
  const writable = db.prospects.filter((prospect) => canWriteProspect(call, prospect));
  const rows: Row[] = [];
  for (const previous of filterRows(writable, request.query)) {
    const next = beforeWriteProspect(db, user, changes, previous);
    afterWriteProspect(db, user, next, previous);
    Object.assign(previous, next);
    rows.push(selected(request, previous));
  }
  return changedRows(request, rows);
}

function deleteProspects(call: TableCall): CloudReply {
  const { request, db } = call;
  const writable = db.prospects.filter((prospect) => canWriteProspect(call, prospect));
  const ids = new Set(filterRows(writable, request.query).map((prospect) => prospect.id));
  db.prospects = db.prospects.filter((prospect) => !ids.has(prospect.id));
  return emptyReply(204);
}

const PROSPECT_METHODS: Readonly<Record<string, (call: TableCall) => CloudReply>> = {
  GET: (call) => {
    const visible = call.db.prospects.filter((prospect) => canSeeProspect(call, prospect));
    return listRows(call.request, filterRows(visible, call.request.query));
  },
  POST: insertProspects,
  PATCH: updateProspects,
  DELETE: deleteProspects,
};

function readOnlyHistory(
  rowsOf: (db: CommercialDb) => readonly { gestion_id: string }[],
): (call: TableCall) => CloudReply {
  return ({ request, db, user }) => {
    if (request.method !== "GET") {
      return databaseError("new row violates row-level security policy", "P0001");
    }
    const visible = rowsOf(db).filter((row) => {
      const action = actionById(db, row.gestion_id);
      return action && canSee(user, action);
    });
    return listRows(request, filterRows(visible, request.query));
  };
}

function readFlag({ request, db }: TableCall): CloudReply {
  const wanted = request.query.get("clave");
  const rows = [{ clave: "gestiones", valor: db.flag }].filter(
    (row) => !wanted || wanted === `eq.${row.clave}`,
  );
  return listRows(request, rows);
}

function readOwnProfile({ request, user }: TableCall): CloudReply | undefined {
  if (request.method !== "GET" || request.query.get("id") !== `eq.${user.id}`) return undefined;
  return listRows(request, [
    {
      id: user.id,
      role: user.role,
      full_name: user.name,
      nombre_asesor: user.name,
      celular_asesor: "",
      email_asesor: user.email,
      status: "active",
      facultades: null,
      es_prueba: false,
      lider_id: leaderOf(user.id),
      flyer_fav: null,
    },
  ]);
}

function companiesTable({ request, db, user }: TableCall): CloudReply | undefined {
  if (request.method !== "GET") return undefined;
  const visible = db.companies.filter(
    (company) => user.role === "admin" || user.role === "hunter" || company.user_id === user.id,
  );
  return listRows(request, filterRows(visible, request.query));
}

const TABLES: Readonly<Record<string, (call: TableCall) => CloudReply | undefined>> = {
  app_flags: readFlag,
  profiles: readOwnProfile,
  padron_empresas: companiesTable,
  gestiones: (call) => ACTION_METHODS[call.request.method]?.(call),
  gestion_prospectos: (call) => PROSPECT_METHODS[call.request.method]?.(call),
  gestion_mensajes: readOnlyHistory((db) => db.messages),
  gestion_eventos: readOnlyHistory((db) => db.events),
  gestion_leido: ({ request, db, user }) =>
    listRows(
      request,
      filterRows(
        db.readMarks.filter((row) => row.user_id === user.id),
        request.query,
      ),
    ),
};

const RPC_PATH = /^\/rest\/v1\/rpc\/(.+)$/;
const TABLE_PATH = /^\/rest\/v1\/(.+)$/;

function callFunction(request: CloudRequest, db: CommercialDb, name: string) {
  const fn = COMMERCIAL_RPC[name];
  if (!fn) return undefined;
  const result = fn({
    state: request.state,
    db,
    user: request.user,
    args: jsonBody<RpcArgs>(request),
  });
  return jsonReply(result ?? null);
}

function dispatch(request: CloudRequest, db: CommercialDb): CloudReply | undefined {
  const rpc = RPC_PATH.exec(request.path)?.[1];
  if (rpc) return callFunction(request, db, rpc);
  const table = TABLE_PATH.exec(request.path)?.[1] ?? "";
  return TABLES[table]?.({ request, db, user: request.user });
}

/** The first route of a browser opened with commercial actions: what it skips goes on. */
export const handleCommercialActions: CloudHandler = (request) => {
  const db = request.state.commercialActions;
  if (!db) return undefined;
  try {
    return dispatch(request, db);
  } catch (error) {
    if (error instanceof DatabaseFailure) return databaseError(error.message, error.code);
    throw error;
  }
};
