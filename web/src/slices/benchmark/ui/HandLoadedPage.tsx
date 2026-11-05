// "Cargadas a mano": what does not arrive by itself (a promotion of Macro or Santander, the benefits of a
// package) is loaded here and enters the comparison as "cargada a mano". The page is shown to nobody,
// as in the current app: no tab leads here, and its promotions still count. To show it again, it is
// one more tab in BenchmarkView.
import { useState } from "react";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { ConfirmDialog } from "@/shared/ui/index.ts";
import { removeHandLoaded, writeProblem } from "../api/benchmark-writes.ts";
import { useBenchmark, useBenchmarkActions } from "../model/benchmark-context.ts";
import { shortDate } from "../model/dates.ts";
import { daysText, handLoadedDays } from "../model/hand-loaded.ts";
import { isHttps, money } from "../model/offers.ts";
import { bankName, bankOrder, type HandLoadedPromotion } from "../model/rows.ts";
import { HandLoadedEditor } from "./HandLoadedEditor.tsx";
import styles from "./BenchmarkView.module.css";

const PER_PERIOD: Readonly<Record<string, string>> = {
  month: " por mes",
  week: " por semana",
  day: " por día",
  transaction: " por compra",
};

function benefitOf(promotion: HandLoadedPromotion): string {
  const cap = promotion.tope
    ? `tope ${money(Number(promotion.tope))}${PER_PERIOD[promotion.tope_por ?? ""] ?? ""}`
    : "";
  return [
    promotion.pct === null || promotion.pct === undefined ? "" : `${String(promotion.pct)}%`,
    promotion.cuotas ? `${String(promotion.cuotas)} cuotas sin interés` : "",
    cap,
  ]
    .filter(Boolean)
    .join(" · ");
}

function audienceOf(segment: string | null | undefined): string {
  if (segment === "premium") return "Sólo Premium";
  return segment === "clasico" ? "Sólo Clásico/Gold" : "";
}

function Validity({
  promotion,
  today,
}: {
  readonly promotion: HandLoadedPromotion;
  readonly today: string;
}) {
  const ended = Boolean(promotion.fecha_hasta && promotion.fecha_hasta < today);
  const starts = Boolean(promotion.fecha_desde && promotion.fecha_desde > today);
  return (
    <td>
      {ended && (
        <>
          <b className={styles.down}>Vencida</b>{" "}
        </>
      )}
      {!ended && starts && `Empieza el ${shortDate(promotion.fecha_desde)} `}
      {promotion.fecha_hasta && (
        <div className={styles.segment}>{`hasta ${shortDate(promotion.fecha_hasta)}`}</div>
      )}
    </td>
  );
}

function Row({
  promotion,
  onEdit,
  onRemove,
}: {
  readonly promotion: HandLoadedPromotion;
  readonly onEdit: ((promotion: HandLoadedPromotion) => void) | null;
  readonly onRemove: (promotion: HandLoadedPromotion) => void;
}) {
  const { days } = useBenchmark();
  const ended = Boolean(promotion.fecha_hasta && promotion.fecha_hasta < days.today);
  const audience = audienceOf(promotion.segmento);
  return (
    <tr className={ended ? styles.faded : undefined} data-hand-loaded={promotion.id}>
      <td>
        <b>{bankName(promotion.banco)}</b>
      </td>
      <td>{promotion.titulo}</td>
      <td>{promotion.rubro}</td>
      <td style={{ minWidth: 180 }}>
        {benefitOf(promotion)}
        {promotion.beneficio && <div className={styles.segment}>{promotion.beneficio}</div>}
        {promotion.condicion && <div className={styles.segment}>{promotion.condicion}</div>}
        {audience && <div className={styles.segment}>{audience}</div>}
      </td>
      <td>{daysText(handLoadedDays(promotion))}</td>
      <td>
        {[promotion.credito ? "Crédito" : "", promotion.debito ? "Débito" : ""]
          .filter(Boolean)
          .join(" y ")}
      </td>
      <Validity promotion={promotion} today={days.today} />
      <td>
        {isHttps(promotion.fuente_url) && (
          <a href={promotion.fuente_url ?? ""} target="_blank" rel="noopener noreferrer">
            Ver página
          </a>
        )}
        {promotion.updated_at && (
          <div className={styles.segment}>{`act. ${shortDate(promotion.updated_at)}`}</div>
        )}
        {promotion.notas && <div className={styles.segment}>{promotion.notas}</div>}
      </td>
      {onEdit && (
        <td className={styles.noWrap}>
          <button type="button" className={styles.button} onClick={() => onEdit(promotion)}>
            Editar
          </button>{" "}
          <button type="button" className={styles.button} onClick={() => onRemove(promotion)}>
            Quitar
          </button>
        </td>
      )}
    </tr>
  );
}

function sorted(list: readonly HandLoadedPromotion[]): HandLoadedPromotion[] {
  return list.toSorted(
    (one, other) =>
      bankOrder(one.banco) - bankOrder(other.banco) || one.titulo.localeCompare(other.titulo, "es"),
  );
}

function useRemoval() {
  const backend = useBackend();
  const { show } = useToast();
  const { readAgain } = useBenchmarkActions();
  const [asking, setAsking] = useState<HandLoadedPromotion | null>(null);
  const confirm = async (promotion: HandLoadedPromotion) => {
    setAsking(null);
    const problem = writeProblem(await removeHandLoaded(backend, promotion.id), "quitar");
    if (problem) {
      show(problem);
      return;
    }
    await readAgain();
  };
  return { asking, setAsking, confirm };
}

type Editing = null | "new" | HandLoadedPromotion;

function Table({
  list,
  onEdit,
  onRemove,
}: {
  readonly list: readonly HandLoadedPromotion[];
  readonly onEdit: ((promotion: HandLoadedPromotion) => void) | null;
  readonly onRemove: (promotion: HandLoadedPromotion) => void;
}) {
  return (
    <div className={`${styles.card} ${styles.slides}`} data-slides="table">
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Banco</th>
            <th>Marca</th>
            <th>Rubro</th>
            <th>Beneficio</th>
            <th>Días</th>
            <th>Tarjetas</th>
            <th>Vigencia</th>
            <th>Fuente</th>
            {onEdit && <th aria-label="Editar o quitar" />}
          </tr>
        </thead>
        <tbody>
          {sorted(list).map((promotion) => (
            <Row key={promotion.id} promotion={promotion} onEdit={onEdit} onRemove={onRemove} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HandLoadedPage() {
  const { data, isAdmin } = useBenchmark();
  const { readAgain } = useBenchmarkActions();
  const [editing, setEditing] = useState<Editing>(null);
  const removal = useRemoval();
  const list = data.handLoaded;
  return (
    <>
      <div className={styles.card}>
        <h3>Promos cargadas a mano</h3>
        <p className={styles.sub}>
          Lo que no llega solo se carga acá y entra a la comparación con la etiqueta «cargada a
          mano»: por ejemplo los beneficios de un paquete (poné el paquete en «Condición») o una
          promo de Macro o Santander que la carga asistida mensual no haya traído. El día 5 de cada
          mes te llega un mail para revisarlas.
        </p>
        {isAdmin && list !== null && (
          <button type="button" className={styles.button} onClick={() => setEditing("new")}>
            + Agregar promo
          </button>
        )}
      </div>
      {list === null && (
        <div className={styles.empty}>
          <strong>No se pudo leer la tabla de promos cargadas a mano</strong>
          ¿Está aplicada la migración 043?{" "}
          <button type="button" className={styles.button} onClick={() => void readAgain()}>
            Reintentar
          </button>
        </div>
      )}
      {list?.length === 0 && (
        <div className={styles.empty}>
          <strong>Todavía no hay promos cargadas a mano</strong>
          {isAdmin
            ? "Agregá la primera con «+ Agregar promo»."
            : "El administrador las va a cargar."}
        </div>
      )}
      {list && list.length > 0 && (
        <Table list={list} onEdit={isAdmin ? setEditing : null} onRemove={removal.setAsking} />
      )}
      {editing && (
        <HandLoadedEditor
          promotion={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => void readAgain()}
        />
      )}
      {removal.asking && (
        <ConfirmDialog
          title={`¿Quitar «${removal.asking.titulo}» de ${bankName(removal.asking.banco)}?`}
          confirmLabel="Quitar"
          danger
          onCancel={() => removal.setAsking(null)}
          onConfirm={() => {
            if (removal.asking) void removal.confirm(removal.asking);
          }}
        >
          Se borra de las promos cargadas a mano. No se puede deshacer.
        </ConfirmDialog>
      )}
    </>
  );
}
