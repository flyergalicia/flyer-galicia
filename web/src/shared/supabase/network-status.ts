/**
 * A passing problem and not an answer: no answer at all, too slow, too many requests or the
 * server down. Anything else really is what the server has to say.
 */
export function isTransientStatus(status: number | null | undefined): boolean {
  return !status || status === 408 || status === 429 || status >= 500;
}

export type FailureKind = "transient" | "rejected";

export function failureKind(status: number | null | undefined): FailureKind {
  return isTransientStatus(status) ? "transient" : "rejected";
}
