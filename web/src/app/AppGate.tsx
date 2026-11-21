import { useEffect, useState } from "react";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { useScreenTitles } from "@/shared/lib/app-config/screen-titles-query.ts";
import {
  SLOW_AFTER_MS,
  useCommercialActionsFlag,
  usePermissions,
  useSession,
} from "@/shared/session/index.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { EntryScreen } from "@/slices/auth/index.ts";
import { AppShell } from "./shell/AppShell.tsx";

/**
 * Nobody sees the app until it is known what they may see: this is what keeps a tab from showing
 * for a moment and going away. If what it waits for does not answer, it goes in with what it has.
 */
export function AppGate() {
  const session = useSession();
  const { auth } = useBackend();
  const { loadStatus } = usePermissions();
  const isSignedIn = session.status === "signed-in";
  // A session in the browser means someone is on the way in: what they need comes along.
  const wantsConfig = isSignedIn || (session.status === "loading" && auth.hasStoredSession());
  const options = useFlyerOptions(wantsConfig);
  const titles = useScreenTitles(wantsConfig);
  const commercial = useCommercialActionsFlag(wantsConfig);
  const isSettled =
    options.settled && titles.settled && commercial.settled && loadStatus !== "loading";

  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (!isSignedIn || isSettled) return undefined;
    const timer = setTimeout(() => {
      setGaveUp(true);
    }, SLOW_AFTER_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [isSignedIn, isSettled]);

  if (session.status !== "signed-in" || !(isSettled || gaveUp)) return <EntryScreen />;
  return (
    <AppShell
      key={session.user.id}
      session={session}
      titles={titles.titles}
      flyerOptions={options.options}
      commercialActionsOn={commercial.on}
    />
  );
}
