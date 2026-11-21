import { describe, expect, it } from "vitest";
import { readPublicEnvironment } from "./public-environment.ts";

describe("readPublicEnvironment", () => {
  it("returns the values when both are present", () => {
    const result = readPublicEnvironment({
      VITE_SUPABASE_URL: " https://project.supabase.co ",
      VITE_SUPABASE_ANON_KEY: "public-key",
    });

    expect(result).toEqual({
      ok: true,
      value: { supabaseUrl: "https://project.supabase.co", supabaseAnonKey: "public-key" },
    });
  });

  it("lists every missing value", () => {
    expect(readPublicEnvironment({})).toEqual({
      ok: false,
      missing: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"],
    });
  });

  it("lists only the value that is missing", () => {
    expect(readPublicEnvironment({ VITE_SUPABASE_URL: "https://project.supabase.co" })).toEqual({
      ok: false,
      missing: ["VITE_SUPABASE_ANON_KEY"],
    });
    expect(readPublicEnvironment({ VITE_SUPABASE_ANON_KEY: "public-key" })).toEqual({
      ok: false,
      missing: ["VITE_SUPABASE_URL"],
    });
  });

  it("treats blank and non text values as missing", () => {
    expect(readPublicEnvironment({ VITE_SUPABASE_URL: "   ", VITE_SUPABASE_ANON_KEY: 1 })).toEqual({
      ok: false,
      missing: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"],
    });
  });
});
