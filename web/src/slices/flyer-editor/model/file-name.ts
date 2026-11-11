// What the name of the file needs of the form.
import { type FlyerValues } from "@/shared/flyer-engine/index.ts";
import type { FlyerFormState, FormContext } from "./form-state.ts";

const NO_CASHBACK_NAME = "Sin cashback";

export function valuesForFileName(form: FlyerFormState, { names }: FormContext): FlyerValues {
  return {
    empresa: form.empresa,
    nombre: form.officers[0]?.nombre ?? "",
    config: form.noCashback ? NO_CASHBACK_NAME : (names[form.cashback] ?? ""),
  };
}

/** A tag goes where the cursor is, and the cursor after it. */
export function insertAtCursor(
  input: HTMLInputElement | null,
  tag: string,
  write: (value: string) => void,
): void {
  if (!input) return;
  const { value, selectionStart, selectionEnd } = input;
  const start = selectionStart ?? value.length;
  write(value.slice(0, start) + tag + value.slice(selectionEnd ?? value.length));
  input.focus();
  requestAnimationFrame(() => {
    input.setSelectionRange(start + tag.length, start + tag.length);
  });
}
