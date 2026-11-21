import { companyCategoryLabel } from "@/shared/domain/company-registry/index.ts";
import { optionLabel, optionTab } from "@/shared/domain/flyer-options.ts";
import { titleOf } from "@/shared/domain/screen-titles.ts";
import { useFlyerOptions } from "@/shared/lib/app-config/flyer-options-query.ts";
import { useScreenTitles } from "@/shared/lib/app-config/screen-titles-query.ts";
import { useWorkspaceValue } from "@/shared/lib/flyer-workspace/index.ts";
import { DecisionDialog } from "@/shared/ui/decision-dialog/DecisionDialog.ts";
import { ConfirmDialog } from "@/shared/ui/index.ts";
import { NoCashbackDialog } from "@/slices/company-registry/index.ts";
import type { CompanyNotice } from "../model/use-company-bringing.ts";

const AFTER_ANSWER_MS = 150;

interface CategoryNoticeProps {
  readonly notice: Extract<CompanyNotice, { kind: "category" }>;
  readonly onStay: () => void;
  readonly onGo: (option: number) => void;
}

function CategoryNotice({
  notice: {
    company,
    goOn,
    warning: { wanted },
  },
  onStay,
  onGo,
}: CategoryNoticeProps) {
  const { options } = useFlyerOptions();
  const { titles } = useScreenTitles();
  const option = useWorkspaceValue((state) => state.slot.option);
  const here = `${titleOf(titles, optionTab(options, option))} · ${optionLabel(options, option)}`;
  const name = company.empresa || "Esta empresa";
  const stay = goOn ? "Descargar igual" : "Seguir acá";
  const foot = (
    <DecisionDialog.Foot>
      <DecisionDialog.No
        onClick={() => {
          onStay();
          goOn?.();
        }}
      >
        {stay}
      </DecisionDialog.No>
      <DecisionDialog.Yes
        onClick={() => {
          onGo(wanted);
        }}
      >
        {wanted ? `Ir a ${optionLabel(options, wanted)}` : "Ir a Flyer Galicia"}
      </DecisionDialog.Yes>
    </DecisionDialog.Foot>
  );
  if (wanted) {
    return (
      <DecisionDialog title="📋 Beneficio por rubro">
        <DecisionDialog.Text>
          <strong>{name}</strong> tiene cargado el beneficio{" "}
          <strong>{companyCategoryLabel(company, options)}</strong>, y estás armando el flyer en{" "}
          <strong>{here}</strong>.
        </DecisionDialog.Text>
        <DecisionDialog.Text>
          Si lo pasás a <strong>Flyer Rubros → {optionLabel(options, wanted)}</strong> se conservan
          la empresa, los oficiales y los topes.
        </DecisionDialog.Text>
        {foot}
      </DecisionDialog>
    );
  }
  return (
    <DecisionDialog title="📋 Sin beneficio por rubro">
      <DecisionDialog.Text>
        <strong>{name}</strong> no tiene rubro cargado, y estás armando el flyer en{" "}
        <strong>{here}</strong>.
      </DecisionDialog.Text>
      <DecisionDialog.Text>
        Si es correcto que lleve el cartel del beneficio, seguí acá: al generar el flyer te ofrezco
        guardarle el rubro.
      </DecisionDialog.Text>
      {foot}
    </DecisionDialog>
  );
}

interface ShowAmountsProps {
  readonly notice: Extract<CompanyNotice, { kind: "show-amounts" }>;
  readonly isCropped: boolean;
  readonly onYes: () => void;
  readonly onNo: () => void;
}

function ShowAmountsNotice({ notice: { company }, isCropped, onYes, onNo }: ShowAmountsProps) {
  return (
    <ConfirmDialog
      title="Esta empresa tiene cashback"
      confirmLabel="Mostrar los importes"
      cancelLabel="Seguir así"
      onConfirm={onYes}
      onCancel={onNo}
    >
      <b>{company.empresa || "Esta empresa"}</b> tiene cashback, pero este flyer no muestra importes
      {isCropped ? " (se quitó esa parte)" : ""}. ¿Querés mostrarlos?
    </ConfirmDialog>
  );
}

interface CompanyNoticesProps {
  readonly notice: CompanyNotice | null;
  readonly isCropped: boolean;
  readonly onClose: () => void;
  readonly onGoToWanted: (option: number) => void;
  readonly onShowAmounts: (original: number, company: string) => void;
}

/** What is said on bringing a company. It only closes with its buttons, so nothing is missed. */
export function CompanyNotices({
  notice,
  isCropped,
  onClose,
  onGoToWanted,
  onShowAmounts,
}: CompanyNoticesProps) {
  if (!notice) return null;
  if (notice.kind === "category") {
    return <CategoryNotice notice={notice} onStay={onClose} onGo={onGoToWanted} />;
  }
  if (notice.kind === "no-cashback") {
    return <NoCashbackDialog company={notice.company.empresa} onClose={onClose} />;
  }
  if (notice.kind === "amounts-elsewhere") {
    return (
      <DecisionDialog title="⚠ Esta empresa tiene cashback">
        <DecisionDialog.Text>
          <strong>{notice.company.empresa || "Esta empresa"}</strong> tiene cashback, pero{" "}
          <strong>este flyer no muestra importes</strong>.
        </DecisionDialog.Text>
        <DecisionDialog.Text>
          Si le corresponde mostrarlos, elegí arriba el flyer original (el que tiene la parte de los
          importes).
        </DecisionDialog.Text>
        <DecisionDialog.Foot>
          <DecisionDialog.Yes onClick={onClose}>Entendido</DecisionDialog.Yes>
        </DecisionDialog.Foot>
      </DecisionDialog>
    );
  }
  return (
    <ShowAmountsNotice
      notice={notice}
      isCropped={isCropped}
      onYes={() => {
        onShowAmounts(notice.original, notice.company.empresa);
        onClose();
        setTimeout(notice.after, AFTER_ANSWER_MS);
      }}
      onNo={() => {
        onClose();
        setTimeout(notice.after, AFTER_ANSWER_MS);
      }}
    />
  );
}
