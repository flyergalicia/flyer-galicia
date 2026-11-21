import { memo, type ReactNode, useState } from "react";
import {
  benefitText,
  decodeEntities,
  formatDate,
  isSupermarket,
  ownDays,
  type Promotion,
  promotionHasPercent,
  promotionNote,
  statusText,
} from "@/shared/domain/promotions/index.ts";
import { usePromotionLogoSource } from "@/shared/lib/promotions/logo-file.ts";
import { usePromotionPicking } from "@/shared/lib/promotions/promotion-picking.ts";
import { Badge, DataTable } from "@/shared/ui/index.ts";
import { usePromotionsActions } from "../model/promotions-context.ts";
import type { ResultRow } from "../model/result-rows.ts";
import {
  hiddenRowsHint,
  linkCell,
  modoTagHint,
  newTagHint,
  STATUS_TONE,
  whereCell,
} from "../model/row-cells.ts";
import styles from "./PromotionsView.module.css";

const PERCENT_DOT_HINT = "Súper con % de descuento: al ponerlo van estos días debajo";

function PromotionLogo({
  image,
  promotion,
}: {
  readonly image: string;
  readonly promotion: Promotion | null;
}) {
  const source = usePromotionLogoSource();
  const [failedOn, setFailedOn] = useState<string | null>(null);
  const address = source(image);
  let logo: ReactNode;
  if (!promotion?.imagen) {
    logo = <div className={`${styles.logo} ${styles.logoEmpty}`} title="Sin coincidencia" />;
  } else if (failedOn === address) {
    logo = (
      <div className={`${styles.logo} ${styles.logoFailed}`} title="No se pudo cargar el logo" />
    );
  } else {
    logo = (
      <img
        className={styles.logo}
        loading="lazy"
        decoding="async"
        src={address}
        alt=""
        onError={() => {
          setFailedOn(address);
        }}
      />
    );
  }
  return (
    <span className={styles.logoHolder}>
      {logo}
      {promotionHasPercent(promotion) && (
        <span className={styles.percentDot} data-testid="percent-dot" title={PERCENT_DOT_HINT} />
      )}
    </span>
  );
}

/** One row and what the tick of one row per brand joined under it. */
interface RowStanding {
  readonly row: ResultRow;
  readonly hidden: number;
  readonly joinedNames: readonly string[] | null;
}

function MatchSelect({ row }: { readonly row: ResultRow }) {
  const { chooseMatch } = usePromotionsActions();
  const current = row.candidates.findIndex(({ promotion }) => promotion.id === row.promotion?.id);
  return (
    <select
      className={styles.matchSelect}
      aria-label={`Coincidencia de ${row.brand}`}
      value={String(row.promotion ? current : -1)}
      onChange={(event) => {
        chooseMatch(row.key, Number(event.target.value));
      }}
    >
      <option value="-1">— Elegir coincidencia —</option>
      {row.candidates.map(({ promotion }, index) => (
        <option key={promotion.id} value={index}>
          {decodeEntities(promotion.titulo)}
        </option>
      ))}
    </select>
  );
}

function PromotionText({ row, hidden, joinedNames }: RowStanding) {
  const { promotion } = row;
  const canChoose = row.needsReview || row.status === "NO_ENCONTRADA";
  if (!promotion) {
    return canChoose ? <MatchSelect row={row} /> : <span data-part="title">-</span>;
  }
  const newHint = newTagHint(promotion);
  const modoHint = modoTagHint(promotion);
  const benefit = benefitText(promotion);
  const note = promotionNote(promotion);
  const days = isSupermarket(promotion) ? ownDays(promotion) : "";
  return (
    <>
      <span data-part="title">{decodeEntities(promotion.titulo)}</span>
      {newHint && (
        <>
          {" "}
          <span className={styles.newTag} title={newHint}>
            Nueva
          </span>
        </>
      )}
      {modoHint && (
        <>
          {" "}
          <span className={styles.modoTag} data-part="modo" title={modoHint}>
            MODO
          </span>
        </>
      )}
      {hidden > 0 && (
        <>
          {" "}
          <span className={styles.moreTag} title={hiddenRowsHint(hidden, joinedNames)}>
            +{hidden}
          </span>
        </>
      )}
      {benefit && (
        <div className={styles.benefit} data-part="benefit">
          {benefit}
        </div>
      )}
      {note && (
        <div className={styles.note} data-part="note">
          {note}
        </div>
      )}
      {days && (
        <div className={styles.days} data-part="days">
          {days}
        </div>
      )}
      {canChoose && (
        <>
          <br />
          <MatchSelect row={row} />
        </>
      )}
    </>
  );
}

function WhereText({
  promotion,
  totalProvinces,
}: {
  readonly promotion: Promotion | null;
  readonly totalProvinces: number;
}) {
  const { kind, text, title } = whereCell(promotion, totalProvinces);
  return (
    <span className={kind === "online" ? styles.online : styles.where} title={title}>
      {text}
    </span>
  );
}

function LinkToPromotion({ promotion }: { readonly promotion: Promotion | null }) {
  const link = linkCell(promotion);
  if (!link) return <span className={styles.noLink}>-</span>;
  return (
    <a
      className={styles.link}
      data-part="link"
      href={link.address}
      target="_blank"
      rel="noopener noreferrer"
      title={link.title}
    >
      {link.text}
    </a>
  );
}

function ExcludeTick({ row }: { readonly row: ResultRow }) {
  const { dispatch } = usePromotionsActions();
  return (
    <input
      type="checkbox"
      className={styles.exclude}
      title="Excluir del reporte"
      aria-label="Excluir del reporte"
      checked={row.excluded}
      onChange={(event) => {
        dispatch({ type: "excluded", key: row.key, excluded: event.target.checked });
      }}
    />
  );
}

interface PromotionRowProps extends RowStanding {
  readonly isActiveTab: boolean;
  readonly totalProvinces: number;
}

function PromotionRowCells({
  row,
  hidden,
  joinedNames,
  isActiveTab,
  totalProvinces,
}: PromotionRowProps) {
  const { promotion, status, startDate } = row;
  const picking = usePromotionPicking();
  return (
    <DataTable.Row
      excluded={row.excluded}
      className={picking?.isChosen?.(row) ? `${styles.row} ${styles.rowChosen}` : styles.row}
    >
      <DataTable.Cell className={styles.cellSelect}>
        {picking?.firstCell(row) ?? <ExcludeTick row={row} />}
      </DataTable.Cell>
      <DataTable.Cell className={styles.cellLogo} data-part="logo">
        <PromotionLogo image={promotion?.imagen ?? ""} promotion={promotion} />
      </DataTable.Cell>
      {!isActiveTab && (
        <DataTable.Cell className={styles.cellBrand} data-part="brand">
          {row.brand}
        </DataTable.Cell>
      )}
      <DataTable.Cell
        className={styles.cellPromotion}
        data-part="promotion"
        data-promotion-id={promotion?.id}
      >
        <PromotionText row={row} hidden={hidden} joinedNames={joinedNames} />
      </DataTable.Cell>
      <DataTable.Cell className={styles.cellCategory} data-part="category">
        {promotion ? decodeEntities(promotion.subtitulo || "-") : "-"}
      </DataTable.Cell>
      <DataTable.Cell className={styles.cellWhere} data-part="where">
        <WhereText promotion={promotion} totalProvinces={totalProvinces} />
      </DataTable.Cell>
      <DataTable.Cell className={styles.cellStart}>
        {promotion ? formatDate(startDate) : "-"}
      </DataTable.Cell>
      <DataTable.Cell className={styles.cellEnd}>
        {promotion ? formatDate(promotion.fecha_hasta) : "-"}
      </DataTable.Cell>
      <DataTable.Cell className={styles.cellStatus} data-part="status">
        <Badge tone={STATUS_TONE[status]}>{statusText(status, startDate)}</Badge>
      </DataTable.Cell>
      <DataTable.Cell className={styles.cellLink}>
        <LinkToPromotion promotion={promotion} />
      </DataTable.Cell>
    </DataTable.Row>
  );
}

/** The filters repaint on every key, over more than a thousand rows: only what changed is drawn. */
export const PromotionRow = memo(PromotionRowCells);
