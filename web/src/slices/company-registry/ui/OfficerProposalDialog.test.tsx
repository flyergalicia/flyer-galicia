import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Inside } from "@/shared/lib/testing/Inside.tsx";
import { type RegistryCloud, registryHarness } from "../testing/registry-cloud.ts";
import { OfficerProposalDialog } from "./OfficerProposalDialog.tsx";

const OFFICER = { nombre: "Ana Perez", celular: "11 1", email: "a@b.c" };

function open(cloud: RegistryCloud = {}, officers: unknown = [OFFICER]) {
  const onSend = vi.fn<(officers: unknown, note: string) => Promise<boolean>>(() =>
    Promise.resolve(true),
  );
  const onClose = vi.fn<() => void>();
  const harness = registryHarness({ faculties: ["asesores_guardados"], ...cloud });
  void render(
    harness.wrap(
      <Inside>
        <OfficerProposalDialog
          title="✎ Proponer un cambio de oficiales"
          lead="ACME SA"
          officers={officers}
          base={[OFFICER]}
          noteLabel="Nota para el oficial (opcional)"
          notePlaceholder="Ej: el celular"
          sendLabel="Enviar propuesta"
          textIsEnough={false}
          onSend={onSend}
          onClose={onClose}
        />
      </Inside>,
    ),
  );
  return { harness, onSend, onClose };
}

const field = (what: string, slot = 1) =>
  page.getByLabelText(`${what} del oficial ${String(slot)}`);
const send = () => page.getByRole("button", { name: "Enviar propuesta" });
const slot = (position: number) => page.getByTestId("proposal-slot").nth(position);

afterEach(() => {
  localStorage.clear();
});

describe("proposing a change of officers", () => {
  it("asks for a change: a note alone is not enough", async () => {
    open();

    await expect.element(send()).toBeDisabled();
    await page.getByTestId("proposal-note").fill("Algo");
    await expect.element(send()).toBeDisabled();

    await field("Celular").fill("11 9");

    await expect.element(send()).toBeEnabled();
    await expect.element(page.getByText("Vas a proponer")).toBeVisible();
    await expect.element(page.getByText(/celular 11 1 → 11 9/)).toBeVisible();
  });

  it("sends the four places, and closes if it could", async () => {
    const { onSend, onClose } = open();

    await field("Celular").fill(" 11 9 ");
    await page.getByTestId("proposal-note").fill(" Cambió ");
    await send().click();

    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
    expect(onSend).toHaveBeenCalledWith(
      [
        { ...OFFICER, celular: "11 9" },
        { nombre: "", celular: "", email: "" },
        { nombre: "", celular: "", email: "" },
        { nombre: "", celular: "", email: "" },
      ],
      "Cambió",
    );
  });

  it("what is not a list starts empty", async () => {
    open({}, "nada");

    await expect.element(field("Nombre")).toHaveValue("");
  });

  it("the mail is deduced from the name until somebody writes it", async () => {
    open({}, []);

    await field("Nombre", 2).fill("Sol Ruiz");
    await expect.element(field("Mail", 2)).toHaveValue("sol.ruiz@bancogalicia.com.ar");

    await field("Nombre", 3).fill("");
    await field("Mail", 3).fill("x@y.z");
    await field("Mail", 3).fill("");
    await field("Nombre", 3).fill("Luis Gomez");
    await expect.element(field("Mail", 3)).toHaveValue("");
  });

  it("cancelling closes", async () => {
    const { onClose } = open();

    await page.getByRole("button", { name: "Cancelar" }).click();

    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("pasting", () => {
  it("opens with the cursor where the text goes", async () => {
    open();
    await slot(0).getByRole("button", { name: /Pegar/ }).click();
    await expect.element(page.getByLabelText("Pegar los datos del oficial 1")).toHaveFocus();
  });

  it("completes what it recognizes and says so", async () => {
    open({}, []);
    await slot(0).getByRole("button", { name: /Pegar/ }).click();

    await page
      .getByLabelText("Pegar los datos del oficial 1")
      .fill("Julieta De Santis, 11 3617-9603, julieta.desantis@bancogalicia.com.ar");

    await expect.element(field("Nombre")).toHaveValue("Julieta De Santis");
    await expect.element(field("Celular")).toHaveValue("11 3617-9603");
    await expect.element(field("Mail")).toHaveValue("julieta.desantis@bancogalicia.com.ar");
    await expect.element(page.getByText(/Completé: nombre, celular, mail/)).toBeVisible();
  });

  it("the mail is deduced when the text does not bring it", async () => {
    open({}, []);
    await slot(0).getByRole("button", { name: /Pegar/ }).click();

    await page.getByLabelText("Pegar los datos del oficial 1").fill("Ana Perez");

    await expect.element(field("Mail")).toHaveValue("ana.perez@bancogalicia.com.ar");
  });

  it("says when it found nothing, and keeps what was there", async () => {
    open();
    await slot(0).getByRole("button", { name: /Pegar/ }).click();

    await page.getByLabelText("Pegar los datos del oficial 1").fill("???");

    await expect.element(page.getByText("No encontré nada reconocible.")).toBeVisible();
    await expect.element(field("Nombre")).toHaveValue("Ana Perez");
    await slot(0).getByRole("button", { name: /Pegar/ }).click();
    expect(page.getByLabelText("Pegar los datos del oficial 1").elements()).toHaveLength(0);
  });
});

describe("the saved officers", () => {
  const SAVED = [
    { id: "a1", name: "Sol — Centro", nombre: "Sol Ruiz", celular: "11 5", email: "s@b.c" },
    { id: "a2", name: "", nombre: "", celular: "", email: "" },
  ];

  it("nobody saved says how to do it", async () => {
    open({ advisors: [] });

    await slot(0)
      .getByRole("button", { name: /Guardados/ })
      .click();

    await expect
      .element(page.getByTestId("saved-officers"))
      .toMatchTextContent(/Todavía no guardaste ningún oficial/);
    await userEvent.click(page.getByTestId("proposal-note"));
    await expect.element(page.getByTestId("saved-officers")).not.toBeInTheDocument();
  });

  it("choosing one fills in the place", async () => {
    open({ advisors: SAVED });
    await slot(1)
      .getByRole("button", { name: /Guardados/ })
      .click();

    await page.getByRole("button", { name: /Sol — Centro/ }).click();

    await expect.element(field("Nombre", 2)).toHaveValue("Sol Ruiz");
    await expect.element(field("Mail", 2)).toHaveValue("s@b.c");
    await expect.element(page.getByTestId("saved-officers")).not.toBeInTheDocument();
    await slot(2)
      .getByRole("button", { name: /Guardados/ })
      .click();
    await expect.element(page.getByText("(sin nombre)")).toBeVisible();
  });

  it("saving one needs a name", async () => {
    const { harness } = open({ advisors: [] }, []);

    await slot(0)
      .getByRole("button", { name: /Guardar este/ })
      .click();

    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Completá al menos el nombre para guardarlo.");
    expect(harness.network.to("/rest/v1/rpc/asesores_replace")).toHaveLength(0);
  });

  it("saving one goes first on the list", async () => {
    const { harness } = open({ advisors: SAVED.slice(0, 1) });

    await slot(0)
      .getByRole("button", { name: /Guardar este/ })
      .click();

    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Ana Perez guardado en tus oficiales.");
    const body = harness.network.to("/rest/v1/rpc/asesores_replace")[0]?.body;
    expect(JSON.stringify(body)).toContain('"nombre":"Ana Perez"');
    expect(JSON.stringify(body).indexOf("Ana Perez")).toBeLessThan(
      JSON.stringify(body).indexOf("Sol"),
    );
  });

  it("the one that is there is not saved twice", async () => {
    const { harness } = open({
      advisors: [{ id: "a", name: "Ana", nombre: "ANA PEREZ", celular: "", email: "A@B.C" }],
    });

    await slot(0)
      .getByRole("button", { name: /Guardar este/ })
      .click();

    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Ana Perez ya está en tus guardados.");
    expect(harness.network.to("/rest/v1/rpc/asesores_replace")).toHaveLength(0);
  });
});
