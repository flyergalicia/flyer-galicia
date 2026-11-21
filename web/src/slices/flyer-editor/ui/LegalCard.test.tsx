import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { paintedFlyer } from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import { openWithForm } from "../testing/form-on-screen.tsx";
import { LegalCard } from "./LegalCard.tsx";

const FILES = {
  "_active9.json": { imageUrl: paintedFlyer([]), cfg: {} },
  "_legal9.json": { text: "uno dos tres" },
};

async function open() {
  const opened = await openWithForm(<LegalCard />, { files: FILES });
  await opened.workspace().selectOption(9, false);
  const field = opened.screen.getByTestId("legal-text");
  await expect.element(field).toHaveValue("uno dos tres");
  const element = field.element();
  if (!(element instanceof HTMLTextAreaElement)) throw new Error("It is not a text area");
  return { ...opened, field, element };
}

function pasteHtml(element: HTMLTextAreaElement, data: Readonly<Record<string, string>>) {
  const clipboardData = new DataTransfer();
  for (const [kind, text] of Object.entries(data)) clipboardData.setData(kind, text);
  const event = new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

describe("the card of the legal", () => {
  it("what is written goes to the option on screen", async () => {
    const { field, workspace } = await open();
    await field.fill("otro texto");
    expect(workspace().getState().legal).toBe("otro texto");
  });

  it("B puts what is selected in bold, and it stays selected", async () => {
    const { element, field, screen } = await open();
    const bold = screen.getByRole("button", { name: "Negrita" });
    element.setSelectionRange(4, 7);
    await bold.click();
    await expect.element(field).toHaveValue("uno **dos** tres");
    expect([element.selectionStart, element.selectionEnd]).toEqual([6, 9]);
    await expect.element(bold).toHaveAttribute("aria-pressed", "true");

    await bold.click();
    await expect.element(field).toHaveValue("uno dos tres");
    await expect.element(bold).toHaveAttribute("aria-pressed", "false");
  });

  it("Ctrl+B does the same, and another key does not", async () => {
    const { element, field } = await open();
    await field.click();
    element.setSelectionRange(4, 7);
    await userEvent.keyboard("{Control>}b{/Control}");
    await expect.element(field).toHaveValue("uno **dos** tres");
    element.setSelectionRange(0, 0);
    await userEvent.keyboard("{Control>}{Alt>}b{/Alt}{/Control}");
    await expect.element(field).toHaveValue("uno **dos** tres");
  });

  it("with nothing to put in bold it says how", async () => {
    const { element, field, screen, workspace } = await open();
    workspace().setLegal("uno  dos");
    await expect.element(field).toHaveValue("uno  dos");
    element.setSelectionRange(4, 4);
    await screen.getByRole("button", { name: "Negrita" }).click();
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Seleccioná el texto que querés en negrita");
  });

  it("the button says whether the cursor is in bold as it moves", async () => {
    const { element, field, screen, workspace } = await open();
    workspace().setLegal("uno **dos** tres");
    await expect.element(field).toHaveValue("uno **dos** tres");
    const bold = screen.getByRole("button", { name: "Negrita" });
    await field.click();
    element.setSelectionRange(7, 7);
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(bold).toHaveAttribute("aria-pressed", "true");
    element.setSelectionRange(1, 1);
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(bold).toHaveAttribute("aria-pressed", "false");
  });

  it("pasting with format keeps the bold, in its place", async () => {
    const { element, field } = await open();
    element.setSelectionRange(4, 7);
    const event = pasteHtml(element, { "text/html": "<b>$' fuerte</b>" });
    expect(event.defaultPrevented).toBe(true);
    // Invariant 14.
    await expect.element(field).toHaveValue("uno **$' fuerte** tres");
    expect(element.selectionStart).toBe(4 + "**$' fuerte**".length);
  });

  it("pasting without format is a common paste", async () => {
    const { element } = await open();
    const event = pasteHtml(element, { "text/plain": "algo" });
    expect(event.defaultPrevented).toBe(false);
  });

  it("while the legal comes it says of which flyer", async () => {
    const { screen } = await openWithForm(<LegalCard />, {
      files: { "_opciones.json": { opts: [{ n: 1, nombre: "Combustible" }] } },
    });
    await expect.element(screen.getByTestId("legal-text")).toHaveAttribute("placeholder", "");
  });
});
