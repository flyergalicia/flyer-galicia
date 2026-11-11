// Gives the browser a file made in memory: a sheet, a list. The address is let go a moment later.

export const SHEET_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const RELEASE_AFTER_MS = 4000;

export function saveFile(content: BlobPart, name: string, type: string): void {
  const address = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = address;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(address);
  }, RELEASE_AFTER_MS);
}
