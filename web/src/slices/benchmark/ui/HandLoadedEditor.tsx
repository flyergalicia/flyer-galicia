// The window of a promotion loaded by hand (only the administrator; the database demands it too).
import { type Ref, useEffect, useRef, useState } from "react";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Modal } from "@/shared/ui/index.ts";
import { saveHandLoaded, writeProblem } from "../api/benchmark-writes.ts";
import {
  checkHandLoaded,
  type HandLoadedTexts,
  handLoadedTexts,
  rubroChoices,
  SHORT_DAYS,
} from "../model/hand-loaded-form.ts";
import { BANKS, type HandLoadedPromotion } from "../model/rows.ts";
import styles from "./BenchmarkView.module.css";

type TextKey = {
  [Key in keyof HandLoadedTexts]: HandLoadedTexts[Key] extends string ? Key : never;
}[keyof HandLoadedTexts];

interface HandLoadedEditorProps {
  /** Null: a new one. */
  readonly promotion: HandLoadedPromotion | null;
  readonly onClose: () => void;
  /** It was saved: everything is read again. */
  readonly onSaved: () => void;
}

const CAP_PERIODS = [
  ["", "Sin dato"],
  ["month", "Por mes"],
  ["week", "Por semana"],
  ["day", "Por día"],
  ["transaction", "Por compra"],
] as const;

const AUDIENCES = [
  ["", "Todos"],
  ["clasico", "Sólo Clásico / Gold"],
  ["premium", "Sólo Premium (Select, Selecta…)"],
] as const;

interface FieldProps {
  readonly texts: HandLoadedTexts;
  readonly change: (key: TextKey, value: string) => void;
}

function TextField({
  name,
  label,
  type,
  whole = false,
  texts,
  change,
  focus,
}: FieldProps & {
  readonly name: TextKey;
  readonly label: string;
  readonly type: "text" | "number" | "date";
  readonly whole?: boolean;
  readonly focus?: Ref<HTMLInputElement>;
}) {
  return (
    <label className={`${styles.field} ${whole ? styles.whole : ""}`}>
      {label}
      <input
        ref={focus}
        type={type}
        value={texts[name]}
        onChange={({ target }) => {
          change(name, target.value);
        }}
      />
    </label>
  );
}

function Choice({
  name,
  label,
  options,
  texts,
  change,
}: FieldProps & {
  readonly name: TextKey;
  readonly label: string;
  readonly options: readonly (readonly [string, string])[];
}) {
  return (
    <label className={styles.field}>
      {label}
      <select
        aria-label={label}
        value={texts[name]}
        onChange={({ target }) => {
          change(name, target.value);
        }}
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function Days({
  texts,
  onChange,
}: {
  readonly texts: HandLoadedTexts;
  readonly onChange: (days: readonly number[]) => void;
}) {
  return (
    <div className={`${styles.field} ${styles.whole}`}>
      Días (ninguno marcado = todos los días)
      <div>
        {SHORT_DAYS.map((day, index) => (
          <label key={day} className={styles.tick}>
            <input
              type="checkbox"
              checked={texts.dias_n.includes(index)}
              onChange={({ target }) => {
                const others = texts.dias_n.filter((one) => one !== index);
                onChange(target.checked ? [...others, index] : others);
              }}
            />{" "}
            {day}
          </label>
        ))}
      </div>
    </div>
  );
}

function Cards({
  texts,
  onChange,
}: {
  readonly texts: HandLoadedTexts;
  readonly onChange: (change: Partial<HandLoadedTexts>) => void;
}) {
  return (
    <div className={`${styles.field} ${styles.whole}`}>
      Tarjetas
      <div>
        <label className={styles.tick}>
          <input
            type="checkbox"
            checked={texts.credito}
            onChange={({ target }) => onChange({ credito: target.checked })}
          />{" "}
          Crédito
        </label>
        <label className={styles.tick}>
          <input
            type="checkbox"
            checked={texts.debito}
            onChange={({ target }) => onChange({ debito: target.checked })}
          />{" "}
          Débito
        </label>
      </div>
    </div>
  );
}

function LongField({
  name,
  label,
  texts,
  change,
}: FieldProps & { readonly name: TextKey; readonly label: string }) {
  return (
    <label className={`${styles.field} ${styles.whole}`}>
      {label}
      <textarea
        rows={2}
        value={texts[name]}
        onChange={({ target }) => {
          change(name, target.value);
        }}
      />
    </label>
  );
}

function useSaving(
  promotion: HandLoadedPromotion | null,
  onClose: () => void,
  onSaved: () => void,
) {
  const backend = useBackend();
  const { show } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const save = async (texts: HandLoadedTexts) => {
    const check = checkHandLoaded(texts);
    if (!check.ok) {
      show(check.problem);
      return;
    }
    setIsSaving(true);
    const problem = writeProblem(
      await saveHandLoaded(backend, promotion?.id ?? "", check.row),
      "guardar",
    );
    if (problem) {
      setIsSaving(false);
      show(problem);
      return;
    }
    onClose();
    show("Guardado.");
    onSaved();
  };
  return { isSaving, save };
}

export function HandLoadedEditor({ promotion, onClose, onSaved }: HandLoadedEditorProps) {
  const [texts, setTexts] = useState(() => handLoadedTexts(promotion));
  const { isSaving, save } = useSaving(promotion, onClose, onSaved);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  const merge = (change: Partial<HandLoadedTexts>) => {
    setTexts((before) => ({ ...before, ...change }));
  };
  const change = (key: TextKey, value: string) => {
    merge({ [key]: value });
  };
  const shared = { texts, change };
  const banks = BANKS.map(({ code, name }) => [code, name] as const);
  const rubros = rubroChoices(texts.rubro).map((rubro) => [rubro, rubro] as const);
  return (
    <Modal onClose={onClose} className={styles.editor}>
      <Modal.Title className={styles.editorTitle}>
        {promotion ? "Editar promo" : "Agregar promo"}
      </Modal.Title>
      <div className={styles.editorGrid}>
        <Choice {...shared} name="banco" label="Banco" options={banks} />
        <Choice {...shared} name="rubro" label="Rubro" options={rubros} />
        <TextField {...shared} name="titulo" label="Marca o comercio" type="text" focus={first} />
        <TextField {...shared} name="pct" label="% de descuento o reintegro" type="number" />
        <TextField {...shared} name="tope" label="Tope ($)" type="number" />
        <Choice {...shared} name="tope_por" label="El tope es" options={CAP_PERIODS} />
        <TextField {...shared} name="cuotas" label="Cuotas sin interés" type="number" />
        <Choice {...shared} name="segmento" label="Para quién" options={AUDIENCES} />
        <TextField
          {...shared}
          name="condicion"
          label="Condición (ej.: Paquete Black+ All · Visa Signature por NFC)"
          type="text"
          whole
        />
        <Days texts={texts} onChange={(dias_n) => merge({ dias_n })} />
        <Cards texts={texts} onChange={merge} />
        <TextField {...shared} name="fecha_desde" label="Desde" type="date" />
        <TextField {...shared} name="fecha_hasta" label="Hasta" type="date" />
        <TextField
          {...shared}
          name="provincias"
          label="Provincias (separadas por coma; vacío = todo el país)"
          type="text"
          whole
        />
        <LongField {...shared} name="beneficio" label="Detalle (cómo se paga, condiciones)" />
        <TextField
          {...shared}
          name="fuente_url"
          label="Dirección de la página (https://…)"
          type="text"
          whole
        />
        <LongField {...shared} name="notas" label="Notas" />
      </div>
      <div className={styles.editorActions}>
        <button type="button" className={styles.button} onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={isSaving}
          onClick={() => void save(texts)}
        >
          {isSaving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}
