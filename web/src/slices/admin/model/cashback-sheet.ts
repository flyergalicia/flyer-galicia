// Config → Cashback: a copy of the configurations that is edited and, only on saving, goes to
// everybody. The first one (BAU) is the fallback and is never taken out.
import type { CashbackConfig } from "@/shared/domain/company-registry/cashback.ts";

export const AMOUNT_KEYS = ["m1", "m2", "m3", "m4"] as const;
export type AmountKey = (typeof AMOUNT_KEYS)[number];

export const CASHBACK_NAME_LENGTH = 30;
const ANGLE_BRACKETS = /[<>]/g;

/** A name typed in its place: without < >, and an empty one leaves the one it had. */
export function renamedConfig(
  configs: readonly CashbackConfig[],
  index: number,
  typed: string,
): readonly CashbackConfig[] {
  const name = typed.replace(ANGLE_BRACKETS, "").trim();
  if (!name) return configs;
  return configs.map((config, at) => (at === index ? { ...config, nombre: name } : config));
}

export function withAmount(
  configs: readonly CashbackConfig[],
  index: number,
  key: AmountKey,
  value: string,
): readonly CashbackConfig[] {
  return configs.map((config, at) => (at === index ? { ...config, [key]: value } : config));
}

/** It starts with the amounts of the last one: only what changes has to be touched. */
export function withNewConfig(configs: readonly CashbackConfig[]): readonly CashbackConfig[] {
  const last = configs.at(-1) ?? { m1: "", m2: "", m3: "", m4: "" };
  const { m1, m2, m3, m4 } = last;
  return [...configs, { nombre: `Config ${String(configs.length)}`, m1, m2, m3, m4 }];
}

export function withoutConfig(
  configs: readonly CashbackConfig[],
  index: number,
): readonly CashbackConfig[] {
  return index === 0 ? configs : configs.filter((_config, at) => at !== index);
}

export function removeQuestion(name: string): { readonly title: string; readonly body: string } {
  return {
    title: `¿Quitar "${name}"?`,
    body: "Deja de aparecer en el armador para todos. Las empresas de tu base o filas del masivo que la tengan cargada van a salir SIN cashback hasta que les pongas otra.",
  };
}

export function savedCashbackText(count: number): string {
  return `Cashback actualizado para todos (${String(count)} config${count > 1 ? "s" : ""})`;
}

/**
 * While it is edited, the flyer behind shows the amount typed (as `_cbField`): it is the copy of this
 * page, not what everybody has, until it is saved. A configuration the editor does not have is left.
 */
export function previewedAmount(
  shown: readonly CashbackConfig[] | undefined,
  index: number,
  key: AmountKey,
  value: string,
): readonly CashbackConfig[] | undefined {
  if (!shown?.[index]) return shown;
  return withAmount(shown, index, key, value);
}
