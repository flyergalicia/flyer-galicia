import { useQuery } from "@tanstack/react-query";
import { type Backend, useBackend } from "@/shared/supabase/index.ts";

/** After changing an account, invalidate this one and the number on the button follows. */
export const PENDING_ACCOUNTS_QUERY_KEY = ["admin", "pending-accounts"] as const;

async function countPendingAccounts(db: Backend["db"]): Promise<number> {
  const { count } = await db
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "reset_pending"]);
  return count ?? 0;
}

/** How many accounts wait for the administrator. Without an answer, none. */
export function usePendingAccounts(): number {
  const { db } = useBackend();
  const { data } = useQuery({
    queryKey: PENDING_ACCOUNTS_QUERY_KEY,
    queryFn: () => countPendingAccounts(db),
  });
  return data ?? 0;
}
