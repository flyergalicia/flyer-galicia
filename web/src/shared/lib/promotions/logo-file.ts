// Logos of promotions, where they live (invariant 26) and their files.
import { useCallback } from "react";
import { promotionLogoSource } from "@/shared/domain/promotions/index.ts";
import { type Bucket, useBackend } from "@/shared/supabase/index.ts";

/** The address of a logo. Everything that shows or downloads one asks here. */
export function usePromotionLogoSource(): (image: string | null | undefined) => string {
  const { bucket } = useBackend();
  return useCallback(
    (image) => promotionLogoSource(image, (file) => bucket.publicUrl(file)),
    [bucket],
  );
}

/** The address of a logo, for what is outside a component. */
export function promotionLogoAddress(image: string, bucket: Pick<Bucket, "publicUrl">): string {
  return promotionLogoSource(image, (file) => bucket.publicUrl(file));
}

/** The file of a logo. What cannot arrive throws, and whoever asked decides what to do. */
export async function fetchLogoBlob(address: string): Promise<Blob> {
  const answer = await fetch(address);
  if (!answer.ok) throw new Error(`HTTP ${String(answer.status)}`);
  return answer.blob();
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
