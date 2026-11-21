// The amounts of a flyer: they come already formatted ("$250.000") and are compared by their digits.
import { type FlyerScene, type FlyerValues } from "./types.ts";

export type AmountNumber = 1 | 2 | 3 | 4;

function digitsOf(value: string | number | null | undefined): string {
  return String(value ?? "").replaceAll(/\D/g, "");
}

/** "24000" becomes "$24.000"; nothing typed stays empty. */
export function formatAmount(raw: string | number | null | undefined): string {
  const digits = digitsOf(raw).replace(/^0+(?=\d)/, "");
  if (!digits) return "";
  return `$${digits.replaceAll(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/** The `{total}` of a legal text: the sum of the two caps. */
export function sumAmounts(first: string | undefined, second: string | undefined): string {
  const a = digitsOf(first);
  const b = digitsOf(second);
  if (!a && !b) return "";
  return formatAmount(String(Number.parseInt(a || "0", 10) + Number.parseInt(b || "0", 10)));
}

/** This flyer carries no amounts: that part was cropped, or it was published without them. */
export function hasNoAmounts(scene: FlyerScene): boolean {
  const { cashback, montos } = scene.calibration;
  return Boolean(scene.singleCashback ? cashback.off : montos.off);
}

/** One amount as it is written, or nothing when the flyer shows no amounts. */
export function amountOf(values: FlyerValues, number: AmountNumber, scene: FlyerScene): string {
  if (values.nocb || hasNoAmounts(scene)) return "";
  // Stored values may hold a number: an old history entry, a cell of a spreadsheet.
  return String(values[`m${number}`] ?? "").trim();
}

/** The largest one, written as it came: what the single cashback and `{cashback}` show. */
export function largestAmount(values: FlyerValues, scene: FlyerScene): string {
  let best = "";
  let bestValue = 0;
  for (const number of [1, 2, 3, 4] as const) {
    const written = amountOf(values, number, scene);
    const value = Number.parseInt(digitsOf(written) || "0", 10);
    if (value > bestValue) {
      bestValue = value;
      best = written;
    }
  }
  return best;
}
