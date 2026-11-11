import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cachedAdvisors,
  keepAdvisorsCopy,
  newAdvisorId,
  sanitizeAdvisors,
} from "./saved-advisors.ts";

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
  });
});

describe("the list of advisors", () => {
  it("always has the same shape, whatever arrives", () => {
    expect(
      sanitizeAdvisors([
        { id: "a", nombre: " Ana ", celular: 11, email: null },
        { id: "a", nombre: "Repetido" },
        null,
        "x",
        { name: "Solo rótulo" },
      ]),
    ).toEqual([
      { id: "a", name: "Ana", nombre: "Ana", celular: "11", email: "" },
      expect.objectContaining({ name: "Solo rótulo", nombre: "" }),
    ]);
    expect(sanitizeAdvisors(null)).toEqual([]);
  });

  it("each new one has its own id", () => {
    expect(newAdvisorId()).not.toBe(newAdvisorId());
    expect(newAdvisorId()).toMatch(/^a\d+/);
  });
});

describe("the copy of the browser", () => {
  it("goes and comes back", () => {
    const rows = [{ id: "a", name: "Ana", nombre: "Ana", celular: "", email: "" }];
    keepAdvisorsCopy("u", rows);

    expect(cachedAdvisors("u")).toEqual(rows);
    expect(cachedAdvisors("otro")).toEqual([]);
  });

  it("broken is empty", () => {
    memory.set("fg_asesores_u", "{");

    expect(cachedAdvisors("u")).toEqual([]);
  });

  it("a browser that does not let it loses nothing else", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("no");
      },
      setItem: () => {
        throw new Error("no");
      },
    });

    expect(cachedAdvisors("u")).toEqual([]);
    expect(() => {
      keepAdvisorsCopy("u", []);
    }).not.toThrow();
  });
});
