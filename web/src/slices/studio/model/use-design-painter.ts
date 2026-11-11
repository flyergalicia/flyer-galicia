// Estudio draws a design without the editor: its own logos and sections in memory.
import { useState } from "react";
import { createLogoLibrary } from "@/shared/flyer-engine/index.ts";
import { createSectionLibrary } from "@/shared/lib/flyer-workspace/index.ts";
import { fetchLogoBlob, promotionLogoAddress } from "@/shared/lib/promotions/logo-file.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import type { DesignPainter } from "./design-image.ts";

const SOURCES_FILE = "_fuentes.json";

export function useDesignPainter(): DesignPainter {
  const { bucket } = useBackend();
  const [painter] = useState<DesignPainter>(() => {
    const home = bucket.publicUrl(SOURCES_FILE).slice(0, -SOURCES_FILE.length);
    return {
      logos: createLogoLibrary({
        fetchLogo: (key) => fetchLogoBlob(promotionLogoAddress(key, bucket)),
        onArrival: () => undefined,
      }),
      sections: createSectionLibrary({ isOurs: (address) => address.startsWith(home) }),
      origins: new Map(),
    };
  });
  return painter;
}
