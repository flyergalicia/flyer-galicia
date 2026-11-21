// Who is on Gestiones, by id: the notices of the header need their names, and the screens of the
// slice their roles and leaders. There is one read of them for everybody.
import { type QueryClient, useQuery } from "@tanstack/react-query";
import { type Backend, useBackend } from "@/shared/supabase/index.ts";

export const COMMERCIAL_PEOPLE_QUERY_KEY = ["commercial-actions", "people"] as const;
/** What the agenda reads: the hunters of each one come from there. */
export const COMMERCIAL_AGENDA_QUERY_KEY = ["commercial-actions", "agenda"] as const;

/** Somebody changed profile or leader: the teams of Gestiones and its agenda are read again. */
export function invalidateTeams(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: COMMERCIAL_PEOPLE_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: COMMERCIAL_AGENDA_QUERY_KEY });
}

export interface CommercialPerson {
  readonly id: string;
  readonly nombre: string;
  readonly rol: string;
  readonly lider_id?: string | null;
  readonly es_prueba?: boolean;
}

export type CommercialPeople = Readonly<Record<string, CommercialPerson>>;

const NOBODY: CommercialPeople = {};

function isPerson(value: unknown): value is CommercialPerson {
  return typeof value === "object" && value !== null && "id" in value && "nombre" in value;
}

/** A failure stays a failure: it does not get written down as nobody (invariant 24). */
export async function readCommercialPeople({ rpc }: Pick<Backend, "rpc">) {
  const answer = await rpc("gestiones_personas");
  if (!answer.ok) throw new Error(answer.error.message);
  const rows = Array.isArray(answer.value) ? (answer.value as unknown[]) : [];
  return Object.fromEntries(rows.filter(isPerson).map((person) => [person.id, person]));
}

export function useCommercialPeople(enabled = true) {
  const backend = useBackend();
  const { data, isError, isPending, refetch } = useQuery({
    queryKey: COMMERCIAL_PEOPLE_QUERY_KEY,
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () => readCommercialPeople(backend),
  });
  return { people: data ?? NOBODY, failed: isError, isLoading: isPending, reload: refetch };
}
