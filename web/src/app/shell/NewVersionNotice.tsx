import { useEffect, useRef, useState } from "react";
import { addressOfVersion, ownVersion, publishedVersion } from "@/shared/lib/version-check.ts";
import styles from "./NewVersionNotice.module.css";

const FIRST_LOOK_AFTER_MS = 4000;
const LOOK_AGAIN_AFTER_MS = 5 * 60 * 1000;

/**
 * It looks a moment after opening and each time someone comes back to the tab, at most once every
 * five minutes. Reloading with the version in the address skips the page kept in the cache.
 */
export function NewVersionNotice({
  address = window.location,
}: {
  readonly address?: Pick<Location, "pathname" | "replace">;
}) {
  const [published, setPublished] = useState<string | null>(null);
  const lastLook = useRef(0);

  useEffect(() => {
    const own = ownVersion();
    if (own === null) return undefined;
    const look = () => {
      const now = Date.now();
      if (now - lastLook.current < LOOK_AGAIN_AFTER_MS) return;
      lastLook.current = now;
      void publishedVersion(now).then((version) => {
        if (version !== null && version !== own) setPublished(version);
      });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") look();
    };
    const timer = setTimeout(look, FIRST_LOOK_AFTER_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (published === null) return null;
  return (
    <button
      type="button"
      className={styles.notice}
      data-testid="new-version"
      onClick={() => {
        address.replace(addressOfVersion(address.pathname, published));
      }}
    >
      Hay una versión nueva de la app — tocá acá para actualizar
    </button>
  );
}
