// The views of Benchmark, in the order of their solapas. They live here, apart from the screen,
// because the search of screens offers them before the code of Benchmark comes down.
export type BenchView = "rubro" | "marca" | "semana" | "comercio" | "versus" | "tarjetas";

/**
 * Each view with its name. On its solapa, "Galicia vs" names the bank compared; elsewhere it is
 * "otro banco". "Cargadas a mano" is shown to nobody: it is not here.
 */
export const BENCHMARK_VIEWS: readonly (readonly [BenchView, string])[] = [
  ["rubro", "Resumen por rubro"],
  ["marca", "Cara a cara por marca"],
  ["semana", "Semana"],
  ["comercio", "Por comercio"],
  ["versus", "Galicia vs otro banco"],
  ["tarjetas", "Tarjetas y salas VIP"],
];

export function isBenchView(value: string): value is BenchView {
  return BENCHMARK_VIEWS.some(([view]) => view === value);
}
