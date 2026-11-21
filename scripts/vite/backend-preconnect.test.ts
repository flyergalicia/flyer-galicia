import { describe, expect, it } from "vitest";
import { injectBackendPreconnect } from "./backend-preconnect.ts";

const PAGE = '<head><meta charset="UTF-8" /><script src="a.js"></script></head>';

describe("injectBackendPreconnect", () => {
  it("opens the connection before any script", () => {
    const html = injectBackendPreconnect(PAGE, "https://x.supabase.co");

    expect(html).toContain('<link rel="preconnect" href="https://x.supabase.co" crossorigin>');
    expect(html.indexOf("preconnect")).toBeLessThan(html.indexOf("<script"));
  });

  it("does nothing without a backend", () => {
    expect(injectBackendPreconnect(PAGE, "")).toBe(PAGE);
  });
});
