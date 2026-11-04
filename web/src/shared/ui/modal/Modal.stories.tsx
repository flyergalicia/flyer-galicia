import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../button/Button.tsx";
import { Modal } from "./Modal.ts";
import type { ModalLook, ModalSize } from "./Modal.parts.tsx";

function Example({ size, look }: { readonly size: ModalSize; readonly look?: ModalLook }) {
  return (
    <Modal size={size} look={look ?? "window"} onClose={() => undefined}>
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
export const Medium: Story = { args: { size: "medium" } };
export const Wide: Story = { args: { size: "wide" } };
export const Account: Story = { args: { size: "narrow", look: "account" } };
export const OverTheFlyer: Story = { args: { size: "wide", look: "dialog" } };

/** A window with a header of its own: the title is what names it. */
export const OwnHeader: StoryObj<typeof Modal> = {
  render: () => (
    <Modal size="medium" onClose={() => undefined}>
      <Modal.Title>Cambiar esto</Modal.Title>
      <Modal.Body>Lo que hay en la ventana.</Modal.Body>
    </Modal>
  ),
};
