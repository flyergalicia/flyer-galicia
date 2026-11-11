// "Insertar una sección": a flyer is chosen and a part of it is marked by dragging.
import { useQuery } from "@tanstack/react-query";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { useFlyerWorkspace } from "@/shared/lib/flyer-workspace/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { usePermissions } from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { Button, Modal } from "@/shared/ui/index.ts";
import {
  readSectionSources,
  SECTION_SOURCES_QUERY_KEY,
  type SectionSource,
} from "../api/section-sources.ts";
import { useLogoEditorActions } from "../model/editor-context.ts";
import type { CopiedSection } from "../model/editor-state.ts";
import { recentSections, rememberSection } from "../model/section-recents.ts";
import { sectionFromDrag, sectionThumbnail } from "../model/section-rows.ts";
import pickerStyles from "./LogoPicker.module.css";
import styles from "./Sections.module.css";

const RECENT_WIDTH = 180;

interface Marked {
  readonly sy: number;
  readonly sh: number;
}

interface Chosen {
  readonly source: SectionSource;
  readonly image: HTMLImageElement | null;
  readonly failed: boolean;
}

function NoSources() {
  const editor = useLogoEditorActions();
  const { can, isAdminNow, isHunter, isLeader } = usePermissions();
  const canSeeStudio = !isHunter && !isLeader && can("estudio");
  let text = "Pedile al administrador que suba uno.";
  if (isAdminNow) text = "Subí uno desde Estudio → Flyers para copiar.";
  else if (canSeeStudio) {
    text =
      "Podés proponer uno desde Estudio → Flyers para copiar; se ve acá cuando el administrador lo aprueba.";
  }
  return (
    <div className={styles.nothing}>
      {text}
      {canSeeStudio && (
        <>
          <br />
          <Button
            variant="secondary"
            size="dialog"
            onClick={() => {
              editor.closeSectionPicker();
              editor.goToStudioSources();
            }}
          >
            Ir a Estudio
          </Button>
        </>
      )}
    </div>
  );
}

interface SheetProps {
  readonly image: HTMLImageElement;
  readonly marked: Marked | null;
  readonly onMark: (marked: Marked | null) => void;
}

/** Dragging on the flyer: on letting go, the edges go to the nearest smooth rows. */
function SectionSheet({ image, marked, onMark }: SheetProps) {
  const sheet = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);
  const [dragged, setDragged] = useState<{ from: number; to: number } | null>(null);
  const toImage = (clientY: number) => {
    const box = sheet.current?.getBoundingClientRect();
    if (!box?.height) return 0;
    const y = ((clientY - box.top) * image.naturalHeight) / box.height;
    return Math.max(0, Math.min(image.naturalHeight, y));
  };
  const onDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const from = toImage(event.clientY);
    start.current = from;
    sheet.current?.setPointerCapture(event.pointerId);
    setDragged({ from, to: from });
  };
  const onMove = (event: PointerEvent) => {
    if (start.current !== null) setDragged({ from: start.current, to: toImage(event.clientY) });
  };
  const onUp = (event: PointerEvent) => {
    if (start.current === null) return;
    const from = start.current;
    start.current = null;
    setDragged(null);
    onMark(sectionFromDrag(image, from, toImage(event.clientY)));
  };
  const band = dragged
    ? { top: Math.min(dragged.from, dragged.to), tall: Math.abs(dragged.to - dragged.from) }
    : marked && { top: marked.sy, tall: marked.sh };
  const percent = (rows: number) => `${String((rows * 100) / image.naturalHeight)}%`;
  return (
    <div
      ref={sheet}
      className={styles.sheet}
      data-testid="section-sheet"
      data-natural-height={image.naturalHeight}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => {
        start.current = null;
        setDragged(null);
      }}
    >
      <img alt="" src={image.src} draggable={false} />
      {band && (
        <div
          className={styles.sheetBand}
          data-testid="section-band"
          style={{ top: percent(band.top), height: percent(band.tall), minHeight: 2 }}
        >
          <span>Se copia esta parte</span>
        </div>
      )}
    </div>
  );
}

interface ListProps {
  readonly sources: readonly SectionSource[];
  readonly chosen: SectionSource | null;
  readonly onChoose: (source: SectionSource) => void;
  readonly onRecent: (section: CopiedSection) => void;
}

function RecentButton({
  recent,
  source,
  onRecent,
}: {
  readonly recent: CopiedSection;
  readonly source: SectionSource;
  readonly onRecent: ListProps["onRecent"];
}) {
  const { sections } = useFlyerWorkspace();
  const [thumbnail, setThumbnail] = useState("");
  useEffect(() => {
    let isCurrent = true;
    void sections.fetch(recent.u).then((image) => {
      if (isCurrent && image) setThumbnail(sectionThumbnail(image, recent, RECENT_WIDTH));
    });
    return () => {
      isCurrent = false;
    };
  }, [recent, sections]);
  return (
    <button
      type="button"
      className={styles.recent}
      data-testid="recent-section"
      onClick={() => {
        onRecent(recent);
      }}
    >
      <span className={styles.recentImage}>{thumbnail && <img alt="" src={thumbnail} />}</span>
      <span>de «{source.nombre}»</span>
    </button>
  );
}

function SourceList({ sources, chosen, onChoose, onRecent }: ListProps) {
  const [recents] = useState(recentSections);
  const known = new Map(sources.map((source) => [source.img, source]));
  const usable = recents.flatMap((recent) => {
    const source = known.get(recent.u);
    return source ? [{ recent, source }] : [];
  });
  return (
    <>
      {usable.length > 0 && <div className={styles.sourceTitle}>Copiadas hace poco</div>}
      {usable.map(({ recent, source }) => (
        <RecentButton
          key={`${recent.u}${String(recent.sy)}${String(recent.sh)}`}
          recent={recent}
          source={source}
          onRecent={onRecent}
        />
      ))}
      <div className={styles.sourceTitle}>Flyers</div>
      {sources.map((source) => (
        <button
          key={source.id}
          type="button"
          className={styles.source}
          aria-pressed={chosen?.id === source.id}
          onClick={() => {
            onChoose(source);
          }}
        >
          <span className={styles.sourceImage}>
            {source.mini.startsWith("data:image/jpeg;base64,") && <img alt="" src={source.mini} />}
          </span>
          <span>{source.nombre || "Sin nombre"}</span>
        </button>
      ))}
    </>
  );
}

/** With only one flyer it is chosen by itself. */
function useChosenSource(sources: readonly SectionSource[] | undefined) {
  const { sections } = useFlyerWorkspace();
  const [picked, setPicked] = useState<SectionSource | null>(null);
  const [first] = sources ?? [];
  const source = picked ?? (sources?.length === 1 ? (first ?? null) : null);
  const picture = useQuery({
    queryKey: [...SECTION_SOURCES_QUERY_KEY, "picture", source?.img],
    queryFn: () => sections.fetch(source?.img ?? ""),
    enabled: Boolean(source),
    staleTime: 0,
    gcTime: 0,
  });
  const chosen: Chosen | null = source && {
    source,
    image: picture.data ?? null,
    failed: picture.data === null,
  };
  return {
    chosen,
    choose: (next: SectionSource) => {
      setPicked(next);
      if (next === source && !picture.data) void picture.refetch();
    },
  };
}

function SheetView({ chosen, ...sheet }: Omit<SheetProps, "image"> & { chosen: Chosen | null }) {
  let body = <div className={styles.nothing}>Elegí un flyer de la lista.</div>;
  if (chosen?.failed) {
    body = (
      <div className={styles.nothing}>
        No se pudo bajar este flyer. Revisá tu conexión y tocalo de nuevo.
      </div>
    );
  } else if (chosen?.image) {
    body = <SectionSheet image={chosen.image} {...sheet} />;
  } else if (chosen) {
    body = <div className={styles.nothing}>Bajando el flyer…</div>;
  }
  return (
    <div className={styles.sheetView} data-testid="section-view">
      {body}
    </div>
  );
}

export function SectionPicker() {
  const editor = useLogoEditorActions();
  const { bucket } = useBackend();
  const { sections } = useFlyerWorkspace();
  const toast = useToast();
  const {
    data: sources,
    isError,
    refetch,
  } = useQuery({
    queryKey: SECTION_SOURCES_QUERY_KEY,
    queryFn: () => readSectionSources(bucket, sections.isOurs),
    staleTime: 0,
    retry: false,
  });
  const { chosen, choose } = useChosenSource(sources);
  const [marked, setMarked] = useState<Marked | null>(null);
  const [isThin, setThin] = useState(false);
  const flyerWidth = editor.picture()?.width ?? 1240;
  const go = (section: CopiedSection) => {
    rememberSection(section);
    editor.startPlacing(section);
  };
  const copy = () => {
    const { source, image } = chosen ?? {};
    if (!source || !image || !marked) return;
    go({
      u: source.img,
      sy: marked.sy,
      sh: marked.sh,
      sw: image.naturalWidth,
      nombre: source.nombre,
    });
  };
  const pickRecent = async (recent: CopiedSection) => {
    const image = await sections.fetch(recent.u);
    if (!image) {
      toast.show("No se pudo bajar ese flyer. Revisá tu conexión.");
      return;
    }
    go({ ...recent, sw: image.naturalWidth });
  };
  const isEmpty = sources?.length === 0;
  let list = <div className={styles.empty}>Cargando…</div>;
  if (isError) {
    list = (
      <div className={styles.empty}>
        No se pudo leer la lista.{" "}
        <Button
          variant="ghost"
          size="dialog"
          onClick={() => {
            void refetch();
          }}
        >
          Reintentar
        </Button>
      </div>
    );
  } else if (isEmpty) {
    list = <div className={styles.empty}>Todavía no hay flyers para copiar.</div>;
  } else if (sources) {
    list = (
      <SourceList
        sources={sources}
        chosen={chosen?.source ?? null}
        onChoose={(source) => {
          setMarked(null);
          setThin(false);
          choose(source);
        }}
        onRecent={(recent) => {
          void pickRecent(recent);
        }}
      />
    );
  }
  let howTall = "";
  if (marked && chosen?.image) {
    const tall = Math.round((marked.sh * flyerWidth) / chosen.image.naturalWidth);
    howTall = `Marcaste ${String(tall)} px de alto. Si no es lo que querés, volvé a arrastrar.`;
  } else if (isThin) {
    howTall = "Arrastrá de arriba hacia abajo sobre la parte que querés copiar.";
  }
  return (
    <Modal
      onClose={editor.closeSectionPicker}
      look="dialog"
      closeOnBackdrop={false}
      className={styles.pickerWindow}
    >
      <div className={styles.pickerHead}>
        <div className={styles.pickerHeadText}>
          <Modal.Title className={pickerStyles.title}>Insertar una sección</Modal.Title>
          <div className={styles.pickerText}>
            Elegí un flyer y arrastrá de arriba hacia abajo sobre la parte que querés copiar (toma
            todo el ancho).
          </div>
        </div>
        <button
          type="button"
          className={pickerStyles.close}
          aria-label="Cerrar"
          onClick={editor.closeSectionPicker}
        >
          ×
        </button>
      </div>
      <div className={styles.pickerBody}>
        <div className={styles.sourceList}>{list}</div>
        {isEmpty ? (
          <div className={styles.sheetView} data-testid="section-view">
            <NoSources />
          </div>
        ) : (
          <SheetView
            chosen={chosen}
            marked={marked}
            onMark={(next) => {
              setMarked(next);
              setThin(!next);
            }}
          />
        )}
      </div>
      <div className={styles.pickerFoot}>
        <span className={styles.howTall}>{howTall}</span>
        <Button variant="ghost" size="dialog" onClick={editor.closeSectionPicker}>
          Cancelar
        </Button>
        <Button size="dialog" disabled={!marked} onClick={copy}>
          Copiar esta sección
        </Button>
      </div>
    </Modal>
  );
}
