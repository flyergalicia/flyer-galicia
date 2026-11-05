// What this Hunter has open on each company: while it is open, a second one is not offered.
import { useCallback, useEffect, useMemo } from "react";
import { type Company, normalizeName } from "@/shared/domain/company-registry/index.ts";
import { useMyProposals } from "@/shared/lib/company-registry/proposals-query.ts";
import { usePermissions } from "@/shared/session/index.ts";

const OPEN = new Set(["pendiente", "consulta"]);

export type OpenProposalStatus = "pendiente" | "consulta";

function isOpen(status: string): status is OpenProposalStatus {
  return OPEN.has(status);
}

export function useOpenProposals(isActive: boolean) {
  const { can } = usePermissions();
  const { list, reload } = useMyProposals();
  const canPropose = can("proponer_oficiales");
  const open = useMemo(
    () =>
      new Map(
        list.flatMap(({ dueno_id: owner, empresa_key: key, estado }) =>
          isOpen(estado) ? [[`${owner}|${key}`, estado] as const] : [],
        ),
      ),
    [list],
  );
  const statusOf = useCallback(
    ({ user_id: owner, empresa }: Pick<Company, "user_id" | "empresa">) =>
      owner ? open.get(`${owner}|${normalizeName(empresa)}`) : undefined,
    [open],
  );
  // Each time the screen comes up it looks again: the owner may have answered.
  useEffect(() => {
    if (isActive && canPropose) void reload();
  }, [canPropose, isActive, reload]);
  return { canPropose, statusOf, reload };
}
