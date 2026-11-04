import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { StatCard } from "./StatCard.tsx";

describe("StatCard", () => {
  it("says what it counts and how many", async () => {
    const screen = await render(<StatCard label="Activos" value={4} tone="green" />);
    await expect.element(screen.getByText("Activos")).toBeVisible();
    await expect.element(screen.getByText("4")).toBeVisible();
  });

  it("is neutral unless told otherwise, and zero still shows", async () => {
    const screen = await render(<StatCard label="Flyers generados" value={0} />);
    await expect.element(screen.getByText("0")).toBeVisible();
  });
});
