// Logos of promotions, where they live (invariant 26) and their files.
import { useCallback } from "react";
import { promotionLogoSource } from "@/shared/domain/promotions/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";

/** The address of a logo. Everything that shows or downloads one asks here. */
export function usePromotionLogoSource(): (image: string | null | undefined) => string {
  const { bucket } = useBackend();
  return useCallback(
    (image) => promotionLogoSource(image, (file) => bucket.publicUrl(file)),
    [bucket],
  );
}

/** The bytes of a logo; null if it cannot be brought, which is not worth stopping for. */
export async function fetchLogoFile(address: string): Promise<ArrayBuffer | null> {
  try {
    const answer = await fetch(address);
    return answer.ok ? await answer.arrayBuffer() : null;
  } catch {
    return null;
  }
}
