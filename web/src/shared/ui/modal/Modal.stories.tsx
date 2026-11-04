import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../button/Button.tsx";
import { Modal } from "./Modal.ts";
import type { ModalSize } from "./Modal.parts.tsx";

function Example({ size }: { readonly size: ModalSize }) {
  return (
    <Modal size={size} onClose={() => undefined}>
      <Modal.Header icon="database-window">Base de datos</Modal.Header>
      <Modal.Body>Lo que hay en la ventana.</Modal.Body>
      <Modal.Footer>
        <Button variant="ghost" size="dialog">
          Cancelar
        </Button>
        <Button size="dialog">Guardar</Button>
      </Modal.Footer>
    </Modal>
  );
}

const meta = {
  title: "Shared/UI/Modal",
  component: Example,
} satisfies Meta<typeof Example>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Narrow: Story = { args: { size: "narrow" } };
export const Regular: Story = { args: { size: "regular" } };
export const Wide: Story = { args: { size: "wide" } };
