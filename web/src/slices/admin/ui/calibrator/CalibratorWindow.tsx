import { useCallback, useEffect, useId, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useDialog } from "@/shared/ui/modal/use-dialog.ts";
import type { CalibratorStore } from "../../model/calibrator/calibrator-store.ts";
import { hasBenefit, zoneRects, zonesOf } from "../../model/calibrator/zones.ts";
import { registerProbe } from "@/shared/lib/test-probe.ts";
import type { OpenCalibrator } from "../../model/use-calibrator.ts";
import { BaseRow, BenefitRow, HeightRow, PropertiesRow } from "./CalibratorControls.tsx";
import { CalibratorFoot } from "./CalibratorFoot.tsx";
import { attachCalibratorCanvas, type CalibratorCanvas } from "./calibrator-canvas.ts";
import { useCalibratorVersion } from "./use-calibrator-version.ts";
import { useEditorSize } from "./use-editor-size.ts";
import styles from "./Calibrator.module.css";

interface CalibratorWindowProps {
  readonly calibrator: OpenCalibrator;
  readonly saving: boolean;
  readonly onSave: () => void;
  /** Leaves without saving: nothing was written. */
  readonly onClose: () => void;
}

function ZoneChips({ store }: { readonly store: CalibratorStore }) {
  useCalibratorVersion(store);
  const chosen = store.chosen();
  return (
    <div className={styles.legend} data-testid="calibrator-zones">
      {zonesOf(store.frame()).map((zone) => (
        <button
          key={zone.id}
          type="button"
          className={chosen === zone.id ? `${styles.chip} ${styles.on}` : styles.chip}
          style={{ color: zone.color }}
          aria-pressed={chosen === zone.id}
          data-zone={zone.id}
          onClick={() => {
            store.choose(zone.id);
          }}
        >
          <span className={styles.dot} style={{ background: zone.color }} />
          {zone.label}
        </button>
      ))}
    </div>
  );
}

const nothing = () => undefined;

/**
 * The calibrator (`_cal*`): the zones of the tab of that flyer over its picture, dragged into place,
 * with their size, weight and color; it saves the calibration with the name of the image and
 * activates it in the option.
 */
export function CalibratorWindow({ calibrator, saving, onSave, onClose }: CalibratorWindowProps) {
  const { store, template } = calibrator;
  const titleId = useId();
  const card = useRef<HTMLDialogElement>(null);
  const picture = useRef<HTMLDivElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const split = useRef<HTMLDivElement>(null);
  const corner = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  // Escape does nothing, as today: what was adjusted is only left with its ✕.
  useDialog(card, nothing);
  const parts = useMemo(() => ({ card, picture, controls, split, corner }), []);
  const enlarge = useEditorSize(parts);
  const controller = useRef<CalibratorCanvas | null>(null);
  useEffect(() => {
    if (!canvas.current || !picture.current) return undefined;
    const attached = attachCalibratorCanvas(store, canvas.current, picture.current);
    controller.current = attached;
    return () => {
      attached.detach();
      controller.current = null;
    };
  }, [store]);
  // What a test reads and a person does not see: the numbers of the calibration being adjusted.
  useEffect(
    () =>
      registerProbe("calibrator", () => ({
        calibration: structuredClone(store.cfg),
        rects: zoneRects(store.frame()),
        scale: store.scale(),
      })),
    [store],
  );
  const zoom = useCallback<CalibratorCanvas["zoom"]>((factor, at) => {
    controller.current?.zoom(factor, at);
  }, []);
  const benefit = hasBenefit(store.tab);
  return createPortal(
    <div className={styles.overlay}>
      <dialog
        ref={card}
        open
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.card}
        data-testid="calibrator"
      >
        <div className={styles.head}>
          <h3 id={titleId} className={styles.title}>
            Calibrar flyer — {store.optionName}
            {benefit ? " (Flyer Rubros)" : ""}
          </h3>
          <button type="button" className={styles.save} disabled={saving} onClick={onSave}>
            Guardar y activar
          </button>
          <button type="button" className={styles.close} aria-label="Cerrar" onClick={onClose}>
            ✕
          </button>
        </div>
        <ZoneChips store={store} />
        <div ref={picture} className={styles.picture} data-testid="calibrator-picture">
          <canvas ref={canvas} className={styles.canvas} data-testid="calibrator-canvas" />
        </div>
        <div
          ref={split}
          className={styles.splitBar}
          title="Arrastrá para agrandar la imagen (doble clic: volver al reparto normal)"
          data-testid="calibrator-split"
        />
        <div ref={controls} className={styles.controls}>
          <BaseRow store={store} />
          <HeightRow store={store} />
          <PropertiesRow store={store} />
          {benefit && <BenefitRow store={store} template={template} />}
          <CalibratorFoot store={store} zoom={zoom} enlarge={enlarge} />
        </div>
        <div
          ref={corner}
          className={styles.corner}
          title="Arrastrá para cambiar el ancho y el alto del editor (doble clic: tamaño normal)"
          data-testid="calibrator-corner"
        />
      </dialog>
    </div>,
    document.body,
  );
}
