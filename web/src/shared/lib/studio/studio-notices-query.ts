// What is known about Estudio without opening it: the number on its tab and on the envelope of the
// header, and whether the tab is there at all (a copy shared by the administrator brings it, even
// without the permission). It goes in the first load: it stays small.
import { type QueryClient, useQuery } from "@tanstack/react-query";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";

export const STUDIO_NOTICES_QUERY_KEY = ["studio", "notices"] as const;
const REFRESH_MS = 90_000;
const COLUMNS = "id,nombre,estado,compartido_por,compartido_at";

/** One design of this person, as far as the notices go. */
export interface MyDesignNotice {
  readonly id: string;
  readonly nombre: string;
  readonly estado: string;
  readonly compartido_por: string | null;
  readonly compartido_at: string | null;
}

/** What each one has to hear: an administrator, the requests; the others, their designs. */
export interface StudioNotices {
  readonly requests: number;
  readonly mine: readonly MyDesignNotice[];
}

const NOTHING: StudioNotices = { requests: 0, mine: [] };

function isMyDesign(value: unknown): value is MyDesignNotice {
  return typeof value === "object" && value !== null && "estado" in value;
}

/** Estudio knows it better when it is open: it writes it here, and nothing is read twice. */
export function noteMyDesigns(queryClient: QueryClient, mine: readonly MyDesignNotice[]): void {
  queryClient.setQueryData<StudioNotices>(STUDIO_NOTICES_QUERY_KEY, { requests: 0, mine });
}

export function noteRequests(queryClient: QueryClient, requests: number): void {
  queryClient.setQueryData<StudioNotices>(STUDIO_NOTICES_QUERY_KEY, { requests, mine: [] });
}

export function useIsAdministrator(): boolean {
  const session = useSession();
  return session.status === "signed-in" && session.isAdmin;
}

export function usePersonId(): string {
  const session = useSession();
  return session.status === "signed-in" ? session.user.id : "";
}

/** The admin hears the requests when Estudio is on for them; the rest, always, unless hunter or leader. */
export function useStudioNotices(): StudioNotices & { readonly settled: boolean } {
  const { db } = useBackend();
  const { can, isHunter, isLeader } = usePermissions();
  const isAdmin = useIsAdministrator();
  const personId = usePersonId();
  const {
    data = NOTHING,
    isSuccess,
    isError,
  } = useQuery({
    queryKey: STUDIO_NOTICES_QUERY_KEY,
    enabled: Boolean(personId) && !isHunter && !isLeader && (!isAdmin || can("estudio")),
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<StudioNotices> => {
      if (isAdmin) {
        const { count, error } = await db
          .from("flyer_disenos")
          .select("id", { count: "exact", head: true })
          .eq("estado", "pedido")
          .in("tipo", ["diseno", "fuente"]);
        if (error) throw error;
        return { requests: count ?? 0, mine: [] };
      }
      const { data: rows, error } = await db
        .from("flyer_disenos")
        .select(COLUMNS)
        .eq("user_id", personId)
        .eq("tipo", "diseno");
      if (error) throw error;
      return { requests: 0, mine: (rows ?? []).filter(isMyDesign) };
    },
  });
  return { ...data, settled: isSuccess || isError };
}

export function questionsOf({ mine }: StudioNotices): readonly MyDesignNotice[] {
  return mine.filter(({ estado }) => estado === "consulta");
}

/** How many designs of this person came from the administrator: with one, the tab is there. */
export function sharedCount({ mine }: StudioNotices): number {
  return mine.filter(({ compartido_por: from }) => Boolean(from)).length;
}
