// The accounts: read with the session of the administrator (RLS), changed through auth-admin when a
// mail or a password is involved. A refusal is said as the server said it.
import type { Backend } from "@/shared/supabase/index.ts";
import type { Account } from "../model/accounts.ts";

export const ACCOUNTS_QUERY_KEY = ["admin", "accounts"] as const;

export async function readAccounts(db: Backend["db"]): Promise<readonly Account[]> {
  const { data, error } = await db
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

/** Empty when it went well; otherwise what the database said. */
export async function setStatus(db: Backend["db"], id: string, status: string): Promise<string> {
  const { error } = await db.from("profiles").update({ status }).eq("id", id);
  return error ? error.message : "";
}

export interface AccountChange {
  readonly full_name: string;
  readonly role: string;
  readonly status: string;
  readonly lider_id: string | null;
}

export async function saveAccount(
  db: Backend["db"],
  id: string,
  change: AccountChange,
): Promise<string> {
  const { error } = await db.from("profiles").update(change).eq("id", id);
  return error ? error.message : "";
}

/** auth-admin does not know about leaders: it goes after the account exists, by its mail. */
export async function setLeaderByEmail(
  db: Backend["db"],
  email: string,
  leader: string,
): Promise<void> {
  await db.from("profiles").update({ lider_id: leader }).eq("email", email.toLowerCase());
}
