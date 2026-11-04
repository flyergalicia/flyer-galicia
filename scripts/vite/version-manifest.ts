import { createHash } from "node:crypto";
import type { Plugin } from "vite";

const VERSION_LENGTH = 10;

export function computeVersion(fileNames: readonly string[]): string {
  const content = fileNames.toSorted().join("\n");
  return createHash("sha256").update(content).digest("hex").slice(0, VERSION_LENGTH);
}

// Emits the file the app polls to offer a reload when a new version is published.
// It has no leading underscore because GitHub Pages does not serve those files.
export function versionManifest(): Plugin {
  return {
    name: "flyer:version-manifest",
    apply: "build",
    generateBundle(_options, bundle) {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ v: computeVersion(Object.keys(bundle)) }),
      });
    },
  };
}
