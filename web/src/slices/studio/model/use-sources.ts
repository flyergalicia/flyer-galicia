// "Flyers para copiar": the administrator uploads, the others propose, and approving it sends the
// picture to the bucket. One thing at a time.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { rasterizeFlyer } from "@/shared/lib/pdf-flyer/rasterize-flyer.ts";
import { useOptionOnScreen } from "@/shared/lib/option-on-screen/option-on-screen-context.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { SECTION_SOURCES_QUERY_KEY } from "@/slices/logo-editor/index.ts";
import {
  blobOfJpeg,
  changeSources,
  markProposalApproved,
  publishSource,
  proposeSource,
  type Proposal,
  readProposal,
  readProposalPicture,
  readProposals,
  readSources,
  rejectProposal,
  type Source,
  sourceThumbnail,
} from "../api/sources.ts";
import { deleteDesign } from "../api/designs.ts";
import { DesignImageError } from "./design-image.ts";
import { studioFailure } from "./studio-failure.ts";
import type { StudioDialogs } from "./use-studio-dialogs.tsx";

const SOURCES_KEY = ["studio", "sources"] as const;
const PROPOSALS_KEY = ["studio", "proposals"] as const;
const LARGEST_FILE = 25 * 1024 * 1024;
const NAME_LENGTH = 60;
const LONG_NOTICE_MS = 9000;
const ACCEPTED = /\.(?:pdf|png|jpe?g)$/i;

export const ACCEPTED_FILES = ".pdf,application/pdf,image/png,image/jpeg";

export interface SourcePicture {
  readonly name: string;
  readonly picture: string;
}

function nameFromFile(file: File): string {
  return file.name
    .replace(/\.[^.]+$/, "")
    .replaceAll(/[_-]+/g, " ")
    .trim()
    .slice(0, NAME_LENGTH);
}

interface SourcesOptions {
  readonly isActive: boolean;
  readonly isAdmin: boolean;
  /** Without the faculty of Estudio, nothing of this is read. */
  readonly isEnabled: boolean;
  readonly dialogs: StudioDialogs;
  readonly mail: (id: string, que: string) => void;
  readonly showPicture: (picture: SourcePicture) => void;
}

export function useSources({
  isActive,
  isAdmin,
  isEnabled,
  dialogs,
  mail,
  showPicture,
}: SourcesOptions) {
  const backend = useBackend();
  const { bucket } = backend;
  const queryClient = useQueryClient();
  const toast = useToast();
  const onScreen = useOptionOnScreen();
  const isBusy = useRef(false);
  const sources = useQuery({
    queryKey: SOURCES_KEY,
    queryFn: () => readSources(bucket),
    enabled: isEnabled,
    staleTime: 0,
  });
  const proposals = useQuery({
    queryKey: [...PROPOSALS_KEY, isAdmin],
    queryFn: () => readProposals(backend, isAdmin),
    enabled: isEnabled,
    staleTime: 0,
  });
  const { refetch: refetchSources } = sources;
  const { refetch: refetchProposals } = proposals;
  const wasActive = useRef(isActive);
  useEffect(() => {
    if (isActive && !wasActive.current && isEnabled) {
      void refetchSources();
      void refetchProposals();
    }
    wasActive.current = isActive;
  }, [isActive, isEnabled, refetchProposals, refetchSources]);

  const refresh = async () => {
    // The window of Insertar lists them too.
    void queryClient.invalidateQueries({ queryKey: SECTION_SOURCES_QUERY_KEY });
    await Promise.all([refetchSources(), refetchProposals()]);
  };

  const askName = (initial: string) =>
    dialogs.askText({
      title: isAdmin ? "Subir a Flyers para copiar" : "Proponer un flyer para copiar",
      text: isAdmin
        ? "Un nombre para reconocerlo en la lista (por ejemplo, «Shoppings CABA»)."
        : "Un nombre para reconocerlo. Le llega al administrador; cuando lo aprueba, lo ven todos en Insertar.",
      initial,
      confirmLabel: isAdmin ? "Subir" : "Enviar propuesta",
      maxLength: NAME_LENGTH,
    });

  const send = async (name: string, blob: Blob, canvas: HTMLCanvasElement) => {
    const thumbnail = sourceThumbnail(canvas);
    if (isAdmin) {
      await publishSource(bucket, {
        blob,
        width: canvas.width,
        height: canvas.height,
        thumbnail,
        name,
        proposedBy: "",
      });
      toast.show(`Listo: «${name}» ya está en Flyers para copiar.`);
    } else {
      await proposeSource(backend, canvas, name, thumbnail, onScreen.get() ?? 1);
      toast.show(
        "Propuesta enviada. Cuando el administrador la apruebe, la ven todos en Insertar.",
      );
    }
  };

  const chooseFile = async (file: File) => {
    if (isBusy.current) {
      toast.show("Esperá a que termine la subida anterior.");
      return;
    }
    if (!ACCEPTED.test(file.name) && file.type !== "application/pdf") {
      toast.show("Subí el flyer en PDF (o una imagen PNG o JPG).");
      return;
    }
    if (file.size > LARGEST_FILE) {
      toast.show("El archivo supera los 25 MB.");
      return;
    }
    isBusy.current = true;
    toast.show("Preparando el flyer…");
    const rasterized = await rasterizeFlyer(file, toast.show);
    // Without pdf.js it stays busy, as it is today: the person is told, and it needs a reload.
    if (rasterized === "no-reader") return;
    if (!rasterized) {
      isBusy.current = false;
      toast.show("No se pudo leer ese archivo.");
      return;
    }
    const name = await askName(nameFromFile(file));
    if (!name) {
      isBusy.current = false;
      if (name !== null) toast.show("Hace falta un nombre.");
      return;
    }
    try {
      await send(name, rasterized.blob, rasterized.canvas);
    } catch (cause) {
      const start = isAdmin ? "No se pudo subir" : "No se pudo enviar";
      toast.show(`${start}: ${studioFailure(cause)}`);
    }
    isBusy.current = false;
    await refresh();
  };

  const look = async (source: Source) => {
    showPicture({ name: source.nombre, picture: source.img });
  };

  const lookAtProposal = async ({ id }: Proposal) => {
    try {
      const { name, picture } = await readProposalPicture(backend, id);
      if (picture.startsWith("data:image/jpeg;base64,")) showPicture({ name, picture });
      else toast.show("No se pudo abrir ese flyer.");
    } catch {
      toast.show("No se pudo abrir ese flyer.");
    }
  };

  const rename = async (source: Source) => {
    const name = await dialogs.askText({
      title: "Cambiar nombre",
      text: "",
      initial: source.nombre,
      confirmLabel: "Guardar",
      maxLength: NAME_LENGTH,
    });
    if (name === null) return;
    if (!name) {
      toast.show("Hace falta un nombre.");
      return;
    }
    try {
      await changeSources(bucket, (list) =>
        list.map((entry) =>
          typeof entry === "object" && entry !== null && Reflect.get(entry, "id") === source.id
            ? { ...entry, nombre: name }
            : entry,
        ),
      );
      await refresh();
    } catch (cause) {
      toast.show(`No se pudo guardar: ${studioFailure(cause)}`);
    }
  };

  const remove = async (source: Source) => {
    const yes = await dialogs.askYes({
      title: `¿Quitar «${source.nombre}»?`,
      text: "Deja de aparecer en Insertar. Los flyers que ya tienen una sección copiada de él no cambian.",
      confirmLabel: "Quitar",
      cancelLabel: "Volver",
    });
    if (!yes) return;
    try {
      await changeSources(bucket, (list) =>
        list.filter(
          (entry) =>
            !(
              typeof entry === "object" &&
              entry !== null &&
              Reflect.get(entry, "id") === source.id
            ),
        ),
      );
      await refresh();
      toast.show("Quitado de Flyers para copiar.");
    } catch (cause) {
      toast.show(`No se pudo quitar: ${studioFailure(cause)}`);
    }
  };

  const publishProposal = async (id: string): Promise<string> => {
    const proposal = await readProposal(backend, id);
    if (proposal.estado !== "pedido") {
      throw new DesignImageError("esa propuesta ya se resolvió o se canceló");
    }
    const blob = blobOfJpeg(proposal.picture);
    if (!blob) throw new DesignImageError("la propuesta no trae la imagen");
    await publishSource(bucket, {
      blob,
      width: proposal.width,
      height: proposal.height,
      thumbnail: proposal.miniatura,
      name: proposal.nombre,
      proposedBy: proposal.autor,
    });
    return proposal.nombre;
  };

  const approve = async ({ id }: Proposal) => {
    if (isBusy.current) {
      toast.show("Esperá a que termine lo anterior.");
      return;
    }
    isBusy.current = true;
    toast.show("Aprobando…");
    try {
      const name = await publishProposal(id);
      // If it cannot be marked, it is said: it would stay with "Aprobar", and approving it again
      // would put it twice on the list.
      if (await markProposalApproved(backend, id)) {
        mail(id, "resuelto");
        toast.show(`Aprobado: «${name}» ya está en Flyers para copiar.`);
      } else {
        toast.show(
          `«${name}» ya está en Flyers para copiar, pero no se pudo marcar la propuesta como aprobada. No la apruebes de nuevo: tocá «No aprobar» para sacarla de la lista de pendientes.`,
          LONG_NOTICE_MS,
        );
      }
    } catch (cause) {
      toast.show(`No se pudo aprobar: ${studioFailure(cause)}`);
    }
    isBusy.current = false;
    await refresh();
  };

  const reject = async ({ id }: Proposal) => {
    const note = await dialogs.askText({
      title: "No aprobar",
      text: "Si querés, decile por qué (lo ve quien lo propuso).",
      confirmLabel: "No aprobar",
      maxLength: 500,
      isLong: true,
    });
    if (note === null) return;
    try {
      await rejectProposal(backend, id, note);
      mail(id, "resuelto");
      await refresh();
    } catch (cause) {
      toast.show(`No se pudo: ${studioFailure(cause)}`);
    }
  };

  const cancel = async ({ id, nombre }: Proposal) => {
    const yes = await dialogs.askYes({
      title: `¿Borrar la propuesta «${nombre}»?`,
      text: "Se borra con su imagen. Para proponerlo de nuevo vas a tener que volver a subir el PDF.",
      confirmLabel: "Borrar",
      cancelLabel: "Volver",
    });
    if (!yes) return;
    try {
      await deleteDesign(backend, id);
      toast.show("Propuesta borrada.");
      await refresh();
    } catch (cause) {
      toast.show(`No se pudo: ${studioFailure(cause)}`);
    }
  };

  return {
    sources: sources.data ?? null,
    sourcesFailure: sources.data ? null : sources.error,
    proposals: proposals.data ?? [],
    chooseFile,
    look,
    lookAtProposal,
    rename,
    remove,
    approve,
    reject,
    cancel,
  };
}
