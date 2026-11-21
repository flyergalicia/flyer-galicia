import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { placeDeskOnPage } from "../testing/place-desk-on-page.ts";
import { PlaceDeskReader } from "../testing/PlaceDeskReader.tsx";
import { createPlaceDesk, type Leave, useLeaveRequests, usePlaceRequests } from "./place-desk.ts";
import { PlaceDeskProvider } from "./PlaceDeskProvider.tsx";

describe("the desk of places", () => {
  it("keeps the last place asked for each one, until it is taken", () => {
    const desk = createPlaceDesk();
    desk.ask("benchmark", "semana");
    desk.ask("benchmark", "tarjetas");
    desk.ask("promotions", "active");

    expect(desk.take("benchmark")).toBe("tarjetas");
    expect(desk.take("benchmark")).toBeNull();
    expect(desk.take("promotions")).toBe("active");
  });

  it("tells whoever listens, until they stop", () => {
    const desk = createPlaceDesk();
    const heard = vi.fn<() => void>();
    const stop = desk.subscribe(heard);
    desk.ask("admin", "legales");
    stop();
    desk.ask("admin", "uso");

    expect(heard).toHaveBeenCalledOnce();
  });

  it("leaves a window as the window says, and with no window goes on at once", () => {
    const desk = createPlaceDesk();
    const goOn = vi.fn<() => void>();
    desk.leave("database", goOn);
    expect(goOn).toHaveBeenCalledOnce();

    const leave = vi.fn<Leave>((then) => {
      then();
    });
    const stop = desk.onLeave("database", leave);
    desk.leave("database", goOn);
    expect(leave).toHaveBeenCalledOnce();
    expect(goOn).toHaveBeenCalledTimes(2);

    // Whoever stops is not the one that replaced it.
    const other = vi.fn<Leave>();
    desk.onLeave("database", other);
    stop();
    desk.leave("database", goOn);
    expect(other).toHaveBeenCalledOnce();
  });
});

function Holder({ onLeave }: { readonly onLeave: Leave }) {
  const [place, setPlace] = useState("primera");
  usePlaceRequests("benchmark", setPlace);
  useLeaveRequests("benchmark", onLeave);
  return <p>{place}</p>;
}

function Page({ withHolder, onLeave }: { readonly withHolder: boolean; readonly onLeave: Leave }) {
  return (
    <PlaceDeskProvider>
      <PlaceDeskReader />
      {withHolder && <Holder onLeave={onLeave} />}
    </PlaceDeskProvider>
  );
}

describe("a screen with places", () => {
  it("takes what was asked before it was on the page, and what is asked while it is", async () => {
    const onLeave = vi.fn<Leave>();
    const screen = await render(<Page withHolder={false} onLeave={onLeave} />);
    placeDeskOnPage().ask("benchmark", "semana");
    await screen.rerender(<Page withHolder onLeave={onLeave} />);
    await expect.element(screen.getByText("semana")).toBeVisible();

    placeDeskOnPage().ask("benchmark", "tarjetas");
    await expect.element(screen.getByText("tarjetas")).toBeVisible();

    const goOn = vi.fn<() => void>();
    placeDeskOnPage().leave("benchmark", goOn);
    expect(onLeave).toHaveBeenCalledWith(goOn);
    expect(goOn).not.toHaveBeenCalled();

    await screen.rerender(<Page withHolder={false} onLeave={onLeave} />);
    placeDeskOnPage().leave("benchmark", goOn);
    expect(goOn).toHaveBeenCalledOnce();
  });

  it("on its own, with nobody to ask, is where it starts", async () => {
    const screen = await render(<Holder onLeave={vi.fn<Leave>()} />);
    await expect.element(screen.getByText("primera")).toBeVisible();
    expect(() => placeDeskOnPage()).toThrow(/no desk of places/);
  });
});
