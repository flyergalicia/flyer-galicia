// Tarjetas y salas VIP: loaded by hand from the official pages; the administrator edits them here.
import { useState } from "react";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { ConfirmDialog } from "@/shared/ui/index.ts";
import { removeCard, writeProblem } from "../api/benchmark-writes.ts";
import { useBenchmark, useBenchmarkActions } from "../model/benchmark-context.ts";
import {
  announcedChanges,
  bestOfGalicia,
  mostPasses,
  mostPassesCount,
  sortedCards,
  TRUST_TEXT,
} from "../model/cards.ts";
import { shortDate } from "../model/dates.ts";
import { isHttps } from "../model/offers.ts";
import { bankName, GALICIA, type PremiumCard } from "../model/rows.ts";
import { barStyle } from "./bar-style.ts";
import { CardEditor } from "./CardEditor.tsx";
import styles from "./BenchmarkView.module.css";

const BAR_PX = 240;

/** null: closed; "new": a new one; else, the card being edited. */
type Editing = null | "new" | PremiumCard;

function Intro({ onAdd }: { readonly onAdd: (() => void) | null }) {
  const { isAdmin } = useBenchmark();
  return (
    <div className={styles.card}>
      <h3>Tarjetas premium y salas VIP</h3>
      <p className={styles.sub}>
        {`Cargado a mano desde las páginas oficiales de cada banco. Estas condiciones cambian seguido: mirá la vigencia y la fecha de revisión de cada fila antes de usarlas con un cliente.${isAdmin ? " Vos podés corregir cada fila y agregar tarjetas." : ""}`}
      </p>
      {onAdd && (
        <button type="button" className={styles.button} onClick={onAdd}>
          + Agregar tarjeta
        </button>
      )}
    </div>
  );
}

function Changes({ cards }: { readonly cards: readonly PremiumCard[] }) {
  const { days } = useBenchmark();
  const changes = announcedChanges(cards, days.today);
  if (changes.length === 0) return null;
  return (
    <div className={styles.card}>
      <h3>Cambios anunciados</h3>
      <ul className={styles.list}>
        {changes.map(({ card, date }) => (
          <li key={card.id}>
            <b>{`${bankName(card.banco)} · ${card.tarjeta}`}</b>
            {`: cambia el ${date}. ${card.vigencia ?? ""}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PassesSummary({ cards }: { readonly cards: readonly PremiumCard[] }) {
  const top = mostPasses(cards);
  const galicia = bestOfGalicia(cards);
  if (top.length === 0) return null;
  return (
    <div className={`${styles.summary} ${styles.passesSummary}`}>
      {"Los que más dan: "}
      {top.map((card, index) => (
        <span key={card.id}>
          {index > 0 && ", "}
          <b>{`${bankName(card.banco)} ${card.paquete || card.tarjeta}`}</b>
          {` (${String(card.pases_anio)})`}
        </span>
      ))}
      .
      {galicia && (
        <>
          {" La de Galicia con más pases es "}
          <b>{galicia.tarjeta}</b>
          {` (${String(galicia.pases_anio)}).`}
        </>
      )}
    </div>
  );
}

function Passes({ cards }: { readonly cards: readonly PremiumCard[] }) {
  const longest = mostPassesCount(cards);
  return (
    <div className={styles.card}>
      <h3>Pases a salas VIP por año (titular)</h3>
      <PassesSummary cards={cards} />
      {cards.map((card) => {
        const passes = card.pases_anio ?? 0;
        const name = bankName(card.banco);
        return (
          <div key={card.id} className={styles.bar} data-galicia={card.banco === GALICIA}>
            <span
              className={styles.passName}
              title={`${name} ${card.tarjeta} ${card.paquete ?? ""}`}
            >
              {`${name} · ${card.tarjeta}${card.paquete ? ` (${card.paquete})` : ""}`}
            </span>
            {passes > 0 ? (
              <>
                <i
                  style={barStyle(
                    Math.max(3, Math.round((passes / longest) * BAR_PX)),
                    passes / longest,
                    "190px",
                  )}
                />{" "}
                {passes}
              </>
            ) : (
              <span className={styles.segment}>sin dato</span>
            )}
          </div>
        );
      })}
      <p className={styles.notice}>
        Las bajas de pases ya anunciadas (por ejemplo Macro desde el 18/11/2026) figuran en «Cambios
        anunciados» y en el detalle de cada fila.
      </p>
    </div>
  );
}

function SourceCell({ card }: { readonly card: PremiumCard }) {
  const reviewed = card.revisada ? ` · revisada ${shortDate(card.revisada)}` : "";
  return (
    <td style={{ minWidth: 150 }}>
      {isHttps(card.fuente_url) && (
        <a href={card.fuente_url ?? ""} target="_blank" rel="noopener noreferrer">
          Ver página
        </a>
      )}
      <div className={styles.segment}>{`${TRUST_TEXT[card.confianza ?? ""] ?? ""}${reviewed}`}</div>
      {card.notas && <div className={styles.segment}>{card.notas}</div>}
    </td>
  );
}

function CardRow({
  card,
  onEdit,
  onRemove,
}: {
  readonly card: PremiumCard;
  readonly onEdit: ((card: PremiumCard) => void) | null;
  readonly onRemove: (card: PremiumCard) => void;
}) {
  const galicia = card.banco === GALICIA ? styles.galicia : undefined;
  const fastAndParking = [card.fast_pass, card.parking].filter(Boolean).join(" ");
  return (
    <tr data-card={card.id}>
      <td className={galicia}>
        <b>{bankName(card.banco)}</b>
        <div>{card.tarjeta}</div>
        {card.paquete && <div className={styles.segment}>{card.paquete}</div>}
      </td>
      <td style={{ minWidth: 220 }}>
        {card.salas_vip}
        {card.vigencia && <div className={styles.segment}>{card.vigencia}</div>}
      </td>
      <td style={{ minWidth: 170 }}>{fastAndParking}</td>
      <td style={{ minWidth: 200 }}>{card.acompanantes}</td>
      <td style={{ minWidth: 230 }}>{card.seguros}</td>
      <td style={{ minWidth: 150 }}>{card.puntos}</td>
      <td style={{ minWidth: 200 }}>{card.costo}</td>
      <SourceCell card={card} />
      {onEdit && (
        <td className={styles.noWrap}>
          <button type="button" className={styles.button} onClick={() => onEdit(card)}>
            Editar
          </button>{" "}
          <button type="button" className={styles.button} onClick={() => onRemove(card)}>
            Quitar
          </button>
        </td>
      )}
    </tr>
  );
}

function CardsTable({
  cards,
  onEdit,
  onRemove,
}: {
  readonly cards: readonly PremiumCard[];
  readonly onEdit: ((card: PremiumCard) => void) | null;
  readonly onRemove: (card: PremiumCard) => void;
}) {
  return (
    <div className={`${styles.card} ${styles.slides}`} data-slides="table">
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Tarjeta</th>
            <th>Salas VIP</th>
            <th>Fast Pass y parking</th>
            <th>Acompañantes y adicionales</th>
            <th>Seguros</th>
            <th>Millas y puntos</th>
            <th>Costo</th>
            <th>Fuente</th>
            {onEdit && <th aria-label="Editar o quitar" />}
          </tr>
        </thead>
        <tbody>
          {cards.map((card) => (
            <CardRow key={card.id} card={card} onEdit={onEdit} onRemove={onRemove} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function useRemoval() {
  const backend = useBackend();
  const { show } = useToast();
  const { readCardsAgain } = useBenchmarkActions();
  const [asking, setAsking] = useState<PremiumCard | null>(null);
  const confirm = async (card: PremiumCard) => {
    setAsking(null);
    const problem = writeProblem(await removeCard(backend, card.id), "quitar");
    if (problem) {
      show(problem);
      return;
    }
    await readCardsAgain();
  };
  return { asking, setAsking, confirm };
}

export function CardsView() {
  const { cards, isAdmin } = useBenchmark();
  const { readCardsAgain, readAgain } = useBenchmarkActions();
  const [editing, setEditing] = useState<Editing>(null);
  const removal = useRemoval();
  const failed = cards === null;
  const intro = <Intro onAdd={isAdmin && !failed ? () => setEditing("new") : null} />;
  if (failed) {
    return (
      <>
        {intro}
        <div className={styles.empty}>
          <strong>No se pudo leer la tabla de tarjetas</strong>
          ¿Está aplicada la migración 042?{" "}
          <button type="button" className={styles.button} onClick={() => void readAgain()}>
            Reintentar
          </button>
        </div>
      </>
    );
  }
  const sorted = sortedCards(cards ?? []);
  return (
    <>
      {intro}
      {sorted.length === 0 ? (
        <div className={styles.empty}>
          <strong>Todavía no hay tarjetas cargadas</strong>
          {isAdmin
            ? "Agregá la primera con «+ Agregar tarjeta»."
            : "El administrador las va a cargar."}
        </div>
      ) : (
        <>
          <Changes cards={sorted} />
          <Passes cards={sorted} />
          <CardsTable
            cards={sorted}
            onEdit={isAdmin ? setEditing : null}
            onRemove={removal.setAsking}
          />
        </>
      )}
      {editing && (
        <CardEditor
          card={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => void readCardsAgain()}
        />
      )}
      {removal.asking && (
        <ConfirmDialog
          title={`¿Quitar «${removal.asking.tarjeta}» de ${bankName(removal.asking.banco)}?`}
          confirmLabel="Quitar"
          danger
          onCancel={() => removal.setAsking(null)}
          onConfirm={() => {
            if (removal.asking) void removal.confirm(removal.asking);
          }}
        >
          Se borra de la tabla. No se puede deshacer.
        </ConfirmDialog>
      )}
    </>
  );
}
