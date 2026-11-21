import { type CSSProperties, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { FLYER_TABS } from "@/shared/domain/flyer-options.ts";
import { useDialog } from "@/shared/ui/modal/use-dialog.ts";
import type { OptionNames } from "../model/use-option-names.ts";
import styles from "./OptionQuestion.module.css";

interface OptionQuestionProps {
  readonly title: string;
  readonly options: readonly number[];
  readonly names: OptionNames;
  readonly onChoose: (option: number) => void;
  readonly onCancel: () => void;
}

function colorStyle(color: string): CSSProperties {
  const style: CSSProperties & { readonly "--option-color": string } = { "--option-color": color };
  return style;
}

/**
 * Which flyer something goes to (`_askOption`): a row per tab of the header, with its name only if
 * there are options in more than one, so that a PDF does not go up to the wrong editor.
 */
export function OptionQuestion({ title, options, names, onChoose, onCancel }: OptionQuestionProps) {
  const titleId = useId();
  const panel = useRef<HTMLDialogElement>(null);
  useDialog(panel, onCancel);
  const tabs = FLYER_TABS.map((tab) => ({
    tab,
    options: options.filter((option) => names.tab(option) === tab),
  })).filter((row) => row.options.length > 0);
  const named = options.some((option) => names.tab(option) !== "flyer");
  return createPortal(
    <div className={styles.overlay}>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Cerrar la pregunta"
        className={styles.backdrop}
        onClick={onCancel}
      />
      <dialog
        ref={panel}
        open
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.box}
        data-testid="option-question"
      >
        <h3 id={titleId} className={styles.title}>
          {title}
        </h3>
        <p className={styles.text}>Elegí a qué armador corresponde.</p>
        {tabs.map((row) => (
          <div key={row.tab}>
            {named && <div className={styles.tab}>{names.tabLabel(row.tab)}</div>}
            <div className={styles.row}>
              {row.options.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={styles.option}
                  style={colorStyle(names.color(option))}
                  data-option={option}
                  onClick={() => {
                    onChoose(option);
                  }}
                >
                  {names.label(option)}
                </button>
              ))}
            </div>
          </div>
        ))}
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancelar
        </button>
      </dialog>
    </div>,
    document.body,
  );
}
