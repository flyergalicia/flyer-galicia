// The changes waiting for somebody: they go on the name of the person and in the name menu, so they
// are read from the first load, apart from the screens that show them.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { type Backend, type Database, useBackend } from "@/shared/supabase/index.ts";

const LOOK_AGAIN_MS = 90_000;
const MY_LIST_LIMIT = 100;
const SEEN_KEY = "fg_hunprop_visto_";
const MY_COLUMNS =
  "id,dueno_id,empresa_key,empresa,estado,asesores_antes,asesores,created_at,resuelta_at,motivo";

type ProposalRow = Database["public"]["Tables"]["padron_propuestas"]["Row"];

/** A change somebody asked for, as the owner or their substitute sees it. */
export type Proposal = ProposalRow;

/** What a Hunter sees of what they proposed. */
export type MyProposal = Pick<
  ProposalRow,
  | "id"
  | "dueno_id"
  | "empresa_key"
  | "empresa"
  | "estado"
  | "asesores_antes"
  | "asesores"
  | "created_at"
  | "resuelta_at"
  | "motivo"
>;

export const PENDING_PROPOSALS_QUERY_KEY = ["company-registry", "pending-proposals"] as const;
export const MY_PROPOSALS_QUERY_KEY = ["company-registry", "my-proposals"] as const;
const SEEN_QUERY_KEY = ["company-registry", "my-proposals-seen"] as const;

function userIdOf(session: ReturnType<typeof useSession>): string | null {
  return session.status === "signed-in" ? session.user.id : null;
}

async function readOpenProposals(db: Backend["db"], userId: string): Promise<readonly Proposal[]> {
  const { data, error } = await db
    .from("padron_propuestas")
    .select("*")
    .in("estado", ["pendiente", "consulta"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  // One's own are not reviewed here, unless the company is theirs too: a Hunter simulated over one's
  // own list would stay open forever and hold up new proposals for that company.
  return (data ?? []).filter(
    ({ creada_por, dueno_id }) => creada_por !== userId || dueno_id === userId,
  );
}

const NO_PROPOSALS: readonly never[] = [];

export interface PendingProposals {
  readonly list: readonly Proposal[];
  /** Only what waits for this person: what is under question waits for the hunter. */
  readonly count: number;
  readonly settled: boolean;
  readonly reload: () => Promise<unknown>;
}

/** Everything open that the database lets this person see and that they did not create. */
export function usePendingProposals(): PendingProposals {
  const { db } = useBackend();
  const userId = userIdOf(useSession());
  const { data, isSuccess, isError, refetch } = useQuery({
    queryKey: [...PENDING_PROPOSALS_QUERY_KEY, userId],
    queryFn: () => readOpenProposals(db, userId ?? ""),
    enabled: userId !== null,
    refetchInterval: LOOK_AGAIN_MS,
  });
  const list = data ?? NO_PROPOSALS;
  const reload = useCallback(() => refetch({ cancelRefetch: false }), [refetch]);
  return {
    list,
    count: list.filter(({ estado }) => estado !== "consulta").length,
    settled: isSuccess || isError,
    reload,
  };
}

function seenKey(userId: string | null): string {
  return `${SEEN_KEY}${userId ?? "anon"}`;
}

function readSeen(userId: string | null): string {
  try {
    return localStorage.getItem(seenKey(userId)) ?? "";
  } catch {
    return "";
  }
}

function writeSeen(userId: string | null, when: string): void {
  try {
    localStorage.setItem(seenKey(userId), when);
  } catch {
    // Without the browser's storage it only says the same news again.
  }
}

async function readMyProposals(db: Backend["db"], userId: string): Promise<readonly MyProposal[]> {
  const { data, error } = await db
    .from("padron_propuestas")
    .select(MY_COLUMNS)
    .eq("creada_por", userId)
    .order("created_at", { ascending: false })
    .limit(MY_LIST_LIMIT);
  if (error) throw new Error(error.message);
  return data;
}

export interface MyProposals {
  readonly list: readonly MyProposal[];
  /** Questions waiting for an answer, and what was resolved and not seen yet. */
  readonly news: number;
  readonly questions: number;
  readonly settled: boolean;
  readonly reload: () => Promise<unknown>;
  /** What is on screen now stops counting as news. */
  readonly markSeen: () => void;
}

function isNews({ estado, resuelta_at: resolved }: MyProposal, seen: string): boolean {
  if (estado === "consulta") return true;
  return (estado === "aprobada" || estado === "rechazada") && (resolved ?? "") > seen;
}

/** What a Hunter proposed and how it ended. Nobody else has a list of these. */
export function useMyProposals(): MyProposals {
  const { db } = useBackend();
  const queryClient = useQueryClient();
  const userId = userIdOf(useSession());
  const { isHunter, can } = usePermissions();
  const { data, isSuccess, isError, refetch } = useQuery({
    queryKey: [...MY_PROPOSALS_QUERY_KEY, userId],
    queryFn: () => readMyProposals(db, userId ?? ""),
    enabled: userId !== null && isHunter && can("proponer_oficiales"),
    refetchInterval: LOOK_AGAIN_MS,
  });
  const { data: seen } = useQuery({
    queryKey: [...SEEN_QUERY_KEY, userId],
    queryFn: () => readSeen(userId),
    initialData: () => readSeen(userId),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const list = data ?? NO_PROPOSALS;
  const reload = useCallback(() => refetch({ cancelRefetch: false }), [refetch]);
  const markSeen = useCallback(() => {
    const now = new Date().toISOString();
    writeSeen(userId, now);
    queryClient.setQueryData([...SEEN_QUERY_KEY, userId], now);
  }, [queryClient, userId]);
  return {
    list,
    news: list.filter((proposal) => isNews(proposal, seen)).length,
    questions: list.filter(({ estado }) => estado === "consulta").length,
    settled: isSuccess || isError,
    reload,
    markSeen,
  };
}
