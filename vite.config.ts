import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { backendPreconnect } from "./scripts/vite/backend-preconnect.ts";
import { contentSecurityPolicy } from "./scripts/vite/content-security-policy.ts";
import { verifiedSheetLibraryIntegrity } from "./scripts/vite/sheet-library-integrity.ts";
import { sourceAlias } from "./scripts/vite/source-alias.ts";
import { versionManifest } from "./scripts/vite/version-manifest.ts";

const WEB_ROOT = "web";

export default defineConfig(({ mode }) => {
  const { VITE_SUPABASE_URL: supabaseOrigin = "" } = loadEnv(mode, WEB_ROOT);

  return {
    root: WEB_ROOT,
    base: "./",
    define: {
      // In development the server may touch the file on its way: the hash is for what is published.
      SHEET_LIBRARY_HASH: JSON.stringify(
        mode === "production" ? verifiedSheetLibraryIntegrity() : "",
      ),
    },
    plugins: [
      react(),
      contentSecurityPolicy(supabaseOrigin),
      backendPreconnect(supabaseOrigin),
      versionManifest(),
    ],
    resolve: { alias: sourceAlias },
    server: { host: "127.0.0.1", port: 5173, strictPort: true },
    preview: { host: "127.0.0.1", port: 8766, strictPort: true },
    build: {
      outDir: "../dist",
      emptyOutDir: true,
      rolldownOptions: {
        // The fg- prefix keeps generated names away from a leading underscore: the
        // Jekyll step of GitHub Pages does not publish files that start with one.
        output: {
          entryFileNames: "assets/fg-[name]-[hash].js",
          chunkFileNames: "assets/fg-[name]-[hash].js",
          assetFileNames: "assets/fg-[name]-[hash][extname]",
        },
      },
    },
  };
});
