import { useEffect, useMemo, useRef, useState } from "react";
import type { Promotion } from "@/shared/domain/promotions/index.ts";
import { useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { Button, Modal } from "@/shared/ui/index.ts";
import { listInfo } from "../model/brand-filter.ts";
import { type BrandPicker, useBrandPicker } from "../model/brand-picker.ts";
import {
  type FlyerPlace,
  indexOfPlace,
  isAdjustable,
  isText,
  isUnderStrip,
  type PlacedChange,
} from "../model/change.ts";
import { useLogoEditorActions } from "../model/editor-context.ts";
import type { PickerRequest } from "../model/editor-store.ts";
import { paintThumbnail } from "../model/thumbnail.ts";
import {
  type PickerActionsInput,
  useBrandPlacing,
  useLogoUpload,
} from "../model/use-picker-actions.ts";
import { useFullScreenChoice } from "../model/use-full-screen-choice.ts";
import { useTextDraft } from "../model/use-text-draft.ts";
import { BrandFiltersBar } from "./BrandFiltersBar.tsx";
import { BrandList } from "./BrandList.tsx";
import { LogoTextForm } from "./LogoTextForm.tsx";
import styles from "./LogoPicker.module.css";

/** How the window opens on this place: what it has today decides what it offers. */
function shapeOf(list: readonly PlacedChange[], { place, several, text }: PickerRequest) {
  const index = indexOfPlace(list, place);
  const current = index >= 0 ? list[index] : undefined;
  const hasLogoNow = isAdjustable(current);
  // A place deleted, or under a strip, hides nothing any more: touching it is for adding.
  const under = isUnderStrip(list, place);
  const covered = !hasLogoNow && (Boolean(current) || under);
  const empty = Boolean(place.vacio) || covered || Boolean(several);
  const shownPlace: FlyerPlace = empty ? { ...place, vacio: true } : place;
  return {
    current: several ? undefined : current,
    forAdding: !several && empty && !hasLogoNow,
    noMove: empty || under,
    place: shownPlace,
    previousText: text ?? null,
  };
}

function PickerThumbnail({
  place,
  current,
  isHidden,
}: {
  readonly place: FlyerPlace;
  readonly current: PlacedChange | undefined;
  /** A free place or a text have no logo to show. */
  readonly isHidden: boolean;
}) {
  const editor = useLogoEditorActions();
  const { logos } = useFlyerWorkspace();
  const canvas = useRef<HTMLCanvasElement>(null);
  const logoKey = !isText(current) && current?.img ? current.img : "";
  useEffect(() => {
    if (!canvas.current) return undefined;
    if (isHidden) {
      canvas.current.hidden = true;
      return undefined;
    }
    return paintThumbnail({ canvas: canvas.current, editor, logos, place, logoKey });
  }, [editor, isHidden, logoKey, logos, place]);
  return (
    <canvas
      ref={canvas}
      className={styles.thumbnail}
      aria-hidden="true"
      data-testid="picker-thumbnail"
    />
  );
}

function HeaderText({
  current,
  several,
}: {
  readonly current: PlacedChange | undefined;
  readonly several: readonly FlyerPlace[] | undefined;
}) {
  if (several) {
    return "Tocá las marcas en el orden en que van: la 1 va al primer lugar (de izquierda a derecha y de arriba abajo), la 2 al segundo, y así. Tocala de nuevo para sacarla.";
  }
  const rest =
    "Elegí una marca de Promociones, subí un logo, escribí un texto o mové lo que hay. El cambio vale sólo para este flyer.";
  if (!current) return rest;
  if (!isAdjustable(current)) return `Ahora está vacío. ${rest}`;
  return (
    <>
      Ahora dice <b>{current.t}</b>. {rest}
    </>
  );
}

function pickerTitle(forAdding: boolean, several: readonly FlyerPlace[] | undefined): string {
  if (several) return `Reemplazar ${several.length} lugares`;
  return forAdding ? "Agregar acá" : "Cambiar esto";
}

interface ModesProps extends PickerActionsInput {
  readonly noMove: boolean;
  readonly onWrite: () => void;
}

function PickerModes({ editor, place, close, noMove, onWrite }: ModesProps) {
  const toast = useToast();
  const { fileInput, isBusy, askForFile, readFile } = useLogoUpload({ editor, place, close });
  return (
    <div className={styles.modes}>
      {!noMove && (
        <Button
          variant="ghost"
          size="sm"
          icon="move"
          onClick={() => {
            close();
            editor.moveFromFlyer(place);
            toast.show("Arrastralo para moverlo, o usá la barrita para el tamaño.");
          }}
        >
          Mover o agrandar lo que hay
        </Button>
      )}
      <Button variant="ghost" size="sm" icon="type" onClick={onWrite}>
        Escribir un texto
      </Button>
      <Button
        variant="ghost"
        size="sm"
        icon="upload"
        disabled={isBusy}
        title="Para marcas que no están en Promociones (PNG o JPG; mejor con fondo blanco o transparente)"
        onClick={askForFile}
      >
        Subir logo de la PC
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        data-testid="logo-file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void readFile(file);
        }}
      />
    </div>
  );
}

function BrandsPart({
  picker,
  loadingLogo,
  picks,
  onChoose,
  onFullScreen,
}: {
  readonly picker: BrandPicker;
  readonly loadingLogo: string | null;
  readonly picks: readonly string[] | null;
  readonly onChoose: (promotion: Promotion) => void;
  readonly onFullScreen: (() => void) | null;
}) {
  const { brands, filters, hasCatalog, isSearchingLocality } = picker;
  const info = isSearchingLocality || !hasCatalog ? "" : listInfo(filters, brands.list.length);
  return (
    <>
      <label className={styles.daysTick}>
        <input
          type="checkbox"
          checked={picker.withDays}
          onChange={(event) => {
            picker.setWithDays(event.target.checked);
          }}
        />{" "}
        Si es un súper, poner también sus días debajo{" "}
        <span>(reemplaza el texto de días que hay)</span>
      </label>
      <div className={styles.infoRow}>
        <div className={styles.info} data-testid="brand-info">
          {info}
        </div>
        {onFullScreen && (
          <button
            type="button"
            className={styles.link}
            title="Ver todas las promociones en la solapa Activas y elegir de ahí"
            onClick={onFullScreen}
          >
            Elegir en pantalla completa
          </button>
        )}
      </div>
      <BrandList picker={picker} loadingLogo={loadingLogo} picks={picks} onChoose={onChoose} />
    </>
  );
}

interface SeveralState {
  readonly picks: readonly Promotion[];
  readonly isPutting: boolean;
  readonly total: number;
  readonly onPut: () => void;
}

function severalLabel({ picks, isPutting, total }: SeveralState): string {
  if (isPutting) return "Poniendo…";
  return picks.length > 0 ? `Poner ${picks.length} de ${total}` : "Poner las marcas";
}

interface FooterProps extends PickerActionsInput {
  readonly current: PlacedChange | undefined;
  readonly canLeaveEmpty: boolean;
  readonly onPutText: (() => void) | null;
  readonly several: SeveralState | null;
}

function PickerFooter({
  editor,
  place,
  close,
  current,
  canLeaveEmpty,
  onPutText,
  several,
}: FooterProps) {
  const toast = useToast();
  return (
    <div className={styles.actions}>
      <span className={styles.actionsLeft}>
        {current && (
          <button
            type="button"
            className={styles.link}
            onClick={() => {
              close();
              editor.takeBack(place);
              toast.show("Ese logo volvió al original.");
            }}
          >
            Volver al original
          </button>
        )}
        {canLeaveEmpty && (
          <button
            type="button"
            className={styles.link}
            onClick={() => {
              close();
              editor.leftEmpty(place);
              toast.show("Listo: ese lugar queda vacío en este flyer.");
            }}
          >
            Dejar el lugar vacío
          </button>
        )}
      </span>
      <Button variant="ghost" size="dialog" onClick={close}>
        Cancelar
      </Button>
      {onPutText && (
        <Button size="dialog" onClick={onPutText}>
          Poner el texto
        </Button>
      )}
      {several && (
        <Button
          size="dialog"
          disabled={several.picks.length === 0 || several.isPutting}
          onClick={several.onPut}
        >
          {severalLabel(several)}
        </Button>
      )}
    </div>
  );
}

/** Choosing the brands of several places: one for each, in the order they are touched. */
function useSeveral(
  places: readonly FlyerPlace[] | undefined,
  put: ReturnType<typeof useBrandPlacing>["putSeveral"],
) {
  const toast = useToast();
  const [picks, setPicks] = useState<readonly Promotion[]>([]);
  const [isPutting, setPutting] = useState(false);
  const total = places?.length ?? 0;
  return {
    state: places
      ? {
          picks,
          isPutting,
          total,
          onPut: () => {
            setPutting(true);
            void put(picks, places, () => {
              setPutting(false);
            });
          },
        }
      : null,
    toggle: (promotion: Promotion) => {
      const known = picks.findIndex(({ imagen }) => imagen === promotion.imagen);
      if (known >= 0) setPicks(picks.toSpliced(known, 1));
      else if (picks.length >= total) {
        toast.show(`Ya elegiste ${total}: sacá una para cambiarla.`);
      } else setPicks([...picks, promotion]);
    },
    images: places ? picks.map(({ imagen }) => imagen ?? "") : null,
  };
}

export function LogoPicker({ request }: { readonly request: PickerRequest }) {
  const editor = useLogoEditorActions();
  const toast = useToast();
  const { several } = request;
  const shape = useMemo(() => shapeOf(editor.active(), request), [editor, request]);
  const { current, forAdding, noMove, place, previousText } = shape;
  const picker = useBrandPicker();
  const close = editor.closePicker;
  const actions = { editor, place, close };
  const placing = useBrandPlacing(picker, actions);
  const severalChoice = useSeveral(several, placing.putSeveral);
  const [isWriting, setWriting] = useState(Boolean(previousText));
  const draft = useTextDraft(editor.picture(), place, previousText);
  const chooseFullScreen = useFullScreenChoice();

  const putText = () => {
    const written = draft.written();
    const text = written.texto
      .replaceAll("\r", "")
      .replace(/[ \t]+$/gm, "")
      .trim();
    if (!text) {
      toast.show("Escribí el texto primero.");
      return;
    }
    close();
    editor.placeText(place, { ...written, texto: text }, previousText);
    toast.show("Listo. Arrastralo para moverlo, o usá la barrita para el tamaño.");
  };

  const hasThumbnail = !place.vacio && !several && !isText(current);
  return (
    <Modal onClose={close} size="medium" look="dialog" className={styles.window}>
      <div className={styles.header}>
        <PickerThumbnail place={place} current={current} isHidden={!hasThumbnail} />
        <div className={styles.headerText}>
          <Modal.Title className={styles.title}>{pickerTitle(forAdding, several)}</Modal.Title>
          <div className={styles.lead}>
            <HeaderText current={current} several={several} />
          </div>
        </div>
        <button type="button" className={styles.close} aria-label="Cerrar" onClick={close}>
          ×
        </button>
      </div>
      {!several && !isWriting && (
        <PickerModes
          {...actions}
          noMove={noMove}
          onWrite={() => {
            setWriting(true);
          }}
        />
      )}
      {isWriting && (
        <LogoTextForm
          place={place}
          draft={draft}
          onBack={
            previousText
              ? null
              : () => {
                  setWriting(false);
                }
          }
        />
      )}
      {!isWriting && <BrandFiltersBar picker={picker} />}
      {place.corta && (
        <div className={styles.warning}>
          Ojo: el recuadro que marcaste corta parte de otro dibujo del flyer y lo va a tapar a
          medias. Si no es lo que querés, cancelá y marcalo de nuevo.
        </div>
      )}
      {!isWriting && (
        <BrandsPart
          picker={picker}
          loadingLogo={placing.loadingLogo}
          picks={severalChoice.images}
          onFullScreen={
            several || previousText
              ? null
              : () => {
                  chooseFullScreen(place, picker.filters, picker.withDays);
                }
          }
          onChoose={(promotion) => {
            if (several) severalChoice.toggle(promotion);
            else void placing.chooseBrand(promotion);
          }}
        />
      )}
      <PickerFooter
        {...actions}
        current={current}
        canLeaveEmpty={!several && !forAdding}
        onPutText={isWriting ? putText : null}
        several={severalChoice.state}
      />
    </Modal>
  );
}
