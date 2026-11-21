import { createHash } from "node:crypto";
import type { Plugin } from "vite";

const CHARSET_META = /<meta\s+charset=["']?utf-8["']?\s*\/?>/i;
const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

export function hashInlineScripts(html: string): string[] {
  return [...html.matchAll(INLINE_SCRIPT)].flatMap(([, content]) =>
    content ? [`'sha256-${createHash("sha256").update(content).digest("base64")}'`] : [],
  );
}

export function buildContentSecurityPolicy(
  supabaseOrigin: string,
  inlineScriptHashes: readonly string[],
): string {
  return [
    "default-src 'self'",
    ["script-src 'self' 'wasm-unsafe-eval'", ...inlineScriptHashes].join(" "),
    "worker-src 'self' blob:",
    `connect-src 'self' ${supabaseOrigin} https://www.galicia.ar`,
    `img-src 'self' data: blob: ${supabaseOrigin} https://www.galicia.ar`,
    "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export function injectContentSecurityPolicy(html: string, supabaseOrigin: string): string {
  if (!CHARSET_META.test(html)) {
    throw new Error("index.html needs a charset meta tag before the Content-Security-Policy");
  }
  const policy = buildContentSecurityPolicy(supabaseOrigin, hashInlineScripts(html));
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  return html.replace(CHARSET_META, (charset) => `${charset}\n    ${meta}`);
}

export function contentSecurityPolicy(supabaseOrigin: string): Plugin {
  return {
    name: "flyer:content-security-policy",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler: (html) => injectContentSecurityPolicy(html, supabaseOrigin),
    },
  };
}
