import { useEffect, useRef, useState } from "react";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import type { MenuWindowProps } from "@/shared/lib/view-props.ts";
import { useSession } from "@/shared/session/index.ts";
import { Button, ConfirmDialog, Input, Modal, Textarea } from "@/shared/ui/index.ts";
import {
  activeNote,
  addNote,
  editNote,
  moveNote,
  newNoteId,
  type NotesState,
  openNotes,
  readNotes,
  removeNote,
  saveNotes,
} from "../model/notes.ts";
import styles from "./NotesWindow.module.css";

const SAVED_MARK_MS = 1500;

/** The notes of whoever is inside, in this browser. */
export function NotesWindow({ onClose }: MenuWindowProps) {
  const session = useSession();
  const toast = useToast();
  const userId = session.status === "signed-in" ? session.user.id : "anon";
  const [state, setState] = useState<NotesState>(() => {
    const now = Date.now();
    return openNotes(readNotes(localStorage, userId), newNoteId(now), now);
  });
  const [askingToDelete, setAskingToDelete] = useState(false);
  const [saved, setSaved] = useState(false);
  const titleField = useRef<HTMLInputElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const note = activeNote(state);

  useEffect(
    () => () => {
      clearTimeout(savedTimer.current);
    },
    [],
  );

  const keep = (next: NotesState) => {
    setState(next);
    saveNotes(localStorage, userId, next.notes);
  };

  const edit = (change: { title?: string; body?: string }) => {
    keep(editNote(state, { title: note.title, body: note.body, ...change }, Date.now()));
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => {
      setSaved(false);
    }, SAVED_MARK_MS);
  };

  const add = () => {
    const now = Date.now();
    keep(addNote(state, newNoteId(now), now));
    setSaved(false);
    // It starts with its number: writing replaces it.
    queueMicrotask(() => {
      titleField.current?.focus();
      titleField.current?.select();
    });
  };

  const remove = () => {
    const now = Date.now();
    setAskingToDelete(false);
    keep(removeNote(state, newNoteId(now), now));
    setSaved(false);
    toast.show("Nota eliminada");
  };

  const copy = () => {
    void navigator.clipboard.writeText(note.body).then(
      () => {
        toast.show("Nota copiada");
      },
      () => undefined,
    );
  };

  return (
    <Modal look="account" size="medium" onClose={onClose}>
      <Modal.Header>📝 Bloc de notas</Modal.Header>
      <div className={styles.body}>
        <div className={styles.side}>
          <button type="button" className={styles.new} onClick={add}>
            + Nueva nota
          </button>
          {state.notes.map(({ id, title }) => (
            <button
              key={id}
              type="button"
              className={id === state.activeId ? `${styles.item} ${styles.active}` : styles.item}
              onClick={() => {
                setState({ ...state, activeId: id });
                setSaved(false);
              }}
            >
              {title || "Sin título"}
            </button>
          ))}
        </div>
        <div className={styles.main}>
          <Input
            ref={titleField}
            controlSize="lg"
            className={styles.title}
            aria-label="Título de la nota"
            placeholder="Título de la nota"
            value={note.title}
            onChange={({ target }) => {
              edit({ title: target.value });
            }}
          />
          <Textarea
            className={styles.text}
            aria-label="Texto de la nota"
            placeholder="Escribí acá legales, datos fijos o recordatorios..."
            value={note.body}
            onChange={({ target }) => {
              edit({ body: target.value });
            }}
          />
          <div className={styles.foot}>
            <div className={styles.footLeft}>
              <button
                type="button"
                className={styles.move}
                title="Subir esta nota"
                onClick={() => {
                  keep(moveNote(state, -1));
                }}
              >
                ↑
              </button>
              <button
                type="button"
                className={styles.move}
                title="Bajar esta nota"
                onClick={() => {
                  keep(moveNote(state, 1));
                }}
              >
                ↓
              </button>
              <span className={styles.status}>{saved ? "Guardado ✓" : ""}</span>
            </div>
            <div className={styles.footRight}>
              <Button
                variant="soft-danger"
                size="xs"
                onClick={() => {
                  setAskingToDelete(true);
                }}
              >
                🗑 Eliminar
              </Button>
              <Button variant="soft-neutral" size="xs" onClick={copy}>
                📋 Copiar
              </Button>
            </div>
          </div>
        </div>
      </div>
      {askingToDelete && (
        <ConfirmDialog
          title={`¿Eliminar la nota "${note.title || "Sin título"}"?`}
          confirmLabel="Eliminar"
          danger
          onConfirm={remove}
          onCancel={() => {
            setAskingToDelete(false);
          }}
        >
          Esta acción no se puede deshacer.
        </ConfirmDialog>
      )}
    </Modal>
  );
}
