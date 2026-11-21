// The store of the form, distributed by Context. Writing in a field draws again only that field and
// the canvas, which reads it without a render (see "Manejo de estado" in the plan).
import { DEFAULT_CASHBACK_CONFIGS } from "@/shared/domain/company-registry/cashback.ts";
import type { FlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import {
  type FlyerFormState,
  type FormContext,
  initialFormState,
  valuesOfForm,
} from "./form-state.ts";

export interface FlyerForm {
  readonly getState: () => FlyerFormState;
  readonly subscribe: (listener: () => void) => () => void;
  /** Changes the form, and the flyer with it. */
  readonly update: (change: (form: FlyerFormState) => FlyerFormState) => void;
  /** What the form draws with besides itself. */
  readonly setContext: (context: FormContext) => void;
  readonly getContext: () => FormContext;
}

export const INITIAL_FORM_CONTEXT: FormContext = {
  configs: DEFAULT_CASHBACK_CONFIGS,
  names: DEFAULT_CASHBACK_CONFIGS.map(({ nombre }) => nombre),
  tab: "flyer",
};

export function createFlyerForm(workspace: Pick<FlyerWorkspace, "setForm">): FlyerForm {
  let state = initialFormState();
  let context = INITIAL_FORM_CONTEXT;
  const listeners = new Set<() => void>();
  const publish = () => {
    workspace.setForm(valuesOfForm(state, context));
  };
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update: (change) => {
      const next = change(state);
      state = next;
      for (const listener of listeners) listener();
      publish();
    },
    setContext: (next) => {
      context = next;
      for (const listener of listeners) listener();
      publish();
    },
    getContext: () => context,
  };
}
