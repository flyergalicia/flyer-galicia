import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { type AppAnswers, ADVISOR, createAppHarness } from "../testing/app-harness.tsx";
import { useSession, usePermissions } from "@/shared/session/index.ts";
import { INVENTED_USER, jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import type { WaitingNotice } from "../view-props.ts";
import { MyProposalsSource, PendingProposalsSource } from "./proposal-notices.tsx";
import { useMyProposals, usePendingProposals } from "./proposals-query.ts";

const PENDING = {
  id: "p1",
  empresa: "ACME",
  estado: "pendiente",
  creada_por: "otro",
  dueno_id: INVENTED_USER.id,
  created_at: "2020-10-20T10:00:00Z",
};

function Inside({
  source: Source,
  report,
}: {
  readonly source: typeof PendingProposalsSource;
  readonly report: (notice: WaitingNotice) => void;
}) {
  const session = useSession();
  const { loadStatus } = usePermissions();
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  return <Source report={report} />;
}

function open(rows: unknown, source: typeof PendingProposalsSource, answers: AppAnswers = {}) {
  const reports: WaitingNotice[] = [];
  const harness = createAppHarness({
    ...answers,
    tables: { padron_propuestas: () => jsonResponse(rows) },
  });
  harness.storeSession();
  void render(
    harness.wrap(
      <Inside
        source={source}
        report={(notice) => {
          reports.push(notice);
        }}
      />,
    ),
  );
  return { harness, reports };
}

const notice = () => page.getByRole("status");
const lastCount = (reports: readonly WaitingNotice[]) => reports.at(-1)?.count;

afterEach(() => {
  localStorage.clear();
});

function SeenButton() {
  const { markSeen, news } = useMyProposals();
  return (
    <button type="button" onClick={markSeen}>
      Vistas {news}
    </button>
  );
}

function InsideButton({ children }: { readonly children: React.ReactNode }) {
  const session = useSession();
  const { loadStatus } = usePermissions();
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  return children;
}

function ListReader() {
  const { list, count, settled } = usePendingProposals();
  return (
    <div data-testid="list">{`${String(settled)} ${String(list.length)} ${String(count)}`}</div>
  );
}

function MyReader() {
  const { list, settled, questions } = useMyProposals();
  return (
    <div data-testid="mine">{`${String(settled)} ${String(list.length)} ${String(questions)}`}</div>
  );
}

describe("what waits for the owner", () => {
  it("is counted, said once on entering, and carries its hint", async () => {
    const { reports } = open([PENDING, { ...PENDING, id: "p2" }], PendingProposalsSource);

    await expect
      .element(notice())
      .toHaveTextContent(
        "Tenés 2 cambios pendientes para revisar. Tu nombre → Base de datos → Cambios pendientes.",
      );
    expect(lastCount(reports)).toBe(2);
    expect(reports.at(-1)?.hint).toBe("2 cambios de oficiales para revisar");
  });

  it("one reads in singular", async () => {
    const { reports } = open([PENDING], PendingProposalsSource);

    await expect
      .element(notice())
      .toHaveTextContent(
        "Tenés 1 cambio pendiente para revisar. Tu nombre → Base de datos → Cambios pendientes.",
      );
    expect(reports.at(-1)?.hint).toBe("1 cambio de oficiales para revisar");
  });

  it("what is under question waits for the hunter, and nothing is said about it", async () => {
    const { reports, harness } = open([{ ...PENDING, estado: "consulta" }], PendingProposalsSource);

    await vi.waitFor(() => {
      expect(harness.network.to("/rest/v1/padron_propuestas").length).toBeGreaterThan(0);
      expect(reports.length).toBeGreaterThan(0);
    });
    expect(lastCount(reports)).toBe(0);
    await expect.element(notice()).toHaveTextContent("");
  });

  it("one's own does not count, unless the company is one's own too", async () => {
    const { reports } = open(
      [
        { ...PENDING, id: "a", creada_por: INVENTED_USER.id, dueno_id: "otro" },
        { ...PENDING, id: "b", creada_por: INVENTED_USER.id },
      ],
      PendingProposalsSource,
    );

    await vi.waitFor(() => {
      expect(lastCount(reports)).toBe(1);
    });
  });

  it("a failure is no number, and the reading of it does not break anything", async () => {
    const { reports } = open({ message: "x" }, PendingProposalsSource, {});

    await vi.waitFor(() => {
      expect(reports.length).toBeGreaterThan(0);
    });
    expect(lastCount(reports)).toBe(0);
  });
});

describe("what a hunter proposed", () => {
  const HUNTER = { profile: { ...ADVISOR, role: "hunter" } };
  const FACULTIES = {
    files: { "_facultades.json": { roles: { hunter: { proponer_oficiales: true } } } },
  };
  const QUESTION = {
    ...PENDING,
    estado: "consulta",
    creada_por: INVENTED_USER.id,
    resuelta_at: null,
  };
  const RESOLVED = {
    ...PENDING,
    id: "p2",
    estado: "aprobada",
    resuelta_at: "2020-10-21T10:00:00Z",
  };

  it("nobody else asks for it", async () => {
    const { harness, reports } = open([QUESTION], MyProposalsSource);

    await vi.waitFor(() => {
      expect(reports.length).toBeGreaterThan(0);
    });
    expect(lastCount(reports)).toBe(0);
    expect(harness.network.to("/rest/v1/padron_propuestas")).toHaveLength(0);
  });

  it("questions and what was resolved are news, and it says so on entering", async () => {
    const { reports } = open([QUESTION, RESOLVED], MyProposalsSource, {
      ...HUNTER,
      ...FACULTIES,
    });

    await expect
      .element(notice())
      .toHaveTextContent(
        "Tenés 1 consulta sobre un cambio que propusiste y 1 cambio resuelto. Tu nombre → Mis propuestas.",
      );
    expect(lastCount(reports)).toBe(2);
    expect(reports.at(-1)?.hint).toBe("2 novedades en tus modificaciones");
  });

  it("several read in plural", async () => {
    const proposals = [
      QUESTION,
      { ...QUESTION, id: "q2" },
      RESOLVED,
      { ...RESOLVED, id: "r2", estado: "rechazada" },
    ];
    open(proposals, MyProposalsSource, { ...HUNTER, ...FACULTIES });

    await expect
      .element(notice())
      .toHaveTextContent(
        "Tenés 2 consultas sobre cambios que propusiste y 2 cambios resueltos. Tu nombre → Mis propuestas.",
      );
  });

  it("what was seen before is not news, and one reads in singular", async () => {
    localStorage.setItem(`fg_hunprop_visto_${INVENTED_USER.id}`, "2020-10-22T10:00:00Z");
    const { reports } = open([QUESTION, RESOLVED], MyProposalsSource, { ...HUNTER, ...FACULTIES });

    await vi.waitFor(() => {
      expect(lastCount(reports)).toBe(1);
    });
    expect(reports.at(-1)?.hint).toBe("1 novedad en tus modificaciones");
  });

  it("only a resolved one says how many", async () => {
    open([RESOLVED], MyProposalsSource, { ...HUNTER, ...FACULTIES });

    await expect
      .element(notice())
      .toHaveTextContent("Tenés 1 cambio resuelto. Tu nombre → Mis propuestas.");
  });

  it("marking them seen takes the news away, and survives no storage", async () => {
    const harness = createAppHarness({
      ...HUNTER,
      ...FACULTIES,
      tables: { padron_propuestas: () => jsonResponse([RESOLVED]) },
    });
    harness.storeSession();
    void render(
      harness.wrap(
        <InsideButton>
          <SeenButton />
        </InsideButton>,
      ),
    );
    const button = page.getByRole("button");
    await expect.element(button).toHaveTextContent("Vistas 1");

    await button.click();

    await expect.element(button).toHaveTextContent("Vistas 0");
    expect(localStorage.getItem(`fg_hunprop_visto_${INVENTED_USER.id}`)).toBeTruthy();

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("no");
    });
    await button.click();
    await expect.element(button).toHaveTextContent("Vistas 0");
    vi.restoreAllMocks();
  });
});

describe("the list of what waits", () => {
  it("a failure stays settled with nothing in it", async () => {
    const harness = createAppHarness({
      tables: { padron_propuestas: () => jsonResponse({ message: "falla", code: "XX" }, 500) },
    });
    harness.storeSession();
    void render(harness.wrap(<ListReader />));

    await expect.element(page.getByTestId("list")).toHaveTextContent("true 0 0");
  });

  it("a failure of what a hunter proposed too", async () => {
    const harness = createAppHarness({
      profile: { ...ADVISOR, role: "hunter" },
      files: { "_facultades.json": { roles: { hunter: { proponer_oficiales: true } } } },
      tables: { padron_propuestas: () => jsonResponse({ message: "falla", code: "XX" }, 500) },
    });
    harness.storeSession();
    void render(harness.wrap(<MyReader />));

    await expect.element(page.getByTestId("mine")).toHaveTextContent("true 0 0");
  });

  it("a browser that does not let it read still answers", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementationOnce(() => {
      throw new Error("no");
    });
    const harness = createAppHarness({
      profile: { ...ADVISOR, role: "hunter" },
      tables: { padron_propuestas: () => jsonResponse([]) },
    });
    harness.storeSession();
    void render(harness.wrap(<MyReader />));

    await expect.element(page.getByTestId("mine")).toBeVisible();
    vi.restoreAllMocks();
  });
});
