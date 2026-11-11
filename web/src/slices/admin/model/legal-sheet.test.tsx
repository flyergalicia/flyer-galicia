// Config → Legales: where a marker goes, what is pasted with its bold, and what it says.
import { describe, expect, it } from "vitest";
import {
  insertedAt,
  LEGAL_MARKERS,
  legalSavedText,
  markerPastedText,
  pastedWithBold,
} from "./legal-sheet.ts";

describe("the markers", () => {
  it("are those the flyer fills in, the old ones included", () => {
    expect(LEGAL_MARKERS.map(([marker]) => marker)).toEqual([
      "{empresa}",
      "{eminentblack}",
      "{platinum}",
      "{plusgold}",
      "{plus}",
      "{importe}",
      "{importe2}",
      "{total}",
    ]);
  });

  it("go where the cursor was, or at the end when the field was never touched", () => {
    expect(insertedAt("Hola mundo", 5, "{empresa}")).toEqual({
      text: "Hola {empresa}mundo",
      cursor: 14,
    });
    expect(insertedAt("Hola", null, "{plus}")).toEqual({ text: "Hola{plus}", cursor: 10 });
    expect(insertedAt("Hola", 99, "{plus}").text).toBe("Hola{plus}");
    expect(insertedAt("Hola", -1, "{plus}").text).toBe("Hola{plus}");
    expect(insertedAt("Hola", 0, "{plus}").text).toBe("{plus}Hola");
  });

  it("a $' in the text stays as it is, before and after the marker (invariant 14)", () => {
    expect(insertedAt("Tope $' y $&", 4, "{total}").text).toBe("Tope{total} $' y $&");
    expect(insertedAt("Tope $' y $& de", 12, "{total}").text).toBe("Tope $' y $&{total} de");
  });

  it("say what was pasted", () => {
    expect(markerPastedText("{importe}")).toBe(
      "Pegé {importe} — se reemplaza solo al armar el flyer",
    );
    expect(legalSavedText("Combustible")).toBe(
      "✅ Guardado. Se aplica a Combustible para todos los usuarios.",
    );
  });
});

describe("what is pasted with its format", () => {
  it("keeps the bold as marks, in place of the selection", () => {
    expect(pastedWithBold("abc XYZ def", 4, 7, "<p>uno <b>dos</b></p>")).toEqual({
      text: "abc uno **dos** def",
      cursor: 15,
    });
  });

  it("is text: what came with it does not run nor stays as HTML (invariant 12)", () => {
    const pasted = pastedWithBold("", 0, 0, '<img src=x onerror="alert(1)">hola<script>x</script>');
    expect(pasted.text).not.toMatch(/<|onerror/);
    expect(pasted.text).toMatch(/hola/);
  });
});
