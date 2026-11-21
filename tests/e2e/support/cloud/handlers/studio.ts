// Studio tables and functions, with the rules of migrations 026 and 034.
import {
  CORS_HEADERS,
  type CloudHandler,
  type CloudReply,
  type CloudRequest,
  contentRange,
  databaseError,
  emptyReply,
  jsonBody,
  jsonReply,
  nowIso,
  requestedWindow,
} from "../http.ts";
import { type DesignRow, type Row } from "../state.ts";

const RLS_VIOLATION = "new row violates row-level security policy";
const ADMIN_ONLY_COLUMNS = [
  "nota_admin",
  "opcion_publicada",
  "revisado_at",
  "user_id",
  "autor",
  "compartido_por",
  "compartido_de",
  "compartido_at",
] as const;

function newDesignId(request: CloudRequest): string {
  request.state.sequence += 1;
  return `d${String(request.state.sequence)}-0000-4000-8000-000000000000`;
}

function eqFilter(request: CloudRequest, column: string): string {
  return (request.query.get(column) ?? "").replace(/^eq\./, "");
}

function canSee({ user }: CloudRequest, design: DesignRow): boolean {
  return user.role === "admin" || design.user_id === user.id;
}

function stateFilter(request: CloudRequest): (design: DesignRow) => boolean {
  const raw = request.query.get("estado") ?? "";
  if (raw.startsWith("eq.")) return (design) => design.estado === raw.slice(3);
  if (raw.startsWith("in.")) {
    const allowed = new Set(
      raw
        .slice(4, -1)
        .split(",")
        .map((item) => item.replace(/"/g, "")),
    );
    return (design) => allowed.has(design.estado);
  }
  return () => true;
}

function textOf(value: unknown): unknown {
  return typeof value === "number" || typeof value === "boolean" ? String(value) : value;
}

/** Plain columns and JSON paths with an alias (v:datos->>v is text, v:datos->v is JSON). */
function projectColumn(design: Row, projected: Row, key: string): void {
  const path = /^(\w+):(\w+)->(>?)(\w+)$/.exec(key);
  if (!path) {
    if (key in design) projected[key] = design[key];
    return;
  }
  const [, alias = "", column = "", asText, field = ""] = path;
  const parent = design[column];
  const value = parent && typeof parent === "object" ? (parent as Row)[field] : undefined;
  projected[alias] = value == null ? null : asText ? textOf(value) : value;
}

function project(request: CloudRequest, design: DesignRow): Row {
  const select = request.query.get("select") ?? "*";
  if (select === "*") return design;
  const projected: Row = {};
  for (const key of select.split(",")) projectColumn(design, projected, key);
  return projected;
}

/** Reads only honour estado=eq: the app's in.(...) reads get every state, as they always did. */
function hasRequestedState(request: CloudRequest, design: DesignRow): boolean {
  const estado = eqFilter(request, "estado");
  return !estado || estado.startsWith("in.") || design.estado === estado;
}

function countDesigns(request: CloudRequest): CloudReply {
  const total = request.state.designs.filter(
    (design) => canSee(request, design) && hasRequestedState(request, design),
  ).length;
  return { status: 200, headers: { ...CORS_HEADERS, "Content-Range": `*/${String(total)}` } };
}

function listDesigns(request: CloudRequest): CloudReply {
  const owner = eqFilter(request, "user_id");
  const id = eqFilter(request, "id");
  const kind = eqFilter(request, "tipo");
  const rows = request.state.designs
    .filter(
      (design) =>
        canSee(request, design) &&
        (!owner || design.user_id === owner) &&
        (!id || design.id === id) &&
        hasRequestedState(request, design) &&
        (!kind || (design.tipo || "diseno") === kind),
    )
    .toSorted((a, b) => b.updated_at.localeCompare(a.updated_at));
  const { start, limit } = requestedWindow(request);
  const page = rows.slice(start, start + limit).map((design) => project(request, design));
  if (request.wantsObject) {
    return page.length > 0
      ? jsonReply(page[0])
      : jsonReply({ message: "no rows", code: "PGRST116" }, 406);
  }
  return jsonReply(page, 200, { "Content-Range": contentRange(start, page.length, rows.length) });
}

function createDesign(request: CloudRequest): CloudReply {
  const { user, state, wantsObject } = request;
  const body = jsonBody(request);
  const estado = typeof body.estado === "string" ? body.estado : "privado";
  if (!["privado", "pedido"].includes(estado)) {
    return jsonReply({ message: RLS_VIOLATION }, 403);
  }
  const now = nowIso();
  const design: DesignRow = {
    id: newDesignId(request),
    user_id: user.id,
    autor: user.name,
    nombre: body.nombre,
    empresa: body.empresa ?? "",
    opcion: body.opcion,
    base_name: body.base_name ?? "",
    datos: body.datos,
    miniatura: body.miniatura ?? "",
    estado,
    tipo: typeof body.tipo === "string" ? body.tipo : "diseno",
    compartido_por: "",
    compartido_de: null,
    compartido_at: null,
    nota_admin: "",
    opcion_publicada: null,
    pedido_at: estado === "pedido" ? now : null,
    revisado_at: null,
    created_at: now,
    updated_at: now,
  };
  state.designs.push(design);
  const row = project(request, design);
  return jsonReply(wantsObject ? row : [row], 201);
}

/** Null when an author asks for something only an administrator can do. */
function authorChanges(design: DesignRow, body: Row): Row | null {
  const { estado } = body;
  const allowed =
    !estado ||
    estado === "privado" ||
    estado === "pedido" ||
    (estado === "consulta" && design.estado === "consulta");
  if (!allowed) return null;
  const changes = { ...body };
  for (const column of ADMIN_ONLY_COLUMNS) {
    Reflect.deleteProperty(changes, column);
  }
  return changes;
}

function updateDesign(request: CloudRequest, design: DesignRow): CloudReply {
  const isAdmin = request.user.role === "admin";
  if (!isAdmin && design.estado === "publicado") return jsonReply([]);
  const changes = isAdmin ? jsonBody(request) : authorChanges(design, jsonBody(request));
  if (!changes) return jsonReply({ message: RLS_VIOLATION }, 403);
  if (changes.estado === "pedido" && design.estado !== "pedido") changes.pedido_at = nowIso();
  const reviewed = changes.estado === "publicado" || changes.estado === "rechazado";
  if (isAdmin && reviewed && changes.estado !== design.estado) changes.revisado_at = nowIso();
  Object.assign(design, changes, { updated_at: nowIso() });
  const row = project(request, design);
  return jsonReply(request.wantsObject ? row : [row]);
}

function deleteDesign({ state, user }: CloudRequest, design: DesignRow): CloudReply {
  if (user.role === "admin" || design.estado !== "publicado") {
    state.designs.splice(state.designs.indexOf(design), 1);
  }
  return emptyReply(204);
}

function changeDesign(request: CloudRequest): CloudReply {
  const id = eqFilter(request, "id");
  const matchesState = stateFilter(request);
  const design = request.state.designs.find((row) => row.id === id && matchesState(row));
  if (!design || !canSee(request, design)) {
    return request.wantsObject
      ? jsonReply({ message: "no rows", code: "PGRST116" }, 406)
      : jsonReply([]);
  }
  return request.method === "DELETE"
    ? deleteDesign(request, design)
    : updateDesign(request, design);
}

export const designsTable: CloudHandler = (request) => {
  const actions: Record<string, (r: CloudRequest) => CloudReply> = {
    HEAD: countDesigns,
    GET: listDesigns,
    POST: createDesign,
    PATCH: changeDesign,
    DELETE: changeDesign,
  };
  return actions[request.method]?.(request);
};

export const designMessagesTable: CloudHandler = (request) => {
  const { state, query } = request;
  const filter = /^in\.\((.*)\)$/.exec(query.get("diseno_id") ?? "")?.[1] ?? "";
  const ids = new Set(filter.split(",").map((item) => item.replace(/"/g, "")));
  const visible = new Set(
    state.designs.filter((design) => canSee(request, design)).map((design) => design.id),
  );
  return jsonReply(
    state.designMessages.filter(
      (message) => ids.has(message.diseno_id) && visible.has(message.diseno_id),
    ),
  );
};

function askQuestion(request: CloudRequest, design: DesignRow, text: unknown): CloudReply {
  const { user, state } = request;
  if (user.role !== "admin") {
    return databaseError("Sólo el administrador puede preguntar", "P0001");
  }
  if (!["pedido", "consulta"].includes(design.estado)) {
    return databaseError("Ese diseño ya no está pedido", "P0001");
  }
  const now = nowIso();
  state.designMessages.push({
    diseno_id: design.id,
    rol: "admin",
    tipo: "consulta",
    texto: text,
    autor_nombre: user.name,
    created_at: now,
  });
  Object.assign(design, { estado: "consulta", updated_at: now });
  return emptyReply(204);
}

function answerQuestion(request: CloudRequest, design: DesignRow, text: unknown): CloudReply {
  const { user, state } = request;
  if (design.user_id !== user.id) {
    return databaseError("Sólo quien pidió la publicación puede responder", "P0001");
  }
  if (design.estado !== "consulta") {
    return databaseError("Ese diseño no tiene una pregunta abierta", "P0001");
  }
  const now = nowIso();
  state.designMessages.push({
    diseno_id: design.id,
    rol: "autor",
    tipo: "respuesta",
    texto: text,
    autor_nombre: user.name,
    created_at: now,
  });
  Object.assign(design, { estado: "pedido", updated_at: now });
  return emptyReply(204);
}

interface ShareOutcome {
  nuevos: string[];
  actualizados: string[];
  salteados: { nombre: string; motivo: string }[];
}

function shareWith(
  request: CloudRequest,
  design: DesignRow,
  recipientId: string,
  outcome: ShareOutcome,
): void {
  const { state, user } = request;
  const recipient = Object.values(state.users).find((candidate) => candidate.id === recipientId);
  if (!recipient) {
    outcome.salteados.push({ nombre: "(usuario borrado)", motivo: "ya no existe" });
    return;
  }
  if (recipientId === user.id || recipientId === design.user_id) {
    outcome.salteados.push({ nombre: recipient.name, motivo: "ya es suyo" });
    return;
  }
  const now = nowIso();
  const copy = {
    nombre: design.nombre,
    empresa: design.empresa,
    opcion: design.opcion,
    base_name: design.base_name,
    datos: structuredClone(design.datos),
    miniatura: design.miniatura,
    estado: "privado",
    nota_admin: "",
    compartido_por: user.name,
    compartido_at: now,
    updated_at: now,
  };
  const existing = state.designs.find(
    (row) => row.user_id === recipientId && row.compartido_de === design.id,
  );
  if (!existing) {
    state.designs.push({
      id: newDesignId(request),
      user_id: recipientId,
      autor: recipient.name,
      tipo: "diseno",
      compartido_de: design.id,
      opcion_publicada: null,
      pedido_at: null,
      revisado_at: null,
      created_at: now,
      ...copy,
    });
    outcome.nuevos.push(recipient.name);
    return;
  }
  if (!["privado", "rechazado"].includes(existing.estado)) {
    outcome.salteados.push({
      nombre: recipient.name,
      motivo: "ya lo tiene y pidió publicarlo",
    });
    return;
  }
  Object.assign(existing, copy);
  outcome.actualizados.push(recipient.name);
}

function shareDesign(request: CloudRequest, design: DesignRow, recipients: string[]): CloudReply {
  if (request.user.role !== "admin") {
    return databaseError("Sólo el administrador puede compartir diseños", "P0001");
  }
  const outcome: ShareOutcome = { nuevos: [], actualizados: [], salteados: [] };
  for (const recipient of new Set(recipients)) shareWith(request, design, recipient, outcome);
  return jsonReply(outcome);
}

interface DesignRpcArgs {
  p_id?: string;
  p_texto?: string;
  p_para?: string[];
}

export const designFunctions: CloudHandler = (request) => {
  const args = jsonBody<DesignRpcArgs>(request);
  const design = request.state.designs.find((row) => row.id === args.p_id);
  if (!design) return databaseError("Ese diseño no existe", "P0001");
  const functions: Record<string, () => CloudReply> = {
    flyer_diseno_consultar: () => askQuestion(request, design, args.p_texto),
    flyer_diseno_responder: () => answerQuestion(request, design, args.p_texto),
    flyer_diseno_compartir: () => shareDesign(request, design, args.p_para ?? []),
  };
  return functions[request.file]?.();
};
