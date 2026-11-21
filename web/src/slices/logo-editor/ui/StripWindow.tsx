import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { type Promotion, titleCase } from "@/shared/domain/promotions/index.ts";
import { usePromotionFiltersPort } from "@/shared/lib/promotions/promotion-filters.ts";
import { registerProbe } from "@/shared/lib/test-probe.ts";
import { usePermissions } from "@/shared/session/index.ts";
import { Button, Icon, Modal } from "@/shared/ui/index.ts";
import { isOnlinePromotion } from "@/shared/domain/promotions/index.ts";
import { MAX_CARDS, stripListInfo } from "../model/brand-filter.ts";
import { type BrandPicker, startingFilters, useBrandPicker } from "../model/brand-picker.ts";
import { attachStripKeyboard } from "../model/strip-keyboard.ts";
import type { StripSession } from "../model/strip-session.ts";
import type { StripPick } from "../model/strip-types.ts";
import { type StripActions, useStripActions } from "../model/use-strip-window.ts";
import { BrandFiltersBar } from "./BrandFiltersBar.tsx";
import { BrandCard } from "./BrandList.tsx";
import { StripPreviewBlock } from "./StripPreviewBlock.tsx";
import { StripSelection } from "./StripSelection.tsx";
import pickerStyles from "./LogoPicker.module.css";
import styles from "./StripWindow.module.css";

const NO_BRANDS: readonly Promotion[] = [];

function useSelection(session: StripSession): readonly StripPick[] {
  return useSyncExternalStore(session.subscribe, () => session.getState().selection);
}

function WindowIntro({ session }: { readonly session: StripSession }) {
  const { n, filas, porFila } = session.info;
  return (
    <div className={pickerStyles.lead} data-testid="strip-intro">
      {n > 0 && (
        <>
          La franja tiene <b>{n} logos</b> en {filas.length}
          {filas.length === 1 ? " fila" : " filas"} ({porFila} por fila).{" "}
        </>
      )}
      Tildá las marcas en el orden en que van; después podés reordenarlas. Vale sólo para este
      flyer.
    </div>
  );
}

function StepTabs({
  step,
  count,
  onStep,
}: {
  readonly step: number;
  readonly count: number;
  readonly onStep: (step: number) => void;
}) {
  return (
    <div className={styles.steps} role="tablist" aria-label="Pasos" data-testid="strip-steps">
      <button
        type="button"
        role="tab"
        aria-selected={step === 1}
        data-step="1"
        onClick={() => {
          onStep(1);
        }}
      >
        1. Elegir marcas {count > 0 && <span>({count})</span>}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={step === 2}
        data-step="2"
        onClick={() => {
          onStep(2);
        }}
      >
        2. Ordenar y ver
      </button>
    </div>
  );
}

/** Those ticked, always at hand on top, even if the filter does not bring them. */
function cardsOf(selection: readonly StripPick[], list: readonly Promotion[]) {
  const ticked = selection.map(
    ({ img, t }) =>
      list.find(({ imagen }) => imagen === img) ?? {
        id: img,
        imagen: img,
        titulo: t,
        subtitulo: "",
      },
  );
  const logos = new Set(selection.map(({ img }) => img));
  const rest = list.filter(({ imagen }) => !logos.has(imagen ?? "")).slice(0, MAX_CARDS);
  return [...ticked, ...rest];
}

function EmptyList({ picker }: { readonly picker: BrandPicker }) {
  const { filters, hasCatalog, isCatalogRead, isSearchingLocality } = picker;
  if (isSearchingLocality) {
    return (
      <div className={pickerStyles.empty}>
        Buscando las promos de {titleCase(filters.locality)}…
      </div>
    );
  }
  if (!isCatalogRead) return <div className={pickerStyles.empty}>Cargando promociones…</div>;
  if (!hasCatalog) {
    return <div className={pickerStyles.empty}>No se pudo leer el catálogo de promociones.</div>;
  }
  return <div className={pickerStyles.empty}>No hay promos vigentes con esos filtros.</div>;
}

function infoOf(picker: BrandPicker): string {
  const { brands, filters, hasCatalog, isSearchingLocality } = picker;
  if (isSearchingLocality) return `Buscando las promos de ${titleCase(filters.locality)}…`;
  return hasCatalog ? stripListInfo(filters, brands.list.length) : "";
}

function StripBrandList({
  session,
  picker,
  actions,
}: {
  readonly session: StripSession;
  readonly picker: BrandPicker;
  readonly actions: StripActions;
}) {
  const selection = useSelection(session);
  const { brands, filters, isSearchingLocality } = picker;
  const list = isSearchingLocality ? NO_BRANDS : brands.list;
  const cards = useMemo(() => cardsOf(selection, list), [list, selection]);
  return (
    <div
      className={`${pickerStyles.list} ${styles.list}`}
      data-testid="brand-list"
      data-search={filters.search}
      data-searching={isSearchingLocality || undefined}
    >
      {cards.length === 0 && <EmptyList picker={picker} />}
      {cards.map((promotion) => {
        const logo = promotion.imagen ?? "";
        const order = selection.findIndex(({ img }) => img === logo);
        return (
          <BrandCard
            key={logo}
            promotion={promotion}
            picker={picker}
            isLoading={false}
            number={null}
            stripNumber={order >= 0 ? order + 1 : null}
            onChoose={actions.tickBrand}
          />
        );
      })}
    </div>
  );
}

function BrandsColumn({
  session,
  picker,
  actions,
}: {
  readonly session: StripSession;
  readonly picker: BrandPicker;
  readonly actions: StripActions;
}) {
  const { can } = usePermissions();
  return (
    <div className={styles.left} data-testid="strip-brands">
      <BrandFiltersBar picker={picker} searchHint="Buscar marca" />
      <label className={pickerStyles.daysTick}>
        <input
          type="checkbox"
          checked={picker.withDays}
          onChange={(event) => {
            picker.setWithDays(event.target.checked);
          }}
        />{" "}
        Súper: poner sus días de descuento debajo
      </label>
      <div className={styles.infoRow}>
        <div className={pickerStyles.info} data-testid="brand-info">
          {infoOf(picker)}
        </div>
        <button
          type="button"
          className={`${styles.action} ${styles.suggest}`}
          title="Completa los lugares que faltan con marcas vigentes de la zona elegida, de rubros variados"
          disabled={actions.isSuggesting}
          onClick={actions.suggest}
        >
          {actions.isSuggesting ? "Sugiriendo…" : "✨ Sugerir marcas"}
        </button>
        {can("promos_buscar") && (
          <button
            type="button"
            className={styles.action}
            title="Abre Promociones → Activas con estos filtros, a pantalla completa: elegís ahí y volvés a esta ventana con todo"
            onClick={actions.chooseAtFullScreen}
          >
            <Icon name="expand" size={14} /> Elegir en pantalla completa
          </button>
        )}
      </div>
      <StripBrandList session={session} picker={picker} actions={actions} />
    </div>
  );
}

function SelectionColumn({
  session,
  picker,
  actions,
}: {
  readonly session: StripSession;
  readonly picker: BrandPicker;
  readonly actions: StripActions;
}) {
  const hasSuggested = useSelection(session).some(({ sug }) => sug);
  return (
    <div className={styles.right}>
      <div className={styles.label}>
        Tu selección <span>(en este orden; arrastrá o usá las flechas)</span>
        {hasSuggested && (
          <button
            type="button"
            className={styles.removeSuggested}
            onClick={actions.removeSuggested}
          >
            Quitar sugeridas
          </button>
        )}
      </div>
      <StripSelection session={session} picker={picker} />
    </div>
  );
}

function putLabel(count: number, isPutting: boolean): string {
  if (isPutting) return "Poniendo…";
  if (count === 0) return "Poner logos";
  return `Poner ${String(count)}${count === 1 ? " logo" : " logos"}`;
}

function WindowFooter({
  session,
  actions,
  onStep,
}: {
  readonly session: StripSession;
  readonly actions: StripActions;
  readonly onStep: (step: number) => void;
}) {
  const count = useSelection(session).length;
  const isPutting = useSyncExternalStore(session.subscribe, () => session.getState().isPutting);
  return (
    <div className={styles.actions} data-testid="strip-actions">
      {session.base && (
        <Button
          variant="ghost"
          size="dialog"
          className={styles.onSecondStep}
          onClick={actions.restoreOriginal}
        >
          Volver la franja al original
        </Button>
      )}
      <Button variant="ghost" size="dialog" className={styles.onFirstStep} onClick={actions.close}>
        Cancelar
      </Button>
      <Button
        variant="ghost"
        size="dialog"
        className={styles.backButton}
        onClick={() => {
          onStep(1);
        }}
      >
        ← Elegir más
      </Button>
      <Button
        size="dialog"
        className={styles.nextButton}
        onClick={() => {
          onStep(2);
        }}
      >
        Siguiente: ordenar{count > 0 && ` (${String(count)})`} →
      </Button>
      <Button
        size="dialog"
        className={styles.onSecondStep}
        disabled={isPutting}
        data-testid="strip-put"
        onClick={() => {
          void actions.put();
        }}
      >
        {putLabel(count, isPutting)}
      </Button>
    </div>
  );
}

/** What a test can read of what the window offers: its cards stop at a limit. */
function useOffersProbe(picker: BrandPicker) {
  const { brands } = picker;
  useEffect(
    () =>
      registerProbe("logoStripWindow", () => ({
        offers: () =>
          brands.list.map((promotion) => ({
            id: promotion.id,
            logo: promotion.imagen ?? "",
            title: promotion.titulo,
            isOnline: isOnlinePromotion(promotion),
          })),
      })),
    [brands],
  );
}

/** Armar franja: the preview above, the brands on the left and the selection on the right. */
export function StripWindow({ session }: { readonly session: StripSession }) {
  const port = usePromotionFiltersPort();
  const picker = useBrandPicker(
    session.filters() ?? { ...startingFilters(port.read()), onlyPercent: false },
  );
  const actions = useStripActions(session, picker);
  const count = useSelection(session).length;
  // Coming back from Activas with brands chosen: directly to ordering them.
  const [step, setStep] = useState(session.hasComeBack() && count > 0 ? 2 : 1);
  useOffersProbe(picker);
  useEffect(() => attachStripKeyboard(session), [session]);
  const header = useRef<HTMLDivElement>(null);
  const onStep = (next: number) => {
    setStep(next);
    // Each step starts from the top of the window.
    header.current?.closest("dialog")?.scrollTo(0, 0);
  };
  const stepClass = step === 1 ? styles.firstStep : styles.secondStep;
  return (
    <Modal
      onClose={actions.close}
      size="wide"
      look="dialog"
      closeOnBackdrop={false}
      className={`${styles.window} ${stepClass}`}
    >
      <div ref={header} className={pickerStyles.header}>
        <div className={pickerStyles.headerText}>
          <Modal.Title className={pickerStyles.title}>Armar franja</Modal.Title>
          <WindowIntro session={session} />
        </div>
        <button
          type="button"
          className={pickerStyles.close}
          aria-label="Cerrar"
          onClick={actions.close}
        >
          ×
        </button>
      </div>
      <StepTabs step={step} count={count} onStep={onStep} />
      {session.rect.corta && (
        <div className={pickerStyles.warning}>
          Ojo: el recuadro corta parte de otro dibujo del flyer y lo va a tapar a medias. Si no es
          lo que querés, cancelá y marcalo de nuevo.
        </div>
      )}
      <StripPreviewBlock
        session={session}
        withDays={picker.withDays}
        daysOf={actions.daysOf}
        step={step}
      />
      <div className={styles.columns}>
        <BrandsColumn session={session} picker={picker} actions={actions} />
        <SelectionColumn session={session} picker={picker} actions={actions} />
      </div>
      <WindowFooter session={session} actions={actions} onStep={onStep} />
    </Modal>
  );
}
