import { describe, expect, it } from "vitest";
import { paintedFlyer } from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import { withNoCashback } from "../model/form-state.ts";
import { INITIAL_FORM_CONTEXT } from "../model/flyer-form.ts";
import { openWithForm } from "../testing/form-on-screen.tsx";
import { AmountsCard } from "./AmountsCard.tsx";

const CONFIGS = {
  "_cashback.json": {
    configs: [
      { nombre: "BAU", m1: "$180.000", m2: "$250.000", m3: "$80.000", m4: "$30.000" },
      { nombre: "Otro", m1: "$1", m2: "$2", m3: "$3", m4: "$4" },
    ],
  },
};

describe("the card of the amounts", () => {
  it("each button changes the amounts, and the one chosen is told", async () => {
    const { screen, form } = await openWithForm(<AmountsCard />);
    const amounts = screen.getByTestId("active-amounts");
    const buttons = screen.getByRole("button");
    await expect.element(buttons.first()).toHaveAttribute("aria-pressed", "true");
    await expect.element(amounts).toMatchTextContent(/Eminent Black\$250\.000/);

    await buttons.nth(2).click();
    expect(form().getState().cashback).toBe(2);
    await expect.element(buttons.nth(2)).toHaveAttribute("aria-pressed", "true");
    await expect.element(buttons.first()).toHaveAttribute("aria-pressed", "false");
    await expect.element(amounts).not.toMatchTextContent(/Eminent Black\$250\.000/);
  });

  it("a company without cashback leaves them in blank and none chosen", async () => {
    const { screen, form } = await openWithForm(<AmountsCard />, { files: CONFIGS });
    await expect.element(screen.getByRole("button", { name: "Otro" })).toBeInTheDocument();
    form().update(withNoCashback);
    await expect.element(screen.getByTestId("no-cashback")).toMatchTextContent(/Sin cashback/);
    await expect.element(screen.getByTestId("active-amounts")).toMatchTextContent(/Eminent Black—/);
    await expect
      .element(screen.getByRole("button", { name: "BAU" }))
      .toHaveAttribute("aria-pressed", "false");
    await screen.getByRole("button", { name: "Otro" }).click();
    await expect
      .element(screen.getByTestId("active-amounts"))
      .toMatchTextContent(/Eminent Black\$1/);
    expect(form().getState().noCashback).toBe(false);
    expect(screen.getByTestId("no-cashback").query()).toBeNull();
  });

  it("where one is printed, it marks that one", async () => {
    const { screen, form } = await openWithForm(<AmountsCard />, { files: CONFIGS });
    const printed = "Es el importe que sale impreso en este flyer";
    await expect.element(screen.getByRole("button", { name: "Otro" })).toBeInTheDocument();
    expect(screen.getByTitle(printed).query()).toBeNull();
    form().setContext({ ...INITIAL_FORM_CONTEXT, tab: "sueldo" });
    await expect.element(screen.getByTitle(printed)).toHaveTextContent("Eminent Platinum$250.000");
  });

  it("a flyer that shows none says so instead of the buttons", async () => {
    const { screen, workspace } = await openWithForm(<AmountsCard />, {
      files: {
        "_active9.json": { imageUrl: paintedFlyer([]), cfg: { montos: { off: true } } },
        "_legal9.json": { text: "Legal" },
      },
    });
    await expect.element(screen.getByTestId("active-amounts")).toBeInTheDocument();
    await workspace().selectOption(9, false);
    await expect.element(screen.getByTestId("no-amounts")).toBeInTheDocument();
    expect(screen.getByTestId("active-amounts").query()).toBeNull();
  });

  it("with no configurations at all, there is nothing to press", async () => {
    const { screen } = await openWithForm(<AmountsCard />, {
      files: { "_cashback.json": { configs: [] } },
    });
    await expect.element(screen.getByTestId("active-amounts")).toBeInTheDocument();
  });
});
