import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { Card } from "./Card.ts";

describe("Card", () => {
  it("names itself and its parts as headings, and keeps classes from outside", async () => {
    const screen = await render(
      <Card className="box">
        <Card.Title className="title">Oficiales</Card.Title>
        <Card.Subtitle className="sub">Asesor 1</Card.Subtitle>
        <p>Datos</p>
      </Card>,
    );
    await expect
      .element(screen.getByRole("heading", { name: "Oficiales", level: 3 }))
      .toHaveClass("title");
    await expect
      .element(screen.getByRole("heading", { name: "Asesor 1", level: 4 }))
      .toHaveClass("sub");
    expect(screen.getByText("Datos").element().parentElement?.className).toContain("box");
  });

  it("does not need any class", async () => {
    const screen = await render(
      <Card>
        <Card.Title>Empresa</Card.Title>
        <Card.Subtitle>Datos</Card.Subtitle>
      </Card>,
    );
    await expect.element(screen.getByRole("heading", { name: "Empresa" })).toBeVisible();
  });
});
