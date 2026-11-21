import { useQuery } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useSession, useSessionActions } from "@/shared/session/index.ts";
import { type CallEdge, useBackend } from "@/shared/supabase/index.ts";

export interface TestAccount {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly email: string;
}

const TEST_ACCOUNTS_QUERY_KEY = ["auth", "test-accounts"] as const;
const NO_ACCOUNTS: readonly TestAccount[] = [];

function text(row: object, key: string): string {
  const value: unknown = Reflect.get(row, key);
  return typeof value === "string" ? value : "";
}

function readAccount(row: unknown): TestAccount | null {
  if (typeof row !== "object" || row === null || !text(row, "id")) return null;
  const email = text(row, "email");
  return {
    id: text(row, "id"),
    name: text(row, "full_name") || email || "Cuenta",
    role: text(row, "role"),
    email,
  };
}

function readAccounts(answer: unknown): readonly TestAccount[] {
  const rows: unknown =
    typeof answer === "object" && answer ? Reflect.get(answer, "cuentas") : null;
  if (!Array.isArray(rows)) return NO_ACCOUNTS;
  return rows.flatMap((row: unknown) => readAccount(row) ?? []);
}

async function fetchAccounts(callEdge: CallEdge): Promise<readonly TestAccount[]> {
  const answer = await callEdge("auth-admin", "cuentas_prueba");
  // It does not offer anything then, and it does not ask again: it is a tool for trying things.
  return answer.ok ? readAccounts(answer.value) : NO_ACCOUNTS;
}

function tokenIn(answer: unknown): string {
  const token: unknown =
    typeof answer === "object" && answer ? Reflect.get(answer, "token_hash") : "";
  return typeof token === "string" ? token : "";
}

export interface AccountSwitch {
  readonly accounts: readonly TestAccount[];
  readonly switchTo: (account: TestAccount) => void;
}

/**
 * Jumping to another test account without its password. The server decides: it gives a permission
 * for one use, only to an administrator or a test account, and only to enter another test account.
 * The browser keeps no password and no session of anybody else.
 */
export function useAccountSwitch(): AccountSwitch {
  const { callEdge } = useBackend();
  const session = useSession();
  const { redeemAccountSwitch } = useSessionActions();
  const toast = useToast();
  const going = useRef(false);
  const signedIn = session.status === "signed-in" ? session : null;
  const offers = signedIn !== null && (signedIn.isAdmin || signedIn.profile.es_prueba);

  const { data } = useQuery({
    queryKey: TEST_ACCOUNTS_QUERY_KEY,
    queryFn: () => fetchAccounts(callEdge),
    enabled: offers,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const switchTo = useCallback(
    (account: TestAccount) => {
      if (going.current) return;
      going.current = true;
      toast.show(`Cambiando a ${account.name}…`);
      const fail = (detail: string): void => {
        going.current = false;
        toast.show(`No se pudo cambiar de cuenta${detail}`);
      };
      void callEdge("auth-admin", "entrar_como", { uid: account.id }).then(async (answer) => {
        const token = answer.ok ? tokenIn(answer.value) : "";
        if (!token) {
          fail(".");
          return;
        }
        const redeemed = await redeemAccountSwitch(token);
        if (!redeemed.ok) fail(`: ${redeemed.error.message}`);
      });
    },
    [callEdge, redeemAccountSwitch, toast],
  );

  return { accounts: data ?? NO_ACCOUNTS, switchTo };
}
