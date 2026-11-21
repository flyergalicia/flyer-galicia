// What is said after sharing: who got it, who already had it, and who was left out and why.

export interface ShareAnswer {
  readonly nuevos?: readonly string[];
  readonly actualizados?: readonly string[];
  readonly salteados?: readonly { readonly nombre: string; readonly motivo: string }[];
}

const NAMES_SHOWN = 3;

function names(list: readonly string[]): string {
  return list.length <= NAMES_SHOWN
    ? list.join(", ")
    : `${list.slice(0, NAMES_SHOWN).join(", ")} y ${String(list.length - NAMES_SHOWN)} más`;
}

export function shareSummary({
  nuevos: fresh = [],
  actualizados: updated = [],
  salteados: skipped = [],
}: ShareAnswer): string {
  const parts: string[] = [];
  if (fresh.length > 0) parts.push(`Compartido con ${names(fresh)}.`);
  if (updated.length > 0) {
    parts.push(
      updated.length === 1
        ? `${updated.join("")} ya lo tenía: le llegó esta versión.`
        : `${names(updated)} ya lo tenían: les llegó esta versión.`,
    );
  }
  if (skipped.length > 0) {
    parts.push(
      `No se compartió con ${skipped.map(({ nombre, motivo }) => `${nombre} (${motivo})`).join(", ")}.`,
    );
  }
  return parts.join(" ") || "Listo.";
}
