import { createContext, useContext, useSyncExternalStore } from "react";
import type { FlyerForm } from "./flyer-form.ts";
import type { FlyerTab } from "@/shared/domain/flyer-options.ts";
import type { FlyerFormState } from "./form-state.ts";

export const FlyerFormContext = createContext<FlyerForm | null>(null);

/** The store: it never changes, so reading it does not draw anything again. */
export function useFlyerForm(): FlyerForm {
  const form = useContext(FlyerFormContext);
  if (!form) throw new Error("useFlyerForm needs a FlyerFormProvider above it");
  return form;
}

/** One value of the form: the component draws again only when that value changes. */
export function useFormValue<Value>(select: (form: FlyerFormState) => Value): Value {
  const { subscribe, getState } = useFlyerForm();
  return useSyncExternalStore(subscribe, () => select(getState()));
}

/** The tab the form draws for: it changes without the form changing. */
export function useFormTab(): FlyerTab {
  const { subscribe, getContext } = useFlyerForm();
  return useSyncExternalStore(subscribe, () => getContext().tab);
}
