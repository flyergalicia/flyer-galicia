// The tab Estudio. Each person sees their designs (the administrator, everybody's): from here they are
// used again or asked to be published.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeText } from "@/shared/domain/promotions/index.ts";
import { type DesignRow, isOpenRequest } from "@/shared/lib/studio/design-row.ts";
import { noteMyDesigns, noteRequests } from "@/shared/lib/studio/studio-notices-query.ts";
import type { ViewProps } from "@/shared/lib/view-props.ts";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { Button } from "@/shared/ui/index.ts";
import type { Threads } from "../api/designs.ts";
import type { Proposal } from "../api/sources.ts";
import {
  type CardAction,
  designsOfFilter,
  filterCounts,
  matchesSearch,
  type StudioFilter,
} from "../model/design-card.ts";
import { studioFailure } from "../model/studio-failure.ts";
import { type CompleteView, useDesignActions } from "../model/use-design-actions.ts";
import { useDesignPainter } from "../model/use-design-painter.ts";
import { useDesignsList } from "../model/use-designs-list.ts";
import { type SourcePicture, useSources } from "../model/use-sources.ts";
import { useStudioDialogs } from "../model/use-studio-dialogs.tsx";
import { DesignCard } from "./DesignCard.tsx";
import { SavedSetsSection } from "./SavedSetsSection.tsx";
import { ShareWindow } from "./ShareWindow.tsx";
import { SourcesSection } from "./SourcesSection.tsx";
import { ViewerWindow } from "./ViewerWindow.tsx";
import styles from "./StudioView.module.css";

const SEARCH_WAIT_MS = 120;
const FILTERS: readonly { readonly id: StudioFilter; readonly label: string }[] = [
  { id: "mine", label: "Mis diseños" },
  { id: "all", label: "Todos" },
  { id: "requests", label: "Pedidos" },
];

/** The search waits a moment: each key does not paint every thumbnail again. */
function useSearch() {
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const type = (text: string) => {
    setTyped(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSearch(normalizeText(text));
    }, SEARCH_WAIT_MS);
  };
  return { typed, search, type };
}

interface EmptyProps {
  readonly hasSearch: boolean;
  readonly filter: StudioFilter;
}

function EmptyList({ hasSearch, filter }: EmptyProps) {
  if (hasSearch) return <div className={styles.nothing}>No hay diseños con ese nombre.</div>;
  if (filter === "requests") {
    return <div className={styles.nothing}>No hay pedidos pendientes.</div>;
  }
  return (
    <div className={styles.nothing}>
      <b>Todavía no hay diseños.</b>
      <br />
      En <b>Flyer Galicia</b> tocá <b>Cambiar logos</b> (arriba a la derecha de la vista previa),
      armá tu versión y tocá <b>Guardar en Estudio</b>.
    </div>
  );
}

function FilterBar({
  counts,
  filter,
  onChoose,
}: {
  readonly counts: ReturnType<typeof filterCounts>;
  readonly filter: StudioFilter;
  readonly onChoose: (filter: StudioFilter) => void;
}) {
  return (
    <div className={styles.filters} role="tablist" data-testid="studio-filters">
      {FILTERS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={filter === id}
          data-filter={id}
          onClick={() => {
            onChoose(id);
          }}
        >
          {label} <span>{counts[id]}</span>
        </button>
      ))}
    </div>
  );
}

function useWho() {
  const session = useSession();
  const { can, isHunter, isLeader } = usePermissions();
  const myId = session.status === "signed-in" ? session.user.id : "";
  const isAdmin = session.status === "signed-in" && session.isAdmin;
  const isComplete = !isHunter && !isLeader && can("estudio");
  const isMine = useCallback((design: DesignRow) => design.user_id === myId, [myId]);
  return { myId, isAdmin, isComplete, isMine };
}

/** What is on the list is news for the numbers of the header at once. */
/** Who already has a copy of this design, of the ones on the list. */
function copiesOf(designs: readonly DesignRow[], { id }: DesignRow): ReadonlySet<string> {
  return new Set(
    designs.flatMap(({ compartido_de: of, user_id: owner }) => (of === id && owner ? [owner] : [])),
  );
}

const isWaiting = ({ estado }: { readonly estado: string }) => estado === "pedido";

function useNumbersOfTheList({
  designs,
  proposals,
  isAdmin,
  isMine,
}: {
  readonly designs: readonly DesignRow[] | null;
  readonly proposals: readonly Proposal[];
  readonly isAdmin: boolean;
  readonly isMine: (design: DesignRow) => boolean;
}) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!designs) return;
    if (isAdmin) {
      noteRequests(
        queryClient,
        designs.filter(isWaiting).length + proposals.filter(isWaiting).length,
      );
    } else noteMyDesigns(queryClient, designs.filter(isMine));
  }, [designs, isAdmin, isMine, proposals, queryClient]);
}

function Intro({ isComplete }: { readonly isComplete: boolean }) {
  return isComplete ? (
    <p className={styles.intro} data-testid="studio-intro">
      Tus diseños de flyer. Se arman en el armador con <b>Cambiar logos</b> y se guardan con{" "}
      <b>Guardar en Estudio</b>. Desde acá los volvés a usar o pedís que se publiquen para todos.
    </p>
  ) : (
    <p className={styles.intro} data-testid="studio-intro">
      Los diseños de flyer que te compartió el administrador. Tocá <b>Usar</b> para abrirlo en el
      armador.
    </p>
  );
}

interface GridProps {
  readonly isLoading: boolean;
  readonly failure: unknown;
  readonly designs: readonly DesignRow[] | null;
  readonly shown: readonly DesignRow[];
  readonly hasSearch: boolean;
  readonly filter: StudioFilter;
  readonly threads: Threads;
  readonly isAdmin: boolean;
  readonly canRequest: boolean;
  readonly isMine: (design: DesignRow) => boolean;
  readonly onAction: (action: CardAction, design: DesignRow) => void;
}

function DesignGrid({
  isLoading,
  failure,
  designs,
  shown,
  hasSearch,
  filter,
  threads,
  isAdmin,
  canRequest,
  isMine,
  onAction,
}: GridProps) {
  return (
    <div className={styles.grid} data-testid="design-grid">
      {isLoading && <div className={styles.nothing}>Cargando diseños…</div>}
      {failure ? (
        <div className={styles.nothing} data-testid="studio-failure">
          No se pudieron leer los diseños: {studioFailure(failure)}
        </div>
      ) : null}
      {designs && shown.length === 0 && <EmptyList hasSearch={hasSearch} filter={filter} />}
      {shown.map((design) => (
        <DesignCard
          key={design.id}
          design={design}
          isMine={isMine(design)}
          isAdmin={isAdmin}
          canRequest={canRequest}
          messages={threads[design.id] ?? []}
          onAction={onAction}
        />
      ))}
    </div>
  );
}

/** What is open over the list: the windows that are not a question. */
function useStudioWindows() {
  const [complete, setComplete] = useState<CompleteView | null>(null);
  const [picture, setPicture] = useState<SourcePicture | null>(null);
  const [sharing, setSharing] = useState<DesignRow | null>(null);
  return { complete, setComplete, picture, setPicture, sharing, setSharing };
}

function CompleteWindow({
  view,
  isAdmin,
  onApprove,
  onClose,
}: {
  readonly view: CompleteView;
  readonly isAdmin: boolean;
  readonly onApprove: (design: DesignRow) => void;
  readonly onClose: () => void;
}) {
  const { design, canvas } = view;
  return (
    <ViewerWindow
      title={design.nombre}
      text="Así queda el flyer de este diseño (sin los datos de la empresa ni los oficiales, que se cargan al armarlo)."
      canvas={canvas}
      extra={
        isAdmin && isOpenRequest(design) ? (
          <Button
            variant="green"
            size="dialog"
            onClick={() => {
              onClose();
              onApprove(design);
            }}
          >
            Aprobar y publicar
          </Button>
        ) : null
      }
      onClose={onClose}
    />
  );
}

export function StudioView({ isActive }: ViewProps) {
  const { myId, isAdmin, isComplete, isMine } = useWho();
  const dialogs = useStudioDialogs();
  const painter = useDesignPainter();
  const { complete, setComplete, picture, setPicture, sharing, setSharing } = useStudioWindows();
  const [chosenFilter, setChosenFilter] = useState<StudioFilter | null>(null);
  const { typed, search, type } = useSearch();
  const { designs, isRequestWaiting, isLoading, failure, threads, reload, refreshOne } =
    useDesignsList(isActive);
  const { actions, mail, approve } = useDesignActions({
    myId,
    isAdmin,
    dialogs,
    painter,
    reload,
    refreshOne,
    showComplete: setComplete,
    share: setSharing,
  });
  const sources = useSources({
    isActive,
    isAdmin,
    isEnabled: isComplete,
    dialogs,
    mail,
    showPicture: setPicture,
  });
  useNumbersOfTheList({ designs, proposals: sources.proposals, isAdmin, isMine });
  const list = designs ?? [];
  // The administrator opens straight on the requests if one is waiting, until they choose something.
  const filter = isAdmin ? (chosenFilter ?? (isRequestWaiting ? "requests" : "mine")) : "mine";
  const shown = designsOfFilter(list, filter, isMine).filter((design) =>
    matchesSearch(design, normalizeText, search),
  );
  return (
    <div className={styles.view} data-testid="studio">
      <div className={styles.wrap}>
        <h2 className={styles.title}>Estudio</h2>
        <Intro isComplete={isComplete} />
        <div className={styles.bar}>
          {isAdmin && (
            <FilterBar
              counts={filterCounts(list, isMine)}
              filter={filter}
              onChoose={setChosenFilter}
            />
          )}
          <input
            type="search"
            className={styles.search}
            aria-label="Buscar por nombre o empresa"
            placeholder="Buscar por nombre o empresa"
            autoComplete="off"
            value={typed}
            onChange={({ target }) => {
              type(target.value);
            }}
          />
        </div>
        <DesignGrid
          isLoading={isLoading}
          failure={failure}
          designs={designs}
          shown={shown}
          hasSearch={Boolean(search)}
          filter={filter}
          threads={threads}
          isAdmin={isAdmin}
          canRequest={isComplete}
          isMine={isMine}
          onAction={(action, row) => {
            void actions[action](row);
          }}
        />
        {isComplete && <SavedSetsSection isActive={isActive} dialogs={dialogs} />}
        {isComplete && <SourcesSection isAdmin={isAdmin} sources={sources} />}
      </div>
      {dialogs.dialogs}
      {sharing && (
        <ShareWindow
          design={sharing}
          myId={myId}
          withCopy={copiesOf(list, sharing)}
          onClose={() => {
            setSharing(null);
          }}
          onShared={(hasNews) => {
            if (hasNews) mail(sharing.id, "compartido");
            void reload();
          }}
        />
      )}
      {complete && (
        <CompleteWindow
          view={complete}
          isAdmin={isAdmin}
          onApprove={(design) => {
            void approve(design);
          }}
          onClose={() => {
            setComplete(null);
          }}
        />
      )}
      {picture && (
        <ViewerWindow
          title={picture.name}
          picture={picture.picture}
          onClose={() => {
            setPicture(null);
          }}
        />
      )}
    </div>
  );
}
