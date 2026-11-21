// What of the profile decides which chapters and steps there are (`_tourCapitulos`): the faculties of
// now, what the profile is, and how many flyers it has on each tab.
import { useMemo } from "react";
import { optionsOfTab } from "@/shared/domain/flyer-options.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { useCommercialActionsFlag, usePermissions, useSession } from "@/shared/session/index.ts";

export interface TourProfile {
  readonly searchesCompanies: boolean;
  readonly pastesOfficers: boolean;
  readonly takesNotes: boolean;
  readonly savesAdvisors: boolean;
  readonly searchesPromotions: boolean;
  /** More than one flyer of Flyer Galicia on: the bar of options. */
  readonly severalFlyers: boolean;
  readonly hasCategoryFlyers: boolean;
  readonly hasBranches: boolean;
  /** The history and the draft are kept in this computer. */
  readonly keepsWork: boolean;
  readonly isHunter: boolean;
  readonly isLeader: boolean;
  readonly commercialActionsOn: boolean;
  /** An administrator not looking as another profile. */
  readonly isAdminNow: boolean;
  /** An administrator, also while looking as another profile. */
  readonly isAdmin: boolean;
}

export function useTourProfile(): TourProfile {
  const { can, isHunter, isLeader, isAdminNow } = usePermissions();
  const session = useSession();
  const { on: commercialActionsOn } = useCommercialActionsFlag();
  const { options } = useFlyerOptions();
  const isAdmin = session.status === "signed-in" && session.isAdmin;
  return useMemo(() => {
    const onOfTab = (tab: "flyer" | "rubros") =>
      optionsOfTab(options, tab).filter((option) => can(`opcion_${option}`)).length;
    return {
      searchesCompanies: can("padron_buscar"),
      pastesOfficers: can("pegar_oficial"),
      takesNotes: can("notas"),
      savesAdvisors: can("asesores_guardados"),
      searchesPromotions: can("promos_buscar"),
      severalFlyers: onOfTab("flyer") > 1,
      hasCategoryFlyers: onOfTab("rubros") > 0,
      hasBranches: can("oficiales_sede"),
      keepsWork: can("guardar_trabajo"),
      isHunter,
      isLeader,
      commercialActionsOn,
      isAdminNow,
      isAdmin,
    };
  }, [can, isHunter, isLeader, isAdminNow, isAdmin, commercialActionsOn, options]);
}
