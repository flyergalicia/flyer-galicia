// State and actions of the screen, in two contexts: who only presses buttons is not drawn again.
import { createContext, useContext } from "react";
import type { PromotionsActions } from "./promotions-actions.ts";
import type { PromotionsState } from "./promotions-state.ts";

export const PromotionsStateContext = createContext<PromotionsState | null>(null);
export const PromotionsActionsContext = createContext<PromotionsActions | null>(null);

export function usePromotionsState(): PromotionsState {
  const state = useContext(PromotionsStateContext);
  if (!state) throw new Error("usePromotionsState needs a PromotionsProvider above it");
  return state;
}

export function usePromotionsActions(): PromotionsActions {
  const actions = useContext(PromotionsActionsContext);
  if (!actions) throw new Error("usePromotionsActions needs a PromotionsProvider above it");
  return actions;
}
