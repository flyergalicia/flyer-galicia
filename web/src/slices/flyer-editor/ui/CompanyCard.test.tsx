import { describe, expect, it, vi } from "vitest";
import { paintedFlyer } from "@/shared/lib/flyer-workspace/testing/painted-flyer.ts";
import { openWithForm } from "../testing/form-on-screen.tsx";
import { CompanyCard } from "./CompanyCard.tsx";

const CHOSEN = () => undefined;

function card(isCategoryTab: boolean) {
  return <CompanyCard isCategoryTab={isCategoryTab} onChoose={CHOSEN} onOpenDatabase={CHOSEN} />;
}

describe("the card of the company", () => {
  it("what is written goes to the form, and the sign of the benefit only in Rubros", async () => {
    const { screen, form } = await openWithForm(card(false));
    await screen.getByPlaceholder("Nombre de la empresa").fill("ACME");
    expect(form().getState().empresa).toBe("ACME");
    expect(form().getState().fileName).toBe("Flyer_ACME");
    expect(screen.getByTestId("benefit-fields").query()).toBeNull();
  });

  it("the name of the benefit follows the company until it is written, and ↻ copies it again", async () => {
    const { screen, form } = await openWithForm(card(true));
    const name = screen.getByTestId("benefit-name");
    await screen.getByPlaceholder("Nombre de la empresa").fill("ACME");
    await expect.element(name).toHaveValue("ACME");

    await name.fill("");
    expect(form().getState().benefitNameByHand).toBe(true);
    await screen.getByPlaceholder("Nombre de la empresa").fill("BETA");
    // Erased, it does not come back.
    await expect.element(name).toHaveValue("");

    await screen.getByRole("button", { name: "Volver a copiar el nombre de la empresa" }).click();
    await expect.element(name).toHaveValue("BETA");
  });

  it("the cap is written with its dots on leaving the field", async () => {
    const { screen } = await openWithForm(card(true));
    const cap = screen.getByTestId("benefit-cap");
    await expect.element(cap).toHaveValue("24.000");
    await cap.fill("50000");
    await expect.element(cap).toHaveValue("50000");
    await screen.getByTestId("benefit-name").click();
    await expect.element(cap).toHaveValue("50.000");
    expect(screen.getByTestId("benefit-second-cap").query()).toBeNull();
  });

  it("a legal with a second cap asks for it, with the names of the calibration", async () => {
    const { screen, workspace } = await openWithForm(card(true), {
      files: {
        "_active9.json": {
          imageUrl: paintedFlyer([]),
          cfg: {
            benef: {
              lineas: [{ t: "Tope {importe} y {importe2}" }],
              campos: { importe: "Tope súper", importe2: "Tope combustible" },
            },
          },
        },
        "_legal9.json": { text: "Legal" },
      },
    });
    await expect.element(screen.getByText("Tope de reintegro mensual")).toBeInTheDocument();
    await workspace().selectOption(9, false);

    await expect.element(screen.getByText("Tope súper")).toBeInTheDocument();
    await expect.element(screen.getByText("Tope combustible")).toBeInTheDocument();
    const second = screen.getByTestId("benefit-second-cap");
    await second.fill("7000");
    await screen.getByTestId("benefit-cap").click();
    await expect.element(second).toHaveValue("7.000");
  });

  it("with another calibration without names, it says what it always says", async () => {
    const { screen, workspace } = await openWithForm(card(true), {
      files: {
        "_active9.json": {
          imageUrl: paintedFlyer([]),
          cfg: { benef: { lineas: [{ t: "Tope {importe2}" }], campos: { importe2: "" } } },
        },
        "_legal9.json": { text: "Legal" },
      },
    });
    await workspace().selectOption(9, false);
    await vi.waitFor(() => {
      expect(screen.getByTestId("benefit-second-cap").query()).not.toBeNull();
    });
  });
});
