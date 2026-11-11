import { describe, expect, it, vi } from "vitest";
import { readStoredDark, readStoredPalette, saveDark, savePalette } from "./theme-model.ts";

function storage(values: Record<string, string>) {
  return {
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => {
      values[key] = value;
    },
  };
}

const broken = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("saved appearance", () => {
  it("reads what the old app saved, with the same keys and values", () => {
    const saved = storage({ fg_theme: "dark", fg_palette: "t-grafito" });
    expect(readStoredDark(saved)).toBe(true);
    expect(readStoredPalette(saved)).toBe("grafito");
  });

  it("starts in light and marfil when nothing is saved or the value is unknown", () => {
    expect(readStoredDark(storage({}))).toBe(false);
    expect(readStoredPalette(storage({}))).toBe("marfil");
    expect(readStoredPalette(storage({ fg_palette: "fucsia" }))).toBe("marfil");
    expect(readStoredPalette(storage({ fg_palette: "marino" }))).toBe("marfil");
  });

  it("saves in the same form that it reads", () => {
    const values: Record<string, string> = {};
    saveDark(storage(values), true);
    savePalette(storage(values), "cielo");
    expect(values).toEqual({ fg_theme: "dark", fg_palette: "t-cielo" });
    saveDark(storage(values), false);
    expect(values.fg_theme).toBe("light");
  });

  it("goes on when the browser refuses its storage", () => {
    expect(readStoredDark(broken)).toBe(false);
    expect(readStoredPalette(broken)).toBe("marfil");
    expect(() => {
      saveDark(broken, true);
      savePalette(broken, "marino");
    }).not.toThrow();
    expect(vi.isMockFunction(broken.getItem)).toBe(false);
  });
});
