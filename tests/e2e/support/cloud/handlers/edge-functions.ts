import { setTimeout as sleep } from "node:timers/promises";
import { type CloudHandler, jsonBody, jsonReply } from "../http.ts";
import { answerAccountAction } from "./accounts.ts";
import { localityPromotionIds } from "../seed-data.ts";

const LOCATION_LOOKUP_DELAY_MS = 400;

/** Account switcher for test accounts: the list and the one-use permission. */
export const authAdmin: CloudHandler = (request) => {
  const { state } = request;
  const body = jsonBody(request);
  state.adminCalls.push(body);
  if (body.action === "cuentas_prueba") {
    return jsonReply({ ok: true, cuentas: state.testAccounts });
  }
  if (body.action === "entrar_como") {
    const account = state.testAccounts.find((row) => row.id === body.uid);
    if (!account) {
      return jsonReply({ error: "Sólo se puede cambiar a una cuenta de prueba activa" }, 403);
    }
    return jsonReply({
      ok: true,
      token_hash: `th-${String(body.uid)}`,
      nombre: account.full_name,
    });
  }
  return answerAccountAction(request, body) ?? jsonReply({ ok: true });
};

/**
 * Redeeming a one-use sign-in permission. It stays pending: once it is answered the page
 * reloads into the other account, and these tests are about what happens up to there.
 */
export const redeemSignIn: CloudHandler = (request) => {
  request.state.signInRedemptions.push(jsonBody(request));
  return new Promise<never>(() => undefined);
};

/** "sync" brings the catalog of Galicia into the copy the app reads. */
const syncCatalog: CloudHandler = (request) => {
  const { state } = request;
  state.promotionSyncCalls.push(jsonBody(request));
  const refusal = state.promotionSyncRefusal;
  if (refusal) return jsonReply({ error: refusal.message }, refusal.status);
  state.promotionCatalog = state.promotionCatalogAfterSync ?? state.promotionCatalog;
  return jsonReply({ data: { total: state.promotionCatalog.length } });
};

/** "ubicacion" answers with the promo ids of the locality, as Galicia does, a bit late. */
export const promosGalicia: CloudHandler = async (request) => {
  const body = jsonBody(request);
  if (body.action === "sync") return syncCatalog(request);
  if (body.action !== "ubicacion") return jsonReply({ data: {} });
  request.state.locationCalls += 1;
  await sleep(LOCATION_LOOKUP_DELAY_MS);
  return jsonReply({
    data: { ids: [...localityPromotionIds, ...request.state.extraLocalityPromotionIds] },
  });
};

export const benchmarkSync: CloudHandler = (request) => {
  const body = jsonBody(request);
  request.state.benchmarkCalls.push(body);
  const paced = body.action === "marcas" || body.action === "galicia";
  return jsonReply({
    data: paced
      ? { hechas: 0, pendientes: 0, total: 0 }
      : { resultados: [{ banco: body.banco, total: 1 }], errores: [] },
  });
};
