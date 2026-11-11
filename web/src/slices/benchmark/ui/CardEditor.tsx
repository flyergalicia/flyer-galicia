// The window of a card (only the administrator; the database demands it too).
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Modal } from "@/shared/ui/index.ts";
import { saveCard, writeProblem } from "../api/benchmark-writes.ts";
import {
  CARD_FIELDS,
  type CardField,
  type CardTexts,
  cardTexts,
  checkCard,
  isWideField,
} from "../model/card-form.ts";
import { argentinaDay } from "../model/dates.ts";
import { BANKS, type PremiumCard } from "../model/rows.ts";
import { TRUST_TEXT } from "../model/cards.ts";
import styles from "./BenchmarkView.module.css";

interface CardEditorProps {
  /** Null: a new one. */
  readonly card: PremiumCard | null;
  readonly onClose: () => void;
  /** It was saved: the cards are read again. */
  readonly onSaved: () => void;
}

function FieldOf({
  field,
  value,
  onChange,
}: {
  readonly field: CardField;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const shared = {
    value,
    onChange: ({ target }: { readonly target: { readonly value: string } }) => {
      onChange(target.value);
    },
  };
  return (
    <label className={`${styles.field} ${isWideField(field) ? styles.whole : ""}`}>
      {field.label}
      {field.kind === "area" ? (
        <textarea rows={2} {...shared} />
      ) : (
        <input type={field.kind} {...shared} />
      )}
    </label>
  );
}

export function CardEditor({ card, onClose, onSaved }: CardEditorProps) {
  const backend = useBackend();
  const { show } = useToast();
  const [texts, setTexts] = useState<CardTexts>(() => cardTexts(card));
  const [isSaving, setIsSaving] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  const change = (key: keyof CardTexts) => (value: string) => {
    setTexts((before) => ({ ...before, [key]: value }));
  };
  const save = async () => {
    const check = checkCard(texts, argentinaDay());
    if (!check.ok) {
      show(check.problem);
      return;
    }
    setIsSaving(true);
    const outcome = await saveCard(backend, card?.id ?? "", check.row);
    const problem = writeProblem(outcome, "guardar");
    if (problem) {
      setIsSaving(false);
      show(problem);
      return;
    }
    onClose();
    show("Guardado.");
    onSaved();
  };
  return (
    <Modal onClose={onClose} className={styles.editor}>
      <Modal.Title className={styles.editorTitle}>
        {card ? "Editar tarjeta" : "Agregar tarjeta"}
      </Modal.Title>
      <div className={styles.editorGrid}>
        <label className={styles.field}>
          Banco
          <select
            aria-label="Banco"
            value={texts.banco}
            onChange={({ target }) => change("banco")(target.value)}
          >
            {BANKS.map(({ code, name }) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          De dónde sale
          <select
            aria-label="De dónde sale"
            value={texts.confianza}
            onChange={({ target }) => change("confianza")(target.value)}
          >
            {Object.entries(TRUST_TEXT).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {CARD_FIELDS.map((field) =>
          field.key === "tarjeta" ? (
            <label key={field.key} className={styles.field}>
              {field.label}
              <input
                ref={first}
                type="text"
                value={texts.tarjeta}
                onChange={({ target }) => change("tarjeta")(target.value)}
              />
            </label>
          ) : (
            <FieldOf
              key={field.key}
              field={field}
              value={texts[field.key]}
              onChange={change(field.key)}
            />
          ),
        )}
      </div>
      <div className={styles.editorActions}>
        <button type="button" className={styles.button} onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={isSaving}
          onClick={() => {
            void save();
          }}
        >
          {isSaving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </Modal>
  );
}
