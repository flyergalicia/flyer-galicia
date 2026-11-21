// The tutorial over the real screen (`_tourStart`): everything goes dark, the button it talks about
// is lit and a globe with an arrow says what it does. By chapters (each one can be skipped), with
// Anterior / Siguiente / Cerrar and the keyboard: arrows to move, Escape to leave. It ends leaving
// everything as it was: no menu open, and the main screen.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePlaceDesk } from "@/shared/lib/places/place-desk.ts";
import type { MenuWindowProps } from "@/shared/lib/view-props.ts";
import { useSession } from "@/shared/session/index.ts";
import { GUIDE_VEIL_ATTRIBUTE } from "@/shared/ui/index.ts";
import { planOf } from "../model/plan.ts";
import { spotlightOf, tipPlace, veilHole, type ArrowPlace } from "../model/position.ts";
import { leaveScreen, prepareScreen, type TourWays } from "../model/prepare.ts";
import { useTourProfile } from "../model/profile.ts";
import { markTourSeen } from "../model/seen.ts";
import { screenLoading, visibleTarget } from "../model/targets.ts";
import {
  createTourController,
  type TourController,
  type TourView,
} from "../model/tour-controller.ts";
import { type TourText, tourChapters } from "./chapters.tsx";
import { TourTip } from "./TourTip.tsx";
import styles from "./TourWindow.module.css";

/** The layout may settle a moment after changing tab or scrolling. */
const SETTLE_MS = 250;
const GUIDE_VEIL = { [GUIDE_VEIL_ATTRIBUTE]: "" };

const stayHere = () => undefined;

interface Parts {
  veil: HTMLDivElement | null;
  spot: HTMLDivElement | null;
  tip: HTMLElement | null;
  arrow: HTMLDivElement | null;
}

function px(value: number | undefined): string {
  return value === undefined ? "" : `${String(value)}px`;
}

function placeArrow(arrow: HTMLDivElement, place: ArrowPlace): void {
  arrow.style.top = px(place.top);
  arrow.style.left = px(place.left);
  arrow.style.right = px(place.right);
  arrow.style.bottom = px(place.bottom);
}

/** Where the light and the globe go now, measuring the element again (`_tourPos`). */
function placeAll(view: TourView<TourText>, { veil, spot, tip, arrow }: Parts): void {
  const element = visibleTarget(view.step.target);
  if (!element || !veil || !spot || !tip || !arrow) return;
  const rect = element.getBoundingClientRect();
  const light = spotlightOf(rect);
  spot.style.top = px(light.top);
  spot.style.left = px(light.left);
  spot.style.width = px(light.width);
  spot.style.height = px(light.height);
  veil.style.clipPath = veilHole(rect);
  const place = tipPlace(
    rect,
    { width: tip.offsetWidth, height: tip.offsetHeight },
    { width: window.innerWidth, height: window.innerHeight },
  );
  tip.style.top = px(place.top);
  tip.style.left = px(place.left);
  placeArrow(arrow, place.arrow);
}

interface Around {
  readonly ways: () => TourWays;
  /** It ended: it is remembered as seen, and everything goes back as it was. */
  readonly finish: () => void;
}

function useAround({ onClose, goToTab }: MenuWindowProps): Around {
  const desk = usePlaceDesk();
  const session = useSession();
  const userId = session.status === "signed-in" ? session.user.id : null;
  const latest = useRef({ onClose, goToTab, desk, userId });
  useLayoutEffect(() => {
    latest.current = { onClose, goToTab, desk, userId };
  });
  return useState<Around>(() => {
    const ways = () => ({
      goToTab: latest.current.goToTab ?? stayHere,
      desk: latest.current.desk,
    });
    return {
      ways,
      finish: () => {
        markTourSeen(latest.current.userId);
        leaveScreen(ways());
        latest.current.onClose();
      },
    };
  })[0];
}

function useController(around: Around, setView: (view: TourView<TourText>) => void) {
  const profile = useTourProfile();
  // Fixed on starting, as today. "Modo oscuro" is there for everybody, so it is never empty.
  const [plan] = useState(() => planOf(tourChapters(profile)));
  const controller = useRef<TourController | null>(null);
  useEffect(() => {
    const created = createTourController({
      plan,
      prepare: (step) => {
        prepareScreen(step.prepare, around.ways());
      },
      find: (target) => visibleTarget(target),
      screenLoading: () => screenLoading(),
      show: setView,
      finish: around.finish,
      later: (run) => {
        const timer = setTimeout(run, 0);
        return () => {
          clearTimeout(timer);
        };
      },
      nextFrame: (run) => {
        const frame = requestAnimationFrame(run);
        return () => {
          cancelAnimationFrame(frame);
        };
      },
      now: () => performance.now(),
    });
    controller.current = created;
    created.start();
    return () => {
      created.dispose();
      controller.current = null;
    };
  }, [plan, around, setView]);
  return controller;
}

/** Arrows to move, Escape to leave, wherever the focus is (`_tourTecla`). */
function useKeys(controller: { readonly current: TourController | null }): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const moves = controller.current;
      if (!moves) return;
      if (event.key === "Escape") {
        event.preventDefault();
        moves.close();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        moves.next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        moves.previous();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [controller]);
}

/** The light and the globe follow the element: on each step, a moment later, and on scroll. */
function usePlacing(view: TourView<TourText> | null, parts: { readonly current: Parts }): void {
  const place = useCallback(() => {
    if (view) placeAll(view, parts.current);
  }, [view, parts]);
  useLayoutEffect(() => {
    place();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      place();
      timer = setTimeout(place, SETTLE_MS);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [place]);
  useEffect(() => {
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [place]);
}

export function TourWindow(props: MenuWindowProps) {
  const around = useAround(props);
  const [view, setView] = useState<TourView<TourText> | null>(null);
  const controller = useController(around, setView);
  const parts = useRef<Parts>({ veil: null, spot: null, tip: null, arrow: null });
  useKeys(controller);
  usePlacing(view, parts);
  if (!view) return null;
  const moves = {
    onClose: () => controller.current?.close(),
    onNext: () => controller.current?.next(),
    onPrevious: () => controller.current?.previous(),
    onSkipChapter: () => controller.current?.skipChapter(),
    onChapter: (chapter: Parameters<TourController["goToChapter"]>[0]) =>
      controller.current?.goToChapter(chapter),
  };
  return createPortal(
    <>
      <div
        ref={(element) => {
          parts.current.veil = element;
        }}
        className={styles.veil}
        data-testid="tour-veil"
        {...GUIDE_VEIL}
      />
      <div
        ref={(element) => {
          parts.current.spot = element;
        }}
        className={styles.spotlight}
        data-testid="tour-spotlight"
      />
      <TourTip
        view={view}
        tipRef={(element) => {
          parts.current.tip = element;
        }}
        arrowRef={(element) => {
          parts.current.arrow = element;
        }}
        {...moves}
      />
    </>,
    document.body,
  );
}
