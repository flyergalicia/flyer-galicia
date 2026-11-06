// Admin → Auditoría (`audit_log`): what auth-admin wrote about each account, in words.
import { roleLabel } from "@/shared/session/index.ts";

export interface AuditRow {
  readonly id: number | string;
  readonly created_at: string | null;
  readonly actor_email: string | null;
  readonly accion: string | null;
  readonly objetivo_email: string | null;
  readonly detalle: unknown;
}

export const AUDIT_ACTIONS: Readonly<Record<string, string>> = {
  register: "Pidió acceso",
  request_reset: "Pidió cambiar su contraseña",
  approve_user: "Aprobó la cuenta de",
  create_user: "Creó el usuario",
  approve_reset: "Aprobó el cambio de contraseña de",
  deny_reset: "Rechazó el cambio de contraseña de",
  set_password: "Cambió la contraseña de",
  delete_user: "Eliminó al usuario",
  alta_a_medias: "⚠ Alta a medias (revisar)",
  baja_a_medias: "⚠ Baja a medias (revisar)",
};

/** The choices of the filter "Acción", in their order. */
export const AUDIT_FILTERS: readonly (readonly [string, string])[] = [
  ["", "Todas"],
  ["register", "Pedidos de acceso"],
  ["request_reset", "Pedidos de cambio de contraseña"],
  ["approve_user", "Cuentas aprobadas"],
  ["create_user", "Usuarios creados"],
  ["approve_reset", "Cambios de contraseña aprobados"],
  ["deny_reset", "Cambios de contraseña rechazados"],
  ["set_password", "Contraseñas cambiadas por un admin"],
  ["delete_user", "Usuarios eliminados"],
  ["alta_a_medias", "Altas a medias (revisar)"],
  ["baja_a_medias", "Bajas a medias (revisar)"],
];

function part(details: unknown, key: string): string {
  if (typeof details !== "object" || details === null) return "";
  const value: unknown = Reflect.get(details, key);
  if (!value) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** IP, profile, status, the status before, the name, and whether it was left half done. */
export function auditDetails({ detalle }: Pick<AuditRow, "detalle">): string {
  const ip = part(detalle, "ip");
  const role = part(detalle, "rol");
  const status = part(detalle, "estado");
  const before = part(detalle, "estado_anterior");
  return [
    ip && `IP ${ip}`,
    role && `rol ${roleLabel(role)}`,
    status && `estado ${status}`,
    before && `estaba ${before}`,
    part(detalle, "nombre"),
    part(detalle, "parcial") && "quedó a medias: se pidió reintentar",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function auditAction({ accion }: Pick<AuditRow, "accion">): string {
  return (accion && AUDIT_ACTIONS[accion]) || accion || "—";
}

export function auditActor({ actor_email }: Pick<AuditRow, "actor_email">): string {
  return actor_email || "Visitante (sin sesión)";
}
