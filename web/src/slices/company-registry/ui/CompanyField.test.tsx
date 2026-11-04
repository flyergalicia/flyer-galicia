import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { SearchableCompany } from "@/shared/domain/company-registry/index.ts";
import { jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { Inside } from "../testing/Inside.tsx";
import {
  FAILED_CONNECTION,
  type RegistryCloud,
  registryHarness,
} from "../testing/registry-cloud.ts";
import { CompanyField } from "./CompanyField.tsx";

const OFFICER = { nombre: "Ana Perez", celular: "11 1", email: "" };
const ACME = {
  empresa: "ACME S.A.",
  cuits: ["30711111111"],
  config: "Config 2",
  asesores: [OFFICER],
};
const BETA = { empresa: "BETA SA", cuits: ["30722222222"], config: "", asesores: [] };
const OWNER_COMPANY = {
  empresa: "DELTA FOODS",
  cuits: ["30900124615"],
  config: "BAU",
  asesores: [],
  user_id: "o1",
  dueno_nombre: "Pepito Gomez",
};
const NAMELESS = { empresa: "", cuits: ["307"], config: "BAU", asesores: [] };

function Host({
  onChoose,
  onOpenDatabase,
  note,
  start,
}: {
  readonly onChoose: (company: SearchableCompany) => void;
  readonly onOpenDatabase: () => void;
  readonly note?: string;
  readonly start: string;
}) {
  const [value, setValue] = useState(start);
  const [chosen, setChosen] = useState<SearchableCompany | null>(null);
  return (
    <>
      <button type="button">Afuera</button>
      <CompanyField
        placeholder="Nombre de la empresa"
        value={value}
        onChange={setValue}
        chosen={chosen}
        note={note ?? ""}
        onOpenDatabase={onOpenDatabase}
        onChoose={(company) => {
          setChosen(company);
          setValue(company.empresa);
          onChoose(company);
        }}
      />
    </>
  );
}

function open(cloud: RegistryCloud = {}, options: { note?: string; start?: string } = {}) {
  const onChoose = vi.fn<(company: SearchableCompany) => void>();
  const onOpenDatabase = vi.fn<() => void>();
  const harness = registryHarness({
    faculties: ["padron_buscar"],
    companies: [ACME, BETA],
    ...cloud,
  });
  void render(
    harness.wrap(
      <Inside>
        <Host
          onChoose={onChoose}
          onOpenDatabase={onOpenDatabase}
          start={options.start ?? ""}
          {...(options.note === undefined ? {} : { note: options.note })}
        />
      </Inside>,
    ),
  );
  return { harness, onChoose, onOpenDatabase };
}

const lens = () => page.getByTestId("company-search-button");
const field = () => page.getByTestId("company-name");
const list = () => page.getByTestId("company-search-list");
const query = () => page.getByTestId("company-search-query");
const options = () => list().getByTestId("company-option");
const suggestions = () => page.getByTestId("company-suggestions");
const suggested = () => suggestions().getByTestId("company-option");

function names(element: Element): (string | undefined)[] {
  return [...element.querySelectorAll('[data-part="name"]')].map((name) => name.textContent);
}

afterEach(() => {
  vi.restoreAllMocks();
});

async function loaded(cloud: RegistryCloud = {}) {
  const opened = open(cloud);
  await lens().click();
  await expect.element(options().first()).toBeVisible();
  await lens().click();
  return opened;
}

describe("without the permission", () => {
  it("is a plain field: no magnifying glass and no suggestion", async () => {
    const onFocus = vi.fn<() => void>();
    const harness = registryHarness({ faculties: [], companies: [ACME] });
    void render(
      harness.wrap(
        <Inside>
          <CompanyField
            placeholder="Nombre de la empresa"
            value="acme"
            onChange={() => undefined}
            onChoose={() => undefined}
            onOpenDatabase={() => undefined}
            onFocus={onFocus}
          />
        </Inside>,
      ),
    );

    await expect.element(page.getByPlaceholder("Nombre de la empresa")).toHaveValue("acme");
    expect(lens().elements()).toHaveLength(0);
    await userEvent.click(page.getByPlaceholder("Nombre de la empresa"));
    expect(onFocus).toHaveBeenCalled();
    expect(suggestions().elements()).toHaveLength(0);
  });
});

describe("the magnifying glass", () => {
  it("opens showing all of them, with the focus to write", async () => {
    open();
    await lens().click();

    await expect.element(query()).toHaveFocus();
    await expect.element(options().nth(1)).toBeVisible();
    expect(names(list().element())).toEqual(["ACME S.A.", "BETA SA"]);
    await expect
      .element(options().first())
      .toMatchTextContent(/30-71111111-1 — Config 2 · 1 oficial/);
    await expect.element(options().nth(1)).toMatchTextContent(/SIN CASHBACK · sin oficiales/);
  });

  it("dots do not count", async () => {
    open();
    await lens().click();
    await expect.element(options().nth(1)).toBeVisible();

    await query().fill("beta s.a.");
    await expect.element(list()).toMatchTextContent(/BETA SA/);
    expect(names(list().element())).toEqual(["BETA SA"]);
  });

  it("nothing found says so, as text", async () => {
    open();
    await lens().click();
    await expect.element(options().nth(1)).toBeVisible();

    await query().fill("<b>zzz</b>");

    await expect.element(list()).toHaveTextContent('Sin resultados para "<b>zzz</b>".');
  });

  it("nothing loaded says how to load them", async () => {
    const { onOpenDatabase } = open({ companies: [] });
    await lens().click();

    await expect.element(list()).toMatchTextContent(/Todavía no cargaste empresas/);
    await list()
      .getByRole("button", { name: /Cargar mis empresas/ })
      .click();

    expect(onOpenDatabase).toHaveBeenCalledOnce();
    await expect.element(list()).not.toBeInTheDocument();
  });

  it("a cut says it could not connect, and Reintentar brings them", async () => {
    let cut = true;
    const { harness } = open({
      companies: (request) => (cut ? FAILED_CONNECTION(request) : jsonResponse([ACME])),
    });
    await lens().click();

    await expect
      .element(list(), { timeout: 12_000 })
      .toMatchTextContent(/No se pudo conectar para traer tus empresas/);
    await expect.element(list()).not.toMatchTextContent(/Todavía no cargaste/);

    cut = false;
    await list()
      .getByRole("button", { name: /Reintentar/ })
      .click();
    await expect.element(options()).toBeVisible();
    expect(harness.network.to("/rest/v1/padron_empresas").length).toBeGreaterThan(1);
  });

  it("opening it again after a cut tries again by itself", async () => {
    let cut = true;
    open({ companies: (request) => (cut ? FAILED_CONNECTION(request) : jsonResponse([ACME])) });
    await lens().click();
    await expect.element(list(), { timeout: 12_000 }).toMatchTextContent(/No se pudo conectar/);
    await lens().click();
    await expect.element(list()).not.toBeInTheDocument();

    cut = false;
    await lens().click();

    await expect.element(options()).toBeVisible();
  });

  it("choosing one brings it, and it closes", async () => {
    const { onChoose } = open();
    await lens().click();
    await expect.element(options().nth(1)).toBeVisible();

    await options().nth(1).click();

    expect(onChoose).toHaveBeenCalledOnce();
    expect(onChoose.mock.calls[0]?.[0].empresa).toBe("BETA SA");
    await expect.element(list()).not.toBeInTheDocument();
    await expect.element(field()).toHaveValue("BETA SA");
  });

  it("the keyboard goes over the list, stays inside it, and Enter chooses", async () => {
    const { onChoose } = open();
    await lens().click();
    await expect.element(options().nth(1)).toBeVisible();
    await expect.element(options().first()).toHaveAttribute("data-on", "true");

    await userEvent.keyboard("{ArrowUp}");
    await expect.element(options().first()).toHaveAttribute("data-on", "true");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(options().nth(1)).toHaveAttribute("data-on", "true");
    await userEvent.keyboard("{Enter}");

    expect(onChoose.mock.calls[0]?.[0].empresa).toBe("BETA SA");
  });

  it("Enter with nothing found does nothing, and Escape closes", async () => {
    const { onChoose } = open();
    await lens().click();
    await expect.element(options().nth(1)).toBeVisible();
    await query().fill("zzz");

    await userEvent.keyboard("{Enter}");
    expect(onChoose).not.toHaveBeenCalled();

    await userEvent.keyboard("{Escape}");
    await expect.element(list()).not.toBeInTheDocument();
  });

  it("a click outside closes it, and so does its X", async () => {
    open();
    await lens().click();
    await expect.element(list()).toBeVisible();

    await page.getByRole("button", { name: "Afuera" }).click();
    await expect.element(list()).not.toBeInTheDocument();

    await lens().click();
    await page.getByTestId("company-search").getByLabelText("Cerrar").click();
    await expect.element(list()).not.toBeInTheDocument();
  });

  it("Administrar goes to Base de datos", async () => {
    const { onOpenDatabase } = open();
    await lens().click();

    await page.getByRole("button", { name: /Administrar/ }).click();

    expect(onOpenDatabase).toHaveBeenCalledOnce();
  });

  it("a name that is not there still reads", async () => {
    open({ companies: [NAMELESS] });
    await lens().click();

    await expect.element(options()).toMatchTextContent(/\(sin razón social\)/);
    await expect.element(options()).toMatchTextContent(/307 — BAU/);
  });
});

describe("the companies of a substitute", () => {
  const SUBSTITUTE = { substitutes: [OWNER_COMPANY] };

  it("come after one's own, with whose they are, and never as one's own", async () => {
    const { onChoose } = open(SUBSTITUTE);
    await lens().click();
    await expect.element(options().nth(2)).toBeVisible();

    await expect.element(options().nth(2)).toMatchTextContent(/Empresa de Pepito Gomez/);
    expect(names(list().element())[0]).toBe("ACME S.A.");
    await query().fill("30-90012461");
    await expect.element(options()).toMatchTextContent(/DELTA FOODS/);
    await options().click();

    expect(onChoose.mock.calls[0]?.[0]).toMatchObject({
      empresa: "DELTA FOODS",
      owner: { id: "o1", nombre: "Pepito Gomez" },
    });
  });

  it("whose name is not there is another officer", async () => {
    open({ substitutes: [{ ...OWNER_COMPANY, dueno_nombre: " " }] });
    await lens().click();

    await expect.element(options().nth(2)).toMatchTextContent(/Empresa de otro oficial/);
  });

  it("with nothing of one's own, they are still there", async () => {
    open({ companies: [], ...SUBSTITUTE });
    await lens().click();

    await expect.element(options()).toMatchTextContent(/DELTA FOODS/);
  });

  it("a cut in that list takes nothing away, and is asked again a minute later", async () => {
    const harness = open({
      functions_: { padron_suplencias: () => jsonResponse({ message: "x" }, 500) },
    });
    await lens().click();
    await expect.element(options().nth(1)).toBeVisible();
    expect(names(list().element())).toEqual(["ACME S.A.", "BETA SA"]);
    expect(harness.harness.network.to("/rest/v1/rpc/padron_suplencias").length).toBeGreaterThan(0);
  });

  it("a hunter does not ask for them", async () => {
    const { harness } = open({ role: "hunter", faculties: ["padron_buscar"], ...SUBSTITUTE });
    await expect.element(page.getByRole("textbox").first()).toBeVisible();

    expect(harness.network.to("/rest/v1/rpc/padron_suplencias")).toHaveLength(0);
  });
});

describe("while typing", () => {
  it("one letter or two digits are not enough", async () => {
    await loaded();

    await field().fill("a");
    expect(suggestions().elements()).toHaveLength(0);
    await field().fill("30");
    expect(suggestions().elements()).toHaveLength(0);
  });

  it("two letters or three digits are", async () => {
    await loaded();

    await field().fill("be");
    await expect.element(suggestions()).toMatchTextContent(/BETA SA/);
    await field().fill("307");
    await expect.element(suggested().nth(1)).toBeVisible();
    await field().fill("  ");
    await expect.element(suggestions()).not.toBeInTheDocument();
  });

  it("Enter brings the first, and the list goes away", async () => {
    const { onChoose } = await loaded();

    await field().fill("be");
    await expect.element(suggestions()).toBeVisible();
    await userEvent.keyboard("{Enter}");

    expect(onChoose.mock.calls[0]?.[0].empresa).toBe("BETA SA");
    await expect.element(suggestions()).not.toBeInTheDocument();
  });

  it("with exactly the name of the chosen one, it does not bother", async () => {
    await loaded();

    await field().fill("be");
    await suggested().click();
    await expect.element(field()).toHaveValue("BETA SA");
    await userEvent.click(field());

    expect(suggestions().elements()).toHaveLength(0);
  });

  it("the arrows go over them and Escape takes them away; the arrow brings them back", async () => {
    const { onChoose } = await loaded();
    await field().fill("307");
    await expect.element(suggested().nth(1)).toBeVisible();

    await userEvent.keyboard("{ArrowDown}");
    await expect.element(suggested().nth(1)).toHaveAttribute("data-on", "true");
    await userEvent.keyboard("{ArrowUp}");
    await expect.element(suggested().first()).toHaveAttribute("data-on", "true");
    await userEvent.keyboard("{Escape}");
    await expect.element(suggestions()).not.toBeInTheDocument();

    await userEvent.keyboard("{ArrowDown}");
    await expect.element(suggestions()).toBeVisible();
    await userEvent.keyboard("x");
    await field().fill("zzz");
    await userEvent.keyboard("{Enter}");
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("of more than eight it says there are more", async () => {
    const many = Array.from({ length: 10 }, (_, row) => ({
      empresa: `EMPRESA ${String(row)}`,
      cuits: [],
      config: "BAU",
    }));
    await loaded({ companies: many });

    await field().fill("empresa");

    await expect
      .element(suggestions())
      .toMatchTextContent(/Hay más coincidencias — abrí la lupa para verlas todas/);
    expect(suggested().elements()).toHaveLength(8);
  });

  it("a click outside takes them away, and the focus brings them back", async () => {
    await loaded();
    await field().fill("be");
    await expect.element(suggestions()).toBeVisible();

    await page.getByRole("button", { name: "Afuera" }).click();
    await expect.element(suggestions()).not.toBeInTheDocument();

    await userEvent.click(field());
    await expect.element(suggestions()).toBeVisible();
  });

  it("they stay under the field when the window changes", async () => {
    await loaded();
    await field().fill("be");
    await expect.element(suggestions()).toBeVisible();

    window.dispatchEvent(new Event("resize"));

    await expect.element(suggestions()).toBeVisible();
  });

  it("they show whose a company is", async () => {
    await loaded({ substitutes: [OWNER_COMPANY] });

    await field().fill("delta");

    await expect.element(suggestions()).toMatchTextContent(/Empresa de Pepito Gomez/);
  });

  it("after a cut they try again by themselves, and at most every 10 seconds", async () => {
    let cut = true;
    const { harness } = open({
      companies: (request) => (cut ? FAILED_CONNECTION(request) : jsonResponse([ACME])),
    });
    await lens().click();
    await expect.element(list(), { timeout: 12_000 }).toMatchTextContent(/No se pudo conectar/);
    await lens().click();

    cut = false;
    await field().fill("ac");
    await expect.element(suggestions()).toMatchTextContent(/ACME/);
    const asked = harness.network.to("/rest/v1/padron_empresas").length;

    await field().fill("acm");
    expect(harness.network.to("/rest/v1/padron_empresas")).toHaveLength(asked);
  });
});

describe("the note under the field", () => {
  it("is there only when it has something to say", async () => {
    open({}, { note: "Esta empresa no tiene oficiales asignados." });

    await expect
      .element(page.getByTestId("company-note"))
      .toHaveTextContent("⚠ Esta empresa no tiene oficiales asignados.");
  });

  it("nothing to say, nothing there", async () => {
    open();

    await expect.element(field()).toBeVisible();
    expect(page.getByTestId("company-note").elements()).toHaveLength(0);
  });
});
