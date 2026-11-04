import { type Dispatch, useEffect, useMemo, useRef, useState } from "react";
import { readSheetFile, type SheetApi } from "@/shared/lib/sheet-library.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useSheetLibrary } from "@/shared/lib/use-sheet-library.ts";
import { Button, Input } from "@/shared/ui/index.ts";
import {
  advisorsOfSheet,
  downloadAdvisors,
  downloadAdvisorTemplate,
} from "../api/company-sheets.ts";
import type { SavedAdvisor } from "../api/saved-advisors.ts";
import {
  type AdvisorsDraft,
  type AdvisorsDraftAction,
  matchingAdvisors,
} from "../model/advisors-draft.ts";
import { useSavedAdvisors } from "../model/use-saved-advisors.ts";
import type { Ask } from "./use-ask.tsx";
import { SEPARATOR } from "./separator.ts";
import styles from "./DatabaseWindow.module.css";

const FIELDS = [
  ["name", "Nombre visible", "Cómo lo ves en la lista"],
  ["nombre", "Nombre real (va al flyer)", undefined],
  ["celular", "Celular", undefined],
  ["email", "Email", undefined],
] as const;

function AdvisorsHelp() {
  return (
    <details className={styles.help}>
      <summary>¿Cómo funciona?</summary>
      <p>
        Acá están los asesores que guardás para cargarlos de un click desde los títulos{" "}
        <strong>"Asesor 1"</strong> a <strong>"Asesor 4"</strong> del armador. Podés{" "}
        <strong>corregirlos</strong> (antes había que borrarlos y volver a cargarlos), agregar,
        eliminar, subirlos desde un Excel o bajarte la lista.
        <br />
        <br />
        El <strong>nombre visible</strong> es el rótulo con el que los ves en la lista (por ejemplo{" "}
        <em>"Juan — Sucursal Centro"</em>); el <strong>nombre real</strong> es el que sale impreso
        en el flyer. Si dejás el visible vacío, se usa el real.
        <br />
        <br />
        Esta lista <strong>viaja con tu cuenta</strong>: la ves igual desde cualquier computadora, y
        nadie más puede verla ni editarla.
      </p>
    </details>
  );
}

function plural(count: number): { readonly es: string; readonly s: string } {
  return count === 1 ? { es: "", s: "" } : { es: "es", s: "s" };
}

function Status({
  rows,
  dirty,
  loading,
}: {
  readonly rows: readonly SavedAdvisor[] | null;
  readonly dirty: boolean;
  readonly loading: boolean;
}) {
  if (loading || !rows) return <span>Cargando tus asesores...</span>;
  if (rows.length === 0) {
    return <>Todavía no guardaste ningún asesor. Agregá el primero o subí un Excel.</>;
  }
  const { es, s } = plural(rows.length);
  return (
    <>
      <strong>{rows.length}</strong> asesor{es} guardado{s}
      {dirty && (
        <>
          {SEPARATOR}
          <span className={styles.unsaved}>cambios sin guardar</span>
        </>
      )}
    </>
  );
}

interface AdvisorsPaneProps {
  readonly isActive: boolean;
  readonly draft: AdvisorsDraft;
  readonly dispatch: Dispatch<AdvisorsDraftAction>;
  readonly ask: Ask;
}

/** Mis asesores: what the title of each officer loads in the flyer editor, corrected in its place. */
export function AdvisorsPane({ isActive, draft, dispatch, ask }: AdvisorsPaneProps) {
  const { rows: saved, loading, save, latest } = useSavedAdvisors();
  const { show } = useToast();
  const withLibrary = useSheetLibrary();
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const focusLast = useRef(false);
  const { rows, dirty } = draft;
  const positions = useMemo(() => matchingAdvisors(rows ?? [], query), [rows, query]);

  // The copy is made when the list arrives, and it does not come back on top of what is edited.
  useEffect(() => {
    if (isActive && !rows && !loading) dispatch({ type: "load", rows: saved });
  }, [dispatch, isActive, loading, rows, saved]);

  useEffect(() => {
    if (!focusLast.current) return;
    focusLast.current = false;
    list.current?.querySelector<HTMLInputElement>(":scope > :last-child input")?.focus();
  });

  const reloadCopy = () => {
    if (dirty) {
      // Losing them for pressing Recargar would be worse than not reloading.
      show("Tenés cambios sin guardar: guardalos o descartalos");
      return;
    }
    dispatch({ type: "load", rows: saved });
  };
  const add = () => {
    focusLast.current = true;
    setQuery("");
    dispatch({ type: "add", rows: saved });
  };
  const remove = (row: number) => {
    const advisor = rows?.[row];
    if (!advisor) return;
    const label = advisor.name || advisor.nombre || "este asesor";
    ask({
      message: `¿Eliminar el asesor guardado "${label}"?\n\nSe borra al tocar "Guardar cambios".`,
      confirmLabel: "Eliminar",
      onYes: () => {
        dispatch({ type: "remove", row });
      },
    });
  };
  const discard = () => {
    if (!dirty) {
      dispatch({ type: "load", rows: saved });
      return;
    }
    ask({
      message: "¿Descartar los cambios que hiciste en tus asesores?",
      confirmLabel: "Descartar",
      onYes: () => {
        dispatch({ type: "load", rows: saved });
        show("Cambios descartados");
      },
    });
  };
  const saveAll = async () => {
    if (!rows) return;
    setSaving(true);
    // A read on its way would step on what is about to be saved.
    await latest();
    const stored = await save(rows);
    setSaving(false);
    if (!stored) return;
    const { es, s } = plural(rows.length);
    show(`${String(rows.length)} asesor${es} guardado${s}`);
    dispatch({ type: "load", rows });
  };
  const importFile = async (api: SheetApi, file: File) => {
    try {
      const incoming = advisorsOfSheet(await readSheetFile(api, file));
      const all = [...incoming, ...(await latest())];
      await save(all);
      dispatch({ type: "load", rows: all });
      const count = incoming.length;
      const s = count > 1;
      show(
        count > 0
          ? `${String(count)} asesor${s ? "es" : ""} importado${s ? "s" : ""}`
          : "No se encontraron asesores en el Excel",
      );
    } catch (cause) {
      show(`No se pudo leer el Excel: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  };
  const onFile = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file) return;
    input.value = "";
    void withLibrary((api) => importFile(api, file));
  };
  const downloadAll = () =>
    void withLibrary(async (api) => {
      const all = await latest();
      if (all.length === 0) {
        show("Todavía no guardaste ningún asesor");
        return;
      }
      downloadAdvisors(api, all);
      show(`Excel descargado (${String(all.length)} asesores)`);
    });
  const downloadTemplate = () =>
    void withLibrary((api) => {
      downloadAdvisorTemplate(api);
      show("Plantilla descargada!");
    });

  return (
    <>
      <p className={styles.short}>
        Los asesores que cargás de un click desde los títulos <strong>"Asesor 1"</strong> a{" "}
        <strong>"Asesor 4"</strong> del armador.
      </p>
      <AdvisorsHelp />
      <div className={styles.buttons}>
        <Button size="sm" onClick={() => fileInput.current?.click()}>
          ↑ Subir Excel
        </Button>
        <Button variant="soft-neutral" size="xs" onClick={add}>
          + Agregar asesor
        </Button>
        <Button variant="soft-neutral" size="xs" onClick={downloadAll}>
          ⬇ Descargar Excel
        </Button>
        <Button variant="soft-neutral" size="xs" onClick={downloadTemplate}>
          ⬇ Plantilla vacía
        </Button>
        <Button variant="soft-neutral" size="xs" onClick={reloadCopy}>
          Recargar
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xls"
          hidden
          data-testid="advisor-sheet-input"
          onChange={({ target }) => {
            onFile(target);
          }}
        />
      </div>
      <p className={styles.status} data-testid="advisor-status">
        <Status rows={rows} dirty={dirty} loading={loading} />
      </p>
      <Input
        className={styles.editorFilter}
        placeholder="Filtrar: nombre, celular o mail..."
        autoComplete="off"
        value={query}
        onChange={({ target }) => {
          setQuery(target.value);
        }}
      />
      <div ref={list} data-testid="advisor-list">
        {rows && rows.length > 0 && positions.length === 0 && (
          <p className={styles.nothing}>Sin resultados para "{query}".</p>
        )}
        {rows && query && positions.length > 0 && (
          <p className={styles.showing}>
            Mostrando {positions.length} de {rows.length}.
          </p>
        )}
        {positions.map((position) => {
          const advisor = rows?.[position];
          return advisor ? (
            <div key={advisor.id} className={styles.advisorRow} data-testid="advisor-row">
              <div className={styles.advisorMain}>
                {FIELDS.map(([key, placeholder, title]) => (
                  <Input
                    key={key}
                    placeholder={placeholder}
                    title={title}
                    value={advisor[key]}
                    onChange={({ target }) => {
                      dispatch({ type: "field", row: position, key, value: target.value });
                    }}
                  />
                ))}
                <Button
                  variant="soft-muted"
                  size="xs"
                  title="Eliminar asesor"
                  aria-label="Eliminar asesor"
                  onClick={() => {
                    remove(position);
                  }}
                >
                  ✕
                </Button>
              </div>
            </div>
          ) : null;
        })}
      </div>
      <div className={styles.buttonsBelow}>
        <Button
          size="sm"
          disabled={saving}
          onClick={() => void saveAll()}
          data-testid="advisors-save"
        >
          {saving ? "Guardando..." : "Guardar cambios"}
        </Button>
        <Button variant="soft-muted" size="xs" onClick={discard}>
          Descartar cambios
        </Button>
      </div>
    </>
  );
}
