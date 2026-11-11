import type { CSSProperties } from "react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { ListRow } from "./ListRow.ts";

describe("ListRow", () => {
  it("shows its parts in a row", async () => {
    const screen = await render(
      <ListRow>
        <ListRow.Main>
          <ListRow.Title>Asesor Prueba</ListRow.Title>
          <ListRow.Meta>asesor.prueba@bancogalicia.com.ar</ListRow.Meta>
        </ListRow.Main>
        <ListRow.Aside tight>Activo</ListRow.Aside>
        <ListRow.Aside>Editar</ListRow.Aside>
      </ListRow>,
    );
    await expect.element(screen.getByText("Asesor Prueba")).toBeVisible();
    const row = screen.getByText("Activo").element().parentElement;
    if (!row) throw new Error("the part is not in a row");
    expect(getComputedStyle(row).display).toBe("flex");
  });

  it("gives way in the text, not in what is on the right", async () => {
    const screen = await render(
      <div style={{ width: 200 }}>
        <ListRow density="compact">
          <ListRow.Main>
            <ListRow.Title>Una razón social muy larga que no entra en este lugar</ListRow.Title>
          </ListRow.Main>
          <ListRow.Aside>Editar</ListRow.Aside>
        </ListRow>
      </div>,
    );
    const title = screen.getByText(/Una razón social/).element();
    expect(title.scrollWidth).toBeGreaterThan(title.clientWidth);
    expect(screen.getByText("Editar").element().getBoundingClientRect().right).toBeLessThanOrEqual(
      200,
    );
  });

  it("marks with its border a row that waits for a decision", async () => {
    const colors: CSSProperties & Record<"--waiting-line" | "--raised-line", string> = {
      "--waiting-line": "rgb(245, 197, 66)",
      "--raised-line": "rgb(1, 2, 3)",
    };
    const screen = await render(
      <div style={colors}>
        <ListRow tone="waiting" data-testid="waiting">
          <ListRow.Main>Pendiente</ListRow.Main>
        </ListRow>
        <ListRow data-testid="plain">
          <ListRow.Main>Activo</ListRow.Main>
        </ListRow>
      </div>,
    );
    const waiting = getComputedStyle(screen.getByTestId("waiting").element()).borderTopColor;
    const plain = getComputedStyle(screen.getByTestId("plain").element()).borderTopColor;
    expect(waiting).toBe("rgb(245, 197, 66)");
    expect(plain).toBe("rgb(1, 2, 3)");
  });
});
