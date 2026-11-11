// The flyers that came out (`flyer_logs`), as Registros and the dashboard list and export them.
// Everything in a log was written by a user: it is shown as text, never as markup.
import type { PeopleNames } from "./people.ts";

export interface FlyerLog {
  readonly id: string;
  readonly user_id: string | null;
  readonly empresa: string | null;
  readonly config_name: string | null;
  readonly format: string | null;
  readonly flyer_type?: string | null;
  readonly created_at: string | null;
}

/** What the flyer editor wrote about the flyer: its option, the advisor, the caps of Rubros. */
export interface FlyerDetails {
  readonly opcion?: unknown;
  readonly masivo?: unknown;
  readonly padron?: unknown;
  readonly config?: unknown;
  readonly importe?: unknown;
  readonly importe2?: unknown;
  readonly beneficio?: unknown;
  readonly nombre?: unknown;
  readonly celular?: unknown;
  readonly email?: unknown;
  readonly nombre2?: unknown;
  readonly celular2?: unknown;
  readonly email2?: unknown;
}

/** An old log has none, and one that cannot be read counts as none. */
export function flyerDetails(text: string | null | undefined): FlyerDetails {
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** A value of the details as it reads; nothing when it is empty. */
export function detailText(value: unknown): string {
  if (!value) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function optionOfDetails({ opcion }: FlyerDetails): number {
  const number = Number(opcion);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function authorOf(log: Pick<FlyerLog, "user_id">, names: PeopleNames): string {
  return (log.user_id && names.get(log.user_id)) || log.user_id || "Usuario";
}

/** "Filtrar usuario...": by the name of whoever generated it. */
export function byAuthor(
  logs: readonly FlyerLog[],
  names: PeopleNames,
  query: string,
): readonly FlyerLog[] {
  const text = query.trim().toLowerCase();
  const withAuthor = logs.filter((log) => log.user_id);
  if (!text) return withAuthor;
  return withAuthor.filter((log) =>
    (names.get(log.user_id ?? "") ?? "").toLowerCase().includes(text),
  );
}

export function countText(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** "Tope 24.000 / 30.000", the cap of a flyer of Rubros. */
export function capText({ importe, importe2 }: FlyerDetails): string {
  const first = detailText(importe);
  if (!first) return "";
  const second = detailText(importe2);
  return `Tope ${first}${second && second !== first ? ` / ${second}` : ""}`;
}

export function advisorLine({ nombre, celular, email }: FlyerDetails): string {
  return [detailText(nombre), detailText(celular), detailText(email)].filter(Boolean).join(" · ");
}

export function dateTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString("es-AR") : "";
}

/** The name of the file of a day: the date as the computer writes it in UTC, as it does today. */
export function sheetFileName(prefix: string, now: Date): string {
  return `${prefix}_${now.toISOString().slice(0, 10)}.xlsx`;
}

export const REGISTRY_HEAD = [
  "Fecha/Hora",
  "Usuario",
  "Empresa",
  "Configuración",
  "Opción",
  "Beneficio (Rubros)",
  "Tope (Rubros)",
  "Tope 2 (Rubros)",
  "Nombre Asesor 1",
  "Cel Asesor 1",
  "Email Asesor 1",
  "Nombre Asesor 2",
  "Cel Asesor 2",
  "Email Asesor 2",
  "Formato",
] as const;
export const REGISTRY_WIDTHS = [22, 28, 32, 14, 16, 24, 14, 28, 18, 36, 28, 18, 36, 8];

/** A line of the Excel of Registros. */
export function registryLine(
  log: FlyerLog,
  names: PeopleNames,
  optionName: (option: number) => string,
): string[] {
  const details = flyerDetails(log.flyer_type);
  const option = optionOfDetails(details);
  return [
    dateTime(log.created_at),
    (log.user_id && names.get(log.user_id)) || log.user_id || "",
    log.empresa ?? "",
    detailText(details.config),
    option ? optionName(option) : "",
    detailText(details.beneficio),
    detailText(details.importe),
    detailText(details.importe2),
    detailText(details.nombre),
    detailText(details.celular),
    detailText(details.email),
    detailText(details.nombre2),
    detailText(details.celular2),
    detailText(details.email2),
    log.format ?? "",
  ];
}

export const DASHBOARD_HEAD = ["Usuario", "Empresa", "Formato", "Configuración", "Fecha/Hora"];
export const DASHBOARD_WIDTHS = [30, 30, 40, 22];

export function dashboardLine(log: FlyerLog, names: PeopleNames): string[] {
  return [
    (log.user_id && names.get(log.user_id)) || log.user_id || "",
    log.empresa ?? "",
    log.format ?? "",
    log.config_name ?? "",
    dateTime(log.created_at),
  ];
}
