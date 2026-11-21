// The window of a user: what it checks before going to the server, and what it sends.
import type { Account } from "./accounts.ts";

export const PROFILE_CHOICES = [
  ["asesor", "Asesor"],
  ["vip", "VIP"],
  ["pro", "Pro"],
  ["hunter", "Hunter"],
  ["lider", "Líder"],
  ["admin", "Administrador"],
] as const;

export const STATUS_CHOICES = [
  ["active", "Activo"],
  ["inactive", "Inactivo"],
] as const;

export interface AccountForm {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly role: string;
  readonly status: string;
  readonly leader: string;
  /** "Enviar usuario y contraseña por mail": only when editing, with a new password. */
  readonly sendAccess: boolean;
  readonly sendTo: string;
  readonly sendName: string;
}

export function newAccountForm(): AccountForm {
  return {
    name: "",
    email: "",
    password: "",
    role: "asesor",
    status: "active",
    leader: "",
    sendAccess: false,
    sendTo: "",
    sendName: "",
  };
}

export function editAccountForm(account: Account): AccountForm {
  return {
    name: account.full_name ?? "",
    email: account.email ?? "",
    password: "",
    role: account.role ?? "asesor",
    status: account.status ?? "active",
    leader: account.lider_id ?? "",
    sendAccess: false,
    sendTo: account.email ?? "",
    sendName: "",
  };
}

const MIN_PASSWORD = 8;
const ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** What is wrong before anything is sent; empty when nothing is. */
export function newAccountProblem({ name, email, password }: AccountForm): string {
  if (!name.trim()) return "El nombre completo es requerido.";
  const mail = email.trim();
  if (!mail || !mail.includes("@")) return "Ingresá un email válido.";
  if (password.length < MIN_PASSWORD) return "La contraseña debe tener al menos 8 caracteres.";
  return "";
}

export function editProblem(form: AccountForm): string {
  if (!form.name.trim()) return "El nombre completo es requerido.";
  if (form.password && form.password.length < MIN_PASSWORD) {
    return "La nueva contraseña debe tener al menos 8 caracteres.";
  }
  const access = accessToSend(form);
  if (access && !ADDRESS.test(access.to)) {
    return "Escribí a qué mail mandar el usuario y la contraseña.";
  }
  return "";
}

/** Where the user and the password go, or null: only with a new password and the option ticked. */
export function accessToSend({
  password,
  sendAccess,
  sendTo,
  sendName,
}: AccountForm): { readonly to: string; readonly name: string } | null {
  if (!password || !sendAccess) return null;
  return { to: sendTo.trim(), name: sendName.trim() };
}

/**
 * Going from not active to active approves the account, which sends its mail. A change of password
 * on hold was already active: it is not approved again.
 */
export function becomesActive(before: Account | undefined, status: string): boolean {
  return (
    status === "active" &&
    before !== undefined &&
    before.status !== "active" &&
    before.status !== "reset_pending"
  );
}
