import type { Meta, StoryObj } from "@storybook/react-vite";
import { DecisionDialog } from "./DecisionDialog.ts";

function Example({ wide = false }: { readonly wide?: boolean }) {
  return (
    <DecisionDialog title="Actualizar mis empresas" wide={wide}>
      <DecisionDialog.Text>Generaste el flyer con datos distintos:</DecisionDialog.Text>
      <DecisionDialog.Alert>Esta empresa queda guardada sin sus oficiales.</DecisionDialog.Alert>
      <DecisionDialog.List>
        <DecisionDialog.Item>Cashback: BAU → Config 2</DecisionDialog.Item>
        <DecisionDialog.Item danger>Oficial 2: − Luis Gomez (se quita)</DecisionDialog.Item>
      </DecisionDialog.List>
      <DecisionDialog.Field label="CUIT" id="story-cuit">
        <input id="story-cuit" type="text" />
        <DecisionDialog.Hint>Opcional.</DecisionDialog.Hint>
        <DecisionDialog.Hint warn>Ese CUIT ya figura en otra empresa.</DecisionDialog.Hint>
      </DecisionDialog.Field>
      <DecisionDialog.Foot>
        <DecisionDialog.No onClick={() => undefined}>No, dejarlo como está</DecisionDialog.No>
        <DecisionDialog.Yes onClick={() => undefined}>Actualizar empresa</DecisionDialog.Yes>
      </DecisionDialog.Foot>
    </DecisionDialog>
  );
}

const meta = {
  title: "Shared/UI/DecisionDialog",
  component: Example,
} satisfies Meta<typeof Example>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Regular: Story = {};
export const Wide: Story = { args: { wide: true } };
