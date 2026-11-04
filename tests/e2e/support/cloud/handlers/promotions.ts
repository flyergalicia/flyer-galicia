import { type CloudHandler, databaseError, jsonReply, nowIso, pagedRows } from "../http.ts";
import { locations } from "../seed-data.ts";

export const readPromotionsMeta: CloudHandler = ({ state, wantsObject }) => {
  const row = {
    last_sync_at: nowIso(),
    total: state.promotionCatalog.length,
    ubicaciones: locations,
  };
  return jsonReply(wantsObject ? row : [row]);
};

export const listPromotions: CloudHandler = (request) =>
  pagedRows(request, request.state.promotionCatalog);

export const listModoPromotions: CloudHandler = (request) =>
  request.state.modoTableMissing
    ? databaseError('relation "promos_modo_cache" does not exist', "42P01", 404)
    : pagedRows(request, request.state.modoPromotions);
