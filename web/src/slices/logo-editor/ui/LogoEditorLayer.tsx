import { type RefObject, useEffect, useMemo, useRef } from "react";
import { useWorkspaceValue, useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { usePromotionCatalog } from "@/shared/lib/promotions/catalog-query.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { boxKeys, boxOf, isAdjustable, type PlacedChange } from "../model/change.ts";
import { flyerCoordinates } from "../model/coordinates.ts";
import { useLogoEditorActions, useLogoEditorValue } from "../model/editor-context.ts";
import {
  EXPIRED_TEXT,
  type MarkReader,
  markReaderFor,
  outOfProvinceText,
} from "../model/flyer-marks.ts";
import { attachKeyboardController } from "../model/keyboard-controller.ts";
import { attachPointerController } from "../model/pointer-controller.ts";
import { PlacementMarks } from "./PlacementBar.tsx";
import { InsertLine, TrimBands } from "./SectionsOnFlyer.tsx";
import styles from "./LogoEditor.module.css";

interface LogoEditorLayerProps {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
  readonly isActive: boolean;
}

function useControllers({ canvasRef, isActive }: LogoEditorLayerProps) {
  const editor = useLogoEditorActions();
  const workspace = useFlyerWorkspace();
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const coordinates = flyerCoordinates(canvas, workspace);
    editor.attachCoordinates(coordinates);
    const detach = attachPointerController(canvas, editor, coordinates, () => layer.current);
    return () => {
      detach();
      editor.attachCoordinates(null);
    };
  }, [canvasRef, editor, workspace]);
  useEffect(() => {
    if (!isActive) return undefined;
    return attachKeyboardController(editor);
  }, [editor, isActive]);
  return layer;
}

/** One notice when expired brands show up, not repeated while they are the same. */
function useExpiredNotice(list: readonly PlacedChange[], marks: MarkReader, isOn: boolean) {
  const toast = useToast();
  const seen = useRef("");
  useEffect(() => {
    if (!isOn) return;
    const expired = list.filter(marks.isExpired);
    const key = expired
      .map(({ img }) => img ?? "")
      .toSorted((one, other) => one.localeCompare(other))
      .join("|");
    if (key === seen.current) return;
    seen.current = key;
    if (expired.length === 0) return;
    toast.show(
      expired.length === 1
        ? "Hay 1 marca vencida en este flyer: está marcada en rojo."
        : `Hay ${expired.length} marcas vencidas en este flyer: están marcadas en rojo.`,
    );
  }, [isOn, list, marks, toast]);
}

function cursorOf(on: boolean, mode: string): string {
  if (!on) return "";
  if (mode === "trim") return "row-resize";
  return mode === "insert" ? "crosshair" : "";
}

interface MarkerProps {
  readonly change: PlacedChange;
  readonly index: number;
  readonly marks: MarkReader;
  readonly chosen: readonly number[];
}

function markerNote(change: PlacedChange, marks: MarkReader) {
  if (marks.isExpired(change)) return { text: EXPIRED_TEXT, tone: "expired" };
  if (marks.isOutOfProvince(change)) {
    return { text: outOfProvinceText(change), tone: "province" };
  }
  return null;
}

function Marker({ change, index, marks, chosen }: MarkerProps) {
  const editor = useLogoEditorActions();
  const selected = useLogoEditorValue((state) => state.selected);
  const flashing = useLogoEditorValue((state) => state.flashing.has(index));
  const coordinates = editor.coordinates();
  if (!coordinates) return null;
  const { tx, ty, tw, th } = boxOf(change);
  const drawsSomething: boolean = isAdjustable(change);
  const place = drawsSomething
    ? coordinates.toLayer(tx, ty, tw, th)
    : coordinates.toLayer(change.x, change.y, change.w, change.h);
  const isChosen = index === selected || chosen.includes(index);
  const note = markerNote(change, marks);
  return (
    <div
      className={styles.marker}
      data-marker=""
      data-testid="logo-marker"
      data-chosen={isChosen || undefined}
      data-group={(chosen.length > 1 && chosen.includes(index)) || undefined}
      data-flashing={flashing || undefined}
      data-note={note?.tone}
      data-note-text={note?.text}
      data-title={change.t}
      style={place}
    >
      {change.franjaBase && (
        <button
          type="button"
          className={styles.editStrip}
          title="Volver al editor de esta franja (sin marcarla de nuevo)"
          data-testid="edit-strip"
          onClick={() => {
            editor.editStrip(change.franja);
          }}
        >
          ✎ Editar franja
        </button>
      )}
    </div>
  );
}

function Guides() {
  const editor = useLogoEditorActions();
  const guides = useLogoEditorValue((state) => state.guides);
  const coordinates = editor.coordinates();
  if (!coordinates) return null;
  return guides.map((guide) => {
    const isVertical = guide.axis === "vertical";
    const place = isVertical
      ? { left: coordinates.toLayer(guide.at, 0, 0, 0).left }
      : { top: coordinates.toLayer(0, guide.at, 0, 0).top };
    return (
      <div
        key={`${guide.axis}${String(guide.at)}`}
        className={styles.guide}
        data-testid="logo-guide"
        data-axis={guide.axis}
        data-near={guide.near || undefined}
        data-exact={guide.exact || undefined}
        style={place}
      />
    );
  });
}

function MarkingBox() {
  const box = useLogoEditorValue((state) => state.box);
  if (!box) return null;
  return (
    <div
      className={styles.markingBox}
      style={{
        left: Math.min(box.x0, box.x1),
        top: Math.min(box.y0, box.y1),
        width: Math.abs(box.x1 - box.x0),
        height: Math.abs(box.y1 - box.y0),
      }}
    />
  );
}

/** The boxes over the flyer: the canvas that is downloaded does not carry them. */
export function LogoEditorLayer(props: LogoEditorLayerProps) {
  const editor = useLogoEditorActions();
  const layer = useControllers(props);
  const on = useLogoEditorValue((state) => state.on);
  const clean = useLogoEditorValue((state) => state.clean);
  const places = useLogoEditorValue((state) => state.places);
  useLogoEditorValue((state) => state.list);
  useLogoEditorValue((state) => state.group);
  useLogoEditorValue((state) => state.selected);
  // What is over the flyer follows it: zoom, size, officers that make it grow.
  useWorkspaceValue((state) => state.draws);
  const { canvasRef } = props;
  const mode = useLogoEditorValue((state) => state.mode);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.dataset["logoEditing"] = on ? String(!clean) : "";
    // Marking a zone, a finger marks too: if not, dragging goes over the page.
    canvas.style.touchAction = on && mode !== "none" ? "none" : "";
    canvas.style.cursor = cursorOf(on, mode);
  }, [canvasRef, clean, mode, on]);
  const { data: catalog } = usePromotionCatalog(on);
  const marks = useMemo(() => markReaderFor(catalog?.all ?? []), [catalog]);
  const list = on ? editor.active() : [];
  useExpiredNotice(list, marks, on);
  const coordinates = editor.coordinates();
  const chosen = editor.chosen();
  const keys = boxKeys(list);
  return (
    <div ref={layer} className={styles.layer} hidden={clean} data-testid="logo-editor-layer">
      {list.map((change, index) => (
        <Marker key={keys[index]} change={change} index={index} marks={marks} chosen={chosen} />
      ))}
      {on &&
        coordinates &&
        places.map((place) => (
          <div
            key={`${place.x},${place.y}`}
            className={styles.marker}
            data-marker=""
            data-testid="logo-marker"
            data-chosen=""
            data-group=""
            data-on-flyer=""
            style={coordinates.toLayer(place.x, place.y, place.w, place.h)}
          />
        ))}
      <Guides />
      <MarkingBox />
      <TrimBands />
      <InsertLine />
      <PlacementMarks />
    </div>
  );
}
