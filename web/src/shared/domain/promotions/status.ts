// What is happening with a promotion in the month that is being validated.
import { isInProvince } from "./geography.ts";
import type { Promotion } from "./promotion.ts";
import { formatDate } from "./text.ts";

export const PROMOTION_STATUSES = [
  "VIGENTE",
  "VENCE_ESTE_MES",
  "VENCIDA",
  "REVISAR",
  "NO_ENCONTRADA",
  "SIN_FECHA",
  "FUERA_PROV",
  "PROXIMA",
] as const;

export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

export const STATUS_LABEL: Readonly<Record<PromotionStatus, string>> = {
  VIGENTE: "Vigente",
  VENCE_ESTE_MES: "Vence este mes",
  VENCIDA: "Vencida",
  REVISAR: "Revisar",
  NO_ENCONTRADA: "No encontrada",
  SIN_FECHA: "Sin fecha informada",
  FUERA_PROV: "Fuera de la provincia",
  PROXIMA: "Próximamente",
};

export function expiryStatus(
  until: string | null | undefined,
  monthRef: Date,
): "SIN_FECHA" | "VENCIDA" | "VENCE_ESTE_MES" | "VIGENTE" {
  if (!until) return "SIN_FECHA";
  const end = new Date(`${until}T23:59:59`);
  const endOfMonth = new Date(monthRef.getFullYear(), monthRef.getMonth() + 1, 0, 23, 59, 59);
  if (end < monthRef) return "VENCIDA";
  return end <= endOfMonth ? "VENCE_ESTE_MES" : "VIGENTE";
}

/**
 * The status with the chosen province on top. Expired wins over out of the province: it is the
 * worst of the two, the first thing to fix on a flyer. "Próximamente" goes after the province: out
 * of it, a promotion is of no use whenever it starts.
 */
export function finalStatus(
  promotion: Promotion,
  province: string,
  monthRef: Date,
): PromotionStatus {
  const expiry = expiryStatus(promotion.fecha_hasta, monthRef);
  if (expiry === "VENCIDA" || expiry === "SIN_FECHA") return expiry;
  if (!isInProvince(promotion, province)) return "FUERA_PROV";
  return promotion.proximamente ? "PROXIMA" : expiry;
}

/** As it reads on the label and on the Excel: an upcoming one says when it starts, if known. */
export function statusText(status: PromotionStatus, startDate: string | null | undefined): string {
  if (status === "PROXIMA" && startDate) return `Empieza el ${formatDate(startDate)}`;
  return STATUS_LABEL[status];
}
