import { createHash } from "node:crypto";
import type { Plugin } from "vite";

const VERSION_LENGTH = 10;

export function computeVersion(fileNames: readonly string[]): string {
  const content = fileNames.toSorted().join("\n");
  return createHash("sha256").update(content).digest("hex").slice(0, VERSION_LENGTH);
}

const HTML_PAGE = "index.html";
const CHARSET_META = /<meta\s+charset=["']?utf-8["']?\s*\/?>/i;

/** The page says which version it is, to compare it with the one that is published. */
export function markPageVersion(html: string, version: string): string {
  if (!CHARSET_META.test(html)) {
    throw new Error("index.html needs a charset meta tag to carry its version after it");
  }
  const meta = `<meta name="build-v" content="${version}">`;
  return html.replace(CHARSET_META, (charset) => `${charset}\n    ${meta}`);
}

// Emits the file the app polls to offer a reload when a new version is published.
// It has no leading underscore because GitHub Pages does not serve those files.
export function versionManifest(): Plugin {
  return {
    name: "flyer:version-manifest",
    apply: "build",
    // After the page exists, which has the names of the files in it and not its own.
    enforce: "post",
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((name) => name !== HTML_PAGE);
      const version = computeVersion(files);
      const page = bundle[HTML_PAGE];
      if (page?.type === "asset") page.source = markPageVersion(String(page.source), version);
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ v: version }),
      });
    },
  };
}
