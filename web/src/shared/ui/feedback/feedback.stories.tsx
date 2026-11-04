import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "../button/Button.tsx";
import { EmptyState } from "./EmptyState.tsx";
import { Notice } from "./Notice.tsx";
import { ProgressBar } from "./ProgressBar.tsx";
import { Skeleton } from "./Skeleton.tsx";
import { Spinner } from "./Spinner.tsx";
import { Toast } from "./Toast.tsx";

const meta = {
  title: "Shared/UI/Feedback",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const ToastShown: Story = { render: () => <Toast visible>PDF descargado</Toast> };
export const ToastHidden: Story = { render: () => <Toast visible={false}>PDF descargado</Toast> };
export const Spinning: Story = { render: () => <Spinner label="Ingresando" /> };
export const SkeletonRow: Story = { render: () => <Skeleton /> };
export const SkeletonCard: Story = { render: () => <Skeleton shape="card" /> };
export const Empty: Story = {
  render: () => (
    <EmptyState icon="clock" title="Todavía no generaste flyers">
      Cuando bajes uno va a aparecer acá.
      <Button size="sm">Armar un flyer</Button>
    </EmptyState>
  ),
};
export const NoticeOk: Story = {
  render: () => <Notice tone="ok">Se leyeron 12 filas sin problemas.</Notice>,
};
export const NoticeWarning: Story = {
  render: () => <Notice tone="warning">3 filas no tienen mail.</Notice>,
};
export const NoticeError: Story = {
  render: () => <Notice tone="error">Falta la columna empresa.</Notice>,
};
export const NoticeAccent: Story = {
  render: () => <Notice tone="accent">Tenés un flyer a medio armar.</Notice>,
};
export const ProgressHalf: Story = {
  render: () => <ProgressBar value={50} label="Generando flyers" />,
};
