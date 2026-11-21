import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button.tsx";

const meta = {
  title: "Shared/UI/Button",
  component: Button,
  args: { children: "Descargar PDF" },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { icon: "download" } };
export const Secondary: Story = { args: { variant: "secondary", children: "Reintentar" } };
export const Ghost: Story = { args: { variant: "ghost", icon: "restore", children: "Restaurar" } };
export const Blue: Story = { args: { variant: "blue", icon: "eye", children: "Vista previa" } };
export const Green: Story = { args: { variant: "green", icon: "zap", children: "Generar ZIP" } };
export const SoftDanger: Story = {
  args: { variant: "soft-danger", size: "xs", children: "Desactivar" },
};
export const SoftOk: Story = { args: { variant: "soft-ok", size: "xs", children: "Aprobar" } };
export const SoftNeutral: Story = {
  args: { variant: "soft-neutral", size: "xs", children: "Editar" },
};
export const SoftMuted: Story = {
  args: { variant: "soft-muted", size: "xs", children: "Cancelar" },
};
export const Link: Story = { args: { variant: "link", size: "xs", children: "Crear cuenta" } };
export const Large: Story = { args: { size: "lg", fullWidth: true, children: "Ingresar" } };
export const InADialog: Story = { args: { size: "dialog", children: "Aceptar" } };
export const Small: Story = { args: { size: "sm", children: "+ Nuevo usuario" } };
export const Disabled: Story = { args: { disabled: true } };
export const Busy: Story = { args: { busy: true, children: "Generando…" } };
