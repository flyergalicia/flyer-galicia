import {
  DataTableRoot,
  DataTableHead,
  DataTableBody,
  DataTableHeader,
  DataTableRow,
  DataTableCell,
} from "./DataTable.parts.tsx";

export const DataTable = Object.assign(DataTableRoot, {
  Head: DataTableHead,
  Body: DataTableBody,
  Header: DataTableHeader,
  Row: DataTableRow,
  Cell: DataTableCell,
});
