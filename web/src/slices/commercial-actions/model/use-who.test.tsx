import { Component, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { createAppHarness } from "@/shared/lib/testing/app-harness.tsx";
import { useWho } from "./use-who.ts";

class Boundary extends Component<{ readonly children: ReactNode }, { readonly said: string }> {
  override state = { said: "" };

  static getDerivedStateFromError(cause: Error) {
    return { said: cause.message };
  }

  override render() {
    const { said } = this.state;
    return said ? <span>{said}</span> : this.props.children;
  }
}

function Reader() {
  return <span>{useWho().me}</span>;
}

describe("who is who", () => {
  it("only makes sense for a person who is signed in", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const harness = createAppHarness();
    const screen = await render(
      harness.wrap(
        <Boundary>
          <Reader />
        </Boundary>,
      ),
    );
    await expect.element(screen.getByText("useWho needs a person who is signed in")).toBeVisible();
    vi.restoreAllMocks();
  });
});
