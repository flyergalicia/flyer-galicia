import { beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { BRANCH_PIN, withBranches, withOfficerPlace } from "../model/form-state.ts";
import { openWithForm } from "../testing/form-on-screen.tsx";
import { BranchesSwitch } from "./BranchesSwitch.tsx";
import { OfficersCard } from "./OfficersCard.tsx";

const theSwitch = () => page.getByRole("switch", { name: /Oficiales por sede/ });

function open(faculty = true, onTurnedOn: () => void = () => undefined) {
  return openWithForm(
    <>
      <BranchesSwitch onTurnedOn={onTurnedOn} />
      <OfficersCard />
    </>,
    { faculties: { oficiales_sede: faculty } },
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("the switch of Oficiales por sede", () => {
  it("is there only with the faculty", async () => {
    await open(false);
    await expect.element(page.getByRole("switch", { name: "Mostrar en el flyer" })).toBeVisible();
    expect(theSwitch().query()).toBeNull();
  });

  it("with the faculty gone while it was on, it goes off and what was loaded goes too", async () => {
    const { form } = await open(false);
    form().update((state) => withOfficerPlace(withBranches(state, true), 0, "Rosario"));
    await vi.waitFor(() => {
      expect(form().getState().branches).toBe(false);
    });
    expect(form().getState().officers[0]?.ubic).toBe(`${BRANCH_PIN} `);
  });

  it("on, it opens the title and a place per officer, and what follows happens there", async () => {
    const onTurnedOn = vi.fn<() => void>();
    const { form } = await open(true, onTurnedOn);
    expect(page.getByTestId("branches-title").query()).toBeNull();

    await theSwitch().click();

    expect(form().getState().branches).toBe(true);
    expect(onTurnedOn).toHaveBeenCalledOnce();
    await expect.element(theSwitch()).toBeChecked();
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Oficiales por sede: ya podés cargar hasta 8 con su ubicación");
    const title = page.getByTestId("branches-title");
    await expect.element(title).toHaveFocus();
    await title.fill("Tus oficiales");
    expect(form().getState().branchesTitle).toBe("Tus oficiales");
    const place = page.getByTestId("officer-place-1");
    await expect.element(place).toHaveValue(`${BRANCH_PIN} `);
    await place.fill(`${BRANCH_PIN} Rosario`);
    expect(form().getState().officers[0]?.ubic).toBe(`${BRANCH_PIN} Rosario`);
  });

  it("off with nothing loaded, it goes without asking", async () => {
    const { form } = await open();
    form().update((state) => withBranches(state, true));
    await theSwitch().click();
    expect(form().getState().branches).toBe(false);
    await expect.element(page.getByRole("status")).toHaveTextContent("Oficiales por sede: apagado");
    expect(page.getByRole("alertdialog").query()).toBeNull();
  });

  it("off with something loaded, it asks first", async () => {
    const { form } = await open();
    form().update((state) => ({ ...withBranches(state, true), branchesTitle: "Tus oficiales" }));
    await theSwitch().click();
    const question = page.getByRole("alertdialog");
    await expect.element(question).toMatchTextContent(/¿Apagar "Oficiales por sede"\?/);
    await expect.element(question).toMatchTextContent(/Se borran las ubicaciones/);

    await question.getByRole("button", { name: "Cancelar" }).click();
    expect(form().getState().branches).toBe(true);

    await theSwitch().click();
    await page.getByRole("button", { name: "Apagar igual" }).click();
    expect(form().getState().branches).toBe(false);
    expect(form().getState().branchesTitle).toBe("");
    await expect.element(page.getByRole("status")).toHaveTextContent("Oficiales por sede: apagado");
  });
});
