import type { InputHTMLAttributes, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { type FieldContextValue, useOptionalField } from "./field-context.ts";
import styles from "./Field.module.css";

export type ControlSize = "lg" | "md" | "sm";

type ControlOptions = {
  readonly controlSize?: ControlSize | undefined;
  /** The light shadow that the search boxes of the admin panel have. */
  readonly elevated?: boolean | undefined;
};

function controlClass(
  base: string | undefined,
  { controlSize = "md", elevated = false }: ControlOptions,
  status: FieldContextValue["status"] | undefined,
  className: string | undefined,
): string {
  const classes = [
    styles.control,
    base,
    styles[controlSize],
    elevated && styles.elevated,
    status === "invalid" && styles.invalid,
    status === "warning" && styles.warning,
    className,
  ];
  return classes.filter(Boolean).join(" ");
}

function fieldAttributes(field: FieldContextValue | null, id: string | undefined) {
  if (!field) return { id };
  return {
    id: id ?? field.controlId,
    "aria-invalid": field.status === "invalid" || undefined,
    "aria-describedby": field.status === "valid" ? undefined : field.messageId,
  };
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> &
  ControlOptions & { readonly ref?: Ref<HTMLInputElement> };

export function Input({
  controlSize,
  elevated,
  className,
  id,
  type = "text",
  ...rest
}: InputProps) {
  const field = useOptionalField();
  return (
    <input
      {...rest}
      {...fieldAttributes(field, id)}
      type={type}
      className={controlClass(styles.input, { controlSize, elevated }, field?.status, className)}
    />
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, id, ...rest }: TextareaProps) {
  const field = useOptionalField();
  return (
    <textarea
      {...rest}
      {...fieldAttributes(field, id)}
      className={controlClass(styles.textarea, {}, field?.status, className)}
    />
  );
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> &
  ControlOptions & {
    /** "custom" draws its own arrow; "native" leaves the one of the browser. */
    readonly appearance?: "custom" | "native";
    readonly ref?: Ref<HTMLSelectElement>;
  };

export function Select({
  appearance = "custom",
  controlSize,
  elevated,
  className,
  id,
  ...rest
}: SelectProps) {
  const field = useOptionalField();
  const base = appearance === "custom" ? styles.selectCustom : styles.selectNative;
  return (
    <select
      {...rest}
      {...fieldAttributes(field, id)}
      className={controlClass(base, { controlSize, elevated }, field?.status, className)}
    />
  );
}
