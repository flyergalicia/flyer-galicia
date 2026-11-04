// The rules of the catalog of promotions, without screen or network. Promociones, Cambiar logos,
// Armar franja, Marcas guardadas, Estudio and Marcas vigiladas all read them.
export { baseBrand, brandGroupKey } from "./brands.ts";
export { daysSignature, EVERY_DAY_TEXT, formatDays, ownDays, readDays } from "./days.ts";
export {
  catalogHasGeography,
  hasKnownGeography,
  hasSeveralProvinces,
  isInLocality,
  isInProvince,
  isOnlinePromotion,
  knownProvinces,
  localitiesOfProvince,
  localityMatches,
  locationsIn,
  PROVINCE_SEPARATOR,
  type ProvinceLocation,
  provinceList,
  provinceNamesOf,
  provincesName,
  validProvinces,
  whereText,
} from "./geography.ts";
export {
  type BrandMatch,
  type Candidate,
  findCandidates,
  isBetterPromotion,
  matchBrand,
  promotionsByTitle,
  siblingPromotions,
} from "./matching.ts";
export {
  benefitSignature,
  type MergedCatalog,
  mergeModoPromotions,
  modoBrandKey,
  type ModoRow,
} from "./modo.ts";
export {
  benefitText,
  type BucketLogo,
  isModoPromotion,
  isNewPromotion,
  isSupermarket,
  NEW_PROMOTION_DAYS,
  type Promotion,
  promotionHasPercent,
  promotionLink,
  promotionLogoSource,
  promotionNote,
  promotionOfLogo,
} from "./promotion.ts";
export {
  expiryStatus,
  finalStatus,
  PROMOTION_STATUSES,
  type PromotionStatus,
  STATUS_LABEL,
  statusText,
} from "./status.ts";
export {
  type PromotionZone,
  promotionZone,
  type SupermarketIndex,
  supermarketIndexOf,
} from "./supermarkets.ts";
export {
  decodeEntities,
  formatDate,
  lowerCased,
  normalizeText,
  normalizeWithoutSpaces,
  rememberedText,
  titleCase,
} from "./text.ts";
export {
  type WatchedBrand,
  type WatchedBrandsFile,
  watchedBrandsIn,
  withBrandsFound,
} from "./watched-brands.ts";
