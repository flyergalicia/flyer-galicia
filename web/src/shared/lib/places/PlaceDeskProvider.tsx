import { type ReactNode, useState } from "react";
import { createPlaceDesk, PlaceDeskContext } from "./place-desk.ts";

/** One desk for the whole page: whoever asks and whoever answers meet here. */
export function PlaceDeskProvider({ children }: { readonly children: ReactNode }) {
  const [desk] = useState(createPlaceDesk);
  return <PlaceDeskContext.Provider value={desk}>{children}</PlaceDeskContext.Provider>;
}
