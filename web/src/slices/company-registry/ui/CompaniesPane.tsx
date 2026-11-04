import { type Dispatch, useEffect, useRef, useState } from "react";
import {
  importDifference,
  type ImportDifference,
  type SheetReport,
  taxIdCount,
  validateSheet,
} from "@/shared/domain/company-registry/index.ts";
import { relativeDate } from "@/shared/domain/relative-date.ts";
import { readSheetFile, type SheetApi } from "@/shared/lib/sheet-library.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useSheetLibrary } from "@/shared/lib/use-sheet-library.ts";
import { Button, Input } from "@/shared/ui/index.ts";
import { downloadCompanies, downloadCompanyTemplate } from "../api/company-sheets.ts";
import type { EditorAction, EditorState } from "../model/company-editor.ts";
import { useCompanies, useSaveCompanies } from "../model/use-companies.ts";
import { useRegistryContext } from "../model/registry-rules.ts";
import { CompanyEditor } from "./CompanyEditor.tsx";
import { CompanyList } from "./CompanyList.tsx";
import { GeneratorPanel } from "./GeneratorPanel.tsx";
import { ImportSummaryDialog } from "./ImportSummaryDialog.tsx";
import type { Ask } from "./use-ask.tsx";
import { SEPARATOR } from "./separator.ts";
import styles from "./DatabaseWindow.module.css";

const LEAVE_EDITOR = "¿Salir del editor?\n\nLos cambios sin guardar se pierden.";

function CompaniesHelp() {
  return (
    <details className={styles.help}>
      <summary>¿Cómo funciona?</summary>
      <p>
        <strong>Esta lista es tuya.</strong> Nadie más puede editarla: lo impide el servidor, no el
        navegador. Cada usuario con la facultad tiene la suya, separada de la tuya. Un administrador
        puede consultar (nunca modificar) las empresas de los asesores; las de un administrador no
        las ve ni siquiera el otro administrador.
        <br />
        <br />
        Subí un Excel con las empresas precargadas (razón social, CUIT, cashback y hasta 4
        asesores). Después, en el armador, la{" "}
        <strong>lupa al lado de "Nombre de la empresa"</strong> busca por{" "}
        <strong>razón social o CUIT</strong> y completa todo de una. Si la empresa es un{" "}
        <strong>grupo con varios CUIT</strong>, ponélos en la misma celda separados por coma:
        buscando cualquiera de ellos aparece la empresa.
        <br />
        <br />
        Tu lista <strong>no se retroalimenta</strong> con los flyers que se van generando: sólo
        cambia cuando subís un Excel nuevo o editás a mano, así el archivo de tu computadora sigue
        siendo el original. Es <strong>el mismo formato que la plantilla del masivo</strong> más la
        columna <code>cuit</code>, con lo cual el mismo archivo te sirve para las dos cosas.
        <br />
        <br />
        <strong>Cashback:</strong> la columna se llama <code>config</code> y acepta el nombre de
        cualquier configuración que exista en Config → Cashback (<code>BAU</code>,{" "}
        <code>Config 1</code>, <code>Config 2</code>…; también vale escribir sólo el número). Si la
        celda queda <strong>vacía</strong> (o dice algo que no reconozco), esa empresa sale{" "}
        <strong>sin cashback</strong>: el flyer se genera con los importes en blanco. Así se marcan
        las pocas empresas a las que no les corresponde. Al subir el Excel te muestro un informe con
        todo lo que detecté, antes de guardar nada.
        <br />
        <br />
        <strong>Beneficio por rubro (Flyer Rubros):</strong> columnas <code>rubro</code> (el nombre
        de una opción de Flyer Rubros: <code>Combustible</code>, <code>Supermercado</code>,{" "}
        <code>Ambos</code>… vacía = sin rubro), <code>tope_combustible</code> y{" "}
        <code>tope_supermercado</code> (el tope de reintegro de cada uno, ej. <code>24.000</code>:
        una empresa de combustible completa sólo el de combustible, una de supermercado sólo el de
        supermercado, y una de «Ambos» los dos). Los Excel viejos con <code>tope</code> /{" "}
        <code>tope2</code> se siguen leyendo. Al elegir la empresa con la lupa se completan los
        topes, y si estás armando el flyer en la solapa equivocada te aviso y te ofrezco cambiar. Al
        generar un flyer de Rubros para una empresa de tu lista, te propongo guardarle el rubro.
        <br />
        <br />
        <strong>Generar flyers:</strong> desde el botón «Generar flyers» elegís empresas de tu lista
        (o todas) y bajás un ZIP con el flyer de cada una en <strong>su formato</strong>: el armador
        común, o Flyer Rubros según el rubro cargado, con sus oficiales, cashback y topes. El ZIP
        viene ordenado en una carpeta por formato, con un <code>Resumen.txt</code>, y al terminar te
        muestro cuántos salieron de cada uno y qué observaciones hubo.
      </p>
    </details>
  );
}

function Status({ working }: { readonly working: string | null }) {
  const { rows, updatedAt, loading, failed, reload } = useCompanies();
  if (working) return <span>{working}</span>;
  if (loading) return <span>Cargando tus empresas...</span>;
  if (rows.length > 0) {
    return (
      <>
        <strong>{rows.length}</strong> empresas{SEPARATOR}
        <strong>{taxIdCount(rows)}</strong> CUIT{SEPARATOR}actualizado {relativeDate(updatedAt)}
      </>
    );
  }
  if (failed) {
    return (
      <>
        No se pudo conectar para traer tus empresas.{" "}
        <button type="button" className={styles.linkButton} onClick={() => void reload()}>
          Reintentar
        </button>
      </>
    );
  }
  return <>Todavía no cargaste empresas. Subí un Excel o agregalas a mano con "Editar en línea".</>;
}

interface PendingImport {
  readonly report: SheetReport;
  readonly difference: ImportDifference;
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function useSheetImport() {
  const { reload } = useCompanies();
  const save = useSaveCompanies();
  const context = useRegistryContext();
  const { show } = useToast();
  const [working, setWorking] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);

  const saveDirectly = async (report: SheetReport) => {
    setWorking(`Guardando ${String(report.rows.length)} empresas...`);
    if (await save(report.rows)) show(`Empresas actualizadas: ${String(report.rows.length)}`);
  };
  const decide = async (report: SheetReport) => {
    // Compared with what is saved, just read from the base and not with the copy in memory.
    const current = await reload();
    if (!current) {
      show(
        "No pude leer tus empresas guardadas para compararlas: no se reemplazó nada. Probá de nuevo.",
      );
      return;
    }
    const difference = importDifference(current, report.rows, context);
    const hasSaved = difference.current > 0;
    if (report.problems.length > 0 || (hasSaved && difference.hasChanges)) {
      setPending({ report, difference });
    } else if (hasSaved) {
      show("El Excel es igual a lo que ya tenés: no hubo nada que cambiar");
    } else {
      await saveDirectly(report);
    }
  };
  const importFile = async (api: SheetApi, file: File) => {
    setWorking("Leyendo el Excel...");
    try {
      await decide(validateSheet(await readSheetFile(api, file), context));
    } catch (cause) {
      show(`No se pudo leer el Excel: ${errorText(cause)}`);
    } finally {
      setWorking(null);
    }
  };
  return { working, pending, setPending, importFile };
}

interface CompaniesPaneProps {
  readonly isActive: boolean;
  readonly editor: EditorState;
  readonly dispatchEditor: Dispatch<EditorAction>;
  readonly generatorOpen: boolean;
  readonly setGeneratorOpen: (open: boolean) => void;
  readonly ask: Ask;
}

/** Mis empresas: the list that the magnifying glass of the flyer editor searches in. */
export function CompaniesPane({
  isActive,
  editor,
  dispatchEditor,
  generatorOpen,
  setGeneratorOpen,
  ask,
}: CompaniesPaneProps) {
  const { rows, loading, failed, reload } = useCompanies();
  const { options } = useRegistryContext();
  const save = useSaveCompanies();
  const { show } = useToast();
  const withLibrary = useSheetLibrary();
  const { working, pending, setPending, importFile } = useSheetImport();
  const [query, setQuery] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const editorRows = editor.rows;

  // Whoever comes to this pane sees what is saved now.
  useEffect(() => {
    if (isActive) void reload();
  }, [isActive, reload]);

  const closeEditor = () => {
    if (editorRows && editorRows.length > 0) {
      ask({
        message: LEAVE_EDITOR,
        confirmLabel: "Salir sin guardar",
        cancelLabel: "Seguir editando",
        onYes: () => {
          dispatchEditor({ type: "close" });
        },
      });
    } else {
      dispatchEditor({ type: "close" });
    }
  };
  /** What is known of the list. Null: it could not be read, and it is not an empty one. */
  const knownRows = () => (loading || failed ? reload() : Promise.resolve(rows));
  const toggleEditor = async () => {
    if (editorRows) {
      closeEditor();
      return;
    }
    const known = await knownRows();
    if (known) dispatchEditor({ type: "open", rows: known });
  };
  const toggleGenerator = () => {
    if (generatorOpen) {
      setGeneratorOpen(false);
    } else if (editorRows) {
      // It does not open meanwhile: the person answers, and presses it again.
      closeEditor();
    } else {
      setGeneratorOpen(true);
    }
  };
  const downloadAll = () =>
    void withLibrary(async (api) => {
      const known = await knownRows();
      if (!known) return;
      if (known.length === 0) {
        show("Todavía no cargaste empresas");
        return;
      }
      downloadCompanies(api, known, options, "Mis_Empresas_Galicia.xlsx");
      show(`Excel descargado (${String(known.length)} empresas)`);
    });
  const downloadTemplate = () =>
    void withLibrary((api) => {
      downloadCompanyTemplate(api, options);
      show("Plantilla descargada!");
    });
  const onFile = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    if (!file) return;
    // Choosing the same sheet again, once corrected, has to work.
    input.value = "";
    void withLibrary((api) => importFile(api, file));
  };

  return (
    <>
      <p className={styles.short}>
        Tus empresas, privadas: la <strong>lupa</strong> del armador las busca por razón social o
        CUIT y completa oficiales, cashback y topes.
      </p>
      <CompaniesHelp />
      <div className={styles.buttons}>
        <Button size="sm" onClick={() => fileInput.current?.click()}>
          ↑ Subir Excel
        </Button>
        <Button variant="soft-neutral" size="xs" onClick={() => void toggleEditor()}>
          {editorRows ? "✕ Cerrar editor" : "✎ Editar en línea"}
        </Button>
        <Button variant="soft-neutral" size="xs" onClick={downloadAll}>
          ⬇ Descargar Excel
        </Button>
        <Button variant="soft-neutral" size="xs" onClick={downloadTemplate}>
          ⬇ Plantilla vacía
        </Button>
        <Button variant="soft-neutral" size="xs" onClick={toggleGenerator}>
          {generatorOpen ? "✕ Cerrar generador" : "⚡ Generar flyers"}
        </Button>
        <Button variant="soft-neutral" size="xs" onClick={() => void reload()}>
          Recargar
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,.xls"
          hidden
          data-testid="company-sheet-input"
          onChange={({ target }) => {
            onFile(target);
          }}
        />
      </div>
      <p className={styles.status} data-testid="company-status">
        <Status working={working} />
      </p>
      {!editorRows && !generatorOpen && (
        <>
          <Input
            placeholder="Probar el buscador: razón social o CUIT..."
            autoComplete="off"
            value={query}
            onChange={({ target }) => {
              setQuery(target.value);
            }}
          />
          <CompanyList rows={rows} query={query} />
        </>
      )}
      {editorRows && (
        <CompanyEditor
          state={editor}
          dispatch={dispatchEditor}
          ask={ask}
          onCancel={closeEditor}
          onSaved={() => {
            dispatchEditor({ type: "close" });
            void reload();
          }}
        />
      )}
      {generatorOpen && <GeneratorPanel />}
      {pending && (
        <ImportSummaryDialog
          report={pending.report}
          difference={pending.difference}
          onCancel={() => {
            setPending(null);
            show("Carga cancelada: tus empresas quedaron como estaban");
          }}
          onReplace={async () => {
            const saved = await save(pending.report.rows);
            setPending(null);
            if (saved) show(`Empresas actualizadas: ${String(pending.report.rows.length)}`);
          }}
        />
      )}
    </>
  );
}
