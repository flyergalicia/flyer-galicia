// Builds the current app into legacy-site/, never into the root: since the cut-over the root is
// what GitHub Pages publishes, and it holds the React app. The tests that compare against the
// current app serve that folder. _build.mjs is not changed: it runs inside the folder, over copies
// of what it reads.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { resolve } from "node:path";
import { execPath } from "node:process";

const LEGACY_SITE = "legacy-site";

// What _build.mjs reads, and what the page it writes asks for: auth.js, gestiones.js,
// benchmark.js and the sheets library are served next to it.
const COPIED = ["_source.html", "_newcss.txt", "auth.js", "gestiones.js", "benchmark.js", "libs"];
// Only read, to check that the server functions pin their library.
const LINKED = ["supabase"];

function build(): void {
  const site = resolve(LEGACY_SITE);
  rmSync(site, { recursive: true, force: true });
  mkdirSync(site);
  for (const path of COPIED) cpSync(path, `${site}/${path}`, { recursive: true });
  for (const path of LINKED) symlinkSync(resolve(path), `${site}/${path}`);
  execFileSync(execPath, [resolve("_build.mjs")], { cwd: site, stdio: "inherit" });
}

build();
