// The bar that guides the placement of a saved set, and what it marks over the flyer.
import { useEffect, useRef } from "react";
import { useFlyerWorkspace, useWorkspaceValue } from "@/shared/lib/flyer-workspace/index.ts";
import { promotionLogoAddress } from "@/shared/lib/promotions/logo-file.ts";
import { provincesName } from "@/shared/domain/promotions/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button } from "@/shared/ui/index.ts";
import { isFromFlyer, isUploaded } from "../model/change.ts";
import { useLogoEditorActions, useLogoEditorValue } from "../model/editor-context.ts";
import type { LogoEditor } from "../model/editor-store.ts";
import { markReaderFor } from "../model/flyer-marks.ts";
import {
  doneText,
  dotsOf,
  hintOf,
  isAtTheEnd,
  itemNow,
  placeNow,
  type PlacementView,
  sureLeft,
} from "../model/placement-model.ts";
import type { ItemPlace } from "../model/saved-set-matching.ts";
import type { SavedItem, SavedLogo } from "../model/saved-set.ts";
import type { StripBox } from "../model/strip-types.ts";
import { usePromotionCatalog } from "@/shared/lib/promotions/catalog-query.ts";
import styles from "./SavedSets.module.css";

interface LayerBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function LogoImage({ logo }: { readonly logo: string }) {
  const { bucket } = useBackend();
  const { logos } = useFlyerWorkspace();
  const editor = useLogoEditorActions();
  const art = editor.picture();
  const image = art ? logos.imageFor(logo, art, editor.currentArt()) : null;
  if (image instanceof HTMLCanvasElement) return <img alt="" src={image.toDataURL("image/png")} />;
  if (isUploaded(logo) || isFromFlyer(logo)) return <span className={styles.icon}>★</span>;
  return <img alt="" src={promotionLogoAddress(logo, bucket)} />;
}

function Mini({ item }: { readonly item: SavedItem }) {
  if (item.tipo === "franja") {
    return (
      <span className={styles.miniGrid}>
        {item.sel.slice(0, 4).map(({ img }) => (
          <LogoImage key={img} logo={img} />
        ))}
      </span>
    );
  }
  if (item.tipo === "vacio") return <span className={styles.icon}>∅</span>;
  if (item.tipo === "texto") return <span className={styles.icon}>T</span>;
  return <LogoImage logo={item.img} />;
}

function Warnings({ view }: { readonly view: PlacementView }) {
  const editor = useLogoEditorActions();
  const { data: catalog } = usePromotionCatalog(true);
  useLogoEditorValue((state) => state.list);
  const reader = markReaderFor(catalog?.all ?? []);
  const province = view.data.prov ?? "";
  const list = editor.active();
  const expired = list.filter(reader.isExpired).length;
  const outside = province
    ? list.filter((change) => change.prov === province && reader.isOutOfProvince(change)).length
    : 0;
  return (
    <>
      {view.skipped > 0 && (
        <span>
          {" "}
          {view.skipped}
          {view.skipped === 1 ? " salteado" : " salteados"}
        </span>
      )}
      {expired > 0 && (
        <span className={styles.warnExpired}>
          {" "}
          {expired}
          {expired === 1 ? " vencida (en rojo)" : " vencidas (en rojo)"}
        </span>
      )}
      {outside > 0 && (
        <span className={styles.warnProvince}>
          {" "}
          {outside} sin promo en {provincesName(province)} (en amarillo)
        </span>
      )}
    </>
  );
}

function FinishedBar({
  view,
  editor,
}: {
  readonly view: PlacementView;
  readonly editor: LogoEditor;
}) {
  const isPreview = view.mode === "preview";
  const done = doneText(view.counts);
  return (
    <>
      <div className={`${styles.mini} ${styles.miniDone}`}>
        <span className={styles.icon}>✓</span>
      </div>
      <div className={styles.barText}>
        <div className={styles.progress} data-testid="placement-progress">
          {isPreview ? "Encontré dónde va todo" : "Terminaste de colocar"}
        </div>
        <div className={styles.title} data-testid="placement-title">
          {isPreview ? `Así queda «${view.name}»` : `Listo «${view.name}»`}
        </div>
        <div className={styles.hint}>
          {done ? `Puse ${done}. Lo nuevo está marcado en el flyer.` : "No se puso nada."}
          <Warnings view={view} />
        </div>
      </div>
      <div className={styles.actions}>
        {isPreview ? (
          <>
            <Button
              variant="ghost"
              size="dialog"
              data-placement="restore"
              onClick={editor.placement.restore}
            >
              Volver a como estaba
            </Button>
            <Button
              variant="ghost"
              size="dialog"
              data-placement="review"
              onClick={editor.placement.review}
            >
              Revisar uno por uno
            </Button>
            <Button
              size="dialog"
              data-placement="keep"
              title="Enter"
              onClick={() => {
                editor.placement.finish();
              }}
            >
              Dejar así ✓
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="dialog"
              data-placement="back"
              title="Volver al último paso (Ctrl+Z)"
              onClick={editor.placement.back}
            >
              ‹ Atrás
            </Button>
            <Button
              size="dialog"
              data-placement="finish"
              title="Enter"
              onClick={() => {
                editor.placement.finish();
              }}
            >
              Listo ✓
            </Button>
          </>
        )}
      </div>
    </>
  );
}

function titleOf(item: SavedItem, days: string): string {
  const withDays = item.tipo === "logo" && item.esSuper && item.conDias;
  if (!withDays) return item.nombre;
  return days ? `${item.nombre}, con sus días (${days})` : `${item.nombre} (sin días con % hoy)`;
}

function StepsBar({ view, editor }: { readonly view: PlacementView; readonly editor: LogoEditor }) {
  const item = itemNow(view);
  const place = placeNow(view);
  if (!item || !place) return null;
  const province = view.data.prov ?? "";
  const logo: SavedLogo | null = item.tipo === "logo" ? item : null;
  const days = logo ? editor.placement.daysFor(logo.img, province) : "";
  const isOutside = logo ? editor.placement.isOutOfProvince(logo.img, province) : false;
  const total = view.order.length;
  const left = total - view.index;
  const sure = sureLeft(view);
  return (
    <>
      <div className={styles.mini}>
        <Mini item={item} />
      </div>
      <div className={styles.barText}>
        <div className={styles.progress} data-testid="placement-progress">
          Colocando «{view.name}» · {view.index + 1} de {total}
        </div>
        <div className={styles.title} data-testid="placement-title">
          {titleOf(item, days)}
        </div>
        {isOutside && (
          <div className={`${styles.hint} ${styles.warnProvince}`}>
            Ojo: hoy no tiene promo en {provincesName(province)}.
          </div>
        )}
        <div className={styles.hint} data-doubtful={!place.ok}>
          {hintOf(item, place.ok)}
        </div>
        <fieldset className={styles.dots} aria-label="Pasos">
          {dotsOf(view).map(({ state, label }, step) => (
            <button
              // The order of the steps can change: its place in the row is what it stands for.
              key={view.order[step]}
              type="button"
              className={styles.dot}
              data-state={state}
              data-step={step}
              aria-current={state === "now" ? "step" : undefined}
              title={label}
              aria-label={label}
              onClick={() => {
                editor.placement.goToStep(step);
              }}
            />
          ))}
        </fieldset>
        {sure >= 2 && (
          <button
            type="button"
            className={styles.placeSure}
            data-placement="placeSure"
            onClick={editor.placement.placeSure}
          >
            {sure === left
              ? `Poner de una los ${String(sure)} que faltan`
              : `Poner de una los ${String(sure)} que encontré seguro (y seguir con los otros ${String(left - sure)})`}
          </button>
        )}
      </div>
      <div className={styles.actions}>
        <Button
          variant="ghost"
          size="dialog"
          data-placement="back"
          disabled={view.index === 0}
          title="Volver al paso anterior (Ctrl+Z)"
          onClick={editor.placement.back}
        >
          ‹ Atrás
        </Button>
        <Button variant="ghost" size="dialog" data-placement="skip" onClick={editor.placement.skip}>
          Saltar
        </Button>
        <Button size="dialog" data-placement="place" title="Enter" onClick={editor.placement.place}>
          Poner acá ✓
        </Button>
        <button
          type="button"
          className={styles.finish}
          data-placement="finish"
          aria-label="Terminar"
          title="Terminar (lo que ya pusiste queda)"
          onClick={() => {
            editor.placement.finish();
          }}
        >
          ×
        </button>
      </div>
    </>
  );
}

export function PlacementBar() {
  const editor = useLogoEditorActions();
  const view = useLogoEditorValue((state) => state.placement);
  if (!view) return null;
  let body = <StepsBar view={view} editor={editor} />;
  if (view.mode === "preview" && view.isBusy) {
    body = (
      <>
        <div className={styles.mini}>
          <span className={styles.spinner} aria-hidden="true" />
        </div>
        <div className={styles.barText}>
          <div className={styles.progress}>Encontré dónde va todo</div>
          <div className={styles.title}>Poniendo «{view.name}»…</div>
        </div>
      </>
    );
  } else if (view.mode === "preview" || isAtTheEnd(view)) {
    body = <FinishedBar view={view} editor={editor} />;
  }
  return (
    <section
      className={styles.bar}
      aria-label="Colocar marcas guardadas"
      data-testid="placement-bar"
      data-mode={view.mode}
      data-busy={view.isBusy}
    >
      {body}
    </section>
  );
}

function useBroughtIntoView<Element extends HTMLElement>() {
  const mark = useRef<Element>(null);
  useEffect(() => {
    mark.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);
  return mark;
}

function MarkOfNow({ place, on }: { readonly place: ItemPlace; readonly on: LayerBox }) {
  const mark = useBroughtIntoView<HTMLDivElement>();
  return (
    <div
      ref={mark}
      className={styles.mark}
      data-testid="placement-suggestion"
      data-uncertain={!place.ok}
      data-text={place.ok ? "Va acá" : "¿Va acá?"}
      style={on}
    />
  );
}

function MarkPlaced({ on, isHighest }: { readonly on: LayerBox; readonly isHighest: boolean }) {
  const mark = useBroughtIntoView<HTMLDivElement>();
  return (
    <div
      ref={isHighest ? mark : undefined}
      className={`${styles.mark} ${styles.markPlaced}`}
      data-testid="placement-placed"
      style={on}
    />
  );
}

function boxesPlaced({ used, done, isBusy }: PlacementView): readonly StripBox[] {
  if (isBusy) return [];
  return used.flatMap((place, index) => {
    const box = place?.rect ?? place?.det;
    return box && done[index] === "placed" ? [box] : [];
  });
}

/** "Va acá" for the step of now; at the end, one box per thing placed. They follow the flyer. */
export function PlacementMarks() {
  const editor = useLogoEditorActions();
  const view = useLogoEditorValue((state) => state.placement);
  useWorkspaceValue((state) => state.draws);
  const coordinates = editor.coordinates();
  if (!view || !coordinates) return null;
  if (view.mode === "steps" && !isAtTheEnd(view)) {
    const place = placeNow(view);
    const box = place?.rect ?? place?.det;
    if (!place || !box) return null;
    return (
      <MarkOfNow
        key={view.index}
        place={place}
        on={coordinates.toLayer(box.x, box.y, box.w, box.h)}
      />
    );
  }
  const placed = boxesPlaced(view).map((box) => coordinates.toLayer(box.x, box.y, box.w, box.h));
  const highest = Math.min(...placed.map(({ top }) => top));
  return (
    <div className={styles.marks} data-testid="placement-marks">
      {placed.map((on) => (
        <MarkPlaced
          key={`${String(on.left)},${String(on.top)}`}
          on={on}
          isHighest={on.top === highest}
        />
      ))}
    </div>
  );
}
