import { type ReactNode, useState } from "react";
import { type OptionOnScreen, OptionOnScreenContext } from "./option-on-screen-context.ts";

function createHolder(): OptionOnScreen {
  let option: number | null = null;
  return {
    get: () => option,
    set: (next) => {
      option = next;
    },
  };
}

export function OptionOnScreenProvider({ children }: { readonly children: ReactNode }) {
  const [holder] = useState(createHolder);
  return <OptionOnScreenContext.Provider value={holder}>{children}</OptionOnScreenContext.Provider>;
}
