// The bars of Benchmark: their width in pixels, and on a phone their share of the row (--f) and what is
// left for the name and the number (--r).
import type { CSSProperties } from "react";

type BarStyle = CSSProperties & { readonly "--f": string; readonly "--r"?: string };

export function barStyle(width: number, share: number, rest?: string): BarStyle {
  const style: BarStyle = { width: `${String(width)}px`, "--f": share.toFixed(3) };
  return rest === undefined ? style : { ...style, "--r": rest };
}
