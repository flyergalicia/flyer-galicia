import { createContext, useContext, useSyncExternalStore } from "react";
import { hasNoAmounts } from "@/shared/flyer-engine/index.ts";
import type { FlyerWorkspace, WorkspaceState } from "./workspace-store.ts";

export const FlyerWorkspaceContext = createContext<FlyerWorkspace | null>(null);

/** The store: its actions never change, so reading it does not draw anything again. */
export function useFlyerWorkspace(): FlyerWorkspace {
  const workspace = useContext(FlyerWorkspaceContext);
  if (!workspace) throw new Error("useFlyerWorkspace needs a FlyerWorkspaceProvider above it");
  return workspace;
}

/** One value of the store: the component draws again only when that value changes. */
export function useWorkspaceValue<Value>(select: (state: WorkspaceState) => Value): Value {
  const { subscribe, getState } = useFlyerWorkspace();
  return useSyncExternalStore(subscribe, () => select(getState()));
}

/** This flyer draws no amounts: the card of the form that fills them has nothing to do. */
export function useFlyerHasNoAmounts(): boolean {
  return useWorkspaceValue(({ slot: { scene } }) => (scene ? hasNoAmounts(scene) : false));
}
