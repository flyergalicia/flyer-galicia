// What the shell hears about Gestiones without opening it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { INVENTED_USER, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { ADVISOR, type AppAnswers, createAppHarness } from "../testing/app-harness.tsx";
import type { WaitingNotice } from "../view-props.ts";
import { COMMERCIAL_NOTICES_QUERY_KEY } from "./commercial-notices-query.ts";
import { CommercialNoticeSource } from "./CommercialNoticeSource.tsx";

const ME = INVENTED_USER.id;
const FORWARDED = {
  serie_id: "s1",
  empresa: "ACME",
  origen: "derivada",
  estado: "planificada",
  creada_por: "o1",
  hunter_id: ME,
  dueno_id: "o1",
  visto_hunter: false,
  visto_dueno: true,
};
const PEOPLE = [{ id: "o1", nombre: "Mariana", rol: "vip" }];
const FILES = { "_facultades.json": { roles: { hunter: { gestiones: true } } } };

function Stage({ report }: { readonly report: (notice: WaitingNotice) => void }) {
  const session = useSession();
  const { loadStatus } = usePermissions();
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  return <CommercialNoticeSource report={report} />;
}

interface Cloud extends AppAnswers {
  readonly rows?: () => readonly object[] | null;
  readonly role?: string;
  readonly messages?: () => unknown;
  readonly proposals?: readonly object[];
}

async function open({ rows, role = "hunter", messages, proposals = [], ...answers }: Cloud = {}) {
  const reports: WaitingNotice[] = [];
  const harness = createAppHarness({
    commercialFlag: "on",
    files: FILES,
    profile: { ...ADVISOR, role },
    tables: {
      gestiones: () => {
        const answer = rows?.() ?? [];
        return answer === null ? jsonResponse({ message: "falla" }, 500) : jsonResponse(answer);
      },
      padron_propuestas: () => jsonResponse(proposals),
    },
    rpc: (request) => {
      if (request.path.endsWith("gestiones_personas")) return jsonResponse(PEOPLE);
      if (request.path.endsWith("gestiones_mensajes_nuevos")) {
        return jsonResponse(messages ? messages() : []);
      }
      return jsonResponse(null);
    },
    ...answers,
  });
  harness.storeSession();
  await render(
    harness.wrap(
      <Stage
        report={(notice) => {
          reports.push(notice);
        }}
      />,
    ),
  );
  return {
    reports,
    harness,
    last: () => reports.at(-1),
    reload: () => harness.queryClient.invalidateQueries({ queryKey: COMMERCIAL_NOTICES_QUERY_KEY }),
  };
}

const notice = () => page.getByRole("status");

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("what Gestiones tells the header", () => {
  it("the number, on its tab and on the name, and what it is", async () => {
    const { last } = await open({ rows: () => [FORWARDED] });
    await vi.waitFor(() => {
      expect(last()).toEqual({ count: 1, hint: "1 novedad en Gestiones", tabId: "gestiones" });
    });
  });

  it("in the plural", async () => {
    const { last } = await open({
      rows: () => [FORWARDED, { ...FORWARDED, serie_id: "s2" }],
    });
    await vi.waitFor(() => {
      expect(last()?.hint).toBe("2 novedades en Gestiones");
    });
  });

  it("the notice on entering, with the names", async () => {
    await open({ rows: () => [FORWARDED] });
    await expect
      .element(notice())
      .toHaveTextContent("Mariana te derivó una acción en ACME. Está en Gestiones.");
  });

  it("if the names cannot be read, it does not name anybody", async () => {
    await open({
      rows: () => [FORWARDED],
      rpc: (request) =>
        request.path.endsWith("gestiones_personas")
          ? jsonResponse({ message: "falla" }, 500)
          : jsonResponse([]),
    });
    await expect
      .element(notice())
      .toHaveTextContent("Un hunter te derivó una acción en ACME. Está en Gestiones.");
  });

  it("after that, only what arrives", async () => {
    let rows = [FORWARDED];
    const { reload } = await open({ rows: () => rows });
    await expect.element(notice()).toMatchTextContent(/te derivó una acción en ACME/);

    rows = [FORWARDED, { ...FORWARDED, serie_id: "s2", empresa: "OTRA" }];
    await reload();

    await expect.element(notice()).toMatchTextContent(/te derivó una acción en OTRA/);
    await expect.element(notice()).not.toMatchTextContent(/ACME/);
  });

  it("hears again every 90 seconds, and not before", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { harness } = await open();
    const reads = () => harness.network.to("/rest/v1/rpc/gestiones_mensajes_nuevos").length;
    await vi.waitFor(() => {
      expect(reads()).toBe(1);
    });

    await vi.advanceTimersByTimeAsync(80_000);
    expect(reads()).toBe(1);

    await vi.advanceTimersByTimeAsync(10_000);
    await vi.waitFor(() => {
      expect(reads()).toBe(2);
    });
  });

  it("with Gestiones off it asks nothing and says nothing", async () => {
    const { harness, last } = await open({ rows: () => [FORWARDED], commercialFlag: "off" });
    await vi.waitFor(() => {
      expect(last()).toEqual({ count: 0, hint: "0 novedades en Gestiones", tabId: "gestiones" });
    });
    expect(harness.network.to("/rest/v1/gestiones")).toEqual([]);
  });

  it("a failure keeps what was known", async () => {
    let rows: readonly object[] | null = [FORWARDED];
    const { last, reload } = await open({ rows: () => rows });
    await vi.waitFor(() => {
      expect(last()?.count).toBe(1);
    });
    rows = null;
    await reload();
    expect(last()?.count).toBe(1);
  });

  it("messages count, and if they fail the rest is still heard", async () => {
    const { last } = await open({
      rows: () => [FORWARDED],
      messages: () => ({ message: "no es una lista" }),
    });
    await vi.waitFor(() => {
      expect(last()?.count).toBe(1);
    });
  });

  it("a message is told", async () => {
    await open({
      messages: () => [
        { gestion_id: "g", empresa: "ACME", n: 1, ultimo_at: "x", ultimo_autor: "o1" },
      ],
    });
    await expect.element(notice()).toMatchTextContent(/Mariana te escribió sobre ACME/);
  });

  it("a leader hears what is to assign; another person is not asked", async () => {
    const leader = await open({
      role: "lider",
      files: { "_facultades.json": { roles: { lider: { gestiones: true } } } },
      rows: () => [{ serie_id: "s", empresa: "ACME", creada_por: "o1" }],
    });
    await vi.waitFor(() => {
      expect(leader.harness.network.requests.some(({ url }) => url.includes("lider_id=eq"))).toBe(
        true,
      );
    });
  });

  it("if the notice of proposals comes first, this one waits", async () => {
    vi.spyOn(window, "setTimeout");
    await open({
      rows: () => [FORWARDED],
      proposals: [{ id: "p", estado: "pendiente", dueno_id: ME, creada_por: "other" }],
    });
    await vi.waitFor(() => {
      expect(window.setTimeout).toHaveBeenCalledWith(expect.any(Function), 6500);
    });
  });
});
