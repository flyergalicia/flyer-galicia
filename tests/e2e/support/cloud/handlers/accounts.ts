import { type CloudReply, type CloudRequest, jsonBody, jsonReply } from "../http.ts";
import { type CloudState, type Row } from "../state.ts";

const ACTIVATING = new Set(["approve_user", "approve_reset", "deny_reset"]);

function createAccount(state: CloudState, body: Row): void {
  state.sequence += 1;
  state.profiles?.push({
    id: `00000000-0000-4000-8000-${String(state.sequence).padStart(12, "0")}`,
    full_name: body.full_name,
    email: body.email,
    email_asesor: body.email,
    role: body.role,
    status: body.status,
    created_at: new Date().toISOString(),
  });
}

/** What auth-admin leaves in the profiles, so the list the panel reads again shows it. */
function applyToProfiles(state: CloudState, body: Row): void {
  const { action, uid } = body;
  if (!state.profiles) return;
  if (action === "create_user") createAccount(state, body);
  if (action === "delete_user") state.profiles = state.profiles.filter((row) => row.id !== uid);
  if (typeof action === "string" && ACTIVATING.has(action)) {
    for (const row of state.profiles) {
      if (row.id === uid) row.status = "active";
    }
  }
}

/** The actions on accounts of auth-admin; undefined when the action is another one. */
export function answerAccountAction({ state }: CloudRequest, body: Row): CloudReply | undefined {
  const refusal = state.adminRefusal;
  if (refusal !== null && refusal.action === body.action) {
    return jsonReply({ error: refusal.message }, refusal.status);
  }
  applyToProfiles(state, body);
  return undefined;
}

/** The change of one's own password that supabase-js sends. */
export function changeOwnPassword(request: CloudRequest): CloudReply {
  const { state, user } = request;
  const refusal = state.passwordChangeRefusal;
  if (refusal) return jsonReply({ error_code: "x", msg: refusal.message }, refusal.status);
  const { password } = jsonBody<{ password?: string }>(request);
  if (password) state.passwordChanges.push(password);
  return jsonReply({ id: user.id, aud: "authenticated", role: "authenticated", email: user.email });
}

/** The number on the button of the panel: `count: exact` with no rows. */
export function countProfiles({ state, query }: CloudRequest): CloudReply | undefined {
  if (!state.profiles) return undefined;
  const statuses = /^in\.\((.*)\)$/.exec(query.get("status") ?? "")?.[1]?.split(",");
  const rows = state.profiles.filter((row) => !statuses || statuses.includes(String(row.status)));
  return jsonReply(null, 200, { "Content-Range": `*/${String(rows.length)}` });
}
