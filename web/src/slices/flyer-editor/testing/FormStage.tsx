// Test support: everything the form reads, once the session is there.
import type { ReactNode } from "react";
import { FlyerWorkspaceProvider } from "@/shared/lib/flyer-workspace/index.ts";
import { useSession, usePermissions } from "@/shared/session/index.ts";
import { LogoEditorProvider } from "@/slices/logo-editor/index.ts";
import type { FlyerForm } from "../model/flyer-form.ts";
import { useFlyerForm } from "../model/form-context.ts";
import { FlyerFormProvider } from "../ui/FlyerFormProvider.tsx";

function FormHandle({ onForm }: { readonly onForm: (form: FlyerForm) => void }) {
  onForm(useFlyerForm());
  return null;
}

export function FormStage({
  children,
  onForm,
}: {
  readonly children: ReactNode;
  readonly onForm: (form: FlyerForm) => void;
}) {
  const session = useSession();
  const { loadStatus } = usePermissions();
  if (session.status !== "signed-in" || loadStatus === "loading") return null;
  return (
    <FlyerWorkspaceProvider>
      <LogoEditorProvider>
        <FlyerFormProvider>
          <FormHandle onForm={onForm} />
          {children}
        </FlyerFormProvider>
      </LogoEditorProvider>
    </FlyerWorkspaceProvider>
  );
}
