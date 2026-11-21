const OVERLAP_SPAN = /de (\d\d:\d\d a \d\d:\d\d)/;

export function messageOf(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "object" && cause !== null && "message" in cause) {
    return String(cause.message);
  }
  return typeof cause === "string" ? cause : "";
}

/** What the database stops with a code (045) is told in Spanish. */
export function failureText(cause: unknown): string {
  const message = messageOf(cause);
  if (message.includes("GES_PISA")) {
    const span = OVERLAP_SPAN.exec(message)?.[1];
    return `el horario se pisa con otra acción de ese hunter${span ? ` (${span})` : ""}. Cambiá el horario o elegí otro hunter.`;
  }
  if (message.includes("GES_PAQ")) return "elegí con qué paquete fue el alta.";
  if (message.includes("GES_MOT")) return "elegí por qué se descarta.";
  return message;
}
