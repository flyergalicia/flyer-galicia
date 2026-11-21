/** What a failure says, in the words of the server; with no words, that there was no connection. */
export function messageOf(error: unknown): string {
  const message =
    typeof error === "object" && error !== null ? Reflect.get(error, "message") : error;
  return typeof message === "string" && message ? message : "sin conexión";
}
