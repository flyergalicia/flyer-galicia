import type { ActionRow } from "../api/rows.ts";
import { dateLabel } from "../model/formatting.ts";
import { Chip } from "./parts.tsx";

type StateOfAction = Pick<ActionRow, "estado" | "hunter_id" | "tipo" | "fecha" | "vence">;

function DataListChip({ estado, vence }: StateOfAction) {
  if (estado === "planificada") {
    return <Chip tone="info">En curso{vence ? ` · hasta el ${dateLabel(vence)}` : ""}</Chip>;
  }
  if (estado === "cancelada") return <Chip tone="bad">Cancelada</Chip>;
  return <Chip tone="ok">Terminada</Chip>;
}

export function StateChip({ action }: { readonly action: StateOfAction }) {
  const { estado, hunter_id: hunter, tipo, fecha } = action;
  const isData = tipo === "datos";
  if (estado === "planificada" && !hunter) {
    return <Chip tone="warn">Por asignar{isData ? "" : ` · ${dateLabel(fecha)}`}</Chip>;
  }
  if (isData) return <DataListChip {...action} />;
  if (estado === "planificada") return <Chip tone="info">Planificada · {dateLabel(fecha)}</Chip>;
  if (estado === "cancelada") return <Chip tone="bad">Cancelada</Chip>;
  return <Chip tone="ok">Realizada</Chip>;
}
