// What each button of a card does. Everything that changes a design says in what states it has to be:
// if somebody else changed it meanwhile (the author cancelled, another administrator resolved it), it
// is not stepped on.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { optionLabel } from "@/shared/domain/flyer-options.ts";
import {
  FLYER_OPTIONS_QUERY_KEY,
  useFlyerOptions,
} from "@/shared/lib/app-config/flyer-options-query.ts";
import { useDesignDesk } from "@/shared/lib/studio/design-desk.ts";
import {
  type DesignRow,
  STUDIO_DESIGNS_QUERY_KEY,
  upsertDesign,
} from "@/shared/lib/studio/design-row.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { PERMISSIONS_QUERY_KEY, usePermissions } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import {
  changeDesign,
  type DesignChange,
  deleteDesign,
  readDesignContent,
  storedDesign,
} from "../api/designs.ts";
import type { CardAction } from "./design-card.ts";
import { baseFlyerScene, type DesignPainter, paintDesign } from "./design-image.ts";
import { publishDesign } from "./publish-design.ts";
import { studioFailure } from "./studio-failure.ts";
import type { StudioDialogs } from "./use-studio-dialogs.tsx";

const CHANGED_MEANWHILE = "Ese diseño cambió mientras tanto. Te muestro cómo quedó.";

export interface CompleteView {
  readonly design: DesignRow;
  readonly canvas: HTMLCanvasElement;
}

interface ActionsOptions {
  readonly myId: string;
  readonly isAdmin: boolean;
  readonly dialogs: StudioDialogs;
  readonly painter: DesignPainter;
  readonly reload: () => Promise<void>;
  readonly refreshOne: (id: string) => Promise<void>;
  readonly showComplete: (view: CompleteView) => void;
  readonly share: (design: DesignRow) => void;
}

export function useDesignActions({
  myId,
  isAdmin,
  dialogs,
  painter,
  reload,
  refreshOne,
  showComplete,
  share,
}: ActionsOptions) {
  const backend = useBackend();
  const { callEdge, rpc } = backend;
  const queryClient = useQueryClient();
  const toast = useToast();
  const desk = useDesignDesk();
  const { can } = usePermissions();
  const { options } = useFlyerOptions();
  const publishing = useRef(false);
  const exists = (option: number) => options.some(({ n }) => n === option);
  const labelOf = (option: number) => optionLabel(options, option);

  /** Mail to whoever it concerns: the function looks at what happened. It never stops anything. */
  const mail = useCallback(
    (id: string, que: string, flyer?: string) => {
      void callEdge("auth-admin", "notify_estudio", flyer ? { id, que, flyer } : { id, que });
    },
    [callEdge],
  );

  const change = async (
    id: string,
    fields: DesignChange,
    done: string | null,
    expected: readonly string[],
  ): Promise<DesignRow | null> => {
    const outcome = await changeDesign(backend, id, fields, expected);
    if (outcome.kind === "changed") {
      upsertDesign(queryClient, outcome.row);
      if (done) toast.show(done);
      return outcome.row;
    }
    if (outcome.kind === "changed-meanwhile") {
      toast.show(CHANGED_MEANWHILE);
      await reload();
    } else toast.show(`No se pudo: ${studioFailure(outcome.cause)}`);
    return null;
  };

  const use = async (design: DesignRow) => {
    const { id, nombre, opcion, compartido_por: sharedBy } = design;
    if (!exists(opcion)) {
      toast.show("El flyer sobre el que se armó este diseño ya no existe.");
      return;
    }
    // A copy from the administrator can be used even if the profile does not have its base flyer.
    if (!can(`opcion_${opcion}`) && !sharedBy) {
      toast.show(
        `No tenés habilitado el flyer «${labelOf(opcion)}», que es la base de este diseño.`,
      );
      return;
    }
    toast.show(`Abriendo «${nombre}»…`);
    try {
      await desk.openDesign(async () =>
        storedDesign(await readDesignContent(backend, id), myId, Boolean(sharedBy)),
      );
    } catch (cause) {
      toast.show(`No se pudo abrir el diseño: ${studioFailure(cause)}`);
    }
  };

  const view = async (design: DesignRow) => {
    if (!exists(design.opcion)) {
      toast.show("El flyer base de este diseño ya no existe.");
      return;
    }
    toast.show("Armando la vista completa…");
    try {
      const content = await readDesignContent(backend, design.id);
      const whole = await baseFlyerScene(backend.bucket, design.opcion);
      const { canvas } = await paintDesign(painter, whole, content, {
        strict: false,
        notify: toast.show,
      });
      showComplete({ design, canvas });
    } catch (cause) {
      toast.show(`No se pudo armar la vista completa: ${studioFailure(cause)}`);
    }
  };

  const request = async ({ id, nombre, opcion }: DesignRow) => {
    const yes = await dialogs.askYes({
      title: `¿Pedir que se publique «${nombre}»?`,
      text: `Le llega al administrador. Si lo aprueba, aparece como un flyer más (al lado de «${labelOf(opcion)}») para todos los que usan ese flyer.`,
      confirmLabel: "Pedir",
      isSafe: true,
    });
    if (!yes) return;
    const row = await change(
      id,
      { estado: "pedido" },
      "Pedido enviado. Te vas a enterar acá cuando lo revise.",
      ["privado", "rechazado"],
    );
    if (row) void callEdge("auth-admin", "notify_estudio_pedido", { id });
  };

  const removeDesign = async ({ id, nombre, estado }: DesignRow) => {
    const yes = await dialogs.askYes({
      title: `¿Borrar «${nombre}»?`,
      text:
        estado === "publicado"
          ? "El flyer ya publicado NO se borra: sigue en la barra de opciones (eso se maneja desde Config → Opciones)."
          : "No se puede deshacer.",
      confirmLabel: "Borrar",
    });
    if (!yes) return;
    try {
      await deleteDesign(backend, id);
      queryClient.setQueryData<readonly DesignRow[]>(STUDIO_DESIGNS_QUERY_KEY, (list) =>
        list?.filter((row) => row.id !== id),
      );
      desk.closeDesign(id);
      toast.show("Diseño borrado.");
    } catch (cause) {
      toast.show(`No se pudo borrar: ${studioFailure(cause)}`);
    }
  };

  const goToFlyer = ({ opcion_publicada: option }: DesignRow) => {
    if (!option) return;
    if (!can(`opcion_${option}`)) {
      toast.show("Ese flyer no está habilitado para tu perfil.");
      return;
    }
    void desk.showFlyer(option);
  };

  const reject = async ({ id, nombre }: DesignRow) => {
    const note = await dialogs.askText({
      title: `No aprobar «${nombre}»`,
      text: "Contale por qué (lo ve quien lo pidió). Es opcional.",
      confirmLabel: "No aprobar",
      maxLength: 500,
      isLong: true,
    });
    if (note === null) return;
    const row = await change(
      id,
      { estado: "rechazado", nota_admin: note.slice(0, 500) },
      "Listo: no aprobado.",
      ["pedido", "consulta"],
    );
    if (row) mail(id, "resuelto");
  };

  const talk = async (
    { id, nombre, autor }: DesignRow,
    { asking, isQuestion }: { readonly asking: boolean; readonly isQuestion: boolean },
  ) => {
    const text = await dialogs.askText(
      isQuestion
        ? {
            title: `Preguntar sobre «${nombre}»`,
            text: `Le llega a ${autor || "quien lo pidió"} en su Estudio. El pedido queda esperando su respuesta; igual lo podés aprobar o no aprobar cuando quieras.`,
            confirmLabel: "Enviar pregunta",
            maxLength: 1000,
            isLong: true,
          }
        : {
            title: `Responder sobre «${nombre}»`,
            text: "Si tenés que corregir el diseño, primero abrilo con Usar, cambialo y tocá Guardar cambios; después respondé. Al responder, el pedido vuelve al administrador.",
            confirmLabel: "Enviar respuesta",
            maxLength: 1000,
            isLong: true,
          },
    );
    if (text === null) return;
    if (!text) {
      toast.show(asking ? "Escribí la pregunta." : "Escribí la respuesta.");
      return;
    }
    const answer = await rpc(asking ? "flyer_diseno_consultar" : "flyer_diseno_responder", {
      p_id: id,
      p_texto: text,
    });
    if (answer.ok) {
      toast.show(
        asking
          ? "Pregunta enviada. Te aviso acá cuando responda."
          : "Respuesta enviada al administrador.",
      );
    } else toast.show(`No se pudo: ${studioFailure(answer.error)}`);
    await refreshOne(id);
  };

  const publish = async (design: DesignRow, name: string) => {
    // A double click does not publish twice.
    if (publishing.current) {
      toast.show("Ya hay una publicación en curso. Esperá a que termine.");
      return;
    }
    publishing.current = true;
    toast.show(`Publicando «${name}»… no cierres la página.`);
    const { id, opcion } = design;
    const outcome = await publishDesign(
      backend,
      painter,
      { id, name, notify: toast.show },
      studioFailure,
    );
    if (outcome.ok) {
      const { option, permissionsSaved } = outcome;
      const row = await change(
        id,
        { estado: "publicado", opcion_publicada: option, nota_admin: "" },
        null,
        ["pedido", "consulta"],
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: FLYER_OPTIONS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: PERMISSIONS_QUERY_KEY }),
      ]);
      if (row) {
        mail(id, "resuelto", name);
        toast.show(
          `Publicado: «${name}» ya está al lado de «${labelOf(opcion)}».${permissionsSaved ? "" : " Revisá en Facultades quién lo ve."}`,
        );
      } else {
        toast.show(
          `Se creó el flyer «${name}» (opción ${String(option)}), pero el diseño no quedó marcado como publicado. No lo vuelvas a aprobar: si sobra, borralo desde Config → Opciones.`,
        );
      }
    } else {
      const halfDone =
        outcome.kind === "half-done"
          ? ` (la opción ${String(outcome.option)} quedó creada a medias: revisá Config → Opciones)`
          : "";
      toast.show(`No se pudo publicar: ${outcome.reason}${halfDone}`);
      if (outcome.kind === "nothing-created") await reload();
    }
    publishing.current = false;
  };

  const approve = async (design: DesignRow) => {
    if (!isAdmin) return;
    if (!exists(design.opcion)) {
      toast.show("El flyer base de este diseño ya no existe.");
      return;
    }
    const name = await dialogs.askText({
      title: `Aprobar y publicar «${design.nombre}»`,
      text: `Así se va a llamar el flyer nuevo en la barra de opciones, al lado de «${labelOf(design.opcion)}». Lo van a ver los mismos perfiles que hoy ven ese flyer.`,
      initial: design.nombre.slice(0, 40),
      confirmLabel: "Publicar",
      maxLength: 40,
    });
    if (name === null) return;
    if (!name) {
      toast.show("Hace falta un nombre.");
      return;
    }
    await publish(design, name);
  };

  const actions: Readonly<Record<CardAction, (design: DesignRow) => void | Promise<void>>> = {
    use,
    view,
    request,
    answer: (design) => talk(design, { asking: false, isQuestion: false }),
    ask: (design) => talk(design, { asking: true, isQuestion: true }),
    cancel: async ({ id }) => {
      await change(id, { estado: "privado" }, "Pedido cancelado.", ["pedido", "consulta"]);
    },
    goToFlyer,
    approve,
    reject,
    share,
    delete: removeDesign,
  };
  return { actions, mail, approve };
}
