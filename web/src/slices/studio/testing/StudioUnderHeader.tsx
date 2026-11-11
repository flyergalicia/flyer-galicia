// Test support: Estudio under a header that hears its numbers, as in the app, where the shell draws
// again each time they change, and Estudio with it.
import { Profiler } from "react";
import type { DesignDeskWorks } from "@/shared/lib/studio/design-desk.ts";
import { useStudioNotices } from "@/shared/lib/studio/studio-notices-query.ts";
import { StudioStage } from "./StudioStage.tsx";

export function StudioUnderHeader({
  isActive,
  desk,
  onDraw,
}: {
  readonly isActive: boolean;
  readonly desk: DesignDeskWorks;
  readonly onDraw: () => void;
}) {
  const { requests } = useStudioNotices();
  return (
    <Profiler id="studio" onRender={onDraw}>
      <span data-testid="header-requests">{requests}</span>
      <StudioStage isActive={isActive} desk={desk} />
    </Profiler>
  );
}
