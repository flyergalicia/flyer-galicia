// When the list of designs is read, and what happens with what arrives late.
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import { createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { type Answer, deferred, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { aDesign } from "../testing/studio-on-screen.ts";
import { useDesignsList } from "./use-designs-list.ts";

interface HookProps {
  readonly active: boolean;
}

function open(table: Answer, isActive = true, refreshMs?: number) {
  const harness = createAppHarness({
    tables: { flyer_disenos: table, flyer_diseno_mensajes: () => jsonResponse([]) },
  });
  harness.storeSession();
  return renderHook((props?: HookProps) => useDesignsList(props?.active ?? isActive, refreshMs), {
    initialProps: { active: isActive },
    wrapper: ({ children }) => harness.wrap(children),
  });
}

describe("the list of designs", () => {
  it("is read every so often while the screen is on top, and not when it is not", async () => {
    let reads = 0;
    const { rerender } = await open(
      () => {
        reads += 1;
        return jsonResponse([aDesign(`read-${String(reads)}`)]);
      },
      true,
      30,
    );
    await vi.waitFor(() => {
      expect(reads).toBeGreaterThan(2);
    });
    await rerender({ active: false });
    await new Promise((resolve) => {
      setTimeout(resolve, 60);
    });
    const afterHiding = reads;
    await new Promise((resolve) => {
      setTimeout(resolve, 120);
    });
    expect(reads).toBe(afterHiding);
    await rerender({ active: true });
    await vi.waitFor(() => {
      expect(reads).toBeGreaterThan(afterHiding);
    });
  });

  it("what was asked for while it was reading is not lost: the read starts over", async () => {
    const slow = deferred<Response>();
    let reads = 0;
    const answers = [
      () => jsonResponse([aDesign("first")]),
      () => slow.promise,
      () => jsonResponse([aDesign("new")]),
    ];
    const { result } = await open(() => {
      reads += 1;
      return answers[reads - 1]?.() ?? jsonResponse([]);
    });
    await vi.waitFor(() => {
      expect(result.current.designs).toHaveLength(1);
    });
    void result.current.reload();
    await vi.waitFor(() => {
      expect(reads).toBe(2);
    });
    await result.current.reload();
    await vi.waitFor(() => {
      expect(result.current.designs?.map(({ id }) => id)).toEqual(["new"]);
    });
    slow.resolve(jsonResponse([aDesign("old")]));
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(result.current.designs?.map(({ id }) => id)).toEqual(["new"]);
  });

  it("one design is read alone, and a failure there leaves what is on screen", async () => {
    let isCut = false;
    const { result } = await open(({ query }) => {
      if (isCut) throw new TypeError("Failed to fetch");
      return query.has("id")
        ? jsonResponse(aDesign("a", { nombre: "Otro" }))
        : jsonResponse([aDesign("a")]);
    });
    await vi.waitFor(() => {
      expect(result.current.designs).toHaveLength(1);
    });
    await result.current.refreshOne("a");
    await vi.waitFor(() => {
      expect(result.current.designs?.[0]?.nombre).toBe("Otro");
    });
    isCut = true;
    await result.current.refreshOne("a");
    expect(result.current.designs?.[0]?.nombre).toBe("Otro");
  });

  it("a failure is not an empty list", async () => {
    const { result } = await open(() => jsonResponse({ message: "no" }, 500));
    await vi.waitFor(() => {
      expect(result.current.failure).not.toBeNull();
    });
    expect(result.current.designs).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("the administrator opens on the requests according to what was read", async () => {
    const { result } = await open(() => jsonResponse([aDesign("a", { estado: "pedido" })]));
    await vi.waitFor(() => {
      expect(result.current.isRequestWaiting).toBe(true);
    });
  });
});
