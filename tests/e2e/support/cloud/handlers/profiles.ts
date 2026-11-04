import {
  type CloudHandler,
  emptyReply,
  jsonBody,
  jsonReply,
  contentRange,
  requestedWindow,
} from "../http.ts";

export const listProfiles: CloudHandler = ({ wantsObject, state }) =>
  !wantsObject && state.profiles ? jsonReply(state.profiles) : undefined;

export const updateProfile: CloudHandler = (request) => {
  const body = jsonBody(request);
  if ("flyer_fav" in body) request.state.favorites[request.user.id] = body.flyer_fav;
  return emptyReply(204);
};

export const readOwnProfile: CloudHandler = ({ user, wantsObject, state }) => {
  const row = {
    id: user.id,
    role: user.role,
    full_name: user.name,
    email: user.email,
    status: "active",
    email_asesor: user.email,
    facultades: null,
    flyer_fav: state.favorites[user.id] ?? null,
    es_prueba: state.isTestAccount,
  };
  return jsonReply(wantsObject ? row : [row]);
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
