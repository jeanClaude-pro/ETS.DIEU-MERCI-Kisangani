// Quotes one CSV cell and neutralises spreadsheet formulas: a cell starting
// with = + - @ (or a tab / carriage return) would otherwise be executed by
// Excel/LibreOffice when the export is opened (CSV/formula injection).
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  let text = String(value);
  if (FORMULA_TRIGGER.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvRow(values: unknown[]): string {
  return values.map(escapeCsvCell).join(",");
}
