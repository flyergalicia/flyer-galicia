/** The letters of a name for its avatar: the first and the last word, or the first two letters. */
export function initialsOf(name: string, email = ""): string {
  const clean = name.trim();
  if (!clean) return (email || "??").slice(0, 2).toUpperCase();
  const lastWord = clean.lastIndexOf(" ");
  const letters =
    lastWord === -1 ? clean.slice(0, 2) : `${clean.charAt(0)}${clean.charAt(lastWord + 1)}`;
  return letters.toUpperCase();
}
