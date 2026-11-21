// The accounts of Admin → Usuarios: what each status says and what can be done with it.
import type { Database } from "@/shared/supabase/index.ts";

export type Account = Database["public"]["Tables"]["profiles"]["Row"] & {
  readonly created_at?: string | null;
};

export type AccountStatus = "active" | "inactive" | "pending" | "reset_pending";

/** What a button of a row does, by its text. */
export type AccountAction =
  | "approve"
  | "reject"
  | "approve-reset"
  | "deny-reset"
  | "deactivate"
  | "activate"
  | "edit";

export interface AccountButton {
  readonly action: AccountAction;
  readonly label: string;
  readonly tone: "ok" | "warn" | "edit";
  readonly hint?: string;
}

const PENDING_BUTTONS: readonly AccountButton[] = [
  { action: "approve", label: "Aprobar", tone: "ok" },
  { action: "reject", label: "Rechazar", tone: "warn" },
];

const RESET_BUTTONS: readonly AccountButton[] = [
  {
    action: "approve-reset",
    label: "Aprobar cambio",
    tone: "ok",
    hint: "Aplica la nueva clave que pidió el usuario",
  },
  {
    action: "deny-reset",
    label: "Rechazar",
    tone: "warn",
    hint: "Descarta el pedido, la cuenta sigue con su clave anterior",
  },
];

const EDIT: AccountButton = { action: "edit", label: "Editar", tone: "edit" };

/** Pending: approve or reject. A change of password: apply it or not. Otherwise, on or off. */
export function accountButtons({ status }: Pick<Account, "status">): readonly AccountButton[] {
  if (status === "pending") return PENDING_BUTTONS;
  if (status === "reset_pending") return RESET_BUTTONS;
  const toggle: AccountButton =
    status === "active"
      ? { action: "deactivate", label: "Desactivar", tone: "warn" }
      : { action: "activate", label: "Activar", tone: "ok" };
  return [toggle, EDIT];
}

export function statusLabel(status: string | null): string {
  if (status === "active") return "Activo";
  if (status === "pending") return "Pendiente";
  if (status === "reset_pending") return "Cambio de clave";
  return "Inactivo";
}

/** The tone of its badge: a change of password waits like a new account. */
export function statusTone(status: string | null): "green" | "amber" | "red" {
  if (status === "active") return "green";
  if (status === "pending" || status === "reset_pending") return "amber";
  return "red";
}

export function isWaiting({ status }: Pick<Account, "status">): boolean {
  return status === "pending" || status === "reset_pending";
}

/** Whoever is waiting for a decision has no profile yet to show. */
export function showsRole({ status }: Pick<Account, "status">): boolean {
  return status !== "pending";
}

export function accountName({ full_name, email_asesor }: Account): string {
  return full_name || email_asesor || "";
}

/** One does not delete oneself. */
export function canBeDeleted({ id }: Pick<Account, "id">, myId: string | null): boolean {
  return id !== myId;
}

/** "Buscar por nombre o email..." and the status of the filter. */
export function filterAccounts(
  accounts: readonly Account[],
  query: string,
  status: string,
): readonly Account[] {
  const text = query.toLowerCase();
  return accounts.filter((account) => {
    const mail = (account.email_asesor ?? "").toLowerCase();
    const matches =
      !text || (account.full_name ?? "").toLowerCase().includes(text) || mail.includes(text);
    return matches && (!status || account.status === status);
  });
}

/** Who a person can answer to: the leaders, never oneself. */
export function leadersFor(accounts: readonly Account[], self: string | null): readonly Account[] {
  return accounts.filter(({ role, id }) => role === "lider" && id !== self);
}

export function leaderName({ full_name, email }: Account): string {
  return full_name || email || "Sin nombre";
}
