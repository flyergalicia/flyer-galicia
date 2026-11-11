// What the line above the list says.

export function listStatus(query: string, shown: number, total: number, most: number): string {
  if (query.trim()) {
    const cut = shown >= most ? ` — se muestran las primeras ${String(most)}` : "";
    return `${String(shown)} de ${String(total)}${cut}`;
  }
  const loaded = `${String(total)}${total === 1 ? " empresa cargada" : " empresas cargadas"}`;
  return total > most
    ? `${loaded} — se muestran las primeras ${String(most)}, escribí para filtrar`
    : loaded;
}
