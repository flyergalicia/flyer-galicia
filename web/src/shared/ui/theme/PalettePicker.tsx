import { type Palette, PALETTES } from "./theme-model.ts";
import { useTheme, useThemeActions } from "./theme-context.ts";
import styles from "./PalettePicker.module.css";

const NAMES: Readonly<Record<Palette, { label: string; swatch: string }>> = {
  marfil: { label: "Marfil", swatch: "#F7F4EE" },
  marino: { label: "Marino", swatch: "#14213D" },
  grafito: { label: "Grafito", swatch: "#16181D" },
  cielo: { label: "Cielo", swatch: "#2F6FED" },
};

/** The four looks to choose from. The current one stays marked. */
export function PalettePicker() {
  const { palette } = useTheme();
  const { setPalette } = useThemeActions();
  return (
    <fieldset aria-label="Tema" className={styles.grid}>
      {PALETTES.map((name) => (
        <button
          key={name}
          type="button"
          aria-pressed={name === palette}
          className={name === palette ? `${styles.option} ${styles.on}` : styles.option}
          onClick={() => {
            setPalette(name);
          }}
        >
          <i className={styles.swatch} style={{ backgroundColor: NAMES[name].swatch }} />
          {NAMES[name].label}
        </button>
      ))}
    </fieldset>
  );
}
