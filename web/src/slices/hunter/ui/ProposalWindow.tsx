import type { Company, CompanyOfficer } from "@/shared/domain/company-registry/index.ts";
import { useToast } from "@/shared/lib/toast/toast-context.ts";
import { useBackend } from "@/shared/supabase/index.ts";
import { OfficerProposalDialog } from "@/slices/company-registry/index.ts";
import { proposeOfficers } from "../api/officer-proposal.ts";

interface ProposalWindowProps {
  /** With its owner: without one there is nobody to propose it to. */
  readonly company: Company & { readonly user_id: string };
  readonly onSent: () => void;
  readonly onClose: () => void;
}

/** Only officers, and nothing changes until the owner, or their substitute, approves it. */
export function ProposalWindow({ company, onSent, onClose }: ProposalWindowProps) {
  const backend = useBackend();
  const { show } = useToast();
  const send = async (officers: readonly CompanyOfficer[], note: string) => {
    const failed = await proposeOfficers(backend, {
      empresa: company.empresa,
      owner: company.user_id,
      officers,
      note,
    });
    if (failed) {
      show(`No se pudo enviar: ${failed.message}`);
      return false;
    }
    show("Propuesta enviada: queda pendiente de aprobación.");
    onSent();
    return true;
  };
  return (
    <OfficerProposalDialog
      title="✎ Proponer un cambio de oficiales"
      lead={
        <>
          <strong>{company.empresa}</strong> · El cambio queda <strong>pendiente</strong> hasta que
          lo apruebe el oficial dueño (o su suplente). Mientras tanto, el flyer sigue saliendo con
          los datos de hoy.
        </>
      }
      officers={company.asesores}
      base={company.asesores}
      noteLabel="Nota para el oficial (opcional)"
      notePlaceholder="Ej: el celular de Juan quedó desactualizado"
      sendLabel="Enviar propuesta"
      textIsEnough={false}
      onSend={send}
      onClose={onClose}
    />
  );
}
