import { createContext, useContext } from "react";

export interface ToastActions {
  /** Shows the notice: there is one at a time, and the last one wins. A long one asks for more time. */
  readonly show: (text: string, durationMs?: number) => void;
  /** Takes it away only if it still says this: it cannot erase a newer notice. */
  readonly hide: (text: string) => void;
}

export const ToastContext = createContext<ToastActions | null>(null);

export function useToast(): ToastActions {
  const actions = useContext(ToastContext);
  if (!actions) throw new Error("useToast needs a ToastProvider above it");
  return actions;
}
