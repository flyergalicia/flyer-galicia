import {
  isModoPromotion,
  isOnlinePromotion,
  type Promotion,
  titleCase,
  promotionNote,
} from "@/shared/domain/promotions/index.ts";
import { usePromotionLogoSource } from "@/shared/lib/promotions/logo-file.ts";
import {
  daysOfCard,
  MAX_CARDS,
  promotionsOfLogoDetail,
  shortNote,
  untilDate,
  whereChosen,
} from "../model/brand-filter.ts";
import type { BrandPicker } from "../model/brand-picker.ts";
import styles from "./LogoPicker.module.css";

interface BrandCardProps {
  readonly promotion: Promotion;
  readonly picker: BrandPicker;
  readonly isLoading: boolean;
  /** Its order among those chosen, with several places. */
  readonly number: number | null;
  /** Its order in the selection of a strip, which also goes on the corner. */
  readonly stripNumber?: number | null;
  readonly onChoose: (promotion: Promotion) => void;
}

function CardLine({ promotion, picker }: Pick<BrandCardProps, "promotion" | "picker">) {
  const { zone, supermarkets, brands } = picker;
  const days = daysOfCard(promotion, supermarkets, zone);
  const note = promotionNote(promotion);
  const until = untilDate(promotion);
  const ofLogo = brands.ofLogo.get(promotion.imagen ?? "") ?? [];
  return (
    <span className={styles.cardLine} data-testid="brand-detail">
      {promotion.subtitulo ?? ""}
      {days && (
        <>
          {" · "}
          <b className={styles.cardDays}>{days}</b>
        </>
      )}
      {isOnlinePromotion(promotion) && (
        <>
          {" · "}
          <b className={styles.cardOnline}>Online</b>
        </>
      )}
      {isModoPromotion(promotion) && (
        <>
          {" · "}
          <b
            className={styles.cardModo}
            data-testid="modo-tag"
            title="Promoción de MODO: se paga con MODO (QR o NFC desde la app de Galicia)"
          >
            MODO
          </b>
        </>
      )}
      {note && (
        <>
          {" · "}
          <b className={styles.cardNote} title={note} data-testid="brand-note">
            {shortNote(promotion)}
          </b>
        </>
      )}
      {until && ` · hasta ${until}`}
      {ofLogo.length >= 2 && (
        <>
          {" · "}
          <b
            className={styles.cardMore}
            title={promotionsOfLogoDetail(ofLogo)}
            data-testid="more-promotions"
          >
            {ofLogo.length} promos
          </b>
        </>
      )}
    </span>
  );
}

export function BrandCard({
  promotion,
  picker,
  isLoading,
  number,
  stripNumber,
  onChoose,
}: BrandCardProps) {
  const logoSource = usePromotionLogoSource();
  const hasPercent = picker.supermarkets.hasPercentDiscount(promotion, picker.zone);
  return (
    <button
      type="button"
      className={styles.card}
      title={promotion.titulo}
      disabled={isLoading}
      data-testid="brand-card"
      data-loading={isLoading || undefined}
      data-chosen={number !== null || undefined}
      data-n={number ?? undefined}
      data-strip-number={stripNumber ?? undefined}
      data-logo={promotion.imagen ?? undefined}
      data-category={promotion.subtitulo ?? ""}
      aria-pressed={stripNumber === undefined ? undefined : stripNumber !== null}
      onClick={() => {
        onChoose(promotion);
      }}
    >
      {typeof stripNumber === "number" && <span className={styles.stripNumber}>{stripNumber}</span>}
      <span className={styles.cardLogo}>
        <img loading="lazy" decoding="async" alt="" src={logoSource(promotion.imagen)} />
        {hasPercent && (
          <span
            className={styles.percentDot}
            data-testid="percent-dot"
            title="Súper con % de descuento: al ponerlo van sus días debajo"
          />
        )}
      </span>
      <span className={styles.cardTitle} data-testid="brand-title">
        {promotion.titulo}
      </span>
      <CardLine promotion={promotion} picker={picker} />
    </button>
  );
}

export interface BrandListProps {
  readonly picker: BrandPicker;
  readonly loadingLogo: string | null;
  readonly picks: readonly string[] | null;
  readonly onChoose: (promotion: Promotion) => void;
}

function EmptyList({ picker }: Pick<BrandListProps, "picker">) {
  const { filters, hasCatalog, isCatalogRead, isSearchingLocality } = picker;
  if (isSearchingLocality) {
    return (
      <div className={styles.empty}>Buscando las promos de {titleCase(filters.locality)}…</div>
    );
  }
  if (!isCatalogRead) return <div className={styles.empty}>Cargando promociones…</div>;
  if (!hasCatalog) {
    return <div className={styles.empty}>No se pudo leer el catálogo de promociones.</div>;
  }
  return (
    <div className={styles.empty}>
      No hay promos vigentes con esos filtros{whereChosen(filters)}. Si la marca no está en
      Promociones, usá <b>Subir logo de la PC</b>.
    </div>
  );
}

export function BrandList({ picker, loadingLogo, picks, onChoose }: BrandListProps) {
  const { brands, filters, isSearchingLocality } = picker;
  const cards = isSearchingLocality ? [] : brands.list.slice(0, MAX_CARDS);
  return (
    <div
      className={styles.list}
      data-testid="brand-list"
      data-search={filters.search}
      data-searching={isSearchingLocality || undefined}
    >
      {cards.length === 0 && <EmptyList picker={picker} />}
      {cards.map((promotion) => {
        const logo = promotion.imagen ?? "";
        const order = picks ? picks.indexOf(logo) : -1;
        return (
          <BrandCard
            key={String(promotion.id)}
            promotion={promotion}
            picker={picker}
            isLoading={loadingLogo === logo}
            number={order >= 0 ? order + 1 : null}
            onChoose={onChoose}
          />
        );
      })}
    </div>
  );
}
