import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { BenefitLine } from "@/shared/flyer-engine/index.ts";
import { BENEFIT_TEMPLATES } from "../../model/calibrator/benefit-templates.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { Button, ConfirmDialog } from "@/shared/ui/index.ts";
import { CALIBRATION_BASES } from "../../model/calibrator/bases.ts";
import { benefitLines, type LineField, templateOf } from "../../model/calibrator/benefit.ts";
import type { CalibratorStore } from "../../model/calibrator/calibrator-store.ts";
import {
  type PropertyField,
  propertiesOf,
  propertiesTarget,
  sixDigitColor,
  WEIGHTS,
} from "../../model/calibrator/properties.ts";
import { lineColor, zonesOf } from "../../model/calibrator/zones.ts";
import { useCalibratorVersion } from "./use-calibrator-version.ts";
import styles from "./Calibrator.module.css";

interface StoreProps {
  readonly store: CalibratorStore;
}

const TEMPLATE_KEYS = Object.keys(BENEFIT_TEMPLATES);

export function BaseRow({ store }: StoreProps) {
  const toast = useToast();
  const [base, setBase] = useState(CALIBRATION_BASES[0]?.id ?? "");
  return (
    <div className={styles.row}>
      <label htmlFor="calibrator-base" className={styles.label}>
        Partir de esta base:
      </label>
      <select
        id="calibrator-base"
        className={styles.choice}
        value={base}
        onChange={(event) => {
          setBase(event.target.value);
        }}
      >
        {CALIBRATION_BASES.map(({ id, nombre }) => (
          <option key={id} value={id}>
            {nombre}
          </option>
        ))}
      </select>
      <Button
        variant="soft-neutral"
        size="xs"
        className={styles.small}
        onClick={() => {
          const chosen = CALIBRATION_BASES.find(({ id }) => id === base);
          if (!chosen) return;
          store.applyBase(chosen);
          toast.show(`Base «${chosen.nombre}» cargada. Si no era, cerrá sin guardar.`);
        }}
      >
        Cargar base
      </Button>
      <span className={styles.muted}>
        Pone las zonas donde van en ese modelo de flyer; después se retoca arrastrando. El cartel
        del beneficio se elige abajo, con su plantilla.
      </span>
    </div>
  );
}

export function HeightRow({ store }: StoreProps) {
  useCalibratorVersion(store);
  const field = useRef<HTMLInputElement>(null);
  const saved = store.savedRevision();
  const commit = () => {
    store.setHeight(field.current?.value ?? "");
  };
  return (
    <div className={`${styles.row} ${styles.heightRow}`}>
      <label htmlFor="calibrator-height" className={styles.label}>
        Altura final (px):
      </label>
      <input
        key={saved}
        ref={field}
        id="calibrator-height"
        type="number"
        placeholder="auto"
        className={styles.heightField}
        defaultValue={store.cfg.cropH ? String(store.cfg.cropH) : ""}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
      />
      <Button
        variant="soft-neutral"
        size="xs"
        className={styles.tiny}
        onClick={() => {
          if (field.current) field.current.value = "";
          commit();
        }}
      >
        Auto
      </Button>
      <span className={styles.muted}>
        vacío = corta solo después de los legales (línea naranja)
      </span>
    </div>
  );
}

function PropertyInput({
  store,
  field,
  value,
}: StoreProps & { readonly field: PropertyField; readonly value: unknown }) {
  const set = (typed: string) => {
    store.setProperty(field, typed);
  };
  if (field.kind === "weight") {
    return (
      <select
        className={styles.field}
        defaultValue={String(Number(value) || 700)}
        onChange={(event) => {
          set(event.target.value);
        }}
      >
        {WEIGHTS.map((weight) => (
          <option key={weight.value} value={weight.value}>
            {weight.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.kind === "color") {
    return (
      <input
        type="color"
        className={`${styles.field} ${styles.color}`}
        defaultValue={sixDigitColor(value, field.fallback)}
        onInput={(event) => {
          set(event.currentTarget.value);
        }}
      />
    );
  }
  return (
    <input
      type="number"
      className={`${styles.field} ${styles.number}`}
      min={field.min}
      max={field.max}
      step={field.step ?? 1}
      defaultValue={typeof value === "number" || typeof value === "string" ? String(value) : ""}
      onInput={(event) => {
        set(event.currentTarget.value);
      }}
    />
  );
}

/** Each box is the amount it holds: the first is always Eminent Black, and so on. */
function numbered<T>(items: readonly T[], prefix: string) {
  return items.map((item, index) => ({ item, index, name: `${prefix}${String(index)}` }));
}

function BoxColors({ store }: StoreProps) {
  return (
    <span className={styles.colors}>
      {numbered(store.cfg.montos.boxes, "mb").map(({ item: box, index, name }) => (
        <input
          key={name}
          type="color"
          className={`${styles.field} ${styles.color}`}
          title={`Monto ${String(index + 1)}`}
          defaultValue={sixDigitColor(box.col, "#1d4070")}
          onInput={(event) => {
            store.setBoxColor(index, event.currentTarget.value);
          }}
        />
      ))}
    </span>
  );
}

/** The fields of the chosen zone; none for a line of the benefit, which has its own table. */
export function PropertiesRow({ store }: StoreProps) {
  useCalibratorVersion(store);
  const zone = store.chosen();
  const properties = propertiesOf(zone);
  if (!zone || !properties) return null;
  const target = propertiesTarget(store.cfg, properties) ?? {};
  const label = zonesOf(store.frame()).find(({ id }) => id === zone)?.label ?? zone;
  return (
    <div className={styles.properties} data-testid="zone-properties">
      <div className={styles.propertiesRow} key={store.fieldsRevision()}>
        <b>{label}</b>
        {properties.fields.map((field) => (
          <label key={field.key} className={styles.property}>
            {field.label}
            {field.kind === "colors" ? (
              <BoxColors store={store} />
            ) : (
              <PropertyInput store={store} field={field} value={target[field.key]} />
            )}
          </label>
        ))}
        <span className={styles.space} />
        <Button
          variant="soft-neutral"
          size="xs"
          title="Vuelve esta zona a los valores de fábrica"
          onClick={store.resetProperties}
        >
          Restablecer
        </Button>
      </div>
    </div>
  );
}

function LineRow({
  store,
  line,
  index,
}: StoreProps & { readonly line: BenefitLine; readonly index: number }) {
  const edit = (field: LineField) => (value: string) => {
    store.editLine(index, field, value);
  };
  return (
    <div className={styles.line} data-testid="benefit-line">
      <button
        type="button"
        className={`${styles.dot} ${styles.lineDot}`}
        style={{ background: lineColor(index) }}
        title="Elegir esta línea en la imagen"
        aria-label={`Elegir la línea ${String(index + 1)} en la imagen`}
        onClick={() => {
          store.choose(`bl${String(index)}`);
        }}
      />
      <input
        type="text"
        className={`${styles.field} ${styles.lineText}`}
        defaultValue={line.t}
        onInput={(event) => edit("t")(event.currentTarget.value)}
      />
      <input
        type="number"
        className={styles.field}
        min={6}
        max={120}
        step={0.5}
        defaultValue={String(line.fs || 17)}
        onInput={(event) => edit("fs")(event.currentTarget.value)}
      />
      <select
        className={styles.field}
        defaultValue={String(line.peso)}
        onChange={(event) => edit("peso")(event.target.value)}
      >
        {WEIGHTS.map((weight) => (
          <option key={weight.value} value={weight.value}>
            {weight.label}
          </option>
        ))}
      </select>
      <input
        type="color"
        className={`${styles.field} ${styles.lineColor}`}
        title="Color"
        defaultValue={line.color || "#000000"}
        onInput={(event) => edit("color")(event.currentTarget.value)}
      />
      <select
        className={styles.field}
        defaultValue={line.align === "left" ? "left" : "center"}
        onChange={(event) => edit("align")(event.target.value)}
      >
        <option value="left">Izq.</option>
        <option value="center">Centro</option>
      </select>
      <button
        type="button"
        className={styles.remove}
        title="Quitar línea"
        aria-label={`Quitar la línea ${String(index + 1)}`}
        onClick={() => {
          store.removeLine(index);
        }}
      >
        ✕
      </button>
    </div>
  );
}

/** Flyer Rubros: the lines of the benefit box, from the template of its category. */
export function BenefitRow({ store, template }: StoreProps & { readonly template: string }) {
  useCalibratorVersion(store);
  const toast = useToast();
  const [chosen, setChosen] = useState(template);
  const [replacing, setReplacing] = useState(false);
  const lines = useRef<HTMLDivElement>(null);
  const load = () => {
    toast.show(store.loadTemplate(chosen));
  };
  /** A new line, with its text ready to be written. */
  const addLine = () => {
    flushSync(() => {
      store.addLine();
    });
    const last = lines.current?.querySelector<HTMLInputElement>(
      '[data-testid="benefit-line"]:last-child input[type="text"]',
    );
    last?.focus();
    last?.select();
  };
  return (
    <div className={styles.benefit} data-testid="benefit-lines">
      <div className={styles.benefitTop}>
        <b>Cartel del beneficio</b>
        <span className={styles.muted}>Plantilla:</span>
        <select
          className={styles.choice}
          aria-label="Plantilla"
          value={chosen}
          onChange={(event) => {
            setChosen(event.target.value);
          }}
        >
          {TEMPLATE_KEYS.map((key) => (
            <option key={key} value={key}>
              {templateOf(key).nombre}
            </option>
          ))}
        </select>
        <Button
          variant="soft-neutral"
          size="xs"
          className={styles.small}
          onClick={() => {
            if (store.templateReplaces()) setReplacing(true);
            else load();
          }}
        >
          Cargar plantilla
        </Button>
        <Button
          variant="soft-neutral"
          size="xs"
          className={styles.small}
          title="Detecta el cuadro en la imagen y centra el bloque de líneas ahí"
          onClick={() => {
            const said = store.centerBenefit();
            if (said) toast.show(said);
          }}
        >
          ⌖ Centrar en el cuadro
        </Button>
        <span className={styles.space} />
        <Button variant="soft-neutral" size="xs" className={styles.small} onClick={addLine}>
          + Línea
        </Button>
      </div>
      <div className={`${styles.line} ${styles.lineHead}`}>
        <span />
        <span>
          Texto ({"{nombre}"}, {"{importe}"}, {"{importe2}"}, **naranja**)
        </span>
        <span>Letra px</span>
        <span>Peso</span>
        <span>Color</span>
        <span>Alinear</span>
        <span />
      </div>
      <div ref={lines} key={store.linesRevision()}>
        {/* The table is written again whole when lines come or go: the place is the line. */}
        {numbered(benefitLines(store.frame()), "bl").map(({ item: line, index, name }) => (
          <LineRow key={name} store={store} line={line} index={index} />
        ))}
      </div>
      <div className={styles.benefitNote}>
        El PDF va con el cuadro vacío (sólo el dibujo): la app escribe todas las líneas con la misma
        letra. {"{nombre}"}, {"{importe}"} y {"{importe2}"} (segundo tope, cuadro «Ambos») los carga
        cada asesor; **así** sale en naranja y negrita. Al abrir y al cargar una plantilla el bloque
        se centra solo en el cuadro («Centrar en el cuadro» lo vuelve a hacer). Para retocar:
        arrastrá «Cartel (todo)» para mover el bloque entero, o cada línea por separado.
      </div>
      {replacing && (
        <ConfirmDialog
          title={`¿Reemplazar las líneas actuales por la plantilla "${templateOf(chosen).nombre}"?`}
          confirmLabel="Reemplazar"
          onCancel={() => {
            setReplacing(false);
          }}
          onConfirm={() => {
            setReplacing(false);
            load();
          }}
        >
          {""}
        </ConfirmDialog>
      )}
    </div>
  );
}
