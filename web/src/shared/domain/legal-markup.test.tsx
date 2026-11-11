import { describe, expect, it } from "vitest";
import { htmlBoldToMarks } from "./legal-markup.ts";

describe("what is pasted in a legal", () => {
  it("keeps the bold of the source as marks", () => {
    expect(htmlBoldToMarks("<p>Texto <b>fuerte</b></p>")).toBe("Texto **fuerte**");
    expect(htmlBoldToMarks("uno <strong>dos</strong> tres")).toBe("uno **dos** tres");
    expect(htmlBoldToMarks('<span style="font-weight:700">gordo</span>')).toBe("**gordo**");
    expect(htmlBoldToMarks('<span style="font-weight:bold">gordo</span>')).toBe("**gordo**");
    expect(htmlBoldToMarks('<span style="font-weight:bolder">gordo</span>')).toBe("**gordo**");
    expect(htmlBoldToMarks('<span style="font-weight:400">fino</span>')).toBe("fino");
  });

  it("bold next to bold is one", () => {
    expect(htmlBoldToMarks("<b>a</b> <b>b</b>")).toBe("**a b**");
  });

  it("a block and a line break are a new line, and spaces are not piled up", () => {
    expect(htmlBoldToMarks("<p>uno</p><p>dos</p>")).toBe("uno\ndos");
    expect(htmlBoldToMarks("uno<br>dos")).toBe("uno\ndos");
    expect(htmlBoldToMarks("<div>a   b</div>\n\n\n<div>c</div>")).toBe("a b\n c");
    expect(htmlBoldToMarks("<p>a</p><p></p><p></p><p></p><p>b</p>")).toBe("a\n\nb");
  });

  it("runs nothing and leaves out what is not text", () => {
    const pasted = htmlBoldToMarks(
      '<img src=x onerror="window.__xss=1"><!-- nada --><script>window.__xss=1</script>texto',
    );
    expect(pasted).toContain("texto");
    expect(pasted).not.toContain("<img");
    expect(Reflect.has(window, "__xss")).toBe(false);
  });
});
