import { useEffect, useRef } from "react";
import { Checkbox } from "@/shared/ui/index.ts";
import type { FlyerPlace } from "../model/change.ts";
import type { TextDraft } from "../model/use-text-draft.ts";
import styles from "./LogoPicker.module.css";

const BOLD = 700;
const NORMAL = 500;

interface LogoTextFormProps {
  readonly place: FlyerPlace;
  readonly draft: TextDraft;
  readonly onBack: (() => void) | null;
}

function ColorChoice({ draft }: { readonly draft: TextDraft }) {
  const { colors, color, setColor } = draft;
  const chosenName =
    colors.find(([value]) => value.toLowerCase() === color.toLowerCase())?.[1] ?? "";
  return (
    <div className={styles.textRow}>
      <span className={styles.textLabel}>Color</span>
      <fieldset className={styles.colors} aria-label="Color del texto">
        {colors.map(([value, name]) => {
          const isOn = value.toLowerCase() === color.toLowerCase();
          return (
            <label key={value} className={styles.color} data-on={isOn} title={name}>
              <input
                type="radio"
                name="logo-text-color"
                aria-label={name}
                checked={isOn}
                data-testid="text-color"
                onChange={() => {
                  setColor(value);
                }}
              />
              <span style={{ background: value }} />
            </label>
          );
        })}
      </fieldset>
      <span className={styles.colorName} data-testid="text-color-name">
        {chosenName}
      </span>
    </div>
  );
}

/** The text that takes a place: letter and color of the one it replaces, unless they are changed. */
export function LogoTextForm({ place, draft, onBack }: LogoTextFormProps) {
  const { text, color, isBold, size, setBold, write, resize } = draft;
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const focusing = setTimeout(() => {
      field.current?.focus();
    }, 20);
    return () => {
      clearTimeout(focusing);
    };
  }, []);
  return (
    <div className={styles.textForm}>
      {onBack && (
        <button type="button" className={styles.back} onClick={onBack}>
          ← Elegir una marca
        </button>
      )}
      <label className={styles.textLabel} htmlFor="logo-text">
        Texto <span>(Enter = otro renglón)</span>
      </label>
      <textarea
        id="logo-text"
        ref={field}
        rows={2}
        maxLength={120}
        placeholder="Ej.: Martes y jueves"
        value={text}
        onChange={(event) => {
          write(event.target.value);
        }}
      />
      <ColorChoice draft={draft} />
      <div className={styles.textRow}>
        <span className={styles.textLabel}>Tamaño</span>
        <input
          type="range"
          min="10"
          max="120"
          step="1"
          aria-label="Tamaño del texto"
          value={size}
          onChange={(event) => {
            resize(Number(event.target.value));
          }}
        />
        <span className={styles.sizeValue}>{size} px</span>
        <Checkbox
          checked={isBold}
          onChange={(event) => {
            setBold(event.target.checked);
          }}
        >
          Negrita
        </Checkbox>
      </div>
      <div
        className={styles.sample}
        style={{
          background: place.bg,
          color,
          fontWeight: isBold ? BOLD : NORMAL,
          fontSize: Math.max(12, Math.min(44, size)),
        }}
      >
        {text.trim() ? text : "Así se va a ver"}
      </div>
    </div>
  );
}
