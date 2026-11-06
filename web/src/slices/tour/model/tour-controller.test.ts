import { describe, expect, it, vi } from "vitest";
import { planOf, type TourChapter } from "./plan.ts";
import { TO_BULK, TO_INDIVIDUAL, TO_MENU } from "./prepare.ts";
import type { TargetKey } from "./targets.ts";
import {
  createTourController,
  SCREEN_WAIT_MS,
  STEP_WAIT_MS,
  type TourDeps,
  type TourView,
} from "./tour-controller.ts";

const CHAPTERS: readonly TourChapter<string>[] = [
  {
    id: "flyer",
    title: "Armar un flyer",
    steps: [
      { target: "company", title: "Empresa", text: "", prepare: TO_INDIVIDUAL },
      { target: "legal", title: "Legal", text: "", prepare: TO_INDIVIDUAL },
    ],
  },
  {
    id: "masivo",
    title: "Masivo",
    steps: [{ target: "excel", title: "Excel", text: "", prepare: TO_BULK }],
  },
  {
    id: "menu",
    title: "Tu menú",
    steps: [{ target: "menuTheme", title: "Modo oscuro", text: "", prepare: TO_MENU }],
  },
];

/** An element of the page: where it is can change between frames. */
function element(rect = { left: 10, top: 20, width: 30, height: 40 }) {
  const box = { ...rect };
  return {
    box,
    scrollIntoView: vi.fn<(options: ScrollIntoViewOptions) => void>(),
    getBoundingClientRect: () => box,
  };
}

type FakeElement = ReturnType<typeof element>;

/** Frames and the clock in the hands of the test. */
function setUp(seen: Partial<Record<TargetKey, FakeElement>> = {}) {
  let clock = 0;
  let pending: (() => void)[] = [];
  const shown: TourView<string>[] = [];
  const prepared: string[] = [];
  let loading = false;
  const finish = vi.fn<() => void>();
  const deps: TourDeps<string> = {
    plan: planOf(CHAPTERS),
    prepare: (step) => {
      prepared.push(step.title);
    },
    find: (target) => seen[target] ?? null,
    screenLoading: () => loading,
    show: (view) => {
      shown.push(view);
    },
    finish,
    later: (run) => {
      pending.push(run);
      return () => {
        pending = pending.filter((one) => one !== run);
      };
    },
    nextFrame: (run) => {
      pending.push(run);
      return () => {
        pending = pending.filter((one) => one !== run);
      };
    },
    now: () => clock,
  };
  const controller = createTourController(deps);
  const runFrames = (count = 1, ms = 16) => {
    for (let frame = 0; frame < count; frame += 1) {
      clock += ms;
      const now = pending;
      pending = [];
      for (const run of now) run();
    }
  };
  const titles = () => shown.map(({ step }) => step.title);
  return {
    deps,
    controller,
    runFrames,
    titles,
    shown,
    prepared,
    finish,
    pending: () => pending.length,
    setLoading: (value: boolean) => {
      loading = value;
    },
  };
}

const ALL = { company: element(), legal: element(), excel: element(), menuTheme: element() };

describe("a step", () => {
  it("is prepared after the click, and shown once its element is still for one frame", () => {
    const tour = setUp(ALL);
    tour.controller.start();
    expect(tour.prepared).toEqual([]);

    tour.runFrames();
    expect(tour.prepared).toEqual(["Empresa"]);
    tour.runFrames();
    expect(tour.titles()).toEqual([]);
    tour.runFrames();

    expect(tour.titles()).toEqual(["Empresa"]);
    expect(tour.shown[0]).toMatchObject({ index: 0, total: 4 });
    expect(ALL.company.scrollIntoView).toHaveBeenCalledWith({ block: "center", inline: "nearest" });
  });

  it("waits for an element that is still moving: a menu that opens grows it", () => {
    const company = element();
    const tour = setUp({ ...ALL, company });
    tour.controller.start();
    tour.runFrames(2);
    company.box.height = 80;
    tour.runFrames();
    expect(tour.titles()).toEqual([]);
    tour.runFrames();
    expect(tour.titles()).toEqual(["Empresa"]);
  });

  it("is shown anyway when the wait is over, if it never stops moving", () => {
    const company = element();
    const tour = setUp({ ...ALL, company });
    tour.controller.start();
    tour.runFrames();
    for (let frame = 0; frame * 100 < STEP_WAIT_MS; frame += 1) {
      company.box.top += 1;
      tour.runFrames(1, 100);
    }
    company.box.top += 1;
    tour.runFrames(1, 100);
    expect(tour.titles()).toEqual(["Empresa"]);
  });

  it("whose element is not seen is taken off, and the next one takes its place", () => {
    const tour = setUp({ legal: element(), excel: element(), menuTheme: element() });
    tour.controller.start();
    tour.runFrames(1);
    tour.runFrames(Math.ceil(STEP_WAIT_MS / 16) + 1);
    tour.runFrames(3);

    expect(tour.titles()).toEqual(["Legal"]);
    expect(tour.shown[0]).toMatchObject({ index: 0, total: 3 });
  });

  it("waits longer while the code of its screen is coming down", () => {
    const tour = setUp({});
    tour.setLoading(true);
    tour.controller.start();
    tour.runFrames(1);
    tour.runFrames(1, STEP_WAIT_MS + 100);
    expect(tour.prepared).toEqual(["Empresa"]);
    expect(tour.pending()).toBe(1);

    tour.runFrames(1, SCREEN_WAIT_MS);
    tour.setLoading(false);
    tour.runFrames(1, STEP_WAIT_MS);
    expect(tour.prepared).toEqual(["Empresa", "Legal"]);
  });

  it("with no step at all, it ends on starting", () => {
    const finish = vi.fn<() => void>();
    const empty = createTourController({
      ...setUp().deps,
      plan: planOf<string>([]),
      finish,
    });
    empty.start();
    expect(finish).toHaveBeenCalledOnce();
  });

  it("with nothing left to show, it ends", () => {
    const tour = setUp({});
    tour.controller.start();
    for (let round = 0; round < 8; round += 1) tour.runFrames(1, STEP_WAIT_MS);
    expect(tour.finish).toHaveBeenCalledOnce();
  });
});

/** Started, and moved forward that many steps. */
function startedOn(steps = 0) {
  const tour = setUp(ALL);
  tour.controller.start();
  tour.runFrames(3);
  for (let step = 0; step < steps; step += 1) {
    tour.controller.next();
    tour.runFrames(3);
  }
  return tour;
}

describe("moving", () => {
  it("Siguiente goes on, and on the last step it ends", () => {
    const tour = startedOn(3);
    expect(tour.titles()).toEqual(["Empresa", "Legal", "Excel", "Modo oscuro"]);

    tour.controller.next();
    expect(tour.finish).toHaveBeenCalledOnce();
  });

  it("Anterior goes back, and does nothing on the first step", () => {
    const tour = startedOn(1);
    tour.controller.previous();
    tour.runFrames(3);
    tour.controller.previous();
    tour.runFrames(3);
    expect(tour.titles()).toEqual(["Empresa", "Legal", "Empresa"]);
  });

  it("Omitir capítulo goes to the next chapter, and after the last one it ends", () => {
    const tour = startedOn();
    tour.controller.skipChapter();
    tour.runFrames(3);
    tour.controller.skipChapter();
    tour.runFrames(3);
    expect(tour.titles()).toEqual(["Empresa", "Excel", "Modo oscuro"]);
    tour.controller.skipChapter();
    expect(tour.finish).toHaveBeenCalledOnce();
  });

  it("a chip goes to its chapter; one with nothing left does nothing", () => {
    const tour = startedOn();
    tour.controller.goToChapter("menu");
    tour.runFrames(3);
    tour.controller.goToChapter("promos");
    tour.runFrames(3);
    expect(tour.titles()).toEqual(["Empresa", "Modo oscuro"]);
  });

  it("only the last step asked is shown, even if the person goes fast", () => {
    const tour = startedOn();
    tour.controller.next();
    tour.runFrames(1);
    tour.controller.next();
    tour.runFrames(3);
    expect(tour.titles()).toEqual(["Empresa", "Excel"]);
  });

  it("closing ends it once; once gone, nothing pending goes on", () => {
    const tour = startedOn();
    tour.controller.close();
    tour.controller.close();
    tour.controller.next();
    expect(tour.finish).toHaveBeenCalledOnce();

    const other = setUp(ALL);
    other.controller.start();
    other.controller.dispose();
    other.runFrames(5);
    other.controller.next();
    expect(other.prepared).toEqual([]);
    expect(other.finish).not.toHaveBeenCalled();
  });

  it("an element that cannot scroll is shown where it is", () => {
    const company = element();
    company.scrollIntoView.mockImplementation(() => {
      throw new Error("no");
    });
    const tour = setUp({ ...ALL, company });
    tour.controller.start();
    tour.runFrames(3);
    expect(tour.titles()).toEqual(["Empresa"]);
  });
});
