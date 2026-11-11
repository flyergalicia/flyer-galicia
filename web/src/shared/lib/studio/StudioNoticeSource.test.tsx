// What the shell hears about Estudio without opening it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { INVENTED_USER, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { ADVISOR, type AppAnswers, createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import type { WaitingNotice } from "../view-props.ts";
import { StudioNoticeSource } from "./StudioNoticeSource.tsx";

const SEEN_KEY = `fg_est_avisados_${INVENTED_USER.id}`;
const NOTICE = { compartido_por: null, compartido_at: null };
const asked = (id: string, nombre: string) => ({ id, nombre, estado: "consulta", ...NOTICE });
const shared = (id: string, nombre: string) => ({
  id,
  nombre,
  estado: "privado",
  compartido_por: "Admin",
  compartido_at: "2026-10-23",
});

function Stage({ report }: { readonly report: (notice: WaitingNotice) => void }) {
  const session = useSession();
  const { loadStatus } = usePermissions();
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  return <StudioNoticeSource report={report} />;
}

async function open(rows: readonly unknown[] | null, answers: AppAnswers = {}) {
  const reports: WaitingNotice[] = [];
  const harness = createAppHarness({
    tables: {
      flyer_disenos: () =>
        rows ? jsonResponse(rows) : jsonResponse({ message: "Failed to fetch" }, 500),
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
  return { reports, harness, last: () => reports.at(-1) };
}

const notice = () => page.getByRole("status");

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("the notices of Estudio", () => {
  it("a question of the administrator goes on the tab and on the envelope", async () => {
    const { last } = await open([asked("a", "Mío")]);
    await vi.waitFor(() => {
      expect(last()).toEqual({
        count: 1,
        hint: "1 pregunta sobre un diseño de Estudio",
        tabId: "estudio",
      });
    });
    await expect
      .element(notice())
      .toHaveTextContent(
        "El administrador te hizo una pregunta sobre «Mío». Respondela en Estudio.",
      );
  });

  it("several are counted", async () => {
    const { last } = await open([asked("a", "Uno"), asked("b", "Dos")]);
    await vi.waitFor(() => {
      expect(last()?.hint).toBe("2 preguntas sobre diseños de Estudio");
    });
    await expect
      .element(notice())
      .toHaveTextContent(
        "El administrador te hizo preguntas sobre 2 diseños. Respondelas en Estudio.",
      );
  });

  it("a copy from the administrator is told once on this computer", async () => {
    await open([shared("a", "Copia")]);
    await expect
      .element(notice())
      .toHaveTextContent("Admin te compartió «Copia». Lo tenés en la solapa Estudio.");
    expect(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]")).toEqual(["a@2026-10-23"]);
    const again = await open([shared("a", "Copia")]);
    await vi.waitFor(() => {
      expect(again.reports.length).toBeGreaterThan(0);
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });
    expect(document.querySelector('[role="status"][data-visible="true"]')).toBeNull();
  });

  it("a new version of the copy is told again, and several are counted", async () => {
    localStorage.setItem(SEEN_KEY, JSON.stringify(["a@vieja", 3]));
    await open([shared("a", "Una"), shared("b", "Otra")]);
    await expect
      .element(notice())
      .toHaveTextContent("Te compartieron 2 diseños. Los tenés en la solapa Estudio.");
  });

  it("without storage it still tells", async () => {
    const real: typeof Storage.prototype.setItem = Reflect.get(Storage.prototype, "setItem");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function setItem(
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === SEEN_KEY) throw new Error("no room");
      real.call(this, key, value);
    });
    await open([shared("a", "Copia")]);
    await expect.element(notice()).toMatchTextContent("te compartió");
  });

  it("what is saved badly in the browser counts as nothing", async () => {
    localStorage.setItem(SEEN_KEY, "no es json{");
    await open([shared("a", "Copia")]);
    await expect.element(notice()).toMatchTextContent("te compartió");
    localStorage.setItem(SEEN_KEY, JSON.stringify({ not: "a list" }));
  });

  it("with nothing waiting it says nothing", async () => {
    const { last } = await open([{ id: "a", nombre: "x", estado: "privado", ...NOTICE }, 7, null]);
    await vi.waitFor(() => {
      expect(last()).toMatchObject({ count: 0 });
    });
    expect(document.querySelector('[role="status"][data-visible="true"]')).toBeNull();
  });

  it("a read that fails is not news: no number and no notice", async () => {
    const { last } = await open(null);
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
    expect(last()).toMatchObject({ count: 0 });
    expect(document.querySelector('[role="status"][data-visible="true"]')).toBeNull();
  });

  it("an administrator hears the requests only on the tab", async () => {
    const { last, harness } = await open(null, {
      profile: { ...ADVISOR, role: "admin" },
      tables: {
        flyer_disenos: () =>
          new Response(null, { status: 200, headers: { "Content-Range": "*/3" } }),
      },
    });
    await vi.waitFor(() => {
      expect(last()).toEqual({ count: 3, hint: "", tabId: "estudio", onlyOnTab: true });
    });
    const { method, query } = harness.network.to("/rest/v1/flyer_disenos")[0] ?? {};
    expect(method).toBe("HEAD");
    expect(query?.get("tipo")).toBe("in.(diseno,fuente)");
    expect(query?.get("estado")).toBe("eq.pedido");
  });

  it("a count that fails is not zero news", async () => {
    const { last } = await open(null, {
      profile: { ...ADVISOR, role: "admin" },
      tables: { flyer_disenos: () => new Response(null, { status: 500 }) },
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
    expect(last()).toMatchObject({ count: 0 });
  });

  it("hunters and leaders have no Estudio, and hear nothing", async () => {
    const { harness } = await open([asked("a", "Mío")], {
      profile: { ...ADVISOR, role: "hunter" },
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
    expect(harness.network.to("/rest/v1/flyer_disenos")).toEqual([]);
  });
});
