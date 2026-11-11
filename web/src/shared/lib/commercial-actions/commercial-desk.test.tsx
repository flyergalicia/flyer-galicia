import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
  type ActionRequest,
  CommercialDeskContext,
  createCommercialDesk,
  type FlyerRequest,
  useActionRequests,
  useCommercialDesk,
  useFlyerRequests,
} from "./commercial-desk.ts";

function aDesk() {
  const goTo = vi.fn<(tabId: string) => void>();
  const onRegister = vi.fn<() => void>();
  return { desk: createCommercialDesk({ goTo, onRegister }), goTo, onRegister };
}

describe("the desk", () => {
  it("passes on what is to register", () => {
    const { desk, onRegister } = aDesk();
    desk.register({ empresa: "ACME" });
    expect(onRegister).toHaveBeenCalledWith({ empresa: "ACME" });
  });

  it("goes to Gestiones with an action, and it is taken once", () => {
    const { desk, goTo } = aDesk();
    desk.openAction({ id: "g", complete: false });
    expect(goTo).toHaveBeenCalledWith("gestiones");
    expect(desk.takeAction()).toEqual({ id: "g", complete: false });
    expect(desk.takeAction()).toBeNull();
  });

  it("each screen takes the flyer that is for it", () => {
    const { desk, goTo } = aDesk();
    desk.showFlyer("hunter", { company: "ACME", taxIds: null });
    expect(goTo).toHaveBeenCalledWith("hunter");
    expect(desk.takeFlyer("flyer")).toBeNull();
    expect(desk.takeFlyer("hunter")).toEqual({ company: "ACME", taxIds: null });
    expect(desk.takeFlyer("hunter")).toBeNull();
  });

  it("tells whoever listens, until they stop", () => {
    const { desk } = aDesk();
    const listener = vi.fn<() => void>();
    const stop = desk.subscribe(listener);
    desk.openAction({ id: "g", complete: false });
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    desk.openAction({ id: "g", complete: false });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

function Screen({
  onAction,
  onFlyer,
}: {
  readonly onAction: (request: ActionRequest) => void;
  readonly onFlyer: (request: FlyerRequest) => void;
}) {
  useActionRequests(onAction);
  useFlyerRequests("flyer", onFlyer);
  return <span>{useCommercialDesk() ? "with" : "without"}</span>;
}

describe("a screen", () => {
  it("without a desk has nothing to take", async () => {
    const screen = await render(
      <Screen
        onAction={vi.fn<(request: ActionRequest) => void>()}
        onFlyer={vi.fn<(request: FlyerRequest) => void>()}
      />,
    );
    await expect.element(screen.getByText("without")).toBeVisible();
  });

  it("takes what was waiting when it arrives, and what arrives later", async () => {
    const { desk } = aDesk();
    desk.openAction({ id: "before", complete: true });
    const onAction = vi.fn<(request: ActionRequest) => void>();
    const onFlyer = vi.fn<(request: FlyerRequest) => void>();
    await render(
      <CommercialDeskContext.Provider value={desk}>
        <Screen onAction={onAction} onFlyer={onFlyer} />
      </CommercialDeskContext.Provider>,
    );
    expect(onAction).toHaveBeenCalledWith({ id: "before", complete: true });

    desk.showFlyer("flyer", { company: "ACME", taxIds: "30" });
    expect(onFlyer).toHaveBeenCalledWith({ company: "ACME", taxIds: "30" });
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
