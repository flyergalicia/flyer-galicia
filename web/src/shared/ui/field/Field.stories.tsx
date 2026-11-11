import type { Meta, StoryObj } from "@storybook/react-vite";
import { Field } from "./Field.ts";

const meta = {
  title: "Shared/UI/Field",
  component: Field,
  args: { children: null },
} satisfies Meta<typeof Field>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  render: () => (
    <Field>
      <Field.Label>Nombre</Field.Label>
      <Field.Input placeholder="Nombre Asesor 1" />
    </Field>
  ),
};

export const Filled: Story = {
  render: () => (
    <Field>
      <Field.Label>Celular</Field.Label>
      <Field.Input defaultValue="11 4444 5555" />
    </Field>
  ),
};

export const Invalid: Story = {
  render: () => (
    <Field status="invalid">
      <Field.Label>Email</Field.Label>
      <Field.Input defaultValue="ana.perez" />
      <Field.Message>Falta la arroba del mail.</Field.Message>
    </Field>
  ),
};

export const Warning: Story = {
  render: () => (
    <Field status="warning">
      <Field.Label>Celular</Field.Label>
      <Field.Input defaultValue="11 4444" />
      <Field.Message>Parece corto: revisá que estén todos los dígitos.</Field.Message>
    </Field>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Field>
      <Field.Label>Email</Field.Label>
      <Field.Input controlSize="lg" disabled defaultValue="ana.perez@bancogalicia.com.ar" />
    </Field>
  ),
};

export const Large: Story = {
  render: () => (
    <Field>
      <Field.Label>Email</Field.Label>
      <Field.Input controlSize="lg" placeholder="tu@bancogalicia.com.ar" />
    </Field>
  ),
};

export const Small: Story = {
  render: () => (
    <Field>
      <Field.Label>Buscar</Field.Label>
      <Field.Input controlSize="sm" placeholder="Buscar empresa, CUIT o persona" />
    </Field>
  ),
};

export const SelectWithItsArrow: Story = {
  render: () => (
    <Field>
      <Field.Label>Provincia</Field.Label>
      <Field.Select defaultValue="caba">
        <option value="caba">Capital Federal</option>
        <option value="ba">Buenos Aires</option>
      </Field.Select>
    </Field>
  ),
};

export const NativeSelect: Story = {
  render: () => (
    <Field>
      <Field.Label>Estado</Field.Label>
      <Field.Select appearance="native" elevated defaultValue="all">
        <option value="all">Todos</option>
        <option value="active">Activos</option>
      </Field.Select>
    </Field>
  ),
};

export const LongText: Story = {
  render: () => (
    <Field>
      <Field.Label>Legal</Field.Label>
      <Field.Textarea defaultValue="Promoción válida para clientes del banco." />
    </Field>
  ),
};
