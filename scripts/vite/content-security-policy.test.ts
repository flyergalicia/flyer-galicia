import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  hashInlineScripts,
  injectContentSecurityPolicy,
} from "./content-security-policy.ts";

const ORIGIN = "https://project.supabase.co";

describe("content security policy", () => {
  it("does not allow inline scripts without a hash", () => {
    const policy = buildContentSecurityPolicy(ORIGIN, []);

    expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(policy).not.toContain("'unsafe-inline'");
    expect(policy).toContain(`connect-src 'self' ${ORIGIN}`);
  });

  it("hashes inline scripts and ignores external ones", () => {
    const hashes = hashInlineScripts(
      '<script>window.a = 1;</script><script type="module" src="./assets/a.js"></script>',
    );

    expect(hashes).toHaveLength(1);
    expect(hashes[0]).toMatch(/^'sha256-[A-Za-z0-9+/]+=*'$/);
  });

  it("places the policy right after the charset, before any script", () => {
    const html = injectContentSecurityPolicy(
      '<head><meta charset="UTF-8" /><script src="./a.js"></script></head>',
      ORIGIN,
    );

    expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<script"));
    expect(html.indexOf('charset="UTF-8"')).toBeLessThan(html.indexOf("Content-Security-Policy"));
  });

  it("fails the build when the page has no charset", () => {
    expect(() => injectContentSecurityPolicy("<head></head>", ORIGIN)).toThrow(/charset/);
  });
});
