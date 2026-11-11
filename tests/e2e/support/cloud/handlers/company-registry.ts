import { type CloudHandler, databaseError, jsonBody, jsonReply, pagedRows } from "../http.ts";
import { type Row } from "../state.ts";

/**
 * padron_empresas: while the fault is on, the connection drops as it does without network.
 * Rows that name their owner answer only to whoever asks for that owner.
 */
export const companiesTable: CloudHandler = (request) => {
  const { companies, companiesUnreachable } = request.state;
  if (companiesUnreachable) return { abort: "connectionreset" };
  if (!companies) return undefined;
  const owner = request.query.get("user_id")?.replace(/^eq\./, "");
  const rows = owner
    ? companies.filter((row) => row.user_id === undefined || row.user_id === owner)
    : companies;
  return pagedRows(request, rows);
};

/** padron_replace: the rows are not kept, the app holds its own copy after saving. */
export const replaceCompanies: CloudHandler = (request) => {
  const { state } = request;
  state.companyReplaceCalls += 1;
  state.companyReplaceRows.push(jsonBody<{ p_rows: Row[] }>(request).p_rows);
  return state.companyReplaceFails ? databaseError("falla simulada", "XX000", 500) : undefined;
};

/** padron_suplencias: the companies of whoever chose this user as their substitute. */
export const listSubstituteCompanies: CloudHandler = ({ state }) =>
  jsonReply(state.substituteCompanies);

/** padron_suplencia_proponer: the request is kept so a test can read what was sent. */
export const proposeSubstituteChange: CloudHandler = (request) => {
  request.state.substituteRequests.push(jsonBody(request));
  return jsonReply({ id: "p1", origen: "suplente", estado: "pendiente" });
};

/** padron_propuestas: the changes waiting for this user's decision. */
export const proposalsTable: CloudHandler = ({ state, query }) => {
  if (!state.companyProposals) return undefined;
  const author = query.get("creada_por")?.replace(/^eq\./, "");
  const statuses = /^in\.\((.*)\)$/.exec(query.get("estado") ?? "")?.[1]?.split(",");
  return jsonReply(
    state.companyProposals.filter(
      (row) =>
        (author === undefined || row.creada_por === author) &&
        (!statuses || statuses.includes(String(row.estado))),
    ),
  );
};

/** padron_propuesta_mensajes: the conversation of each proposal. */
export const proposalMessagesTable: CloudHandler = ({ state }) => jsonReply(state.proposalMessages);

/** padron_propuesta_responder: the hunter answers; the proposal waits for the owner again. */
export const answerProposal: CloudHandler = (request) => {
  const { state, user } = request;
  if (state.proposalAnswerFails) return databaseError("falla simulada", "XX000", 500);
  const body = jsonBody(request);
  state.proposalAnswers.push(body);
  for (const row of state.companyProposals ?? []) {
    if (row.id === body.p_id)
      Object.assign(row, { estado: "pendiente", asesores: body.p_asesores });
  }
  state.proposalMessages.push({
    id: `m${String(state.proposalMessages.length + 1)}`,
    propuesta_id: body.p_id,
    rol: "hunter",
    tipo: "respuesta",
    autor_nombre: user.name,
    texto: body.p_texto,
    created_at: new Date().toISOString(),
  });
  return jsonReply(null);
};
