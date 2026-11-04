import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "../badge/Badge.tsx";
import { DataTable } from "./DataTable.ts";

const noop = () => undefined;

const meta = {
  title: "Shared/UI/DataTable",
  component: DataTable,
  args: { caption: "Promociones", children: null },
} satisfies Meta<typeof DataTable>;

export default meta;

type Story = StoryObj<typeof meta>;

const body = (
  <DataTable.Body>
    <DataTable.Row>
      <DataTable.Cell>47 Street</DataTable.Cell>
      <DataTable.Cell>
        <Badge tone="expired">Vencida</Badge>
      </DataTable.Cell>
    </DataTable.Row>
    <DataTable.Row selected>
      <DataTable.Cell>9 Z</DataTable.Cell>
      <DataTable.Cell>
        <Badge tone="valid">Vigente</Badge>
      </DataTable.Cell>
    </DataTable.Row>
    <DataTable.Row excluded>
      <DataTable.Cell>Abasto Shopping</DataTable.Cell>
      <DataTable.Cell>
        <Badge tone="none">No encontrada</Badge>
      </DataTable.Cell>
    </DataTable.Row>
  </DataTable.Body>
);

export const Plain: Story = {
  render: () => (
    <DataTable caption="Promociones">
      <DataTable.Head>
        <tr>
          <DataTable.Header>Promoción</DataTable.Header>
          <DataTable.Header>Estado</DataTable.Header>
        </tr>
      </DataTable.Head>
      {body}
    </DataTable>
  ),
};

export const Sortable: Story = {
  render: () => (
    <DataTable caption="Promociones">
      <DataTable.Head>
        <tr>
          <DataTable.Header sort="ascending" onSort={noop}>
            Promoción
          </DataTable.Header>
          <DataTable.Header sort="none" onSort={noop}>
            Estado
          </DataTable.Header>
        </tr>
      </DataTable.Head>
      {body}
    </DataTable>
  ),
};

export const SortedDown: Story = {
  render: () => (
    <DataTable caption="Promociones">
      <DataTable.Head>
        <tr>
          <DataTable.Header sort="descending" onSort={noop}>
            Promoción
          </DataTable.Header>
        </tr>
      </DataTable.Head>
    </DataTable>
  ),
};
