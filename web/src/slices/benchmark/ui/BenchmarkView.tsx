// The tab Benchmark: Galicia against the competition, at the level of a person. Its code comes down
// when the tab is opened, and nothing here touches the flyer editor.
import { type ReactNode, useCallback, useEffect, useMemo, useReducer } from "react";
import { BENCHMARK_VIEWS, isBenchView } from "@/shared/domain/benchmark-views.ts";
import { usePlaceRequests } from "@/shared/lib/places/place-desk.ts";
import { registerProbe } from "@/shared/lib/test-probe.ts";
import type { ViewProps } from "@/shared/lib/view-props.ts";
import { useSession } from "@/shared/session/index.ts";
import type { BenchmarkData } from "../api/benchmark-data.ts";
import {
  type BenchmarkActions,
  BenchmarkActionsContext,
  BenchmarkContext,
  type BenchmarkValue,
  useBenchmark,
  useBenchmarkActions,
} from "../model/benchmark-context.ts";
import { benchmarkProbe } from "../model/benchmark-probe.ts";
import { sortedCards } from "../model/cards.ts";
import { brandIndex, filterDays, filteredPromotions } from "../model/filters.ts";
import { hiddenWithoutPlace } from "../model/notes.ts";
import { REFERENCE_KEY, typedAmount } from "../model/reference.ts";
import { bankName } from "../model/rows.ts";
import {
  type BenchView,
  firstScreen,
  type ScreenAction,
  screenReducer,
  type ScreenState,
} from "../model/screen-state.ts";
import { type BenchmarkReading, useBenchmarkData } from "../model/use-benchmark-data.ts";
import { useRefresh, useSheetDownload } from "../model/use-sheet-and-refresh.ts";
import { BrandsView } from "./BrandsView.tsx";
import { CardsView } from "./CardsView.tsx";
import { HandLoadedPage } from "./HandLoadedPage.tsx";
import { Filters } from "./Filters.tsx";
import { MerchantView } from "./MerchantView.tsx";
import { SourceLabels } from "./SourceLabels.tsx";
import { SummaryView } from "./SummaryView.tsx";
import { VersusView } from "./VersusView.tsx";
import { WeekView } from "./WeekView.tsx";
import styles from "./BenchmarkView.module.css";

const INTRO =
  "Galicia contra la competencia, a nivel persona. Todos los bancos salen de MODO; además se leen la web propia de BBVA, Supervielle y Santander (cuando su web lo permite) y el catálogo propio de Galicia (la misma promo no se cuenta dos veces). De Macro y Santander se suman las promos que cargás a mano (sus webs no dejan leerlas solas). Las promos de MODO que valen con cualquier banco no se comparan: se avisan aparte.";

const VIEWS: Readonly<Record<BenchView, () => ReactNode>> = {
  rubro: () => <SummaryView />,
  marca: () => <BrandsView />,
  semana: () => <WeekView />,
  comercio: () => <MerchantView />,
  versus: () => <VersusView />,
  tarjetas: () => <CardsView />,
};

function readStoredReferences(): string | null {
  try {
    return localStorage.getItem(REFERENCE_KEY);
  } catch {
    return null;
  }
}

function useIsAdmin(): boolean {
  const session = useSession();
  return session.status === "signed-in" && session.isAdmin;
}

function Tabs() {
  const { screen } = useBenchmark();
  const { dispatch } = useBenchmarkActions();
  // "Cargadas a mano" is shown to nobody: its promotions still enter the comparison.
  const tabs = BENCHMARK_VIEWS.map(([view, label]): readonly [BenchView, string] =>
    view === "versus" ? [view, `Galicia vs ${bankName(screen.versus)}`] : [view, label],
  );
  return (
    <div
      className={styles.tabs}
      role="tablist"
      aria-label="Vistas del Benchmark"
      data-testid="benchmark-tabs"
    >
      {tabs.map(([view, label]) => (
        <button
          key={view}
          type="button"
          role="tab"
          className={styles.tab}
          aria-selected={screen.view === view}
          onClick={() => {
            dispatch({ type: "view", view });
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function PlacesNotice() {
  const { data, brands, screen, days } = useBenchmark();
  const hidden = hiddenWithoutPlace(data.rows, brands, screen.filters.prov, days.today);
  if (hidden.length === 0) return null;
  return (
    <p className={`${styles.notice} ${styles.placesNotice}`}>
      {`Con una provincia elegida no se muestran las promos de las que MODO no informa dónde valen (las de las webs propias sin ese dato sí, marcadas «Zona sin confirmar»): ${hidden.join(", ")}. Para verlas, elegí «Todas las provincias».`}
    </p>
  );
}

/** A part that could not be read is said, never shown as empty (invariant 24). */
function PartialFailures({ data }: { readonly data: BenchmarkData }) {
  const { readAgain } = useBenchmarkActions();
  const problems = [
    data.brands === null
      ? "No se pudieron traer los lugares y los logos de las marcas: con una provincia elegida pueden faltar promos."
      : "",
    data.handLoaded === null
      ? "No se pudieron traer las promos cargadas a mano: la comparación sigue sin ellas."
      : "",
  ].filter(Boolean);
  if (problems.length === 0) return null;
  return (
    <div className={`${styles.card} ${styles.highlight}`} role="alert">
      {problems.map((problem) => (
        <p key={problem} className={styles.reminder}>
          {problem}
        </p>
      ))}
      <button
        type="button"
        className={`${styles.button} ${styles.retry}`}
        onClick={() => void readAgain()}
      >
        Reintentar
      </button>
    </div>
  );
}

function ProbeOfBenchmark() {
  const value = useBenchmark();
  useEffect(() => registerProbe("benchmark", () => benchmarkProbe(value)), [value]);
  return null;
}

function Ready({ handLoadedPage }: { readonly handLoadedPage: boolean }) {
  const { screen, data } = useBenchmark();
  return (
    <>
      <ProbeOfBenchmark />
      <Filters />
      <PartialFailures data={data} />
      <PlacesNotice />
      <Tabs />
      {handLoadedPage ? <HandLoadedPage /> : VIEWS[screen.view]()}
    </>
  );
}

function Message({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className={styles.empty}>
      <strong>{title}</strong>
      {children}
    </div>
  );
}

interface ScreenParts {
  readonly reading: BenchmarkReading;
  readonly screen: ScreenState;
  readonly actions: BenchmarkActions;
  readonly isAdmin: boolean;
}

function useValue({ reading, screen, isAdmin }: Omit<ScreenParts, "actions">) {
  const { load, cards } = reading;
  const data = load.status === "ready" ? load.data : null;
  return useMemo((): BenchmarkValue | null => {
    if (!data) return null;
    const brands = brandIndex(data.brands ?? []);
    const days = filterDays();
    const filtered = filteredPromotions(data.rows, screen.filters, brands, days);
    return { screen, data, cards, brands, filtered, days, isAdmin };
  }, [data, cards, screen, isAdmin]);
}

function Body({
  value,
  reading,
  isAdmin,
  handLoadedPage,
}: {
  readonly value: BenchmarkValue | null;
  readonly reading: BenchmarkReading;
  readonly isAdmin: boolean;
  readonly handLoadedPage: boolean;
}) {
  const { load, readAgain } = reading;
  if (load.status === "loading") {
    return <Message title="Cargando…">Trayendo las promos de cada banco.</Message>;
  }
  if (load.status === "failed") {
    return (
      <Message title={load.message}>
        <button type="button" className={styles.button} onClick={() => void readAgain()}>
          Reintentar
        </button>
      </Message>
    );
  }
  if (!value || value.data.rows.length === 0) {
    return (
      <Message title="Todavía no hay promos de la competencia">
        {isAdmin
          ? "Tocá «Actualizar ahora» para bajarlas por primera vez."
          : "Se actualizan una vez por semana."}
      </Message>
    );
  }
  return <Ready handLoadedPage={handLoadedPage} />;
}

function Labels({
  reading,
  today,
}: {
  readonly reading: BenchmarkReading;
  readonly today: string;
}) {
  const { load, last } = reading;
  const read = load.status === "ready" ? load.data : last;
  if (load.status === "ready" && read.meta === null) {
    return (
      <p className={`${styles.notice} ${styles.metaFailure}`} role="alert">
        No se pudo leer de dónde sale cada banco ni cuándo se actualizó.{" "}
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => void reading.readAgain()}
        >
          Reintentar
        </button>
      </p>
    );
  }
  return <SourceLabels meta={read.meta ?? []} handLoaded={read.handLoaded ?? []} today={today} />;
}

function SheetButton({ value }: { readonly value: BenchmarkValue }) {
  const inputs = useCallback(
    () => ({
      filtered: value.filtered,
      filters: value.screen.filters,
      references: value.screen.references,
      meta: value.data.meta ?? [],
      cards: sortedCards(value.cards ?? []),
      brands: value.brands,
      today: value.days.today,
    }),
    [value],
  );
  const sheet = useSheetDownload(inputs);
  return (
    <button
      type="button"
      className={styles.button}
      disabled={sheet.isBusy}
      onClick={() => void sheet.download()}
    >
      {sheet.isBusy ? "Generando…" : "Descargar Excel"}
    </button>
  );
}

function Top({
  value,
  isAdmin,
  refresh,
}: {
  readonly value: BenchmarkValue | null;
  readonly isAdmin: boolean;
  readonly refresh: ReturnType<typeof useRefresh>;
}) {
  return (
    <div className={styles.top}>
      <div>
        <h2>Benchmark</h2>
        <p>{INTRO}</p>
      </div>
      <div className={styles.acts}>
        {value && value.data.rows.length > 0 && <SheetButton value={value} />}
        {isAdmin && (
          <button
            type="button"
            className={styles.button}
            disabled={refresh.step !== null}
            onClick={() => void refresh.refresh()}
          >
            {refresh.step ?? "Actualizar ahora"}
          </button>
        )}
      </div>
    </div>
  );
}

function useActions(
  reading: BenchmarkReading,
  dispatch: (action: ScreenAction) => void,
  screen: ScreenState,
) {
  const { readAgain, readCardsAgain } = reading;
  const setReference = useCallback(
    (rubro: string, typed: string) => {
      const references = { ...screen.references, [rubro]: typedAmount(typed) };
      try {
        localStorage.setItem(REFERENCE_KEY, JSON.stringify(references));
      } catch {
        // Without storage it lasts while the tab is open.
      }
      dispatch({ type: "reference", references });
    },
    [dispatch, screen.references],
  );
  return useMemo(
    (): BenchmarkActions => ({ dispatch, setReference, readAgain, readCardsAgain }),
    [dispatch, setReference, readAgain, readCardsAgain],
  );
}

/**
 * The screen. The page "Cargadas a mano" is shown to nobody, as in the old app (no tab leads
 * there): only its own tests open it, with `handLoadedPage`.
 */
export function BenchmarkScreen({ handLoadedPage = false }: { readonly handLoadedPage?: boolean }) {
  const reading = useBenchmarkData();
  const [screen, dispatch] = useReducer(screenReducer, null, () =>
    firstScreen(readStoredReferences()),
  );
  const isAdmin = useIsAdmin();
  // A view from the search of screens: as its solapa does.
  usePlaceRequests("benchmark", (view) => {
    if (isBenchView(view)) dispatch({ type: "view", view });
  });
  const actions = useActions(reading, dispatch, screen);
  const value = useValue({ reading, screen, isAdmin });
  const refresh = useRefresh(reading.readAgain);
  const today = value?.days.today ?? filterDays().today;
  return (
    <div
      className={styles.view}
      data-testid="benchmark"
      data-view={screen.view}
      data-loading={reading.load.status === "loading"}
    >
      <div className={styles.root}>
        <BenchmarkActionsContext.Provider value={actions}>
          <BenchmarkContext.Provider value={value}>
            <Top value={value} isAdmin={isAdmin} refresh={refresh} />
            <Labels reading={reading} today={today} />
            <Body
              value={value}
              reading={reading}
              isAdmin={isAdmin}
              handLoadedPage={handLoadedPage}
            />
          </BenchmarkContext.Provider>
        </BenchmarkActionsContext.Provider>
      </div>
    </div>
  );
}

export function BenchmarkView(_props: ViewProps) {
  return <BenchmarkScreen />;
}
