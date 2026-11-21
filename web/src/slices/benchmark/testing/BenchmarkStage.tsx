// Test support: the screen of Benchmark, once the session is there.
import { usePermissions, useSession } from "@/shared/session/index.ts";
import { BenchmarkScreen } from "../ui/BenchmarkView.tsx";

export function BenchmarkStage({ handLoadedPage }: { readonly handLoadedPage: boolean }) {
  const session = useSession();
  const { loadStatus } = usePermissions();
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  return <BenchmarkScreen handLoadedPage={handLoadedPage} />;
}
