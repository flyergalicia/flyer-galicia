import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { jsonResponse } from "@/shared/supabase/testing/recording-fetch.ts";
import { NewVersionNotice } from "./NewVersionNotice.tsx";

const FIRST_LOOK_MS = 4000;
const FIVE_MINUTES = 5 * 60 * 1000;
const ANSWER_MS = 50;

function markPage(version: string): void {
  const meta = document.createElement("meta");
  meta.name = "build-v";
  meta.content = version;
  meta.dataset.test = "true";
  document.head.append(meta);
}

function publish(version: string) {
  const asked = vi.fn<() => Promise<Response>>(() => Promise.resolve(jsonResponse({ v: version })));
  vi.stubGlobal("fetch", asked);
  return asked;
}

function comeBack(): void {
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  for (const meta of document.querySelectorAll("meta[data-test]")) meta.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the notice of a new version", () => {
  it("does not look without a mark on the page", async () => {
    const asked = publish("otra");
    const screen = await render(<NewVersionNotice />);

    await vi.advanceTimersByTimeAsync(FIRST_LOOK_MS);

    expect(asked).not.toHaveBeenCalled();
    await expect.element(screen.getByTestId("new-version")).not.toBeInTheDocument();
  });

  it("looks a moment after opening, and says nothing if it is the same", async () => {
    markPage("esta");
    const asked = publish("esta");
    const screen = await render(<NewVersionNotice />);

    await vi.advanceTimersByTimeAsync(FIRST_LOOK_MS);
    await expect.poll(() => asked.mock.calls.length).toBe(1);
    vi.useRealTimers();
    await new Promise((resolve) => {
      setTimeout(resolve, ANSWER_MS);
    });

    expect(screen.getByTestId("new-version").elements()).toEqual([]);
  });

  it("offers to reload when the published one is different", async () => {
    markPage("esta");
    publish("otra");
    const replace = vi.fn<Location["replace"]>();
    const screen = await render(
      <NewVersionNotice address={{ pathname: "/flyer-galicia/", replace }} />,
    );

    await vi.advanceTimersByTimeAsync(FIRST_LOOK_MS);

    const notice = screen.getByRole("button", { name: /versión nueva/ });
    await expect
      .element(notice)
      .toHaveTextContent("Hay una versión nueva de la app — tocá acá para actualizar");
    await notice.click();
    expect(replace).toHaveBeenCalledWith("/flyer-galicia/?v=otra");
  });

  it("coming back to the tab looks again, not more than once every five minutes", async () => {
    markPage("esta");
    const asked = publish("esta");
    await render(<NewVersionNotice />);
    await vi.advanceTimersByTimeAsync(FIRST_LOOK_MS);

    comeBack();
    expect(asked).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(FIVE_MINUTES);
    comeBack();
    expect(asked).toHaveBeenCalledTimes(2);
  });

  it("without an answer there is no new version", async () => {
    markPage("esta");
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    const screen = await render(<NewVersionNotice />);

    await vi.advanceTimersByTimeAsync(FIRST_LOOK_MS + ANSWER_MS);

    await expect.element(screen.getByTestId("new-version")).not.toBeInTheDocument();
  });
});
