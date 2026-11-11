// A published page stays in the cache of the browser for a while, and what it opens is the old app.
// The page says which version it is and version.json which one is published: if they differ, the
// shell offers to reload. Without the mark (Vite in development) there is nothing to compare.

const VERSION_META = 'meta[name="build-v"]';
const VERSION_FILE = "version.json";

export function ownVersion(root: Pick<Document, "querySelector"> = document): string | null {
  return root.querySelector<HTMLMetaElement>(VERSION_META)?.content || null;
}

function versionIn(file: unknown): string | null {
  const version: unknown =
    typeof file === "object" && file !== null ? Reflect.get(file, "v") : null;
  return typeof version === "string" && version ? version : null;
}

/** null also when it cannot be read: no answer is not a new version. */
export async function publishedVersion(now: number): Promise<string | null> {
  try {
    const answer = await fetch(`${VERSION_FILE}?t=${String(now)}`, { cache: "no-store" });
    return answer.ok ? versionIn(await answer.json()) : null;
  } catch {
    return null;
  }
}

export function addressOfVersion(path: string, version: string): string {
  return `${path}?v=${encodeURIComponent(version)}`;
}
