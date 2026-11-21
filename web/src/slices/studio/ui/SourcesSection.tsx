// "Flyers para copiar": de acá salen las secciones de Cambiar logos → Insertar.
import { useRef } from "react";
import { Button } from "@/shared/ui/index.ts";
import type { Proposal, Source } from "../api/sources.ts";
import { shortDate } from "../model/design-card.ts";
import { studioFailure } from "../model/studio-failure.ts";
import { ACCEPTED_FILES, type useSources } from "../model/use-sources.ts";
import styles from "./StudioView.module.css";

const JPEG = "data:image/jpeg;base64,";

function RowImage({ picture }: { readonly picture: string | null | undefined }) {
  const has = Boolean(picture?.startsWith(JPEG));
  return (
    <div className={styles.rowImage} data-empty={!has}>
      {has && <img alt="" src={picture ?? ""} />}
    </div>
  );
}

function proposalText({ estado, nota_admin: note, autor }: Proposal, isAdmin: boolean) {
  if (estado === "rechazado") return `No aprobado${note ? `: ${note}` : ""}`;
  if (isAdmin) {
    return (
      <>
        Propuesto por <b>{autor || "¿?"}</b>
      </>
    );
  }
  return "Esperando que el administrador lo apruebe";
}

interface SectionProps {
  readonly isAdmin: boolean;
  readonly sources: ReturnType<typeof useSources>;
}

function ProposalRow({
  proposal,
  isAdmin,
  sources,
}: SectionProps & { readonly proposal: Proposal }) {
  return (
    <div className={styles.row} data-testid="source-proposal">
      <RowImage picture={proposal.miniatura} />
      <div className={styles.rowText}>
        <b>{proposal.nombre}</b>
        <span>
          {proposalText(proposal, isAdmin)} · {shortDate(proposal.created_at)}
        </span>
      </div>
      <div className={styles.rowActions}>
        <Button
          variant="ghost"
          size="dialog"
          onClick={() => {
            void sources.lookAtProposal(proposal);
          }}
        >
          Ver
        </Button>
        {isAdmin ? (
          <>
            <Button
              variant="green"
              size="dialog"
              onClick={() => {
                void sources.approve(proposal);
              }}
            >
              Aprobar
            </Button>
            <Button
              variant="ghost"
              size="dialog"
              onClick={() => {
                void sources.reject(proposal);
              }}
            >
              No aprobar
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="dialog"
            onClick={() => {
              void sources.cancel(proposal);
            }}
          >
            {proposal.estado === "rechazado" ? "Borrar" : "Cancelar"}
          </Button>
        )}
      </div>
    </div>
  );
}

function SourceRow({ source, isAdmin, sources }: SectionProps & { readonly source: Source }) {
  return (
    <div className={styles.row} data-testid="source" data-source={source.id}>
      <RowImage picture={source.mini} />
      <div className={styles.rowText}>
        <b>{source.nombre || "Sin nombre"}</b>
        <span>
          Subido el {shortDate(source.at)}
          {source.de ? ` · propuesto por ${source.de}` : ""}
        </span>
      </div>
      <div className={styles.rowActions}>
        <Button
          variant="ghost"
          size="dialog"
          onClick={() => {
            void sources.look(source);
          }}
        >
          Ver
        </Button>
        {isAdmin && (
          <>
            <Button
              variant="ghost"
              size="dialog"
              onClick={() => {
                void sources.rename(source);
              }}
            >
              Cambiar nombre
            </Button>
            <Button
              variant="ghost"
              size="dialog"
              onClick={() => {
                void sources.remove(source);
              }}
            >
              Quitar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function SourcesList({ isAdmin, sources }: SectionProps) {
  const { sources: list, sourcesFailure, proposals } = sources;
  if (!list) {
    return (
      <div className={styles.empty}>
        {sourcesFailure
          ? `No se pudo leer la lista: ${studioFailure(sourcesFailure)}`
          : "Cargando…"}
      </div>
    );
  }
  return (
    <>
      {proposals.length > 0 && (
        <>
          <div className={styles.subtitle}>
            {isAdmin ? "Propuestas para aprobar" : "Tus propuestas"} · {proposals.length}
          </div>
          {proposals.map((proposal) => (
            <ProposalRow
              key={proposal.id}
              proposal={proposal}
              isAdmin={isAdmin}
              sources={sources}
            />
          ))}
          <div className={styles.subtitle}>En el depósito · {list.length}</div>
        </>
      )}
      {list.length > 0 ? (
        list.map((source) => (
          <SourceRow key={source.id} source={source} isAdmin={isAdmin} sources={sources} />
        ))
      ) : (
        <div className={styles.empty}>Todavía no hay flyers para copiar.</div>
      )}
    </>
  );
}

export function SourcesSection({ isAdmin, sources }: SectionProps) {
  const fileField = useRef<HTMLInputElement>(null);
  return (
    <section className={styles.section} data-testid="flyers-to-copy">
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>Flyers para copiar</h3>
        <Button
          variant="ghost"
          size="md"
          data-testid="sources-button"
          onClick={() => {
            fileField.current?.click();
          }}
        >
          {isAdmin ? "Subir un flyer (PDF)" : "Proponer un flyer (PDF)"}
        </Button>
        <input
          ref={fileField}
          type="file"
          accept={ACCEPTED_FILES}
          hidden
          data-testid="sources-file"
          onChange={({ target }) => {
            const [file] = target.files ?? [];
            target.value = "";
            if (file) void sources.chooseFile(file);
          }}
        />
      </div>
      <p className={styles.intro}>
        De acá salen las secciones que se agregan con <b>Cambiar logos → Insertar</b>.{" "}
        {isAdmin
          ? "Las propuestas de los demás te llegan acá para aprobar."
          : "Si tenés un flyer con una sección útil, proponelo: lo ven todos cuando el administrador lo aprueba."}
      </p>
      <div className={styles.list} data-testid="sources-list">
        <SourcesList isAdmin={isAdmin} sources={sources} />
      </div>
    </section>
  );
}
