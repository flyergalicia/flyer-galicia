import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "./Checkbox.module.css";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  readonly children: ReactNode;
};

export function Checkbox({ children, className, ...rest }: CheckboxProps) {
  return (
    <label className={className ? `${styles.row} ${className}` : styles.row}>
      <input {...rest} type="checkbox" className={styles.box} />
      {children}
    </label>
  );
}
