// The week of the hunter inside the windows that give them something to do.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { mondayOf } from "../model/agenda-dates.ts";
import { addDays, today } from "../model/formatting.ts";
import { useWho } from "../model/use-who.ts";
import { type CommercialCloud, commercialHarness, CUT, ME } from "../testing/commercial-cloud.ts";
import { HunterWeek, type HunterWeekProps } from "./HunterWeek.tsx";

const MONDAY = mondayOf(today());
const WEDNESDAY = addDays(MONDAY, 2);
const OCCUPANCY = "/rest/v1/rpc/gestiones_ocupacion";

const week = () => page.getByTestId("hunter-week");
const blocks = () => week().getByTestId("agenda-block");

type Props = Omit<HunterWeekProps, "who">;

function Stage(props: Props) {
  const session = useSession();
  const { loadStatus } = usePermissions();
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  return <WithWho {...props} />;
}

function WithWho(props: Props) {
  const who = useWho();
  return <HunterWeek who={who} {...props} />;
}

const TAKEN = [
  {
    id: "own",
    hunter_id: "h1",
    fecha: WEDNESDAY,
    hora_desde: "10:00:00",
    hora_hasta: "12:00:00",
    tipo: "accion",
    empresa: "ALIMENTOS SA",
  },
  {
    id: "hidden",
    hunter_id: "h1",
    fecha: WEDNESDAY,
    hora_desde: "15:00:00",
    hora_hasta: "16:00:00",
    tipo: "accion",
    empresa: null,
  },
  {
    id: "list",
    hunter_id: "h1",
    fecha: WEDNESDAY,
    hora_desde: "08:00:00",
    hora_hasta: null,
    tipo: "datos",
    empresa: "LISTA SA",
  },
  {
    id: "loose",
    hunter_id: "h1",
    fecha: WEDNESDAY,
    hora_desde: null,
    hora_hasta: null,
    tipo: "accion",
    empresa: "SUELTA SA",
  },
  {
    id: "of-other",
    hunter_id: "h2",
    fecha: WEDNESDAY,
    hora_desde: "11:00:00",
    hora_hasta: "12:00:00",
    tipo: "accion",
    empresa: "OTRO SA",
  },
];

function asMine(row: (typeof TAKEN)[number]) {
  return { ...row, hunter_id: ME, estado: "realizada" };
}

const BASE: Props = {
  hunterField: "h1",
  hunter: null,
  date: WEDNESDAY,
  isDataList: false,
  exclude: null,
  onTouch: () => undefined,
};

async function open(props: Partial<Props> = {}, cloud: CommercialCloud = {}) {
  const harness = commercialHarness({
    functions_: { gestiones_ocupacion: () => jsonResponse(TAKEN) },
    ...cloud,
  });
  const onTouch = vi.fn<Props["onTouch"]>();
  const screen = await render(harness.wrap(<Stage {...BASE} onTouch={onTouch} {...props} />));
  return { harness, onTouch, screen };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("the week of a hunter", () => {
  it("is the one of the date, with what they have hidden and only for looking", async () => {
    const { harness } = await open();

    await expect
      .element(page.getByTestId("hunter-week-title"))
      .toMatchTextContent(/^La semana de Sofía Paz$/);
    expect(harness.network.to(OCCUPANCY)[0]?.body).toEqual({
      p_desde: MONDAY,
      p_hasta: addDays(MONDAY, 6),
    });
    await vi.waitFor(() => {
      expect(blocks().elements()).toHaveLength(2);
    });
    expect
      .soft(
        blocks()
          .elements()
          .every((block) => block.tagName === "SPAN"),
      )
      .toBe(true);
    await expect.element(blocks().nth(1)).toMatchTextContent(/Ocupado/);
    await vi.waitFor(() => {
      expect(week().getByTestId("agenda-day").elements()).toHaveLength(7);
    });
  });

  it("leaves out the action being edited", async () => {
    await open({ exclude: "own" });
    await expect.element(blocks()).toMatchTextContent(/Ocupado/);
  });

  it("touching a free spot gives the day and an hour from that time", async () => {
    const { onTouch } = await open();
    const column = week().getByTestId("agenda-day").nth(1);

    await column.click({ position: { x: 5, y: 46 * 3 + 5 } });

    expect(onTouch).toHaveBeenCalledWith(addDays(MONDAY, 1), "11:00", "12:00");
  });

  it("a hunter reads their own actions, and it is their week", async () => {
    const { harness } = await open(
      { hunterField: null, hunter: null },
      {
        role: "hunter",
        tables: {
          gestiones: () => jsonResponse(TAKEN.map((row) => asMine(row))),
        },
      },
    );

    await expect.element(page.getByTestId("hunter-week-title")).toMatchTextContent(/^Tu semana$/);
    expect(harness.network.to(OCCUPANCY)).toEqual([]);
    const [read] = harness.network.to("/rest/v1/gestiones", "GET");
    expect.soft(read?.query.get("hunter_id")).toBe(`eq.${ME}`);
    expect.soft(read?.query.get("estado")).toBe("neq.cancelada");
    expect.soft(blocks().first().element().className).toMatch(/blockDone/);
  });

  it("with no hunter chosen yet, shows nothing", async () => {
    await open({ hunterField: "" });
    await expect.element(week()).not.toBeInTheDocument();
  });

  it("for the leader to assign, shows nothing", async () => {
    await open({ hunterField: "__lider" });
    await expect.element(week()).not.toBeInTheDocument();
  });

  it("of whoever is being edited, without a field", async () => {
    await open({ hunterField: null, hunter: "h1" });
    await expect
      .element(page.getByTestId("hunter-week-title"))
      .toMatchTextContent(/^La semana de Sofía Paz$/);
  });

  it("without anybody to show, nothing", async () => {
    await open({ hunterField: null, hunter: null });
    await expect.element(week()).not.toBeInTheDocument();
  });

  it("keeps showing what it had while there is nothing to ask", async () => {
    const { screen, onTouch } = await open();
    await expect.element(blocks().first()).toBeVisible();

    await screen.rerender(
      commercialHarness().wrap(<Stage {...BASE} onTouch={onTouch} isDataList />),
    );

    await expect.element(page.getByTestId("hunter-week-title")).toBeVisible();
  });

  it("if it cannot be read, it is not there", async () => {
    await open({}, { functions_: { gestiones_ocupacion: CUT } });
    await expect.element(page.getByTestId("agenda-block")).not.toBeInTheDocument();
    await expect.element(week()).not.toBeInTheDocument();
  });
});
