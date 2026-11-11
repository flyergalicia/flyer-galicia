import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useBackend } from "@/shared/supabase/index.ts";
import {
  PROPOSAL_MESSAGES_QUERY_KEY,
  type ProposalMessage,
  readProposalMessages,
} from "../api/proposals.ts";

const NO_MESSAGES: readonly never[] = [];

/** The conversation of each proposal, with the proposals it is asked for. */
export function useProposalMessages(ids: readonly string[]) {
  const { db } = useBackend();
  const sorted = useMemo(() => ids.toSorted(), [ids]);
  const { data, refetch } = useQuery({
    queryKey: [...PROPOSAL_MESSAGES_QUERY_KEY, sorted],
    enabled: sorted.length > 0,
    queryFn: () => readProposalMessages(db, sorted),
  });
  return useMemo(() => {
    const byProposal = new Map<string, ProposalMessage[]>();
    for (const message of data ?? NO_MESSAGES) {
      byProposal.set(message.propuesta_id, [
        ...(byProposal.get(message.propuesta_id) ?? []),
        message,
      ]);
    }
    return { byProposal, reload: refetch };
  }, [data, refetch]);
}
