// What is asked to Galicia through the Edge Function.
import { failure, type Backend, type Result, success } from "@/shared/supabase/index.ts";

/** The function attends up to this many ids per call, to protect Galicia from a burst. */
const IDS_PER_CALL = 80;

type StartDates = Readonly<Record<string, string | null>>;

function dataOf(reply: unknown): unknown {
  return typeof reply === "object" && reply !== null && "data" in reply ? reply.data : undefined;
}

function isStartDates(data: unknown): data is StartDates {
  return typeof data === "object" && data !== null;
}

/** How many promotions the catalog has now. */
export async function askUpdateCatalog(backend: Backend): Promise<Result<number, string>> {
  const answer = await backend.callEdge("promos-galicia", "sync");
  if (!answer.ok) return failure(answer.error.message);
  const data = dataOf(answer.value);
  const total = typeof data === "object" && data !== null && "total" in data ? data.total : 0;
  return success(Number(total) || 0);
}

/** The ids of a locality, which cannot be worked out here (there are thousands); null if no answer. */
export async function idsOfLocality(
  backend: Backend,
  province: string,
  locality: string,
): Promise<readonly (string | number)[] | null> {
  const answer = await backend.callEdge("promos-galicia", "ubicacion", {
    provincia: province,
    localidad: locality,
  });
  if (!answer.ok) return null;
  const data = dataOf(answer.value);
  if (typeof data !== "object" || data === null) return null;
  return "ids" in data && Array.isArray(data.ids) ? data.ids : [];
}

export async function askStartDatesOf(backend: Backend, id: number): Promise<StartDates | null> {
  const answer = await backend.callEdge("promos-galicia", "detalle", { ids: [id] });
  if (!answer.ok) return null;
  const data = dataOf(answer.value);
  return isStartDates(data) ? data : null;
}

/**
 * The date of start only comes one by one: it goes in batches, one after the other, and the column
 * fills up. Says whether all of them were answered.
 */
export function askStartDates(
  backend: Backend,
  ids: readonly number[],
  onAnswer: (dates: StartDates) => void,
): Promise<boolean> {
  const batch = async (from: number, allAnswered: boolean): Promise<boolean> => {
    if (from >= ids.length) return allAnswered;
    const answer = await backend.callEdge("promos-galicia", "detalle", {
      ids: ids.slice(from, from + IDS_PER_CALL),
    });
    const data = answer.ok ? dataOf(answer.value) : undefined;
    if (isStartDates(data)) onAnswer(data);
    return batch(from + IDS_PER_CALL, allAnswered && isStartDates(data));
  };
  return batch(0, true);
}
