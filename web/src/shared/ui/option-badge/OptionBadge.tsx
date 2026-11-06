import type { CSSProperties } from "react";
import styles from "./OptionBadge.module.css";

type OptionBadgeProps = {
  readonly option: number;
  /** The name of the flyer, on hovering. */
  readonly label: string;
  /** The color of that flyer. */
  readonly color: string;
  /** Where it sits among what is around it. */
  readonly className?: string | undefined;
};

function colorStyle(color: string): CSSProperties {
  const style: CSSProperties & { readonly "--option-color": string } = { "--option-color": color };
  return style;
}

/** "OP.n" in the color of the flyer, wherever a flyer that came out is listed: `_optBadge`. */
export function OptionBadge({ option, label, color, className = "" }: OptionBadgeProps) {
  return (
    <span className={`${styles.badge} ${className}`.trim()} style={colorStyle(color)} title={label}>
      OP.{option}
    </span>
  );
}
