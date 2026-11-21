// Proposing a change of officers goes through a function of the database: the list of companies is
// never touched from here, and nothing changes until the owner approves it.
import type { CompanyOfficer } from "@/shared/domain/company-registry/index.ts";
import type { Backend, RpcFailure } from "@/shared/supabase/index.ts";

export interface OfficerProposal {
  readonly empresa: string;
  readonly owner: string;
  readonly officers: readonly CompanyOfficer[];
  readonly note: string;
}

export async function proposeOfficers(
  { rpc }: Pick<Backend, "rpc">,
  { empresa, owner, officers, note }: OfficerProposal,
): Promise<RpcFailure | null> {
  const answer = await rpc("padron_propuesta_crear", {
    p_empresa: empresa,
    p_dueno: owner,
    p_asesores: officers.map(({ nombre, celular, email }) => ({ nombre, celular, email })),
    p_nota: note || null,
  });
  return answer.ok ? null : answer.error;
}
