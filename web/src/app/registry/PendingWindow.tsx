import { useEffect } from "react";
import type { MenuWindowProps } from "@/shared/lib/view-props.ts";

/** The place of a window whose slice has not arrived: it opens nothing. */
export default function PendingWindow({ onClose }: MenuWindowProps) {
  useEffect(() => {
    onClose();
  }, [onClose]);
  return null;
}
