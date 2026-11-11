import { describe, expect, it } from "vitest";
import { daysSignature, formatDays, ownDays, readDays } from "./days.ts";

function inOrder(text: string): number[] {
  return [...readDays(text).days].toSorted((a, b) => a - b);
}

describe("the days of a promotion", () => {
  it("are those it publishes, clean", () => {
    expect(ownDays({ id: 1, titulo: "x", dias: "Viernes  y Sábado " })).toBe("Viernes y Sábado");
    expect(ownDays({ id: 1, titulo: "x", dias: "Todos los días excepto feriados" })).toBe(
      "Todos los días excepto feriados",
    );
    expect(ownDays({ id: 1, titulo: "x" })).toBe("");
    expect(ownDays(null)).toBe("");
  });

  it("are read in any way they are written", () => {
    expect(readDays("Todos los días").everyDay).toBe(true);
    expect([...readDays("Martes y Jueves").days]).toEqual([1, 3]);
    expect(inOrder("de lunes a viernes")).toEqual([0, 1, 2, 3, 4]);
    expect(inOrder("de sábado a lunes")).toEqual([0, 5, 6]);
    expect(readDays("cuando quieras").days.size).toBe(0);
    expect(readDays(null).days.size).toBe(0);
  });

  it("are written as the flyer writes them", () => {
    expect(formatDays(new Set([5, 4]))).toBe("Viernes y sábados");
    expect(formatDays(new Set([1]))).toBe("Martes");
    expect(formatDays(new Set([0, 1, 2]))).toBe("Lunes, martes y miércoles");
    expect(formatDays(new Set([0, 1, 2, 3, 4, 5, 6]))).toBe("Todos los días");
    expect(formatDays(new Set())).toBe("");
  });

  it("compare by what they mean", () => {
    expect(daysSignature("Viernes y Sábado")).toBe(daysSignature("Viernes y sábados"));
    expect(daysSignature("Todos los días")).toBe("todos");
    expect(daysSignature("")).toBe("");
    expect(daysSignature(null)).toBe("");
  });
});
