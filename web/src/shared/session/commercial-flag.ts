import { useQuery } from "@tanstack/react-query";
import { type Backend, useBackend } from "@/shared/supabase/index.ts";
import { usePermissions, useSession } from "./session-context.ts";

/**
 * The switch of Gestiones (table app_flags, from the panel of the administrator). "off": it does
 * not exist for anybody. "prueba": only administrators and test accounts. "on": as the permissions
 * say, and a leader always. Reading it fails like being off, as it does today.
 */
export const COMMERCIAL_FLAG_QUERY_KEY = ["session", "commercial-flag"] as const;

async function readCommercialFlag(db: Backend["db"]): Promise<string> {
  const { data, error } = await db
    .from("app_flags")
    .select("valor")
    .eq("clave", "gestiones")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.valor ?? "off";
}

export interface CommercialSubject {
  readonly flag: string;
  readonly isAdmin: boolean;
  readonly isTestAccount: boolean;
  readonly isLeader: boolean;
  readonly canUseThem: boolean;
}

export function commercialActionsOn(subject: CommercialSubject): boolean {
  const { flag, isAdmin, isTestAccount, isLeader, canUseThem } = subject;
  if (flag === "prueba") return isAdmin || isTestAccount;
  return flag === "on" && (isLeader || canUseThem);
}

export interface CommercialFlagValue {
  readonly on: boolean;
  readonly settled: boolean;
}

export function useCommercialActionsFlag(enabled = true): CommercialFlagValue {
  const { db } = useBackend();
  const session = useSession();
  const { can, isLeader } = usePermissions();
  const { data, isError, isSuccess } = useQuery({
    queryKey: COMMERCIAL_FLAG_QUERY_KEY,
    queryFn: () => readCommercialFlag(db),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const signedIn = session.status === "signed-in" ? session : null;
  return {
    on: commercialActionsOn({
      flag: data ?? "off",
      isAdmin: signedIn?.isAdmin ?? false,
      isTestAccount: signedIn?.profile.es_prueba ?? false,
      isLeader,
      canUseThem: can("gestiones"),
    }),
    settled: isSuccess || isError,
  };
}
