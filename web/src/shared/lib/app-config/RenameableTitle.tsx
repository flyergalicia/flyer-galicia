import { useEffect, useRef, useState } from "react";
import { cleanTitle, type TitleKey, titleOf } from "@/shared/domain/screen-titles.ts";
import { useSession } from "@/shared/session/index.ts";
import { useToast } from "../toast/toast-context.ts";
import { useSaveScreenTitles, useScreenTitles } from "./screen-titles-query.ts";
import styles from "./RenameableTitle.module.css";

const TAPS_TO_RENAME = 4;
const TAP_WINDOW_MS = 1600;

function NameField({
  name,
  onDone,
}: {
  readonly name: string;
  readonly onDone: (text: string | null) => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  const finish = (text: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(text);
  };
  return (
    <input
      ref={field}
      className={styles.field}
      type="text"
      aria-label="Nombre del título"
      maxLength={40}
      defaultValue={name}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") finish(event.currentTarget.value);
        if (event.key === "Escape") finish(null);
      }}
      onBlur={({ target }) => {
        finish(target.value);
      }}
    />
  );
}

/**
 * The title of a panel, as the administrator named it. Four taps in a row rename it, for
 * everybody: `_titGestos`. It is an administrator account, even while previewing a profile.
 */
export function RenameableTitle({
  titleKey,
  shown = titleKey,
  inline = false,
  className,
}: {
  readonly titleKey: TitleKey;
  /** What it shows, when it is not what it renames (the panel of the flyer editor). */
  readonly shown?: TitleKey;
  /** Inside a line of text, as the label of a panel. */
  readonly inline?: boolean;
  readonly className?: string | undefined;
}) {
  const { titles } = useScreenTitles();
  const save = useSaveScreenTitles();
  const toast = useToast();
  const session = useSession();
  const canEdit = session.status === "signed-in" && session.isAdmin;
  const [renaming, setRenaming] = useState(false);
  const taps = useRef({ count: 0, at: 0 });
  const name = titleOf(titles, titleKey);
  const shownName = titleOf(titles, shown);
  const Box = inline ? "span" : "div";

  const tap = () => {
    if (renaming) return;
    const now = Date.now();
    const { count, at } = taps.current;
    const next = now - at <= TAP_WINDOW_MS ? count + 1 : 1;
    taps.current = { count: next >= TAPS_TO_RENAME ? 0 : next, at: now };
    if (next >= TAPS_TO_RENAME) setRenaming(true);
  };
  const finish = (text: string | null) => {
    setRenaming(false);
    const named = text === null ? "" : cleanTitle(text);
    if (!named || named === name) return;
    void save({ ...titles, names: { ...titles.names, [titleKey]: named } }).then((saved) => {
      toast.show(
        saved.ok
          ? `Título guardado: ${named}`
          : `Error al guardar el título: ${saved.error.message}`,
      );
    });
  };

  if (!canEdit) return <Box className={className}>{shownName}</Box>;
  return (
    <Box className={className}>
      {renaming ? (
        <NameField name={name} onDone={finish} />
      ) : (
        <button
          type="button"
          className={styles.title}
          title="4 toques seguidos para cambiar el nombre"
          onClick={tap}
        >
          {shownName}
        </button>
      )}
    </Box>
  );
}
