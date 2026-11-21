import { describe, expect, it, vi } from "vitest";
import { withCompany, withNoCashback } from "../model/form-state.ts";
import { openWithForm } from "../testing/form-on-screen.tsx";
import { FileNameCard } from "./FileNameCard.tsx";

describe("the card of the name of the file", () => {
  it("shows what the file will be called", async () => {
    const { screen, form } = await openWithForm(<FileNameCard />);
    const preview = screen.getByTestId("file-name-preview");
    await expect.element(preview).toHaveTextContent("→ Flyer.pdf");
    form().update((state) => withCompany(state, "ACME"));
    await expect.element(preview).toHaveTextContent("→ Flyer_ACME.pdf");
  });

  it("what is written stays, and a tag goes where the cursor is", async () => {
    const { screen, form } = await openWithForm(<FileNameCard />);
    const field = screen.getByTestId("file-name");
    await field.fill("Mi flyer");
    expect(form().getState().fileNameByHand).toBe(true);

    const input = field.element();
    if (!(input instanceof HTMLInputElement)) throw new Error("It is not a field");
    input.setSelectionRange(2, 2);
    await screen.getByRole("button", { name: "{config}" }).click();
    await expect.element(field).toHaveValue("Mi{config} flyer");
    await expect.element(field).toHaveFocus();
    await vi.waitFor(() => {
      expect(input.selectionStart).toBe(10);
    });
    await expect
      .element(screen.getByTestId("file-name-preview"))
      .toHaveTextContent("→ MiBAU flyer.pdf");

    form().update(withNoCashback);
    await expect
      .element(screen.getByTestId("file-name-preview"))
      .toHaveTextContent("→ MiSin cashback flyer.pdf");
  });
});
