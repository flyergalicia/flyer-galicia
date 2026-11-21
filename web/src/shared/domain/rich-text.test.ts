import { describe, expect, it } from "vitest";
import { richTextOf } from "./rich-text.ts";

describe("a text with marks", () => {
  it("reads the same without them", () => {
    expect(
      richTextOf([
        { strong: "No encontré " },
        { strong: ["la columna ", { code: "empresa" }] },
        ".",
        { lineBreak: true },
        "Otra línea",
      ]),
    ).toBe("No encontré la columna empresa.\nOtra línea");
  });
});
