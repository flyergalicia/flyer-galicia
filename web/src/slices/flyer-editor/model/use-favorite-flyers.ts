// The star: it stays in the account of the person. If the cloud does not take it, it goes back.
import { useCallback, useState } from "react";
import { optionLabel, optionTab } from "@/shared/domain/flyer-options.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useSession } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { saveFavorites } from "../api/flyer-bar.ts";
import { favoritesAfterStar, favoritesOfProfile } from "./option-bar.ts";

export function useFavoriteFlyers() {
  const { db } = useBackend();
  const session = useSession();
  const { show } = useToast();
  const { options } = useFlyerOptions();
  const isIn = session.status === "signed-in";
  const personId = isIn ? session.user.id : null;
  const fromAccount = favoritesOfProfile(isIn ? session.profile.flyer_fav : null);
  const [own, setOwn] = useState<readonly number[] | null>(null);
  const favorites = own ?? fromAccount;

  const toggle = useCallback(
    async (option: number) => {
      if (!personId) return;
      const next = favoritesAfterStar(favorites, option, (other) => optionTab(options, other));
      const label = optionLabel(options, option);
      setOwn(next);
      show(
        favorites.includes(option)
          ? `Sacaste «${label}» de tu favorito.`
          : `«${label}» quedó como tu favorito.`,
      );
      if (await saveFavorites(db, personId, next)) return;
      setOwn(favorites);
      show("No se pudo guardar tu favorito. Probá de nuevo.");
    },
    [db, favorites, options, personId, show],
  );

  return { favorites, toggle };
}
