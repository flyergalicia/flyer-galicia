import {
  type CloudHandler,
  emptyReply,
  jsonBody,
  jsonReply,
  contentRange,
  requestedWindow,
} from "../http.ts";
import { storedSession } from "../users.ts";

/** The list of profiles; a filter like role=neq.admin answers what the database would. */
export const listProfiles: CloudHandler = ({ wantsObject, state, query }) => {
  if (wantsObject || !state.profiles) return undefined;
  const excluded = query.get("role")?.replace(/^neq\./, "");
  return jsonReply(state.profiles.filter((row) => row.role !== excluded));
};

export const listSavedAdvisors: CloudHandler = ({ state }) => jsonReply(state.savedAdvisors);

export const updateProfile: CloudHandler = (request) => {
  const body = jsonBody(request);
  if ("flyer_fav" in body) request.state.favorites[request.user.id] = body.flyer_fav;
  if ("facultades" in body) request.state.ownFaculties[request.user.id] = body.facultades;
  const id = request.query.get("id")?.replace(/^eq\./, "");
  const email = request.query.get("email")?.replace(/^eq\./, "");
  for (const row of request.state.profiles ?? []) {
    if (row.id === id || (email !== undefined && row.email === email)) Object.assign(row, body);
  }
  return emptyReply(204);
};

export const readOwnProfile: CloudHandler = ({ user, wantsObject, state }) => {
  const row = {
    id: user.id,
    role: user.role,
    full_name: user.name,
    email: user.email,
    status: state.ownProfileStatus,
    email_asesor: user.email,
    facultades: state.ownFaculties[user.id] ?? null,
    flyer_fav: state.favorites[user.id] ?? null,
    es_prueba: state.isTestAccount,
  };
  return jsonReply(wantsObject ? row : [row]);
};

export const writeFlyerLog: CloudHandler = (request) => {
  request.state.flyerLogWrites.push(jsonBody(request));
  return emptyReply(201);
};

export const listFlyerLogs: CloudHandler = (request) => {
  const logs = request.state.flyerLogs;
  if (!logs) return undefined;
  const since = (request.query.get("created_at") ?? "").replace(/^gte\./, "");
  const rows = logs.filter((row) => !since || String(row.created_at) >= since);
  const { start, limit } = requestedWindow(request);
  const page = rows.slice(start, start + limit);
  return jsonReply(page, 200, { "Content-Range": contentRange(start, page.length, rows.length) });
};

/** The password grant: the same answer supabase-js would get. */
export const signInWithPassword: CloudHandler = ({ state, user }) => {
  const refusal = state.signInRefusal;
  if (refusal === "offline") return { abort: "connectionreset" };
  if (refusal) return jsonReply({ error_code: "x", msg: refusal.message }, refusal.status);
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const session = JSON.parse(storedSession(user)) as Record<string, unknown>;
  return jsonReply({ ...session, expires_at: expiresAt });
};

export const signOut: CloudHandler = ({ state }) => {
  state.signOuts += 1;
  return emptyReply(204);
};
