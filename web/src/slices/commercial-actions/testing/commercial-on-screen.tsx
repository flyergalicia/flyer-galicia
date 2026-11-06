// Test support: the screen of Gestiones over a simulated cloud.
import { render } from "vitest-browser-react";
import type { CommercialDesk } from "@/shared/lib/commercial-actions/commercial-desk.ts";
import { PlaceDeskReader } from "@/shared/lib/testing/PlaceDeskReader.tsx";
import { type CommercialCloud, commercialHarness } from "./commercial-cloud.ts";
import { CommercialStage } from "./CommercialStage.tsx";

export interface OpenOptions {
  readonly goToTab?: (tabId: string) => void;
  readonly desk?: CommercialDesk;
}

export async function openCommercial(cloud: CommercialCloud = {}, options: OpenOptions = {}) {
  const harness = commercialHarness(cloud);
  const view = (isActive: boolean) =>
    harness.wrap(
      <>
        <PlaceDeskReader />
        <CommercialStage isActive={isActive} goToTab={options.goToTab} desk={options.desk} />
      </>,
    );
  const screen = await render(view(true));
  return {
    screen,
    harness,
    show: (isActive: boolean) => screen.rerender(view(isActive)),
  };
}
