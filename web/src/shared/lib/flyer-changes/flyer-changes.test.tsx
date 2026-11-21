import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { ShowsError } from "@/shared/supabase/testing/ShowsError.tsx";
import { createFlyerChanges, useFlyerChanges } from "./flyer-changes.ts";

function UsesChanges() {
  useFlyerChanges();
  return null;
}

describe("the options whose flyer changed", () => {
  it("are heard by whoever listens, until it stops", () => {
    const changes = createFlyerChanges();
    const heard = vi.fn<(option: number) => void>();
    const stop = changes.listen(heard);
    changes.announce(9);
    stop();
    changes.announce(8);
    expect(heard).toHaveBeenCalledExactlyOnceWith(9);
  });

  it("need their provider", async () => {
    const screen = await render(
      <ShowsError>
        <UsesChanges />
      </ShowsError>,
    );
    await expect
      .element(screen.getByText(/useFlyerChanges needs a FlyerChangesProvider above it/))
      .toBeVisible();
  });
});
