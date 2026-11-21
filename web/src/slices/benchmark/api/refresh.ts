// Actualizar ahora (only the administrator): MODO bank by bank, the websites of BBVA and Supervielle,
// the catalog of Galicia in rounds, and at last places and logos. Each call has a short budget: the
// call is cut at 25 s. Santander and Macro are loaded once a month by the assisted load.
import type { CallEdge } from "@/shared/supabase/index.ts";
import { BANKS } from "../model/rows.ts";

/** What each round may take on the server, below the 25 s cut of the call. */
const BUDGET_MS = 18_000;
/** Rounds of the catalog of Galicia, and of places and logos, at most. */
const MAX_ROUNDS = 40;

export interface RefreshSteps {
  /** What the button says while it works. */
  readonly say: (text: string) => void;
}

function fieldOf(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;
}

/** How many are left, of an answer { data: { pendientes } }. */
function pendingOf(answer: unknown): number {
  const pending = fieldOf(fieldOf(answer, "data"), "pendientes");
  return typeof pending === "number" ? pending : 0;
}

/** The error MODO gave for that bank, of { data: { resultados: [{ error }] } }. */
function bankError(answer: unknown): string {
  const results = fieldOf(fieldOf(answer, "data"), "resultados");
  const first: unknown = Array.isArray(results) ? results[0] : undefined;
  const error = fieldOf(first, "error");
  return typeof error === "string" ? error : "";
}

async function syncBanks(
  callEdge: CallEdge,
  steps: RefreshSteps,
  errors: string[],
  index = 0,
): Promise<void> {
  const bank = BANKS[index];
  if (!bank) return;
  steps.say(`Actualizando ${bank.name}…`);
  const answer = await callEdge("benchmark-sync", "sync", { banco: bank.code });
  const error = answer.ok ? bankError(answer.value) : "sin conexión";
  if (error) errors.push(`${bank.name}: ${error}`);
  await syncBanks(callEdge, steps, errors, index + 1);
}

async function syncWebsites(callEdge: CallEdge, { say }: RefreshSteps, errors: string[]) {
  say("Actualizando la web de BBVA…");
  const bbva = await callEdge("benchmark-sync", "bbva");
  if (!bbva.ok) errors.push(`BBVA propio: ${bbva.error.message}`);
  say("Actualizando la web de Supervielle…");
  const supervielle = await callEdge("benchmark-sync", "supervielle");
  if (!supervielle.ok) errors.push(`Supervielle propio: ${supervielle.error.message}`);
}

interface Rounds {
  readonly action: "galicia" | "marcas";
  /** What the button says at the start of each round. */
  readonly working: string;
  readonly left: (pending: number) => string;
  readonly failed: (message: string) => string;
}

const GALICIA_ROUNDS: Rounds = {
  action: "galicia",
  working: "Galicia (detalle de cada promo)…",
  left: (pending) => `Galicia (faltan ${String(pending)})…`,
  failed: (message) => `Galicia propio: ${message}`,
};

const BRAND_ROUNDS: Rounds = {
  action: "marcas",
  working: "Actualizando lugares y logos…",
  left: (pending) => `Lugares y logos (faltan ${String(pending)})…`,
  failed: () => "lugares y logos",
};

/** Round after round while the server says some are left, up to the limit. */
async function inRounds(
  callEdge: CallEdge,
  steps: RefreshSteps,
  errors: string[],
  rounds: Rounds,
  round = 0,
): Promise<void> {
  steps.say(rounds.working);
  const answer = await callEdge("benchmark-sync", rounds.action, { presupuestoMs: BUDGET_MS });
  if (!answer.ok) {
    errors.push(rounds.failed(answer.error.message));
    return;
  }
  const pending = pendingOf(answer.value);
  if (!(pending > 0 && round < MAX_ROUNDS)) return;
  steps.say(rounds.left(pending));
  await inRounds(callEdge, steps, errors, rounds, round + 1);
}

/** Runs everything, one after the other, and says what could not be updated. */
export async function refreshBenchmark(callEdge: CallEdge, steps: RefreshSteps): Promise<string> {
  const errors: string[] = [];
  await syncBanks(callEdge, steps, errors);
  await syncWebsites(callEdge, steps, errors);
  await inRounds(callEdge, steps, errors, GALICIA_ROUNDS);
  await inRounds(callEdge, steps, errors, BRAND_ROUNDS);
  return errors.length > 0
    ? `Algo no se pudo actualizar: ${errors.join(" · ")}`
    : "Benchmark actualizado.";
}
