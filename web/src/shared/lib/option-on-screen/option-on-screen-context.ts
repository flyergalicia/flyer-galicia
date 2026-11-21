// Which flyer the editor has open, for the screens that start from it: Promociones does not know the
// editor, and a screen stays mounted while another one is on top. Nobody draws again when it changes.
import { createContext, useContext } from "react";

export interface OptionOnScreen {
  readonly get: () => number | null;
  readonly set: (option: number) => void;
}

export const OptionOnScreenContext = createContext<OptionOnScreen | null>(null);

export function useOptionOnScreen(): OptionOnScreen {
  const holder = useContext(OptionOnScreenContext);
  if (!holder) throw new Error("useOptionOnScreen needs an OptionOnScreenProvider above it");
  return holder;
}
