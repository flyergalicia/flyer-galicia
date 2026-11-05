// "Marcas guardadas" in Estudio: the same list as in Cambiar logos, and here they can also be renamed.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useDesignDesk } from "@/shared/lib/studio/design-desk.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button } from "@/shared/ui/index.ts";
import {
  deleteSavedSet,
  failureText,
  readSavedSets,
  renameSavedSet,
  SAVED_SETS_QUERY_KEY,
  SavedSetRowView,
  type SavedSetRow,
} from "@/slices/logo-editor/index.ts";
import type { StudioDialogs } from "../model/use-studio-dialogs.tsx";
import styles from "./StudioView.module.css";

const NAME_LENGTH = 80;

interface SectionProps {
  readonly isActive: boolean;
  readonly dialogs: StudioDialogs;
}

export function SavedSetsSection({ isActive, dialogs }: SectionProps) {
  const backend = useBackend();
  const desk = useDesignDesk();
  const toast = useToast();
  const queryClient = useQueryClient();
  const sets = useQuery({
    queryKey: SAVED_SETS_QUERY_KEY,
    queryFn: () => readSavedSets(backend),
    staleTime: 0,
    retry: false,
  });
  const { refetch } = sets;
  // Showing the screen reads them again: they may have changed from Cambiar logos.
  const wasActive = useRef(isActive);
  useEffect(() => {
    if (isActive && !wasActive.current) void refetch();
    wasActive.current = isActive;
  }, [isActive, refetch]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: SAVED_SETS_QUERY_KEY });
  const rename = async ({ id, nombre }: SavedSetRow) => {
    const name = await dialogs.askText({
      title: "Cambiar el nombre",
      text: "",
      initial: nombre,
      confirmLabel: "Guardar",
      maxLength: NAME_LENGTH,
    });
    if (!name || name === nombre) return;
    try {
      await renameSavedSet(backend, id, name);
      await refresh();
    } catch (cause) {
      toast.show(`No se pudo: ${failureText(cause)}`);
    }
  };
  const remove = async ({ id, nombre }: SavedSetRow) => {
    const yes = await dialogs.askYes({
      title: `¿Borrar «${nombre}»?`,
      text: "Se borran las marcas guardadas, no el flyer. No se puede deshacer.",
      confirmLabel: "Borrar",
    });
    if (!yes) return;
    try {
      await deleteSavedSet(backend, id);
      await refresh();
      toast.show(`Listo: «${nombre}» borrada.`);
    } catch (cause) {
      toast.show(`No se pudo borrar: ${failureText(cause)}`);
    }
  };
  let list = <div className={styles.empty}>Cargando…</div>;
  if (sets.isError) {
    list = <div className={styles.empty}>No se pudieron leer: {failureText(sets.error)}</div>;
  } else if (sets.data?.length === 0) {
    list = (
      <div className={styles.empty}>
        Todavía no guardaste marcas. Armá el flyer con <b>Cambiar logos</b> y tocá{" "}
        <b>Guardar las de este flyer</b>.
      </div>
    );
  } else if (sets.data) {
    list = (
      <>
        {sets.data.map((row) => (
          <SavedSetRowView key={row.id} row={row}>
            <Button
              size="dialog"
              onClick={() => {
                void desk.applySavedSet(row.id);
              }}
            >
              Aplicar en el flyer
            </Button>
            <Button
              variant="ghost"
              size="dialog"
              onClick={() => {
                void rename(row);
              }}
            >
              Cambiar nombre
            </Button>
            <Button
              variant="ghost"
              size="dialog"
              onClick={() => {
                void remove(row);
              }}
            >
              Borrar
            </Button>
          </SavedSetRowView>
        ))}
      </>
    );
  }
  return (
    <section className={styles.section} data-testid="studio-saved-sets">
      <h3 className={styles.sectionTitle}>Marcas guardadas</h3>
      <p className={styles.intro}>
        Las franjas y los logos que guardaste de un flyer (por ejemplo, por localidad) para
        aplicarlos solos en el modelo nuevo. Se guardan desde{" "}
        <b>Cambiar logos → Marcas guardadas</b>.
      </p>
      <div className={styles.list}>{list}</div>
    </section>
  );
}
