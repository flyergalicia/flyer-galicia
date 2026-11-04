import { type ReactNode, useCallback, useMemo, useState } from "react";
import { isFlyerTabId } from "@/shared/domain/flyer-options.ts";
import { decodeEntities } from "@/shared/domain/promotions/index.ts";
import { usePromotionFiltersPort } from "@/shared/lib/promotions/promotion-filters.ts";
import {
  type ManyBrandsRequest,
  type OneBrandRequest,
  type PickableRow,
  type PickedBrand,
  PromotionPickerContext,
  PromotionPickingContext,
} from "@/shared/lib/promotions/promotion-picking.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { Button } from "@/shared/ui/index.ts";
import styles from "./PromotionPickingHost.module.css";

const NOT_AVAILABLE: Readonly<Partial<Record<PickableRow["status"], string>>> = {
  VENCIDA: "Está vencida: no se puede poner en la franja",
  FUERA_PROV: "Es de otra provincia: no se puede poner en la franja",
};
const NO_PROVINCE = "Elegí una provincia a la izquierda y tocá «Ver promociones».";
const TITLES_ON_BAR = 5;

function oneBrandCell(onPick: OneBrandRequest["onBack"]) {
  return function firstCell({ promotion, status }: PickableRow) {
    if (!promotion?.imagen) return null;
    const reason = NOT_AVAILABLE[status];
    return (
      <button
        type="button"
        className={styles.add}
        disabled={Boolean(reason)}
        title={reason ?? "Poner esta marca en el flyer"}
        data-testid="pick-brand"
        data-logo={promotion.imagen}
        onClick={() => {
          onPick(promotion);
        }}
      >
        +
      </button>
    );
  };
}

function orderOf(picked: readonly PickedBrand[], { promotion }: PickableRow): number {
  return picked.findIndex(({ logo }) => logo === promotion?.imagen) + 1;
}

function manyBrandsCell(picked: readonly PickedBrand[], toggle: (row: PickableRow) => void) {
  return function firstCell(row: PickableRow) {
    if (!row.promotion?.imagen) return null;
    const order = orderOf(picked, row);
    // What cannot go on a flyer, unless it is already chosen: there it can be taken out.
    const reason = order ? undefined : NOT_AVAILABLE[row.status];
    return (
      <button
        type="button"
        className={styles.add}
        disabled={Boolean(reason)}
        aria-pressed={reason ? undefined : order > 0}
        title={reason ?? (order ? "Sacar de la franja" : "Agregar a la franja")}
        data-testid="pick-brand"
        data-logo={row.promotion.imagen}
        onClick={() => {
          toggle(row);
        }}
      >
        {order || "+"}
      </button>
    );
  };
}

function OneBrandBar({
  onBack,
  onCancel,
}: {
  readonly onBack: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <div className={styles.bar} data-testid="picking-bar">
      <div className={styles.text}>
        <b>Cambiar un logo</b> · Tocá <b>+</b> en la marca que querés poner y vuelve sola al flyer.
      </div>
      <div className={styles.actions}>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button size="sm" onClick={onBack}>
          Volver al logo
        </Button>
      </div>
    </div>
  );
}

function ManyBrandsBar({
  picked,
  onBack,
  onCancel,
}: {
  readonly picked: readonly PickedBrand[];
  readonly onBack: () => void;
  readonly onCancel: () => void;
}) {
  const count = picked.length;
  return (
    <section
      className={styles.bar}
      aria-label="Marcas elegidas para la franja"
      data-testid="picking-bar"
      data-titles={JSON.stringify(picked.map(({ title }) => title))}
    >
      <div className={styles.text}>
        <b>Armar franja</b> ·{" "}
        {count > 0 ? (
          <>
            {count}
            {count === 1 ? " marca elegida" : " marcas elegidas"}:{" "}
            <span className={styles.titles}>
              {picked
                .slice(0, TITLES_ON_BAR)
                .map(({ title }, index) => `${String(index + 1)}. ${title}`)
                .join(", ")}
              {count > TITLES_ON_BAR && "…"}
            </span>
          </>
        ) : (
          <>
            Tocá <b>+</b> en las marcas que querés, en el orden en que van. También podés pegar
            marcas en <b>Buscar</b>, validarlas y elegir de ahí.
          </>
        )}
      </div>
      <div className={styles.actions}>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button size="sm" onClick={onBack}>
          Volver a la franja{count > 0 && ` (${String(count)})`}
        </Button>
      </div>
    </section>
  );
}

type ActiveRequest =
  | { readonly kind: "one"; readonly asked: OneBrandRequest }
  | {
      readonly kind: "many";
      readonly asked: ManyBrandsRequest;
      readonly picked: readonly PickedBrand[];
    };

interface Leaving {
  /** Nobody is choosing any more. */
  readonly stop: () => void;
  readonly backToFlyer: () => void;
  readonly tell: (text: string) => void;
}

function onePicking(asked: OneBrandRequest, { stop, backToFlyer, tell }: Leaving) {
  const back: OneBrandRequest["onBack"] = (promotion) => {
    stop();
    backToFlyer();
    asked.onBack(promotion);
  };
  return {
    firstCell: oneBrandCell(back),
    bar: (
      <OneBrandBar
        onBack={() => {
          back(null);
        }}
        onCancel={() => {
          stop();
          tell("Listo: no se cambió el logo.");
        }}
      />
    ),
  };
}

function manyPicking(
  asked: ManyBrandsRequest,
  picked: readonly PickedBrand[],
  toggle: (row: PickableRow) => void,
  { stop, backToFlyer, tell }: Leaving,
) {
  return {
    firstCell: manyBrandsCell(picked, toggle),
    isChosen: (row: PickableRow) => orderOf(picked, row) > 0,
    bar: (
      <ManyBrandsBar
        picked={picked}
        onBack={() => {
          stop();
          backToFlyer();
          asked.onBack(picked);
        }}
        onCancel={() => {
          stop();
          asked.onCancel();
          tell("Listo: no se armó la franja.");
        }}
      />
    ),
  };
}

interface PromotionPickingHostProps {
  readonly activeId: string;
  readonly goTo: (viewId: string) => void;
  readonly children: ReactNode;
}

/** Cambiar logos goes to Promociones to choose brands there, and comes back. */
export function PromotionPickingHost({ activeId, goTo, children }: PromotionPickingHostProps) {
  const port = usePromotionFiltersPort();
  const toast = useToast();
  const [request, setRequest] = useState<ActiveRequest | null>(null);
  // Coming back goes to the flyer on screen: it could have been changed while choosing.
  const [flyerTab, setFlyerTab] = useState(activeId);
  if (isFlyerTabId(activeId) && activeId !== flyerTab) setFlyerTab(activeId);
  const backToFlyer = useCallback(() => {
    goTo(flyerTab);
  }, [flyerTab, goTo]);
  const stopPicking = useCallback(() => {
    setRequest(null);
  }, []);

  const goToPromotions = useCallback(
    (filters: OneBrandRequest["filters"]) => {
      port.ask({ ...filters, listActive: true, noProvinceNotice: NO_PROVINCE });
      goTo("promos");
    },
    [goTo, port],
  );

  const pickOneBrand = useCallback(
    (asked: OneBrandRequest) => {
      setRequest({ kind: "one", asked });
      goToPromotions(asked.filters);
    },
    [goToPromotions],
  );

  const pickManyBrands = useCallback(
    (asked: ManyBrandsRequest) => {
      setRequest({ kind: "many", asked, picked: asked.picked });
      goToPromotions(asked.filters);
    },
    [goToPromotions],
  );

  const toggleBrand = useCallback(
    (row: PickableRow) => {
      if (request?.kind !== "many") return;
      const { promotion, status } = row;
      const logo = promotion?.imagen;
      if (!logo) return;
      const { asked, picked } = request;
      const at = orderOf(picked, row) - 1;
      if (at >= 0) {
        setRequest({ ...request, picked: picked.toSpliced(at, 1) });
        return;
      }
      if (NOT_AVAILABLE[status]) return;
      if (picked.length >= asked.limit) {
        toast.show(asked.limitNotice);
        return;
      }
      const brand = { logo, title: decodeEntities(promotion.titulo) };
      setRequest({ ...request, picked: [...picked, brand] });
      asked.onAdd(brand);
    },
    [request, toast],
  );

  const picking = useMemo(() => {
    if (!request) return null;
    const leaving = {
      stop: stopPicking,
      backToFlyer,
      tell: (text: string) => {
        toast.show(text);
      },
    };
    return request.kind === "one"
      ? onePicking(request.asked, leaving)
      : manyPicking(request.asked, request.picked, toggleBrand, leaving);
  }, [backToFlyer, request, stopPicking, toast, toggleBrand]);

  const picker = useMemo(
    () => ({ pickOneBrand, pickManyBrands, stopPicking }),
    [pickManyBrands, pickOneBrand, stopPicking],
  );
  return (
    <PromotionPickerContext.Provider value={picker}>
      <PromotionPickingContext.Provider value={picking}>
        {children}
      </PromotionPickingContext.Provider>
    </PromotionPickerContext.Provider>
  );
}
