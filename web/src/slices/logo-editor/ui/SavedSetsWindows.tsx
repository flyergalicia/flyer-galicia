// "Marcas guardadas": the list, with what each one holds, and the window to save those of this flyer.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { optionLabel } from "@/shared/domain/flyer-options.ts";
import {
  catalogHasGeography,
  knownProvinces,
  provincesName,
  type Promotion,
} from "@/shared/domain/promotions/index.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { shownPromotions, usePromotionCatalog } from "@/shared/lib/promotions/catalog-query.ts";
import { useIncludeModo } from "@/shared/lib/promotions/include-modo-context.ts";
import { usePromotionFiltersPort } from "@/shared/lib/promotions/promotion-filters.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useSession } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { artFileName } from "@/shared/flyer-engine/index.ts";
import { Button, ConfirmDialog, Modal } from "@/shared/ui/index.ts";
import { ProvinceSelect } from "@/shared/ui/province-select/ProvinceSelect.tsx";
import {
  deleteSavedSet,
  failureText,
  readSavedSets,
  SAVED_SETS_QUERY_KEY,
  saveSavedSet,
  type SavedSetRow,
} from "../api/saved-sets.ts";
import { designThumbnail } from "../model/design-thumbnail.ts";
import { useApplySet } from "../model/use-apply-set.ts";
import { useLogoEditorActions, useLogoEditorValue } from "../model/editor-context.ts";
import type { LogoEditor } from "../model/editor-store.ts";
import { drawingsOnce } from "../model/saved-set-matching.ts";
import {
  armSavedSet,
  SAVED_SET_VERSION,
  type SavedSetData,
  summaryOf,
} from "../model/saved-set.ts";
import { uploadsOf } from "../model/uploads.ts";
import pickerStyles from "./LogoPicker.module.css";
import styles from "./SavedSets.module.css";

const LARGEST_DATA = 2_800_000;
const ANGLE_BRACKETS = /[<>]/g;

function useMyId(): string {
  const session = useSession();
  return session.status === "signed-in" ? session.user.id : "";
}

function useSavedSetsList() {
  const backend = useBackend();
  return useQuery({
    queryKey: SAVED_SETS_QUERY_KEY,
    queryFn: () => readSavedSets(backend),
    staleTime: 0,
    retry: false,
  });
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** One saved set: what it holds and whose it is. The buttons are of who shows it. */
export function SavedSetRowView({
  row,
  children,
}: {
  readonly row: SavedSetRow;
  readonly children: ReactNode;
}) {
  const { options } = useFlyerOptions();
  const isMine = row.user_id === useMyId();
  const isOutdated = !(Number(row.v) >= SAVED_SET_VERSION);
  const flyer = row.flyer ?? (row.opcion === null ? "" : optionLabel(options, row.opcion));
  const info = [
    row.resumen ?? "",
    flyer ? `del flyer ${flyer}` : "",
    row.prov ? provincesName(row.prov) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const hasImage = row.miniatura?.startsWith("data:image/jpeg;base64,");
  return (
    <div className={styles.row} data-testid="saved-set" data-set={row.id}>
      <div className={styles.rowImage} data-empty={!hasImage}>
        {hasImage && <img alt="" src={row.miniatura ?? ""} />}
      </div>
      <div className={styles.rowText}>
        <b>{row.nombre}</b>
        {info && <span data-testid="saved-set-content">{info}</span>}
        <span>
          {shortDate(row.updated_at)}
          {!isMine && row.autor ? ` · de ${row.autor}` : ""}
        </span>
        {isOutdated && (
          <span className={styles.outdated} data-testid="saved-set-outdated">
            Guardada con la versión anterior: aplicala en su flyer y volvé a guardarla
            (reemplazándola) para que se ubique mejor.
          </span>
        )}
      </div>
      <div className={styles.rowActions}>{children}</div>
    </div>
  );
}

function SetRow({
  row,
  onApply,
  onDelete,
}: {
  readonly row: SavedSetRow;
  readonly onApply: () => void;
  readonly onDelete: () => void;
}) {
  return (
    <SavedSetRowView row={row}>
      <Button size="dialog" onClick={onApply}>
        Aplicar
      </Button>
      <Button variant="ghost" size="dialog" onClick={onDelete}>
        Borrar
      </Button>
    </SavedSetRowView>
  );
}

function ListWindow() {
  const editor = useLogoEditorActions();
  const backend = useBackend();
  const toast = useToast();
  const queryClient = useQueryClient();
  const apply = useApplySet();
  const { data: rows, error, isError } = useSavedSetsList();
  const [deleting, setDeleting] = useState<SavedSetRow | null>(null);
  useLogoEditorValue((state) => state.list);
  const hasChanges = editor.active().length > 0;
  const { data: catalog } = usePromotionCatalog(true);
  const workspace = useFlyerWorkspace();
  const includeModo = useIncludeModo();
  const askToSave = () => {
    const data = armNow(editor, workspace.logos, shownPromotions(catalog, includeModo));
    if (!data || data.items.length === 0) {
      toast.show(
        "Este flyer no tiene cambios para guardar. Armá las franjas y los logos con «Cambiar logos» y después guardalos.",
      );
    } else if (JSON.stringify(data).length > LARGEST_DATA) {
      toast.show(
        "Los logos subidos desde la PC pesan demasiado para guardarlos. Probá con imágenes más chicas.",
      );
    } else {
      editor.saveSavedSet();
    }
  };
  const confirmDelete = async () => {
    if (!deleting) return;
    const { id, nombre } = deleting;
    setDeleting(null);
    try {
      await deleteSavedSet(backend, id);
      queryClient.setQueryData<readonly SavedSetRow[]>(SAVED_SETS_QUERY_KEY, (list) =>
        list?.filter((row) => row.id !== id),
      );
      toast.show(`Listo: «${nombre}» borrada.`);
    } catch (cause) {
      toast.show(`No se pudo borrar: ${failureText(cause)}`);
    }
  };
  let list = <div className={styles.empty}>Cargando…</div>;
  if (isError) {
    list = <div className={styles.empty}>No se pudieron leer: {failureText(error)}</div>;
  } else if (rows?.length === 0) {
    list = (
      <div className={styles.empty}>
        Todavía no guardaste marcas. Armá el flyer con <b>Cambiar logos</b> y tocá{" "}
        <b>Guardar las de este flyer</b>.
      </div>
    );
  } else if (rows) {
    list = (
      <>
        {rows.map((row) => (
          <SetRow
            key={row.id}
            row={row}
            onApply={() => {
              void apply(row.id);
            }}
            onDelete={() => {
              setDeleting(row);
            }}
          />
        ))}
      </>
    );
  }
  return (
    <Modal
      onClose={editor.closeSavedSets}
      look="dialog"
      closeOnBackdrop={false}
      className={styles.listWindow}
    >
      <div className={styles.head}>
        <div className={styles.headText}>
          <Modal.Title className={pickerStyles.title}>Marcas guardadas</Modal.Title>
          <div className={styles.text}>
            Guardá las franjas y los logos que pusiste en este flyer con un nombre (por ejemplo, la
            localidad) y aplicalos solos en el modelo nuevo: se ubican donde están ahora, con los
            días y la vigencia de hoy.
          </div>
        </div>
        <button
          type="button"
          className={pickerStyles.close}
          aria-label="Cerrar"
          onClick={editor.closeSavedSets}
        >
          ×
        </button>
      </div>
      <Button className={styles.saveButton} disabled={!hasChanges} onClick={askToSave}>
        Guardar las de este flyer
      </Button>
      {!hasChanges && (
        <div className={styles.tip}>
          Para guardar, primero cambiá algo del flyer (una franja o un logo).
        </div>
      )}
      <div className={styles.listTitle}>Mis marcas guardadas</div>
      <div className={styles.list} data-testid="saved-sets">
        {list}
      </div>
      {deleting && (
        <ConfirmDialog
          title={`¿Borrar «${deleting.nombre}»?`}
          confirmLabel="Borrar"
          danger
          onConfirm={() => {
            void confirmDelete();
          }}
          onCancel={() => {
            setDeleting(null);
          }}
        >
          Se borran las marcas guardadas, no el flyer. No se puede deshacer.
        </ConfirmDialog>
      )}
    </Modal>
  );
}

function armNow(
  editor: LogoEditor,
  logos: ReturnType<typeof useFlyerWorkspace>["logos"],
  catalog: readonly Promotion[],
) {
  const art = editor.picture();
  if (!art) return null;
  const list = editor.active();
  return armSavedSet({
    list,
    art,
    catalog,
    boxes: drawingsOnce(art),
    uploads: uploadsOf(list, null, logos, art, editor.currentArt()),
  });
}

interface SaveChoices {
  readonly mine: readonly SavedSetRow[];
  readonly replacingId: string;
  readonly name: string;
  readonly province: string;
  readonly chooseTarget: (id: string) => void;
  readonly typeName: (name: string) => void;
  readonly chooseProvince: (province: string) => void;
}

/** What the window offers: by default, replacing the last one applied, with its name and province. */
function useSaveChoices(rows: readonly SavedSetRow[] | undefined): SaveChoices {
  const editor = useLogoEditorActions();
  const myId = useMyId();
  const port = usePromotionFiltersPort();
  const mine = (rows ?? []).filter(({ user_id: owner }) => owner === myId);
  const last = editor.placement.lastApplied();
  const applied = mine.find(({ id }) => id === last?.id);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [typed, setTyped] = useState<string | null>(null);
  const [chosenProvince, chooseProvince] = useState<string | null>(null);
  const replacingId = replacing ?? applied?.id ?? "";
  const target = mine.find(({ id }) => id === replacingId);
  return {
    mine,
    replacingId,
    name: typed ?? target?.nombre ?? "",
    province: chosenProvince ?? applied?.prov ?? port.read().province,
    chooseTarget: (id) => {
      setReplacing(id);
      setTyped(null);
    },
    typeName: setTyped,
    chooseProvince,
  };
}

function SaveFields({
  choices,
  provinces,
  onEnter,
}: {
  readonly choices: SaveChoices;
  readonly provinces: readonly string[];
  readonly onEnter: () => void;
}) {
  const { mine, replacingId, name, province } = choices;
  const nameField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // After the window took the focus for itself.
    const frame = requestAnimationFrame(() => {
      nameField.current?.focus();
      nameField.current?.select();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <>
      {mine.length > 0 && (
        <>
          <label className={styles.label} htmlFor="saved-set-target">
            Guardar como
          </label>
          <select
            id="saved-set-target"
            className={styles.field}
            value={replacingId}
            onChange={(event) => {
              choices.chooseTarget(event.target.value);
            }}
          >
            <option value="">Una nueva</option>
            {mine.map(({ id, nombre }) => (
              <option key={id} value={id}>
                Reemplazar «{nombre}»
              </option>
            ))}
          </select>
        </>
      )}
      <label className={styles.label} htmlFor="saved-set-name">
        Nombre
      </label>
      <input
        ref={nameField}
        id="saved-set-name"
        type="text"
        className={styles.field}
        maxLength={80}
        autoComplete="off"
        placeholder="Neuquén capital"
        value={name}
        onChange={(event) => {
          choices.typeName(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onEnter();
          }
        }}
      />
      {provinces.length > 0 && (
        <>
          <label className={styles.label} htmlFor="saved-set-province">
            Provincia de estas marcas <span>(te aviso si alguna no tiene promo ahí)</span>
          </label>
          <ProvinceSelect
            appearance="native"
            aria-label="Provincia de estas marcas"
            data-testid="saved-set-province"
            provinces={provinces}
            value={province}
            allLabel="Ninguna en particular"
            onChange={choices.chooseProvince}
          />
        </>
      )}
    </>
  );
}

function useSaving(data: SavedSetData | null, summary: string, choices: SaveChoices) {
  const editor = useLogoEditorActions();
  const backend = useBackend();
  const workspace = useFlyerWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { options } = useFlyerOptions();
  const [isSaving, setSaving] = useState(false);
  const { name, province, replacingId } = choices;
  const save = async () => {
    const art = editor.picture();
    const clean = name.replaceAll(ANGLE_BRACKETS, "").trim();
    if (!clean) {
      toast.show("Ponele un nombre (por ejemplo, la localidad).");
      return;
    }
    const { option } = workspace.getState().slot;
    if (!data || !art || option === null) return;
    setSaving(true);
    try {
      const saved = await saveSavedSet(
        backend,
        {
          nombre: clean,
          opcion: option,
          base_name: artFileName(editor.currentArt()),
          datos: { ...data, prov: province, resumen: summary, flyer: optionLabel(options, option) },
          miniatura: designThumbnail({
            art,
            artKey: editor.currentArt(),
            list: editor.active(),
            cuts: editor.cuts(),
            logos: workspace.logos,
          }),
        },
        replacingId,
      );
      queryClient.setQueryData<readonly SavedSetRow[]>(SAVED_SETS_QUERY_KEY, (list) => [
        saved,
        ...(list ?? []).filter(({ id }) => id !== saved.id),
      ]);
      editor.placement.noteApplied(saved.id, saved.nombre);
      editor.closeSavedSets();
      const verb = replacingId ? "Actualicé «" : "Guardadas como «";
      toast.show(`${verb}${saved.nombre}»: ${summary}.`);
    } catch (cause) {
      setSaving(false);
      toast.show(`No se pudo guardar: ${failureText(cause)}`);
    }
  };
  return { save, isSaving };
}

function buttonText(isSaving: boolean, replacingId: string): string {
  if (isSaving) return "Guardando…";
  return replacingId ? "Reemplazar" : "Guardar";
}

function SaveWindow() {
  const editor = useLogoEditorActions();
  const workspace = useFlyerWorkspace();
  const { data: rows } = useSavedSetsList();
  const { data: catalog } = usePromotionCatalog(true);
  const all = catalog?.all ?? [];
  const includeModo = useIncludeModo();
  const provinces = catalogHasGeography(all) ? knownProvinces(catalog?.locations ?? [], all) : [];
  const [data] = useState(() =>
    armNow(editor, workspace.logos, shownPromotions(catalog, includeModo)),
  );
  const choices = useSaveChoices(rows);
  const summary = data ? summaryOf(data.items) : "nada";
  const { save, isSaving } = useSaving(data, summary, choices);
  return (
    <Modal
      onClose={editor.closeSavedSets}
      look="dialog"
      closeOnBackdrop={false}
      className={styles.saveWindow}
    >
      <div className={styles.head}>
        <div className={styles.headText}>
          <Modal.Title className={pickerStyles.title}>Guardar las marcas de este flyer</Modal.Title>
          <div className={styles.text}>
            Se guardan: <b>{summary}</b>. Después las aplicás en el modelo nuevo desde «Marcas
            guardadas».
          </div>
        </div>
        <button
          type="button"
          className={pickerStyles.close}
          aria-label="Cerrar"
          onClick={editor.closeSavedSets}
        >
          ×
        </button>
      </div>
      <SaveFields
        choices={choices}
        provinces={provinces}
        onEnter={() => {
          void save();
        }}
      />
      <div className={styles.foot}>
        <Button variant="ghost" size="dialog" onClick={editor.closeSavedSets}>
          Cancelar
        </Button>
        <Button
          size="dialog"
          disabled={isSaving}
          onClick={() => {
            void save();
          }}
        >
          {buttonText(isSaving, choices.replacingId)}
        </Button>
      </div>
    </Modal>
  );
}

export function SavedSetsWindows() {
  const which = useLogoEditorValue((state) => state.savedSets);
  if (which === "list") return <ListWindow />;
  return which === "save" ? <SaveWindow /> : null;
}
