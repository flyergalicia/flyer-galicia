// "Guardar en Estudio": what is on the flyer goes with a name, and from Estudio it is used again or
// asked to be published.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { optionLabel } from "@/shared/domain/flyer-options.ts";
import { artFileName } from "@/shared/flyer-engine/index.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { type FlyerWorkspace, useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { upsertDesign } from "@/shared/lib/studio/design-row.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button, Modal } from "@/shared/ui/index.ts";
import { saveDesign } from "../api/designs.ts";
import { failureText } from "../api/saved-sets.ts";
import { designThumbnail } from "../model/design-thumbnail.ts";
import { useLogoEditorActions } from "../model/editor-context.ts";
import type { LogoEditor } from "../model/editor-store.ts";
import { missingUploads, uploadedLogoName, uploadsOf } from "../model/uploads.ts";
import pickerStyles from "./LogoPicker.module.css";
import styles from "./SavedSets.module.css";

const ANGLE_BRACKETS = /[<>]/g;
const LARGEST_UPLOADS = 2_200_000;

function clean(text: string): string {
  return text.replaceAll(ANGLE_BRACKETS, "").trim();
}

function missingText(keys: readonly string[]): string {
  const [first = ""] = keys;
  const what =
    keys.length === 1
      ? `Falta el logo subido de la PC «${uploadedLogoName(first)}»`
      : `Faltan ${String(keys.length)} logos subidos de la PC`;
  return `⚠ ${what}: en ese lugar va a quedar el logo original. Si lo necesitás, volvé a subirlo antes de guardar.`;
}

function uploadsWeight(uploads: Readonly<Record<string, string>>): number {
  return Object.values(uploads).reduce((total, picture) => total + picture.length, 0);
}

/** The design of one's own that is open: its changes can go on it. */
function useOwnDesign() {
  const editor = useLogoEditorActions();
  const work = editor.works.activeWork();
  return work && !work.temp && work.mine && work.status !== "publicado" ? work : null;
}

/** What is on the flyer at the moment of pressing: what is saved, whatever happens meanwhile. */
function snapshotOf(editor: LogoEditor, workspace: FlyerWorkspace) {
  const art = editor.picture();
  const { option } = workspace.getState().slot;
  if (!art || option === null) return null;
  const list = editor.active();
  const before = editor.works.activeWork();
  const artKey = editor.currentArt();
  return {
    art,
    option,
    list,
    artKey,
    workId: before?.id,
    cuts: editor.cuts(),
    legal: workspace.getState().legal,
    uploads: uploadsOf(list, before?.uploads ?? null, workspace.logos, art, artKey),
  };
}

function useSaving(name: string, company: string, keepsSame: boolean) {
  const editor = useLogoEditorActions();
  const workspace = useFlyerWorkspace();
  const backend = useBackend();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [isSaving, setSaving] = useState(false);
  const own = useOwnDesign();
  const write = async (nombre: string, snapshot: NonNullable<ReturnType<typeof snapshotOf>>) => {
    const { art, option, list, artKey, workId, cuts, legal, uploads } = snapshot;
    const sameId = keepsSame && own ? own.id : null;
    const row = await saveDesign(
      backend,
      {
        nombre,
        empresa: clean(company).slice(0, 160),
        opcion: option,
        base_name: artFileName(artKey),
        datos: { v: 1, cambios: list, subidos: uploads, recortes: cuts, legal },
        miniatura: designThumbnail({ art, artKey, list, cuts, logos: workspace.logos }),
      },
      sameId,
    );
    editor.closeSaveDesign();
    upsertDesign(queryClient, row);
    const savedText = `Guardado en Estudio: «${row.nombre}».`;
    // It is saved. If another flyer or another tab was chosen meanwhile (Escape closes the window),
    // the design stays in Estudio and it does not stick to what is open now.
    if (editor.currentArt() !== artKey || editor.works.activeWork()?.id !== workId) {
      toast.show(savedText);
      return;
    }
    editor.works.saved({
      id: row.id,
      name: row.nombre,
      company: row.empresa ?? "",
      status: row.estado,
      option,
      changes: list,
      uploads,
      cuts,
      legal,
    });
    toast.show(sameId ? `Cambios guardados en «${row.nombre}».` : savedText);
  };
  const save = async () => {
    const nombre = clean(name);
    if (!nombre) {
      toast.show("Ponele un nombre al diseño.");
      return;
    }
    const snapshot = snapshotOf(editor, workspace);
    if (!snapshot) return;
    if (uploadsWeight(snapshot.uploads) > LARGEST_UPLOADS) {
      toast.show(
        "Los logos subidos desde la PC pesan demasiado para guardarlos. Probá con imágenes más chicas.",
      );
      return;
    }
    setSaving(true);
    try {
      await write(nombre, snapshot);
    } catch (cause) {
      setSaving(false);
      toast.show(`No se pudo guardar: ${failureText(cause)}`);
    }
  };
  return { save, isSaving };
}

export function SaveDesignWindow() {
  const editor = useLogoEditorActions();
  const workspace = useFlyerWorkspace();
  const { options } = useFlyerOptions();
  const own = useOwnDesign();
  const nameField = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(own?.name ?? "");
  const [company, setCompany] = useState(own?.company || workspace.getState().form.empresa || "");
  const [keepsSame, setKeepsSame] = useState(true);
  const { save, isSaving } = useSaving(name, company, keepsSame);
  const before = editor.works.activeWork();
  const [missing] = useState(() =>
    missingUploads(editor.active(), before?.uploads ?? {}, workspace.logos),
  );
  useEffect(() => {
    // After the window took the focus for itself.
    const frame = requestAnimationFrame(() => {
      nameField.current?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);
  const onEnter = (event: { readonly key: string; preventDefault: () => void }) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    }
  };
  return (
    <Modal
      onClose={editor.closeSaveDesign}
      look="dialog"
      closeOnBackdrop={false}
      className={`${styles.saveWindow} ${styles.designWindow}`}
    >
      <Modal.Title className={pickerStyles.title}>Guardar en Estudio</Modal.Title>
      <div className={styles.text} data-testid="save-design-text">
        Se guarda el diseño (logos y textos) sobre el flyer «
        {optionLabel(options, workspace.getState().slot.option)}». Lo ves en la solapa{" "}
        <b>Estudio</b>: desde ahí lo volvés a usar o pedís que se publique para todos.
      </div>
      {missing.length > 0 && (
        <div className={styles.text} data-testid="save-design-missing" data-warning="">
          {missingText(missing)}
        </div>
      )}
      <label className={styles.label} htmlFor="save-design-name">
        Nombre del diseño
      </label>
      <input
        ref={nameField}
        id="save-design-name"
        type="text"
        className={styles.field}
        maxLength={80}
        autoComplete="off"
        placeholder="Ej.: Combustible con farmacias"
        value={name}
        onChange={({ target }) => {
          setName(target.value);
        }}
        onKeyDown={onEnter}
      />
      <label className={styles.label} htmlFor="save-design-company">
        Empresa <span>(opcional, para encontrarlo)</span>
      </label>
      <input
        id="save-design-company"
        type="text"
        className={styles.field}
        maxLength={160}
        autoComplete="off"
        placeholder="Ej.: Farmacias del Sur S.A."
        value={company}
        onChange={({ target }) => {
          setCompany(target.value);
        }}
        onKeyDown={onEnter}
      />
      {own && (
        <>
          <label className={styles.choice}>
            <input
              type="radio"
              name="save-design-mode"
              data-mode="same"
              checked={keepsSame}
              onChange={() => {
                setKeepsSame(true);
              }}
            />{" "}
            Guardar los cambios en «{own.name}»
          </label>
          <label className={styles.choice}>
            <input
              type="radio"
              name="save-design-mode"
              data-mode="new"
              checked={!keepsSame}
              onChange={() => {
                setKeepsSame(false);
              }}
            />{" "}
            Guardar como un diseño nuevo
          </label>
        </>
      )}
      <div className={styles.foot}>
        <Button variant="ghost" size="dialog" onClick={editor.closeSaveDesign}>
          Cancelar
        </Button>
        <Button
          size="dialog"
          disabled={isSaving}
          onClick={() => {
            void save();
          }}
        >
          {isSaving ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </Modal>
  );
}
