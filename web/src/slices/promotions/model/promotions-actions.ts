// What the person can do on Promociones. It reads and writes the state in order, as things happen:
// an answer that arrives late looks at what is on the screen by then.
import type { QueryClient } from "@tanstack/react-query";
import {
  decodeEntities,
  type WatchedBrand,
  withBrandsFound,
} from "@/shared/domain/promotions/index.ts";
import {
  type PromotionCatalog,
  promotionCatalogOptions,
  PROMOTION_CATALOG_QUERY_KEY,
  shownPromotions,
} from "@/shared/lib/promotions/catalog-query.ts";
import {
  askStartDates,
  askStartDatesOf,
  askUpdateCatalog,
  idsOfLocality,
} from "@/shared/lib/promotions/promotions-edge.ts";
import { changeWatchedBrands } from "@/shared/lib/promotions/watched-brands-store.ts";
import type { ToastActions } from "@/shared/lib/toast/toast-context.ts";
import type { Backend } from "@/shared/supabase/index.ts";
import { downloadPromotionsSheet } from "../api/promotions-sheet.ts";
import type { PromotionsTab } from "../promotions-tab.ts";
import type { PromotionsAction, PromotionsState } from "./promotions-state.ts";
import {
  activeRows,
  galiciaIds,
  idsToAskStartDate,
  searchNotice,
  searchRows,
  watchableRows,
  withChosenMatch,
} from "./result-rows.ts";
import { visibleRows } from "./table.ts";

const MAX_START_DATES = 400;
const START_DATES_TO_CONFIRM = 160;
const FORBIDDEN = /\b403\b/;

const LOADING_CATALOG = "Cargando catálogo...";
const LOOKING_IN_LOCALITY = "Buscando en la localidad...";

export interface PromotionsDependencies {
  readonly read: () => PromotionsState;
  readonly dispatch: (action: PromotionsAction) => void;
  readonly backend: Backend;
  readonly queryClient: QueryClient;
  readonly toast: ToastActions;
  readonly modo: { readonly read: () => boolean; readonly change: (on: boolean) => void };
  readonly logoSource: (image: string | null | undefined) => string;
}

export interface PromotionsActions {
  readonly dispatch: (action: PromotionsAction) => void;
  readonly switchTab: (tab: PromotionsTab) => void;
  readonly setProvince: (value: string) => void;
  readonly setLocality: (value: string) => void;
  readonly setCategory: (value: string) => void;
  readonly validate: () => Promise<void>;
  readonly listActive: () => Promise<void>;
  /** The main action of the tab, unless it is already working. */
  readonly runMainAction: () => void;
  /** MODO went in or out of what can be seen: what is on the table is made again. */
  readonly runAgain: () => void;
  readonly setIncludeModo: (on: boolean) => void;
  readonly updateCatalog: (manual: boolean) => Promise<void>;
  readonly chooseMatch: (key: number, index: number) => void;
  readonly fillStartDates: () => void;
  readonly confirmStartDates: () => void;
  readonly downloadSheet: () => Promise<void>;
  readonly watchFoundBrands: (option: number, optionName: string) => Promise<void>;
}

export function createPromotionsActions(deps: PromotionsDependencies): PromotionsActions {
  const { read, dispatch, backend, queryClient, toast, modo } = deps;
  let autoUpdated = false;

  const catalogNow = () => queryClient.getQueryData<PromotionCatalog>(PROMOTION_CATALOG_QUERY_KEY);
  const shownNow = () => shownPromotions(catalogNow(), modo.read());
  const loadCatalog = () =>
    queryClient.fetchQuery({ ...promotionCatalogOptions(backend), staleTime: 0 });

  /** A catalog that could not be read has already said so: it is not an empty one (invariant 24). */
  const tellEmptyCatalog = (catalog: PromotionCatalog, whileUpdating: string, empty: string) => {
    if (catalog.failure) return;
    toast.show(read().isUpdatingCatalog ? whileUpdating : empty);
  };

  const askDatesAndTell = async (ids: readonly (string | number)[]) => {
    const numeric = galiciaIds(ids);
    if (numeric.length === 0) return;
    const allAnswered = await askStartDates(backend, numeric, (dates) => {
      dispatch({ type: "start-dates", dates });
    });
    if (!allAnswered) {
      toast.show(
        'No se pudo traer la fecha "Desde" de algunas promociones (la columna queda con "-").',
      );
    }
  };

  const validate = async (): Promise<void> => {
    const state = read();
    const brands = state.brandsText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (brands.length === 0) {
      toast.show("Pegá al menos una marca");
      return;
    }
    if (shownNow().length === 0) {
      if (state.validateWork) return;
      dispatch({ type: "validate-work", text: LOADING_CATALOG });
      const catalog = await loadCatalog();
      dispatch({ type: "validate-work", text: "" });
      if (shownPromotions(catalog, modo.read()).length > 0) {
        await validate();
        return;
      }
      tellEmptyCatalog(
        catalog,
        "El catálogo se está sincronizando por primera vez; volvé a tocar Validar en unos segundos.",
        'El catálogo de promociones está vacío. Tocá "Actualizar catálogo ahora" y volvé a validar.',
      );
      return;
    }
    const monthRef = monthOf(state.month);
    const { rows, brandRows } = searchRows(brands, shownNow(), state.province, monthRef);
    dispatch({ type: "results", rows, monthRef });
    const notice = searchNotice(brandRows);
    if (notice) toast.show(notice);
    await askDatesAndTell(idsToAskStartDate(rows));
  };

  const switchTab = (tab: PromotionsTab) => {
    dispatch({ type: "tab", tab });
  };

  const learnLocality = async ({ province, locality }: PromotionsState): Promise<void> => {
    dispatch({ type: "list-work", text: LOOKING_IN_LOCALITY });
    const ids = await idsOfLocality(backend, province, locality);
    dispatch({ type: "list-work", text: "" });
    // Another locality chosen meanwhile: this answer is not for it.
    if (read().locality !== locality) return;
    if (ids) {
      dispatch({ type: "locality-ids", ids });
      return;
    }
    toast.show("No se pudo filtrar por localidad, mostramos toda la provincia.");
    dispatch({ type: "locality", value: "" });
  };

  const listActive = async (): Promise<void> => {
    const state = read();
    if (state.tab !== "active") switchTab("active");
    if (!state.province) {
      toast.show("Elegí una provincia para ver sus promociones");
      return;
    }
    if (shownNow().length === 0) {
      if (state.listWork) return;
      dispatch({ type: "list-work", text: LOADING_CATALOG });
      const catalog = await loadCatalog();
      dispatch({ type: "list-work", text: "" });
      if (shownPromotions(catalog, modo.read()).length > 0) {
        await listActive();
        return;
      }
      tellEmptyCatalog(
        catalog,
        "El catálogo se está sincronizando por primera vez; probá de nuevo en unos segundos.",
        'El catálogo de promociones está vacío. Tocá "Actualizar catálogo ahora".',
      );
      return;
    }
    if (state.locality && !state.localityIds) {
      await learnLocality(state);
      await listActive();
      return;
    }
    const now = new Date();
    const rows = activeRows(shownNow(), read(), now);
    dispatch({ type: "results", rows, monthRef: now });
    if (rows.length === 0) toast.show("No hay promociones vigentes con esos filtros.");
  };

  const relistIfShowing = () => {
    if (read().rows) void listActive();
  };

  const setProvince = (value: string) => {
    dispatch({ type: "province", value });
    if (read().tab === "active") relistIfShowing();
    else dispatch({ type: "recalculate" });
  };

  const setLocality = (value: string) => {
    dispatch({ type: "locality", value });
    relistIfShowing();
  };

  const setCategory = (value: string) => {
    dispatch({ type: "category", value });
    relistIfShowing();
  };

  const runAgain = () => {
    const { rows, tab, brandsText } = read();
    if (!rows) return;
    if (tab === "active") void listActive();
    else if (brandsText) void validate();
  };

  const setIncludeModo = (on: boolean) => {
    modo.change(on);
    runAgain();
  };

  const runMainAction = () => {
    const { tab, listWork, validateWork } = read();
    if (tab === "active") {
      if (!listWork) void listActive();
    } else if (!validateWork) void validate();
  };

  const updateCatalog = async (manual: boolean) => {
    if (read().isUpdatingCatalog) return;
    if (!manual) {
      if (autoUpdated) return;
      autoUpdated = true;
    }
    dispatch({ type: "updating-catalog", on: true });
    const answer = await askUpdateCatalog(backend);
    dispatch({ type: "updating-catalog", on: false });
    if (!answer.ok) {
      // Something updating by itself only speaks when there is nothing to look at.
      if (manual || shownNow().length === 0) {
        toast.show(
          FORBIDDEN.test(answer.error)
            ? "Galicia no dejó actualizar el catálogo ahora. Seguís viendo la última copia guardada."
            : `No se pudo actualizar el catálogo de promociones: ${answer.error}`,
        );
      }
      return;
    }
    if (manual) toast.show(`Catálogo actualizado: ${String(answer.value)} promociones`);
    await queryClient.refetchQueries({ queryKey: PROMOTION_CATALOG_QUERY_KEY, exact: true });
  };

  const chooseMatch = (key: number, index: number) => {
    const { rows, province, monthRef } = read();
    if (!rows) return;
    const chosen = withChosenMatch(rows, key, index, shownNow(), province, monthRef ?? new Date());
    if (!chosen) return;
    dispatch({ type: "rows", rows: chosen.rows });
    const { chosenId, siblingIds } = chosen;
    if (typeof chosenId === "number") {
      void askStartDatesOf(backend, chosenId).then((dates) => {
        if (dates) dispatch({ type: "start-dates", dates });
      });
    }
    void askDatesAndTell(siblingIds);
  };

  const rowsMissingStartDate = () => {
    const { rows, filters, order } = read();
    return visibleRows(rows ?? [], filters, order).filter(
      ({ row }) => row.promotion && !row.excluded && row.startDate === undefined,
    );
  };

  const askVisibleStartDates = () => {
    const ids = rowsMissingStartDate().flatMap(({ row }) =>
      row.promotion ? [row.promotion.id] : [],
    );
    void askDatesAndTell(ids);
  };

  const fillStartDates = () => {
    const count = rowsMissingStartDate().length;
    if (count > MAX_START_DATES) {
      toast.show(
        `Son ${String(count)} promociones y hay que consultarlas de a una: filtrá un poco más (máximo ${String(MAX_START_DATES)}).`,
      );
      return;
    }
    if (count > START_DATES_TO_CONFIRM) dispatch({ type: "confirm-start-dates", count });
    else askVisibleStartDates();
  };

  const confirmStartDates = () => {
    dispatch({ type: "confirm-start-dates", count: null });
    askVisibleStartDates();
  };

  const downloadSheet = async () => {
    const { rows, filters, order, tab, province, isDownloading } = read();
    if (!rows || rows.length === 0 || isDownloading) return;
    await downloadPromotionsSheet({
      rows: visibleRows(rows, filters, order)
        .map(({ row }) => row)
        .filter(({ excluded }) => !excluded),
      isActiveTab: tab === "active",
      province,
      logoSource: deps.logoSource,
      notice: toast.show,
      setBusy: (on) => {
        dispatch({ type: "downloading", on });
      },
    });
  };

  const watchFoundBrands = async (option: number, optionName: string) => {
    const { found } = watchableRows(read().rows ?? []);
    const brands = found.map(({ brand, promotion }): WatchedBrand => ({
      m: brand,
      t: decodeEntities(promotion?.titulo),
      img: promotion?.imagen ?? "",
      origen: "manual",
    }));
    try {
      await changeWatchedBrands(backend.bucket, (file) => withBrandsFound(file, option, brands));
      toast.show(
        `Listo: se vigilan ${String(found.length)} marcas de «${optionName}». Si alguna se vence te llega un mail.`,
      );
    } catch (cause) {
      toast.show(`No se pudo guardar: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  };

  return {
    dispatch,
    switchTab,
    setProvince,
    setLocality,
    setCategory,
    validate,
    listActive,
    runMainAction,
    runAgain,
    setIncludeModo,
    updateCatalog,
    chooseMatch,
    fillStartDates,
    confirmStartDates,
    downloadSheet,
    watchFoundBrands,
  };
}

/** The month to validate, from its first day; without one, today. */
function monthOf(month: string): Date {
  if (!month) return new Date();
  return new Date(
    Number.parseInt(month.slice(0, 4), 10),
    Number.parseInt(month.slice(5, 7), 10) - 1,
    1,
  );
}
