import { createContext, useContext } from "react";

export type FieldStatus = "valid" | "invalid" | "warning";

export type FieldContextValue = {
  readonly controlId: string;
  readonly messageId: string;
  readonly status: FieldStatus;
};

export const FieldContext = createContext<FieldContextValue | null>(null);

/** Null outside a Field: Input, Select and Textarea also work on their own. */
export function useOptionalField(): FieldContextValue | null {
  return useContext(FieldContext);
}

export function useField(part: string): FieldContextValue {
  const field = useContext(FieldContext);
  if (!field) throw new Error(`Field.${part} must be inside a Field`);
  return field;
}
