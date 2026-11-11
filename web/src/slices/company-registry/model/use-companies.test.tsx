import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import { newCompany } from "@/shared/domain/company-registry/index.ts";
import { useSession } from "@/shared/session/index.ts";
import { createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { type Answer, deferred, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { Inside } from "@/shared/lib/testing/Inside.tsx";
import {
  databaseError,
  FAILED_CONNECTION,
  type RegistryCloud,
  registryHarness,
} from "../testing/registry-cloud.ts";
import {
  useCompanies,
  useSaveCompanies,
  useSearchableCompanies,
  useSubstituteCompanies,
  useUserId,
} from "./use-companies.ts";

const ACME = { empresa: "ACME SA", cuits: ["30711111111"], config: "BAU", asesores: [] };
const OWNER_COMPANY = {
  empresa: "DELTA FOODS",
  cuits: ["30900124615"],
  config: "BAU",
  asesores: [],
  user_id: "o1",
  dueno_nombre: "  Pepito Gomez ",
};

async function inside<T>(cloud: RegistryCloud, hook: () => T) {
  const harness = registryHarness(cloud);
  const wrapper = ({ children }: { readonly children: ReactNode }) =>
    harness.wrap(<Inside>{children}</Inside>);
  const { result } = await renderHook(hook, { wrapper });
  return { harness, result };
}

async function settled<T>(read: () => T | null): Promise<T> {
  return await vi.waitFor(() => {
    const value = read();
    if (value === null) throw new Error("The hook has not run yet");
    return value;
  });
}

function Outside({ children }: { readonly children: ReactNode }) {
  return useSession().status === "signed-out" ? children : null;
}

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("without a session", () => {
  it("there is nobody, and nothing is read", async () => {
    const harness = createAppHarness();
    const wrapper = ({ children }: { readonly children: ReactNode }) =>
      harness.wrap(<Outside>{children}</Outside>);
    const { result } = await renderHook(
      () => ({ user: useUserId(), companies: useCompanies(), borrowed: useSubstituteCompanies() }),
      { wrapper },
    );

    const { user, companies, borrowed } = await settled(() => result.current);

    expect(user).toBeNull();
    expect(companies.rows).toEqual([]);
    expect(borrowed.rows).toEqual([]);
    expect(harness.network.to("/rest/v1/padron_empresas")).toEqual([]);
  });
});

describe("the companies of the person", () => {
  it("reading again brings what the cloud has", async () => {
    let rows = [ACME];
    const { result } = await inside({ companies: () => jsonResponse(rows) }, () => useCompanies());
    await vi.waitFor(() => {
      expect(result.current?.rows).toHaveLength(1);
    });

    rows = [ACME, { ...ACME, empresa: "BETA SA" }];
    const read = await result.current.reload();

    expect(read?.map(({ empresa }) => empresa)).toEqual(["ACME SA", "BETA SA"]);
  });

  it("if it cannot, there is nothing to compare against, and that is not an empty list", async () => {
    const cloud = { fails: false };
    const { result } = await inside(
      { companies: () => (cloud.fails ? databaseError("falla") : jsonResponse([ACME])) },
      () => useCompanies(),
    );
    await vi.waitFor(() => {
      expect(result.current?.rows).toHaveLength(1);
    });

    cloud.fails = true;
    const read = await result.current.reload();

    expect(read).toBeNull();
    await vi.waitFor(() => {
      expect(result.current.failed).toBe(true);
    });
    // What was there before is still there.
    expect(result.current.rows).toHaveLength(1);
  });

  it("while it tries again with nothing to show, it is loading", async () => {
    const held = deferred<Response>();
    let answer: Answer = FAILED_CONNECTION;
    const { result } = await inside({ companies: (request) => answer(request) }, () =>
      useCompanies(),
    );
    // The client of the database tries a few times by itself before it gives up on a cut.
    await vi.waitFor(
      () => {
        expect(result.current?.failed).toBe(true);
      },
      { timeout: 15_000 },
    );

    answer = () => held.promise;
    const reading = result.current.reload();

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(true);
    });
    held.resolve(jsonResponse([ACME]));
    await reading;
    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(1);
    });
    expect(result.current.failed).toBe(false);
  });

  it("what was saved is the list from then on, without reading again", async () => {
    const { harness, result } = await inside({ companies: [] }, () => ({
      companies: useCompanies(),
      save: useSaveCompanies(),
    }));
    await vi.waitFor(() => {
      expect(result.current?.companies.loading).toBe(false);
    });
    const reads = harness.network.to("/rest/v1/padron_empresas").length;

    const done = await result.current.save([{ ...newCompany(), empresa: "ACME SA" }]);

    expect(done).toBe(true);
    await vi.waitFor(() => {
      expect(result.current.companies.rows).toHaveLength(1);
    });
    expect(harness.network.to("/rest/v1/padron_empresas")).toHaveLength(reads);
  });
});

describe("the companies of whoever chose this person as substitute", () => {
  it("say whose they are, and without a name they are of another officer", async () => {
    const { result } = await inside(
      {
        substitutes: [OWNER_COMPANY, { ...OWNER_COMPANY, empresa: "SIN NOMBRE", dueno_nombre: 5 }],
      },
      () => useSubstituteCompanies(),
    );

    await vi.waitFor(() => {
      expect(result.current?.rows).toHaveLength(2);
    });
    expect(result.current.rows.map(({ owner }) => owner)).toEqual([
      { id: "o1", nombre: "Pepito Gomez" },
      { id: "o1", nombre: "otro oficial" },
    ]);
  });

  it("an answer that is not a list is nobody's", async () => {
    const { harness, result } = await inside(
      { substitutes: () => jsonResponse({ nada: true }) },
      () => useSubstituteCompanies(),
    );

    await vi.waitFor(() => {
      expect(harness.network.to("/rest/v1/rpc/padron_suplencias")).toHaveLength(1);
    });
    expect(result.current?.rows ?? []).toEqual([]);
  });

  it("within a minute they are not asked for again, and after it they are", async () => {
    const { harness, result } = await inside({ substitutes: [OWNER_COMPANY] }, () =>
      useSubstituteCompanies(),
    );
    await vi.waitFor(() => {
      expect(result.current?.rows).toHaveLength(1);
    });
    const reads = () => harness.network.to("/rest/v1/rpc/padron_suplencias").length;

    await result.current.refreshIfOld();
    expect(reads()).toBe(1);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61_000);
    await result.current.refreshIfOld();

    expect(reads()).toBe(2);
  });

  it("a cut does not take away what was there", async () => {
    const cloud = { fails: false };
    const { result } = await inside(
      { substitutes: () => (cloud.fails ? databaseError("falla") : jsonResponse([OWNER_COMPANY])) },
      () => useSubstituteCompanies(),
    );
    await vi.waitFor(() => {
      expect(result.current?.rows).toHaveLength(1);
    });

    cloud.fails = true;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61_000);
    await result.current.refreshIfOld();

    expect(result.current.rows).toHaveLength(1);
  });

  it("a Hunter has none, and does not ask", async () => {
    const { harness, result } = await inside({ role: "hunter", substitutes: [OWNER_COMPANY] }, () =>
      useSubstituteCompanies(),
    );

    const { refreshIfOld } = await settled(() => result.current);
    await refreshIfOld();

    expect(result.current.rows).toEqual([]);
    expect(harness.network.to("/rest/v1/rpc/padron_suplencias")).toEqual([]);
  });
});

describe("what the search goes through", () => {
  it("one's own first, then the borrowed", async () => {
    const { result } = await inside({ companies: [ACME], substitutes: [OWNER_COMPANY] }, () =>
      useSearchableCompanies(),
    );

    await vi.waitFor(() => {
      expect(result.current?.map(({ empresa }) => empresa)).toEqual(["ACME SA", "DELTA FOODS"]);
    });
  });
});
