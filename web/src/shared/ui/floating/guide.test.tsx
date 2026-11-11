import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { GUIDE_TIP_ATTRIBUTE, GUIDE_VEIL_ATTRIBUTE, insideGuideTip } from "./guide.ts";

describe("what the tutorial puts over the screen", () => {
  it("says whether something is inside its globe", async () => {
    const screen = await render(
      <>
        <section {...{ [GUIDE_TIP_ATTRIBUTE]: "" }}>
          <button type="button">Siguiente</button>
        </section>
        <div {...{ [GUIDE_VEIL_ATTRIBUTE]: "" }} />
        <button type="button">Afuera</button>
      </>,
    );

    expect(insideGuideTip(screen.getByRole("button", { name: "Siguiente" }).element())).toBe(true);
    expect(insideGuideTip(screen.getByRole("button", { name: "Afuera" }).element())).toBe(false);
    expect(insideGuideTip(document)).toBe(false);
    expect(insideGuideTip(null)).toBe(false);
    expect(document.querySelectorAll(`[${GUIDE_VEIL_ATTRIBUTE}]`)).toHaveLength(1);
  });
});
