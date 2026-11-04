import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { SectionLabel } from "./SectionLabel.tsx";

describe("SectionLabel", () => {
  it("goes in capitals, with the minimum allowed for a label", async () => {
    const screen = await render(
      <>
        <SectionLabel>Usuarios</SectionLabel>
        <SectionLabel kind="panel">Flyer</SectionLabel>
      </>,
    );
    for (const text of ["Usuarios", "Flyer"]) {
      const style = getComputedStyle(screen.getByText(text).element());
      expect(style.textTransform).toBe("uppercase");
      expect(Number.parseFloat(style.fontSize)).toBeGreaterThanOrEqual(11);
    }
  });
});
