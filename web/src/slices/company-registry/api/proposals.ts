// What the owner of a company, or their substitute, answers to a proposed change, and what is
// written about it. Everything that writes goes through functions of the database.
import type { Proposal } from "@/shared/lib/company-registry/proposals-query.ts";
import type { CompanyOfficer } from "@/shared/domain/company-registry/index.ts";
import type { Backend, Database, RpcFailure } from "@/shared/supabase/index.ts";

export const PROPOSAL_MESSAGES_QUERY_KEY = ["company-registry", "proposal-messages"] as const;
export const COLLEAGUES_QUERY_KEY = ["company-registry", "colleagues"] as const;
export const MY_SUBSTITUTE_QUERY_KEY = ["company-registry", "my-substitute"] as const;

export type ProposalMessage = Database["public"]["Tables"]["padron_propuesta_mensajes"]["Row"];
export type ProposalAction = "aprobar" | "consultar" | "rechazar";

export interface Colleague {
  readonly id: string;
  readonly nombre: string;
}

export type { Proposal };

export async function readProposalMessages(
  db: Backend["db"],
  ids: readonly string[],
): Promise<readonly ProposalMessage[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db
    .from("padron_propuesta_mensajes")
    .select("*")
    .in("propuesta_id", [...ids])
    .order("created_at", { ascending: true });
  // Without the conversation the card still shows what is proposed.
  return error ? [] : data;
}

export async function answerProposal(
  { rpc }: Pick<Backend, "rpc">,
  id: string,
  action: ProposalAction,
  text: string,
): Promise<RpcFailure | null> {
  const answers = {
    aprobar: () => rpc("padron_propuesta_aprobar", { p_id: id, p_comentario: text || null }),
    consultar: () => rpc("padron_propuesta_consultar", { p_id: id, p_texto: text }),
    rechazar: () => rpc("padron_propuesta_rechazar", { p_id: id, p_motivo: text || null }),
  };
  const answer = await answers[action]();
  return answer.ok ? null : answer.error;
}

function colleagueOf(row: unknown): Colleague[] {
  if (typeof row !== "object" || row === null) return [];
  const id: unknown = Reflect.get(row, "id");
  const name: unknown = Reflect.get(row, "nombre");
  return typeof id === "string" && typeof name === "string" ? [{ id, nombre: name }] : [];
}

export async function readColleagues({ rpc }: Pick<Backend, "rpc">): Promise<readonly Colleague[]> {
  const answer = await rpc("colegas_para_suplente");
  return answer.ok && Array.isArray(answer.value) ? answer.value.flatMap(colleagueOf) : [];
}

export async function readMySubstitute(db: Backend["db"], userId: string): Promise<string | null> {
  const { data } = await db.from("profiles").select("suplente_id").eq("id", userId).single();
  return data?.suplente_id ?? null;
}

export async function saveMySubstitute(
  db: Backend["db"],
  userId: string,
  substitute: string | null,
): Promise<string | null> {
  const { error } = await db.from("profiles").update({ suplente_id: substitute }).eq("id", userId);
  return error ? error.message : null;
}

export async function answerQuestion(
  { rpc }: Pick<Backend, "rpc">,
  id: string,
  text: string,
  officers: readonly CompanyOfficer[],
): Promise<RpcFailure | null> {
  const answer = await rpc("padron_propuesta_responder", {
    p_id: id,
    p_texto: text,
    p_asesores: officers.map(({ nombre, celular, email }) => ({ nombre, celular, email })),
  });
  return answer.ok ? null : answer.error;
}
