import { describe, expect, it, vi } from "vitest";
import { insertAtCursor } from "./file-name.ts";

function fieldWith(value: string): HTMLInputElement {
  const input = document.createElement("input");
  input.value = value;
  document.body.append(input);
  return input;
}

describe("a tag in the name of the file", () => {
  it("goes where the cursor is, in place of what is selected", () => {
    const input = fieldWith("Mi flyer");
    input.setSelectionRange(3, 8);
    const write = vi.fn<(value: string) => void>();
    insertAtCursor(input, "{fecha}", write);
    expect(write).toHaveBeenCalledWith("Mi {fecha}");
    input.remove();
  });

  it("with no cursor, at the end", () => {
    const write = vi.fn<(value: string) => void>();
    const input = fieldWith("Mi flyer");
    vi.spyOn(input, "selectionStart", "get").mockReturnValue(null);
    vi.spyOn(input, "selectionEnd", "get").mockReturnValue(null);
    insertAtCursor(input, "{fecha}", write);
    expect(write).toHaveBeenCalledWith("Mi flyer{fecha}");
    input.remove();
  });

  it("with no field, nothing", () => {
    const write = vi.fn<(value: string) => void>();
    insertAtCursor(null, "{fecha}", write);
    expect(write).not.toHaveBeenCalled();
  });
});
