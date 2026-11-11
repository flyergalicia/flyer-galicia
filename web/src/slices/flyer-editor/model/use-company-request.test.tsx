// "Ver su flyer" of an action of Gestiones reaches the form.
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import {
  sanitizeCompanies,
  type SearchableCompany,
} from "@/shared/domain/company-registry/index.ts";
import {
  CommercialDeskContext,
  createCommercialDesk,
} from "@/shared/lib/commercial-actions/commercial-desk.ts";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { deferred, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { formHarness } from "../testing/form-on-screen.tsx";
import { companyOfRequest, useCompanyRequest } from "./use-company-request.ts";

const STORED = [
  { empresa: "ACME SUR", cuits: ["30900001118"], config: "BAU", asesores: [] },
  { empresa: "ACME", cuits: ["30900002114"], config: "BAU", asesores: [] },
  { empresa: "OTRA SA", cuits: ["30900003110"], config: "BAU", asesores: [] },
];
const COMPANIES = sanitizeCompanies(STORED);

function Stage({ bring }: { readonly bring: (company: SearchableCompany) => void }) {
  const session = useSession();
  const { loadStatus } = usePermissions();
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  return <Inner bring={bring} />;
}

function Inner({ bring }: { readonly bring: (company: SearchableCompany) => void }) {
  useCompanyRequest(bring);
  return null;
}

describe("the company of a request", () => {
  it("is first the one of that exact name", () => {
    const found = companyOfRequest({ company: "acme", taxIds: "30900001118" }, COMPANIES);
    expect(found?.empresa).toBe("ACME");
  });

  it("if not, the one of that CUIT", () => {
    const found = companyOfRequest(
      { company: "Cambió de nombre", taxIds: "30-90000311-0" },
      COMPANIES,
    );
    expect(found?.empresa).toBe("OTRA SA");
  });

  it("if not, the best match", () => {
    const found = companyOfRequest({ company: "SUR", taxIds: null }, COMPANIES);
    expect(found?.empresa).toBe("ACME SUR");
  });

  it("a short number is not a CUIT", () => {
    expect(companyOfRequest({ company: "zzz", taxIds: "123" }, COMPANIES)).toBeNull();
  });

  it("nothing, nothing", () => {
    expect(companyOfRequest({ company: "zzz", taxIds: null }, COMPANIES)).toBeNull();
  });
});

function aDesk() {
  return createCommercialDesk({ goTo: vi.fn<() => void>(), onRegister: vi.fn<() => void>() });
}

describe("on the editor", () => {
  it("brings it and says so", async () => {
    const harness = formHarness({ companies: STORED });
    const desk = aDesk();
    const bring = vi.fn<(company: SearchableCompany) => void>();
    await render(
      harness.wrap(
        <CommercialDeskContext.Provider value={desk}>
          <Stage bring={bring} />
        </CommercialDeskContext.Provider>,
      ),
    );
    await vi.waitFor(() => {
      expect(harness.network.to("/rest/v1/padron_empresas").length).toBeGreaterThan(0);
    });

    desk.showFlyer("flyer", { company: "OTRA SA", taxIds: null });

    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Listo: OTRA SA cargada en el armador.");
    expect(bring.mock.calls[0]?.[0].empresa).toBe("OTRA SA");
  });

  it("if it is not there, it says so", async () => {
    const harness = formHarness({ companies: STORED });
    const desk = aDesk();
    const bring = vi.fn<(company: SearchableCompany) => void>();
    await render(
      harness.wrap(
        <CommercialDeskContext.Provider value={desk}>
          <Stage bring={bring} />
        </CommercialDeskContext.Provider>,
      ),
    );
    await vi.waitFor(() => {
      expect(harness.network.to("/rest/v1/padron_empresas").length).toBeGreaterThan(0);
    });
    desk.showFlyer("flyer", { company: " NINGUNA ", taxIds: null });

    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("«NINGUNA» no está en tus empresas.");
    expect(bring).not.toHaveBeenCalled();
  });

  it("waits for the list when it arrives before it", async () => {
    const answer = deferred<Response>();
    const harness = formHarness({
      tables: { padron_empresas: () => answer.promise },
    });
    const desk = aDesk();
    desk.showFlyer("flyer", { company: "ACME", taxIds: null });
    const bring = vi.fn<(company: SearchableCompany) => void>();
    await render(
      harness.wrap(
        <CommercialDeskContext.Provider value={desk}>
          <Stage bring={bring} />
        </CommercialDeskContext.Provider>,
      ),
    );
    await vi.waitFor(() => {
      expect(harness.network.to("/rest/v1/padron_empresas").length).toBeGreaterThan(0);
    });
    expect(bring).not.toHaveBeenCalled();

    answer.resolve(jsonResponse(COMPANIES));

    await vi.waitFor(() => {
      expect(bring).toHaveBeenCalledOnce();
    });
  });

  it("if the companies could not be read it does not say it is not there", async () => {
    const harness = formHarness({
      tables: { padron_empresas: () => jsonResponse({ message: "falla" }, 500) },
    });
    const desk = aDesk();
    const bring = vi.fn<(company: SearchableCompany) => void>();
    await render(
      harness.wrap(
        <CommercialDeskContext.Provider value={desk}>
          <Stage bring={bring} />
        </CommercialDeskContext.Provider>,
      ),
    );
    await expect.element(page.getByRole("status")).toMatchTextContent(/No se pudieron traer/);
    // Flushed: without it this would pass before the notice had the time to change.
    flushSync(() => {
      desk.showFlyer("flyer", { company: "ACME", taxIds: null });
    });
    await expect
      .element(page.getByRole("status"))
      .not.toMatchTextContent(/no está en tus empresas/);
    expect(bring).not.toHaveBeenCalled();
  });
});
