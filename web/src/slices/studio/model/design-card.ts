// What a card of a design says and offers, from who is looking at it.
import { type DesignRow, isOpenRequest } from "@/shared/lib/studio/design-row.ts";
import type { ButtonVariant } from "@/shared/ui/index.ts";

const STATUS: Readonly<Record<string, string>> = {
  privado: "Guardado",
  pedido: "Pedido enviado",
  consulta: "Con una pregunta",
  publicado: "Publicado",
  rechazado: "No aprobado",
};

export type CardAction =
  | "use"
  | "view"
  | "answer"
  | "request"
  | "cancel"
  | "goToFlyer"
  | "approve"
  | "ask"
  | "reject"
  | "share"
  | "delete";

export interface CardButton {
  readonly action: CardAction;
  readonly label: string;
  readonly variant: ButtonVariant;
}

export interface Viewer {
  readonly isMine: boolean;
  readonly isAdmin: boolean;
  /** The faculty of Estudio: whoever only received a copy can use it, not ask for anything. */
  readonly canRequest: boolean;
  /** The flyer it was published as is still on the list. */
  readonly publishedExists: boolean;
}

function ownerButtons(design: DesignRow, { isMine, canRequest }: Viewer): CardButton[] {
  if (!isMine) return [];
  const { estado } = design;
  const buttons: CardButton[] = [];
  if (estado === "consulta") {
    buttons.push({ action: "answer", label: "Responder", variant: "primary" });
  }
  if ((estado === "privado" || estado === "rechazado") && canRequest) {
    const label = estado === "rechazado" ? "Volver a pedir" : "Pedir que se publique";
    buttons.push({ action: "request", label, variant: "ghost" });
  }
  if (isOpenRequest(design)) {
    buttons.push({ action: "cancel", label: "Cancelar pedido", variant: "ghost" });
  }
  return buttons;
}

function adminButtons(design: DesignRow, { isAdmin }: Viewer): CardButton[] {
  if (!isAdmin) return [];
  const open: CardButton[] = isOpenRequest(design)
    ? [
        { action: "approve", label: "Aprobar y publicar", variant: "green" },
        {
          action: "ask",
          label: design.estado === "consulta" ? "Otra pregunta" : "Preguntar",
          variant: "ghost",
        },
        { action: "reject", label: "No aprobar", variant: "ghost" },
      ]
    : [];
  return [...open, { action: "share", label: "Compartir", variant: "ghost" }];
}

/** Published, the design of a person is not hers to delete any more. */
function canDelete({ estado }: DesignRow, { isMine, isAdmin }: Viewer): boolean {
  return (isMine && estado !== "publicado") || isAdmin;
}

export function cardButtons(design: DesignRow, viewer: Viewer): readonly CardButton[] {
  const goToFlyer: CardButton[] =
    design.estado === "publicado" && design.opcion_publicada && viewer.publishedExists
      ? [{ action: "goToFlyer", label: "Ir al flyer publicado", variant: "ghost" }]
      : [];
  return [
    { action: "use", label: "Usar", variant: "primary" },
    { action: "view", label: "Ver completo", variant: "ghost" },
    ...ownerButtons(design, viewer),
    ...goToFlyer,
    ...adminButtons(design, viewer),
    ...(canDelete(design, viewer)
      ? [{ action: "delete" as const, label: "Borrar", variant: "ghost" as const }]
      : []),
  ];
}

export function statusText(
  { estado, opcion_publicada: published }: DesignRow,
  isMine: boolean,
  labelOf: (option: number) => string,
): string {
  if (estado === "publicado" && published) return `Publicado como «${labelOf(published)}»`;
  if (estado === "consulta") return isMine ? "Te hicieron una pregunta" : "Esperando respuesta";
  return STATUS[estado] ?? estado;
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export type StudioFilter = "mine" | "all" | "requests";

export interface FilterCounts {
  readonly mine: number;
  readonly all: number;
  readonly requests: number;
}

export function filterCounts(
  designs: readonly DesignRow[],
  isMine: (design: DesignRow) => boolean,
): FilterCounts {
  return {
    mine: designs.filter(isMine).length,
    all: designs.length,
    requests: designs.filter(isOpenRequest).length,
  };
}

export function designsOfFilter(
  designs: readonly DesignRow[],
  filter: StudioFilter,
  isMine: (design: DesignRow) => boolean,
): readonly DesignRow[] {
  if (filter === "all") return designs;
  return filter === "requests" ? designs.filter(isOpenRequest) : designs.filter(isMine);
}

export function matchesSearch(
  { nombre, empresa, autor }: DesignRow,
  normalize: (text: string) => string,
  search: string,
): boolean {
  return normalize(`${nombre} ${empresa ?? ""} ${autor ?? ""}`).includes(search);
}
