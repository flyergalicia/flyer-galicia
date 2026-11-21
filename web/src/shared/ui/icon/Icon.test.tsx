import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Icon } from "./Icon.tsx";

describe("Icon", () => {
  it("is decoration for readers, and follows the size of the text around it", async () => {
    const screen = await render(
      <span style={{ fontSize: 20 }}>
        <Icon name="download" className="mine" />
      </span>,
    );
    const icon = screen.container.querySelector("svg");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.getAttribute("class")).toContain("mine");
    expect(icon?.getBoundingClientRect().width).toBe(20);
  });

  it("can have a size of its own", async () => {
    const screen = await render(<Icon name="database" size={24} />);
    expect(screen.container.querySelector("svg")?.getBoundingClientRect().height).toBe(24);
  });
});
