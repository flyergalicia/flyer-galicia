import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConfirmDialog } from "./ConfirmDialog.tsx";

const meta = {
  title: "Shared/UI/ConfirmDialog",
  component: ConfirmDialog,
  args: {
    title: "¿Desactivar este flyer?",
    children: "Va a dejar de verse hasta que lo vuelvas a activar.",
    confirmLabel: "Desactivar",
    onConfirm: () => undefined,
    onCancel: () => undefined,
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Question: Story = {};
export const Danger: Story = { args: { danger: true } };
