import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { DataTable } from "./DataTable.ts";

describe("DataTable", () => {
  it("is a table with its name and its parts", async () => {
    const screen = await render(
      <DataTable caption="Promociones">
        <DataTable.Head>
          <tr>
            <DataTable.Header>Promoción</DataTable.Header>
          </tr>
        </DataTable.Head>
        <DataTable.Body>
          <DataTable.Row>
            <DataTable.Cell>47 Street</DataTable.Cell>
          </DataTable.Row>
        </DataTable.Body>
      </DataTable>,
    );
    await expect.element(screen.getByRole("table", { name: "Promociones" })).toBeVisible();
    await expect.element(screen.getByRole("columnheader", { name: "Promoción" })).toBeVisible();
    await expect.element(screen.getByRole("cell", { name: "47 Street" })).toBeVisible();
  });

  it("orders by pressing a header, and says how it is ordered", async () => {
    const onSort = vi.fn<() => void>();
    const screen = await render(
      <DataTable caption="Promociones">
        <DataTable.Head>
          <tr>
            <DataTable.Header sort="ascending" onSort={onSort}>
              Hasta
            </DataTable.Header>
            <DataTable.Header sort="descending" onSort={onSort}>
              Desde
            </DataTable.Header>
            <DataTable.Header onSort={onSort}>Dónde</DataTable.Header>
            <DataTable.Header sort="ascending">Fija</DataTable.Header>
          </tr>
        </DataTable.Head>
      </DataTable>,
    );
    await expect
      .element(screen.getByRole("columnheader", { name: /Hasta/ }))
      .toHaveAttribute("aria-sort", "ascending");
    await expect
      .element(screen.getByRole("columnheader", { name: /Desde/ }))
      .toHaveAttribute("aria-sort", "descending");
    await expect
      .element(screen.getByRole("columnheader", { name: /Dónde/ }))
      .toHaveAttribute("aria-sort", "none");
    await expect
      .element(screen.getByRole("columnheader", { name: "Fija" }))
      .not.toHaveAttribute("aria-sort");
    await screen.getByRole("button", { name: /Hasta/ }).click();
    expect(onSort).toHaveBeenCalledOnce();
  });

  it("marks a chosen row, and fades one that stays out", async () => {
    const screen = await render(
      <DataTable caption="Promociones">
        <DataTable.Body>
          <DataTable.Row selected>
            <DataTable.Cell>Elegida</DataTable.Cell>
          </DataTable.Row>
          <DataTable.Row excluded>
            <DataTable.Cell>Afuera</DataTable.Cell>
          </DataTable.Row>
          <DataTable.Row>
            <DataTable.Cell>Común</DataTable.Cell>
          </DataTable.Row>
        </DataTable.Body>
      </DataTable>,
    );
    await expect
      .element(screen.getByRole("row", { name: "Elegida" }))
      .toHaveAttribute("aria-selected", "true");
    const faded = screen.getByRole("row", { name: "Afuera" }).element();
    expect(getComputedStyle(faded).opacity).toBe("0.4");
    await expect
      .element(screen.getByRole("row", { name: "Común" }))
      .not.toHaveAttribute("aria-selected");
  });

  it("slides inside its box, so that a wide table does not make the page wider", async () => {
    const screen = await render(
      <div style={{ width: 200 }}>
        <DataTable caption="Ancha">
          <DataTable.Body>
            <DataTable.Row>
              <DataTable.Cell>
                <div style={{ width: 900 }}>Ancha</div>
              </DataTable.Cell>
            </DataTable.Row>
          </DataTable.Body>
        </DataTable>
      </div>,
    );
    const table = screen.getByRole("table").element();
    expect(table.parentElement?.getBoundingClientRect().width).toBe(200);
    expect(table.parentElement?.scrollWidth).toBeGreaterThan(200);
  });
});
