import { type Dispatch, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  categoryOptions,
  matchingPositions,
  sanitizeCompanies,
} from "@/shared/domain/company-registry/index.ts";
import { currentOption } from "@/shared/domain/flyer-options.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { Button, Input } from "@/shared/ui/index.ts";
import type { EditorAction, EditorState } from "../model/company-editor.ts";
import { useSaveCompanies } from "../model/use-companies.ts";
import { useRegistryContext } from "../model/registry-rules.ts";
import { CompanyEditorRow, type EditorChoices } from "./CompanyEditorRow.tsx";
import type { Ask } from "./use-ask.tsx";
import styles from "./DatabaseWindow.module.css";

/** With many companies it waits for the person to stop typing. */
const WAIT_FROM_ROWS = 400;
const WAIT_MS = 150;

interface CompanyEditorProps {
  readonly state: EditorState;
  readonly dispatch: Dispatch<EditorAction>;
  readonly ask: Ask;
  readonly onCancel: () => void;
  readonly onSaved: () => void;
}

function useFilteredRows(rowCount: number) {
  const [written, setWritten] = useState("");
  const [applied, setApplied] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  const write = (text: string) => {
    setWritten(text);
    clearTimeout(timer.current);
    if (rowCount < WAIT_FROM_ROWS) setApplied(text);
    else {
      timer.current = setTimeout(() => {
        setApplied(text);
      }, WAIT_MS);
    }
  };
  return { written, applied, write };
}

/** Add, delete and correct without going through a sheet. What is saved goes with its button. */
export function CompanyEditor({ state, dispatch, ask, onCancel, onSaved }: CompanyEditorProps) {
  const { options, cashbackNames } = useRegistryContext();
  const save = useSaveCompanies();
  const { show } = useToast();
  const rows = useMemo(() => state.rows ?? [], [state.rows]);
  const { written, applied, write } = useFilteredRows(rows.length);
  const [saving, setSaving] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const focusLast = useRef(false);

  const choices = useMemo<EditorChoices>(
    () => ({
      options,
      cashback: [["", "Sin cashback"], ...cashbackNames.map((name) => [name, name] as const)],
      categories: categoryOptions(options).filter(
        (option) => currentOption(options, option) === option,
      ),
    }),
    [cashbackNames, options],
  );
  const positions = useMemo(() => matchingPositions(applied, rows), [applied, rows]);

  useEffect(() => {
    if (!focusLast.current) return;
    focusLast.current = false;
    list.current?.querySelector<HTMLInputElement>(":scope > :last-child input")?.focus();
  });

  const remove = useCallback(
    (row: number, name: string) => {
      ask({
        message: `¿Eliminar ${name || "esta empresa"} de tus empresas?`,
        confirmLabel: "Eliminar",
        onYes: () => {
          dispatch({ type: "remove", row });
        },
      });
    },
    [ask, dispatch],
  );
  const add = () => {
    focusLast.current = true;
    dispatch({ type: "add" });
    // A filter would hide the new row, which is empty.
    write("");
  };
  const saveAll = async () => {
    const clean = sanitizeCompanies(rows);
    setSaving(true);
    const saved = await save(clean);
    setSaving(false);
    if (!saved) return;
    show(`Empresas actualizadas: ${String(clean.length)}`);
    onSaved();
  };

  return (
    <div data-testid="company-editor">
      <p className={styles.editorLead}>
        Los cambios quedan guardados en la nube recién cuando tocas <strong>Guardar cambios</strong>
        .
      </p>
      <Input
        className={styles.editorFilter}
        placeholder="Filtrar: razón social o CUIT..."
        autoComplete="off"
        value={written}
        onChange={({ target }) => {
          write(target.value);
        }}
      />
      <div ref={list}>
        {rows.length === 0 && (
          <p className={styles.nothing}>Todavía no hay empresas. Agregá la primera abajo.</p>
        )}
        {rows.length > 0 && positions.length === 0 && (
          <p className={styles.nothing}>Sin resultados para "{applied}".</p>
        )}
        {applied && positions.length > 0 && (
          <p className={styles.showing}>
            Mostrando {positions.length} de {rows.length}.
          </p>
        )}
        {positions.map((position) => {
          const company = rows[position];
          return company ? (
            <CompanyEditorRow
              key={company.key}
              row={position}
              company={company}
              expanded={state.expanded.includes(position)}
              choices={choices}
              dispatch={dispatch}
              onRemove={remove}
            />
          ) : null;
        })}
      </div>
      <div className={styles.buttonsBelow}>
        <Button variant="soft-neutral" size="xs" onClick={add}>
          + Agregar empresa
        </Button>
        <Button size="sm" disabled={saving} onClick={() => void saveAll()}>
          {saving ? "Guardando..." : "Guardar cambios"}
        </Button>
        <Button variant="soft-muted" size="xs" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
