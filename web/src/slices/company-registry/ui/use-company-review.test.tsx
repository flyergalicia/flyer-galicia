import { useEffect, useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import {
  type CompanyOfficer,
  emptyOfficer,
  sanitizeCompanies,
  type SearchableCompany,
} from "@/shared/domain/company-registry/index.ts";
import { jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import type { FlyerForm } from "../model/company-changes.ts";
import { useCompanies, useSubstituteCompanies } from "../model/use-companies.ts";
import { Inside } from "@/shared/lib/testing/Inside.tsx";
import { databaseError, type RegistryCloud, registryHarness } from "../testing/registry-cloud.ts";
import { NoCashbackDialog } from "./CompanyReviewDialogs.tsx";
import { type CompanyReview, useCompanyReview } from "./use-company-review.tsx";

const ANA = {
  nombre: "Ana Perez",
  celular: "11 4444 5555",
  email: "ana.perez@bancogalicia.com.ar",
};
const LUIS = {
  nombre: "Luis Gomez",
  celular: "11 4444 6666",
  email: "luis.gomez@bancogalicia.com.ar",
};
const ACME = {
  empresa: "ACME SA",
  cuits: ["30711111111"],
  config: "BAU",
  asesores: [ANA, LUIS],
  rubro: {},
};
const BETA = { ...ACME, empresa: "BETA SA", cuits: ["30722222222"] };
const DELTA = {
  ...ACME,
  empresa: "DELTA SA",
  cuits: ["30900123686"],
  user_id: "o1",
  dueno_nombre: "Pepito Gomez",
};

function namedCompany(empresa: string) {
  return { ...ACME, empresa };
}

function officers(...people: readonly CompanyOfficer[]): CompanyOfficer[] {
  return Array.from({ length: 4 }, (_, position) => people[position] ?? emptyOfficer());
}

const FORM: FlyerForm = {
  empresa: "ACME SA",
  cashback: 0,
  officers: officers(ANA, LUIS),
  officersShown: true,
  category: null,
};

interface Controls {
  review: CompanyReview;
  setForm: (form: Partial<FlyerForm>) => void;
  own: readonly SearchableCompany[];
  borrowed: readonly SearchableCompany[];
  note: string;
}

function Host({ onControls }: { readonly onControls: (controls: Controls) => void }) {
  const [note, setNote] = useState("");
  const form = useRef(FORM);
  const review = useCompanyReview({
    readForm: () => form.current,
    onNote: setNote,
  });
  const { rows } = useCompanies();
  const { rows: borrowed } = useSubstituteCompanies();
  useEffect(() => {
    onControls({
      review,
      own: rows,
      borrowed,
      note,
      setForm: (changes) => {
        form.current = { ...form.current, ...changes };
      },
    });
  });
  return <div data-testid="host">{review.dialog}</div>;
}

async function open(cloud: RegistryCloud = {}) {
  const controls: { current: Controls | null } = { current: null };
  const harness = registryHarness({
    faculties: ["padron_buscar"],
    companies: [ACME, BETA],
    ...cloud,
  });
  void render(
    harness.wrap(
      <Inside>
        <Host
          onControls={(latest) => {
            controls.current = latest;
          }}
        />
      </Inside>,
    ),
  );
  await vi.waitFor(() => {
    expect(controls.current?.own.length).toBeGreaterThan(0);
  });
  const get = (): Controls => {
    if (!controls.current) throw new Error("The host is not there");
    return controls.current;
  };
  return { harness, get };
}

const dialog = () => page.getByTestId("decision-dialog");
const yes = () => dialog().getByRole("button").last();
const no = () => dialog().getByRole("button").first();
const notice = () => page.getByRole("status");
const taxIds = () => page.getByLabelText("CUIT / CUITs del grupo");

function savedRows(harness: Awaited<ReturnType<typeof open>>["harness"]) {
  const body = harness.network.to("/rest/v1/rpc/padron_replace").at(-1)?.body;
  const rows: unknown =
    typeof body === "object" && body !== null ? Reflect.get(body, "p_rows") : [];
  return sanitizeCompanies(rows);
}

async function bringAcme(get: () => Controls): Promise<void> {
  const company = get().own.find(({ empresa }) => empresa === "ACME SA");
  if (!company) throw new Error("There is no ACME");
  get().review.companyBrought(company);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("after downloading a flyer of a company", () => {
  it("nothing is asked when nothing changed", async () => {
    const { get } = await open();
    await bringAcme(get);

    get().review.reviewAfterDownload();

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(dialog().elements()).toHaveLength(0);
  });

  it("a change is offered and saved, with the tax ids of the dialog", async () => {
    const { get, harness } = await open();
    await bringAcme(get);
    get().setForm({ officers: officers({ ...ANA, celular: "11 7777 8888" }, LUIS) });

    get().review.reviewAfterDownload();

    await expect.element(dialog()).toMatchTextContent(/Actualizar mis empresas/);
    await expect.element(dialog()).toMatchTextContent(/11 4444 5555 → 11 7777 8888/);
    await expect.element(taxIds()).toHaveValue("30-71111111-1");
    await taxIds().fill("30-71111111-1, 30-79999999-9");
    await yes().click();

    await expect.element(notice()).toHaveTextContent("Empresa actualizada: ACME SA");
    await expect.element(dialog()).not.toBeInTheDocument();
    const saved = savedRows(harness);
    expect(saved).toHaveLength(2);
    expect(saved[0]?.empresa, "the name is never touched").toBe("ACME SA");
    expect(saved[0]?.cuits).toEqual(["30711111111", "30799999999"]);
    expect(saved[0]?.asesores[0]?.celular).toBe("11 7777 8888");
  });

  it("what cannot be saved leaves the company as it was", async () => {
    const { get } = await open({
      functions_: { padron_replace: () => databaseError("falla simulada") },
    });
    await bringAcme(get);
    get().setForm({ cashback: 1, officers: officers({ ...ANA, nombre: "Otro" }) });

    get().review.reviewAfterDownload();
    await expect.element(dialog()).toBeVisible();
    await yes().click();

    await expect
      .element(notice())
      .toHaveTextContent("Error al guardar tus empresas: falla simulada");
    await expect.element(dialog()).not.toBeInTheDocument();
    expect(get().own[0]?.config).toBe("BAU");
    expect(get().own[0]?.asesores[0]?.nombre).toBe("Ana Perez");
  });

  it("saying no holds until something else changes", async () => {
    const { get, harness } = await open();
    await bringAcme(get);
    get().setForm({ cashback: 1 });
    get().review.reviewAfterDownload();
    await expect.element(dialog()).toBeVisible();

    await no().click();
    await expect.element(dialog()).not.toBeInTheDocument();
    expect(harness.network.to("/rest/v1/rpc/padron_replace")).toHaveLength(0);

    get().review.reviewAfterDownload();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(dialog().elements()).toHaveLength(0);

    get().setForm({ cashback: 2 });
    get().review.reviewAfterDownload();
    await expect.element(dialog()).toBeVisible();
  });

  it("a removed officer goes marked, and hiding them all warns", async () => {
    const { get } = await open();
    await bringAcme(get);
    get().setForm({ officers: officers(), officersShown: false });

    get().review.reviewAfterDownload();

    await expect
      .element(page.getByTestId("decision-alert"))
      .toMatchTextContent(/queda guardada sin sus oficiales/);
    expect(dialog().element().querySelectorAll('[data-danger="true"]')).toHaveLength(2);
  });

  it("the company that ends up without officers says so under the field", async () => {
    const { get } = await open();
    await bringAcme(get);
    get().setForm({ officers: officers() });
    get().review.reviewAfterDownload();
    await expect.element(dialog()).toBeVisible();

    await yes().click();

    await vi.waitFor(() => {
      expect(get().note).toBe("Esta empresa no tiene oficiales asignados.");
    });
  });

  it("the same tax id on another name warns, and does not stop", async () => {
    const { get } = await open();
    get().setForm({ empresa: "ACME GRUPO" });

    get().review.reviewAfterDownload();

    await expect.element(dialog()).toMatchTextContent(/Agregar a mis empresas/);
    await expect.element(dialog()).toMatchTextContent(/no pisa ninguna/);
    await expect.element(taxIds()).toHaveFocus();
    await expect.element(dialog()).toMatchTextContent(/Opcional\. Si la empresa es un grupo/);

    await taxIds().fill("30-71111111-1, 307");
    await expect.element(dialog()).toMatchTextContent(/Se guardan 2:/);
    await expect.element(dialog()).toMatchTextContent(/1 no tiene 11 dígitos/);
    await expect
      .element(dialog())
      .toMatchTextContent(/Ese CUIT ya figura en ACME SA.*Se guarda igual/);
  });

  it("of several with the same tax id it names three and says the rest", async () => {
    const rows = ["A", "B", "C", "D", "E"].map(namedCompany);
    const { get } = await open({ companies: rows });
    get().setForm({ empresa: "NUEVA" });
    get().review.reviewAfterDownload();
    await expect.element(taxIds()).toBeVisible();

    await taxIds().fill("307, 30711111111");

    await expect.element(dialog()).toMatchTextContent(/A, B, C y 2 más/);
    await expect.element(dialog()).toMatchTextContent(/1 no tiene/);
    await taxIds().fill("30711111111, 3, 4");
    await expect.element(dialog()).toMatchTextContent(/2 no tienen 11 dígitos/);
  });

  it("a new name is added apart, with its summary", async () => {
    const { get, harness } = await open();
    get().setForm({
      empresa: " NUEVA SRL ",
      cashback: -1,
      officers: officers(
        { nombre: "Sol Ruiz", celular: "11 5", email: "s@b.c" },
        { nombre: "Dos", celular: "", email: "" },
      ),
      category: { opcion: 0, importe: "", importe2: "", txt: "" },
    });

    get().review.reviewAfterDownload();

    await expect.element(dialog()).toMatchTextContent(/Cashback: Sin cashback/);
    await expect.element(dialog()).toMatchTextContent(/Oficial 1: Sol Ruiz · 11 5/);
    await taxIds().fill("30-72222222-2");
    await yes().click();

    await expect
      .element(notice())
      .toHaveTextContent('"NUEVA SRL" agregada a tus empresas (1 CUIT)');
    const saved = savedRows(harness);
    expect(saved.map(({ empresa }) => empresa)).toEqual(["ACME SA", "BETA SA", "NUEVA SRL"]);
    expect(saved.at(-1)?.cuits).toEqual(["30722222222"]);
    expect(saved.at(-1)?.config).toBe("");
  });

  it("the summary of a new one with no officers says so, and a category too", async () => {
    const { get } = await open({
      files: {
        "_opciones.json": { opts: [{ n: 1 }, { n: 4, nombre: "Combustible", solapa: "rubros" }] },
      },
    });
    get().setForm({
      empresa: "NUEVA",
      officers: officers(),
      category: { opcion: 4, importe: "1000", importe2: "", txt: "" },
    });

    get().review.reviewAfterDownload();

    await expect.element(dialog()).toMatchTextContent(/Sin oficiales asignados/);
    await expect.element(dialog()).toMatchTextContent(/Rubro: Combustible · \$1\.000/);
    await yes().click();
    await expect.element(notice()).toHaveTextContent('"NUEVA" agregada a tus empresas');
  });

  it("saying no to a new one holds for that name, and a failure keeps nothing", async () => {
    const { get } = await open({
      functions_: { padron_replace: () => databaseError("falla") },
    });
    get().setForm({ empresa: "NUEVA" });
    get().review.reviewAfterDownload();
    await expect.element(dialog()).toBeVisible();

    await no().click();
    await expect.element(dialog()).not.toBeInTheDocument();
    get().review.reviewAfterDownload();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(dialog().elements()).toHaveLength(0);

    get().setForm({ empresa: "OTRA NUEVA" });
    get().review.reviewAfterDownload();
    await expect.element(dialog()).toBeVisible();
    await yes().click();
    await expect.element(notice()).toHaveTextContent("Error al guardar tus empresas: falla");
    expect(get().own).toHaveLength(2);
  });

  it("a name typed by hand finds the company it is", async () => {
    const { get } = await open();
    get().setForm({ empresa: "beta sa", cashback: 1 });

    get().review.reviewAfterDownload();

    await expect.element(dialog()).toMatchTextContent(/Generaste el flyer de BETA SA/);
  });

  it("no name asks nothing, and forgets the company", async () => {
    const { get } = await open();
    await bringAcme(get);
    get().setForm({ empresa: "  ", cashback: 1 });

    get().review.reviewAfterDownload();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(dialog().elements()).toHaveLength(0);

    get().review.companyForgotten();
    get().setForm({ empresa: "ACME SA" });
    get().review.reviewAfterDownload();
    await expect.element(dialog()).toMatchTextContent(/Generaste el flyer de ACME SA/);
  });

  it("with a list that could not be read it offers nothing: saving would wipe it out", async () => {
    const harness = registryHarness({
      faculties: ["padron_buscar"],
      companies: () => databaseError("falla"),
    });
    const controls: { current: Controls | null } = { current: null };
    void render(
      harness.wrap(
        <Inside>
          <Host
            onControls={(latest) => {
              controls.current = latest;
            }}
          />
        </Inside>,
      ),
    );
    await expect.element(notice()).toMatchTextContent(/No se pudieron traer tus empresas/);
    controls.current?.setForm({ empresa: "NUEVA" });

    controls.current?.review.reviewAfterDownload();
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(dialog().elements()).toHaveLength(0);
    expect(harness.network.to("/rest/v1/rpc/padron_replace")).toHaveLength(0);
  });

  it("without the permission nothing is asked", async () => {
    const harness = registryHarness({ faculties: [], companies: [ACME] });
    const controls: { current: Controls | null } = { current: null };
    void render(
      harness.wrap(
        <Inside>
          <Host
            onControls={(latest) => {
              controls.current = latest;
            }}
          />
        </Inside>,
      ),
    );
    await vi.waitFor(() => {
      expect(controls.current).not.toBeNull();
    });
    controls.current?.setForm({ empresa: "OTRA" });

    controls.current?.review.reviewAfterDownload();

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(dialog().elements()).toHaveLength(0);
  });

  it("a click outside does not close it", async () => {
    const { get } = await open();
    await bringAcme(get);
    get().setForm({ cashback: 1 });
    get().review.reviewAfterDownload();
    await expect.element(dialog()).toBeVisible();

    await userEvent.click(dialog().element().parentElement ?? document.body, {
      position: { x: 2, y: 2 },
    });

    await expect.element(dialog()).toBeVisible();
  });
});

describe("a company of whoever chose this person as substitute", () => {
  const SUBSTITUTE = { substitutes: [DELTA] };

  async function bringDelta(cloud: RegistryCloud = {}) {
    const opened = await open({ ...SUBSTITUTE, ...cloud });
    await vi.waitFor(() => {
      expect(opened.get().borrowed).toHaveLength(1);
    });
    const company = opened.get().borrowed[0];
    if (!company) throw new Error("There is no borrowed company");
    opened.get().review.companyBrought(company);
    opened.get().setForm({
      empresa: "DELTA SA",
      officers: officers({ nombre: "Carla Nueva", celular: "11 6", email: "" }, LUIS),
    });
    return opened;
  }

  it("a change is requested, never saved", async () => {
    const { get, harness } = await bringDelta();

    get().review.reviewAfterDownload();

    await expect.element(dialog()).toMatchTextContent(/Cambios en una empresa de Pepito Gomez/);
    await expect.element(dialog()).toMatchTextContent(/Carla Nueva/);
    expect(taxIds().elements(), "no tax id to complete").toHaveLength(0);
    await expect.element(yes()).toHaveTextContent("Pedírselo a Pepito Gomez");
    await yes().click();

    await expect
      .element(notice())
      .toHaveTextContent(
        "Listo: Pepito Gomez va a ver el pedido en Cambios pendientes y decide si lo guarda.",
      );
    const body = harness.network.to("/rest/v1/rpc/padron_suplencia_proponer")[0]?.body;
    expect(body).toMatchObject({
      p_empresa: "DELTA SA",
      p_dueno: "o1",
      p_config: null,
      p_rubro: null,
      p_nota: null,
    });
    expect(harness.network.to("/rest/v1/rpc/padron_replace")).toHaveLength(0);
    expect(
      get().own.map(({ empresa }) => empresa),
      "and it did not join one's own",
    ).toEqual(["ACME SA", "BETA SA"]);

    get().review.reviewAfterDownload();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(dialog().elements(), "it does not ask again for the same").toHaveLength(0);
  });

  it("the cashback and the category travel only if they changed", async () => {
    const { get, harness } = await bringDelta();
    get().setForm({
      cashback: -1,
      category: { opcion: 4, importe: "1", importe2: "", txt: "" },
    });

    get().review.reviewAfterDownload();
    await expect.element(dialog()).toBeVisible();
    await yes().click();

    await expect.element(notice()).toMatchTextContent(/va a ver el pedido/);
    expect(harness.network.to("/rest/v1/rpc/padron_suplencia_proponer")[0]?.body).toMatchObject({
      p_config: "",
      p_rubro: { opcion: 4, importe: "1" },
    });
  });

  it("saying no holds", async () => {
    const { get, harness } = await bringDelta();
    get().review.reviewAfterDownload();
    await expect.element(dialog()).toBeVisible();

    await no().click();

    await expect.element(dialog()).not.toBeInTheDocument();
    expect(harness.network.to("/rest/v1/rpc/padron_suplencia_proponer")).toHaveLength(0);
  });

  const refusals: readonly (readonly [string, string, boolean])[] = [
    [
      "ya hay un pedido abierto",
      "Esa empresa ya tiene un pedido de cambio esperando a Pepito Gomez.",
      true,
    ],
    ["no sos suplente", "Ya no sos suplente de Pepito Gomez: no se envió el pedido.", false],
    ["otra cosa", "No se pudo enviar el pedido: otra cosa", true],
  ];
  for (const [refusal, said, stays] of refusals) {
    it(`"${refusal}" says so`, async () => {
      const { get } = await bringDelta({
        functions_: { padron_suplencia_proponer: () => databaseError(refusal) },
      });
      get().review.reviewAfterDownload();
      await expect.element(dialog()).toBeVisible();

      await yes().click();

      await expect.element(notice()).toHaveTextContent(said);
      await vi.waitFor(() => {
        expect(dialog().elements().length > 0).toBe(stays);
      });
    });
  }

  it("when the owner takes the person out, it is another company", async () => {
    let listed = true;
    const { get } = await bringDelta({
      functions_: { padron_suplencias: () => jsonResponse(listed ? [DELTA] : []) },
    });
    listed = false;
    await get().review.dialog;

    expect(get().borrowed).toHaveLength(1);
  });

  it("a name that changed goes through one's own list", async () => {
    const { get } = await bringDelta();
    get().setForm({ empresa: "ACME SA", cashback: 1 });

    get().review.reviewAfterDownload();

    await expect.element(dialog()).toMatchTextContent(/Actualizar mis empresas/);
  });
});

describe("a company marked without cashback", () => {
  it("says so when it is brought", async () => {
    const onClose = vi.fn<() => void>();
    const harness = registryHarness();
    void render(harness.wrap(<NoCashbackDialog company="" onClose={onClose} />));

    await expect
      .element(dialog())
      .toMatchTextContent(/Esta empresa está marcada como sin cashback/);
    await dialog().getByRole("button", { name: "Entendido" }).click();

    expect(onClose).toHaveBeenCalledOnce();
  });
});
