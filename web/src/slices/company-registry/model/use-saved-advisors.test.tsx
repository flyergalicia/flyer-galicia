import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import { createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { useSession } from "@/shared/session/index.ts";
import { INVENTED_USER, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { Inside } from "@/shared/lib/testing/Inside.tsx";
import { databaseError, type RegistryCloud, registryHarness } from "../testing/registry-cloud.ts";
import { useSavedAdvisors } from "./use-saved-advisors.ts";

const LUIS = { id: "a1", name: "Luis", nombre: "Luis Sosa", celular: "11", email: "" };
const COPY_KEY = `fg_asesores_${INVENTED_USER.id}`;

async function inside(cloud: RegistryCloud) {
  const harness = registryHarness(cloud);
  const wrapper = ({ children }: { readonly children: ReactNode }) =>
    harness.wrap(<Inside>{children}</Inside>);
  const { result } = await renderHook(() => useSavedAdvisors(), { wrapper });
  return { harness, result };
}

function Outside({ children }: { readonly children: ReactNode }) {
  return useSession().status === "signed-out" ? children : null;
}

afterEach(() => {
  localStorage.clear();
});

describe("the advisors of the account", () => {
  it("the list as the cloud has it, once", async () => {
    const { harness, result } = await inside({ advisors: [LUIS] });
    await vi.waitFor(() => {
      expect(result.current?.loading).toBe(false);
    });
    const reads = harness.network.to("/rest/v1/asesores_guardados", "GET").length;

    const latest = await result.current.latest();

    expect(latest.map(({ nombre }) => nombre)).toEqual(["Luis Sosa"]);
    expect(harness.network.to("/rest/v1/asesores_guardados", "GET")).toHaveLength(reads);
  });

  it("if the cloud did not answer, whoever is about to add to it asks again", async () => {
    const cloud = { answers: false };
    const { harness, result } = await inside({
      advisors: () => (cloud.answers ? jsonResponse([LUIS]) : databaseError("falla")),
    });
    await vi.waitFor(() => {
      expect(harness.network.to("/rest/v1/asesores_guardados", "GET").length).toBeGreaterThan(0);
    });
    await vi.waitFor(() => {
      expect(result.current?.loading).toBe(false);
    });

    cloud.answers = true;
    const latest = await result.current.latest();

    expect(latest.map(({ nombre }) => nombre)).toEqual(["Luis Sosa"]);
  });

  it("what is saved stays in this browser too, and is the list from then on", async () => {
    const { result } = await inside({ advisors: [] });
    await vi.waitFor(() => {
      expect(result.current?.loading).toBe(false);
    });

    const done = await result.current.save([LUIS]);

    expect(done).toBe(true);
    expect(localStorage.getItem(COPY_KEY)).toContain("Luis Sosa");
    await vi.waitFor(() => {
      expect(result.current.rows).toHaveLength(1);
    });
  });
});

describe("without a session", () => {
  it("nothing stays in the browser under anybody's name", async () => {
    const harness = createAppHarness();
    const wrapper = ({ children }: { readonly children: ReactNode }) =>
      harness.wrap(<Outside>{children}</Outside>);
    const { result } = await renderHook(() => useSavedAdvisors(), { wrapper });
    await vi.waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    expect(result.current.rows).toEqual([]);
    expect(harness.network.to("/rest/v1/asesores_guardados", "GET")).toEqual([]);

    await result.current.save([LUIS]);

    expect(Object.keys(localStorage).filter((key) => key.startsWith("fg_asesores_"))).toEqual([]);
  });
});
