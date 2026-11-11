import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Avatar } from "./Avatar.tsx";

describe("Avatar", () => {
  it("shows the initials in the color of that person", async () => {
    const screen = await render(<Avatar initials="AP" color="rgb(0, 105, 92)" />);
    const avatar = screen.getByText("AP").element();
    expect(getComputedStyle(avatar).backgroundColor).toBe("rgb(0, 105, 92)");
    expect(avatar.getBoundingClientRect().width).toBe(34);
  });

  it("has a smaller size", async () => {
    const screen = await render(<Avatar initials="AP" color="red" size="sm" />);
    expect(screen.getByText("AP").element().getBoundingClientRect().width).toBe(28);
  });
});
