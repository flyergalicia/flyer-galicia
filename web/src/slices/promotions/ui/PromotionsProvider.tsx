import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { catalogHasGeography, knownProvinces } from "@/shared/domain/promotions/index.ts";
import { isPromotionsTab, SEARCH_UNLESS_RESULTS } from "@/shared/domain/promotions/tabs.ts";
import { usePrimaryAction } from "@/shared/lib/primary-action/primary-action-context.ts";
import {
  catalogNeverUpdated,
  catalogReadNotice,
  shownPromotions,
  usePromotionCatalog,
} from "@/shared/lib/promotions/catalog-query.ts";
import { useIncludeModo, useSetIncludeModo } from "@/shared/lib/promotions/include-modo-context.ts";
import {
  type AskedFilters,
  usePromotionFiltersPort,
} from "@/shared/lib/promotions/promotion-filters.ts";
import { usePlaceRequests } from "@/shared/lib/places/place-desk.ts";
import { usePromotionLogoSource } from "@/shared/lib/promotions/logo-file.ts";
import { promotionsProbe } from "@/shared/lib/promotions/promotions-probe.ts";
import { registerProbe } from "@/shared/lib/test-probe.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { createPromotionsActions, type PromotionsActions } from "../model/promotions-actions.ts";
import { PromotionsActionsContext, PromotionsStateContext } from "../model/promotions-context.ts";
import {
  initialPromotionsState,
  type PromotionsAction,
  promotionsReducer,
  type PromotionsState,
} from "../model/promotions-state.ts";

interface PromotionsProviderProps {
  readonly isActive: boolean;
  readonly children: ReactNode;
}

function applyAskedFilters(
  asked: AskedFilters,
  dispatch: (action: PromotionsAction) => void,
  listActive: (noProvinceNotice?: string) => Promise<void>,
) {
  const { province, locality, category, hideOnline, onePerBrand, onlyPercent } = asked;
  if (province !== undefined) dispatch({ type: "province", value: province });
  if (locality !== undefined) dispatch({ type: "locality", value: locality });
  if (category !== undefined) dispatch({ type: "category", value: category });
  dispatch({
    type: "filters",
    change: {
      ...(hideOnline === undefined ? {} : { hideOnline }),
      ...(onePerBrand === undefined ? {} : { oneRowPerBrand: onePerBrand }),
      ...(onlyPercent === undefined ? {} : { onlyPercent }),
    },
  });
  if (asked.listActive) void listActive(asked.noProvinceNotice);
}

/** The state, always current for what happens after a wait. */
function useLatestState() {
  const [state, setState] = useState(() => initialPromotionsState());
  const latest = useRef(state);
  const store = useMemo(
    () => ({
      read: () => latest.current,
      dispatch: (action: PromotionsAction) => {
        latest.current = promotionsReducer(latest.current, action);
        setState(latest.current);
      },
    }),
    [],
  );
  return { state, ...store };
}

/** The tick of MODO as known right now: an action that changes it reads the new value at once. */
function useModoChoice() {
  const includeModo = useIncludeModo();
  const setIncludeModo = useSetIncludeModo();
  const latest = useRef(includeModo);
  const choice = useMemo(
    () => ({
      read: () => latest.current,
      remember: (on: boolean) => {
        latest.current = on;
      },
      change: (on: boolean) => {
        latest.current = on;
        setIncludeModo(on);
      },
    }),
    [setIncludeModo],
  );
  return { includeModo, choice };
}

/** The windows of brands start from what is chosen here, and ask from there to choose something. */
function useSharedFilters(
  { province, locality, category, filters }: PromotionsState,
  dispatch: (action: PromotionsAction) => void,
  { listActive }: Pick<PromotionsActions, "listActive">,
) {
  const port = usePromotionFiltersPort();
  const { hideOnline, oneRowPerBrand, onlyPercent } = filters;
  useEffect(() => {
    port.publish({
      province,
      locality,
      category,
      hideOnline,
      onePerBrand: oneRowPerBrand,
      onlyPercent,
    });
  }, [category, hideOnline, locality, onlyPercent, oneRowPerBrand, port, province]);
  useEffect(() => {
    const attend = () => {
      const asked = port.takeAsked();
      if (asked) applyAskedFilters(asked, dispatch, listActive);
    };
    attend();
    return port.onAsked(attend);
  }, [dispatch, listActive, port]);
}

export function PromotionsProvider({ isActive, children }: PromotionsProviderProps) {
  const backend = useBackend();
  const queryClient = useQueryClient();
  const toast = useToast();
  const logoSource = usePromotionLogoSource();
  const { state, read, dispatch } = useLatestState();
  const { includeModo, choice } = useModoChoice();
  const { data: catalog, dataUpdatedAt } = usePromotionCatalog();

  const actions = useMemo(
    () =>
      createPromotionsActions({
        read,
        dispatch,
        backend,
        queryClient,
        toast,
        modo: choice,
        logoSource,
      }),
    [read, dispatch, backend, queryClient, toast, choice, logoSource],
  );

  usePrimaryAction(actions.runMainAction, isActive);

  // Each new reading of the catalog says what it has to say, once.
  const heardAt = useRef(0);
  useEffect(() => {
    if (!catalog || heardAt.current === dataUpdatedAt) return;
    heardAt.current = dataUpdatedAt;
    const notice = catalogReadNotice(catalog);
    if (notice) toast.show(notice);
    const shown = shownPromotions(catalog, choice.read());
    dispatch({
      type: "provinces-known",
      provinces: knownProvinces(catalog.locations, shown),
      usable: shown.length === 0 || catalogHasGeography(shown),
    });
    // A catalog that never updated asks for itself, once: a Galicia that brings nothing is not
    // asked again and again.
    if (catalogNeverUpdated(catalog)) void actions.updateCatalog(false);
  }, [catalog, dataUpdatedAt, actions, choice, dispatch, toast]);

  useEffect(
    () => registerProbe("promotions", () => promotionsProbe(backend, queryClient, choice, read)),
    [backend, queryClient, choice, read],
  );

  useSharedFilters(state, dispatch, actions);

  // Buscar or Activas from the search of screens: as their solapa does. The tutorial goes back to
  // Buscar only from Activas with nothing listed: changing the solapa would empty the table.
  usePlaceRequests("promotions", (place) => {
    if (isPromotionsTab(place)) actions.switchTab(place);
    const { tab, rows } = read();
    if (place === SEARCH_UNLESS_RESULTS && tab === "active" && rows === null) {
      actions.switchTab("search");
    }
  });

  // The tick is one wherever it shows: if another screen changes it, the table follows.
  useEffect(() => {
    if (choice.read() === includeModo) return;
    choice.remember(includeModo);
    actions.runAgain();
  }, [includeModo, choice, actions]);

  return (
    <PromotionsActionsContext.Provider value={actions}>
      <PromotionsStateContext.Provider value={state}>{children}</PromotionsStateContext.Provider>
    </PromotionsActionsContext.Provider>
  );
}
