// What the header knows of Gestiones without opening it: it goes in the first load, so it is small.
// Each extra read fails alone: if it does not work, the notices it has always had remain.
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useCommercialActionsFlag, usePermissions, useSession } from "@/shared/session/index.ts";
import { type Backend, useBackend } from "@/shared/supabase/index.ts";
import {
  type CommercialNotice,
  type NewActionRow,
  noticesOf,
  type ToAssignRow,
  type UnreadMessagesRow,
} from "./commercial-notices.ts";

export const COMMERCIAL_NOTICES_QUERY_KEY = ["commercial-actions", "notices"] as const;

const REFRESH_MS = 90_000;
const NEW_ACTIONS_MAX = 200;
const TO_ASSIGN_MAX = 100;
const NEW_ACTION_COLUMNS =
  "serie_id,empresa,origen,estado,creada_por,hunter_id,dueno_id,visto_hunter,visto_dueno";
const NOTHING: readonly CommercialNotice[] = [];

function isUnreadMessages(value: unknown): value is UnreadMessagesRow {
  return typeof value === "object" && value !== null && "gestion_id" in value;
}

async function readMessages({ rpc }: Pick<Backend, "rpc">): Promise<readonly UnreadMessagesRow[]> {
  const answer = await rpc("gestiones_mensajes_nuevos");
  if (!answer.ok || !Array.isArray(answer.value)) return [];
  return (answer.value as unknown[]).filter(isUnreadMessages);
}

async function readNewActions({ db }: Pick<Backend, "db">, me: string) {
  const { data, error } = await db
    .from("gestiones")
    .select(NEW_ACTION_COLUMNS)
    .or(`and(hunter_id.eq.${me},visto_hunter.eq.false),and(dueno_id.eq.${me},visto_dueno.eq.false)`)
    .order("created_at", { ascending: false })
    .limit(NEW_ACTIONS_MAX);
  if (error) throw new Error(error.message);
  return (data ?? []) as readonly NewActionRow[];
}

async function readToAssign({ db }: Pick<Backend, "db">, me: string) {
  try {
    const { data, error } = await db
      .from("gestiones")
      .select("serie_id,empresa,creada_por")
      .eq("lider_id", me)
      .is("hunter_id", null)
      .eq("estado", "planificada")
      .limit(TO_ASSIGN_MAX);
    return error ? [] : ((data ?? []) as readonly ToAssignRow[]);
  } catch {
    return [];
  }
}

/** What is waiting for this person. With Gestiones off, nothing, and nothing is asked. */
export function useCommercialNotices() {
  const backend = useBackend();
  const session = useSession();
  const { isLeader } = usePermissions();
  const { on } = useCommercialActionsFlag();
  const me = session.status === "signed-in" ? session.user.id : "";
  const { data, isSuccess } = useQuery({
    queryKey: [...COMMERCIAL_NOTICES_QUERY_KEY, me, isLeader],
    enabled: on && Boolean(me),
    refetchInterval: REFRESH_MS,
    staleTime: 0,
    queryFn: async () => {
      const [newActions, messages, toAssign] = await Promise.all([
        readNewActions(backend, me),
        readMessages(backend),
        isLeader ? readToAssign(backend, me) : ([] as readonly ToAssignRow[]),
      ]);
      return noticesOf({ newActions, messages, toAssign }, me);
    },
  });
  return useMemo(
    () => ({ notices: on ? (data ?? NOTHING) : NOTHING, read: isSuccess, on }),
    [data, isSuccess, on],
  );
}
