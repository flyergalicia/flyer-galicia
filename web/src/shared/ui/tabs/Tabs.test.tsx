import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Tabs } from "./Tabs.ts";
import type { TabsVariant } from "./Tabs.parts.tsx";

function Example({
  variant,
  start = "a",
}: {
  readonly variant?: TabsVariant;
  readonly start?: string;
}) {
  const [value, setValue] = useState(start);
  return (
    <Tabs value={value} onChange={setValue} {...(variant ? { variant } : {})}>
      <Tabs.List label="Pantallas">
        <Tabs.Tab value="a" icon="pencil">
          Uno
        </Tabs.Tab>
        <Tabs.Tab value="b" count={2} dot>
          Dos
        </Tabs.Tab>
        <Tabs.Tab value="c" disabled>
          Tres
        </Tabs.Tab>
        <Tabs.Tab value="d" count={0}>
          Cuatro
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="a">Lo de uno</Tabs.Panel>
      <Tabs.Panel value="b">Lo de dos</Tabs.Panel>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("shows only what belongs to the selected tab", async () => {
    const screen = await render(<Example />);
    await expect
      .element(screen.getByRole("tab", { name: "Uno" }))
      .toHaveAttribute("aria-selected", "true");
    await expect.element(screen.getByRole("tabpanel")).toHaveTextContent("Lo de uno");
    await screen.getByRole("tab", { name: /Dos/ }).click();
    await expect.element(screen.getByRole("tabpanel")).toHaveTextContent("Lo de dos");
    await expect.element(screen.getByText("Lo de uno")).not.toBeInTheDocument();
  });

  it("ties a panel to its tab", async () => {
    const screen = await render(<Example />);
    await expect.element(screen.getByRole("tabpanel", { name: "Uno" })).toBeInTheDocument();
  });

  it("goes with the arrows, skips what is off limits and wraps around", async () => {
    const screen = await render(<Example />);
    screen.getByRole("tab", { name: "Uno" }).element().focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(screen.getByRole("tab", { name: /Dos/ })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    await expect
      .element(screen.getByRole("tab", { name: /Cuatro/ }))
      .toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(screen.getByRole("tab", { name: "Uno" })).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect.element(screen.getByRole("tab", { name: /Cuatro/ })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    await expect.element(screen.getByRole("tab", { name: "Uno" })).toHaveFocus();
    await userEvent.keyboard("{End}");
    await expect.element(screen.getByRole("tab", { name: /Cuatro/ })).toHaveFocus();
  });

  it("ignores other keys", async () => {
    const screen = await render(<Example />);
    screen.getByRole("tab", { name: "Uno" }).element().focus();
    await userEvent.keyboard("x");
    await expect
      .element(screen.getByRole("tab", { name: "Uno" }))
      .toHaveAttribute("aria-selected", "true");
  });

  it("only the selected tab is reached with Tab", async () => {
    const screen = await render(<Example start="b" />);
    await expect.element(screen.getByRole("tab", { name: /Dos/ })).toHaveAttribute("tabindex", "0");
    await expect
      .element(screen.getByRole("tab", { name: "Uno" }))
      .toHaveAttribute("tabindex", "-1");
  });

  it("shows a number only when there is something to look at", async () => {
    const screen = await render(<Example />);
    await expect.element(screen.getByRole("tab", { name: /Dos/ })).toHaveTextContent("Dos2");
    expect(screen.getByRole("tab", { name: "Cuatro" }).element().textContent).toBe("Cuatro");
  });

  it.each(["segmented", "pills", "pills-window", "underline", "line"] as const)(
    "has the %s look",
    async (variant) => {
      const screen = await render(<Example variant={variant} />);
      expect(screen.getByRole("tab", { name: "Uno" }).element().className).toContain(variant);
    },
  );

  it("refuses a part outside Tabs, with a clear message", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(render(<Tabs.Tab value="x">Suelta</Tabs.Tab>)).rejects.toThrow(
      "Tabs.Tab must be inside Tabs",
    );
    quiet.mockRestore();
  });
});
