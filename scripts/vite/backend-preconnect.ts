import type { Plugin } from "vite";

const CHARSET_META = /<meta\s+charset=["']?utf-8["']?\s*\/?>/i;

/** The first thing the app does is talk to the backend: the connection is opened beforehand. */
export function injectBackendPreconnect(html: string, origin: string): string {
  if (!origin) return html;
  const link = `<link rel="preconnect" href="${origin}" crossorigin>`;
  return html.replace(CHARSET_META, (charset) => `${charset}\n    ${link}`);
}

export function backendPreconnect(origin: string): Plugin {
  return {
    name: "flyer:backend-preconnect",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler: (html) => injectBackendPreconnect(html, origin),
    },
  };
}
