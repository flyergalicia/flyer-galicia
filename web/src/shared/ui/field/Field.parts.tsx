import { type ReactNode, useId, useMemo } from "react";
import { FieldContext, type FieldStatus, useField } from "./field-context.ts";
import styles from "./Field.module.css";

type FieldProps = {
  /** "invalid" marks it and shows its message; it does not stop anyone from going on. */
  readonly status?: FieldStatus;
  readonly className?: string | undefined;
  readonly children: ReactNode;
};

export function FieldRoot({ status = "valid", className, children }: FieldProps) {
  const id = useId();
  const value = useMemo(
    () => ({ controlId: `${id}-control`, messageId: `${id}-message`, status }),
    [id, status],
  );
  return (
    <FieldContext.Provider value={value}>
      <div className={className ? `${styles.field} ${className}` : styles.field}>{children}</div>
    </FieldContext.Provider>
  );
}

export function FieldLabel({ children }: { readonly children: ReactNode }) {
  const { controlId } = useField("Label");
  return (
    <label className={styles.label} htmlFor={controlId}>
      {children}
    </label>
  );
}

/** The explanation under a control. It only shows when the field is marked. */
export function FieldMessage({ children }: { readonly children: ReactNode }) {
  const { messageId, status } = useField("Message");
  if (status === "valid") return null;
  const tone = status === "invalid" ? styles.messageInvalid : styles.messageWarning;
  return (
    <p id={messageId} className={`${styles.message} ${tone}`}>
      {children}
    </p>
  );
}
