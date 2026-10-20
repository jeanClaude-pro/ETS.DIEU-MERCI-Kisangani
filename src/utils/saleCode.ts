// Client twin of server/utils/saleCode.js — must produce identical codes so
// a receipt printed offline matches what the server stores after sync.
//   V-261020-K7QM3 = Vente · business date · token prefix
import { isValidBarcodeToken } from "./barcodeId.ts";

const OFFSET_MS = 2 * 60 * 60 * 1000;
export const SALE_CODE_PATTERN = /^V-\d{6}-[0-9A-HJKMNP-TV-Z]{5}$/;

export function saleCodeFor(input: { type?: string; occurredAt: string | Date; barcodeToken?: string | null }): string | null {
  if (!isValidBarcodeToken(input.barcodeToken)) return null;
  const date = input.occurredAt instanceof Date ? input.occurredAt : new Date(input.occurredAt);
  if (Number.isNaN(date.getTime())) return null;
  const shifted = new Date(date.getTime() + OFFSET_MS).toISOString();
  const digits = `${shifted.slice(2, 4)}${shifted.slice(5, 7)}${shifted.slice(8, 10)}`;
  return `V-${digits}-${String(input.barcodeToken).slice(0, 5)}`;
}

export function isSaleCode(value: unknown): value is string {
  return typeof value === "string" && SALE_CODE_PATTERN.test(value);
}

/** "v261020k7qm3" / "V-261020-K7QM3" → "V-261020-K7QM3", otherwise null. */
export function canonicalSaleCode(value: string): string | null {
  const compact = value.toUpperCase().replace(/[\s-]/g, "");
  if (!/^V\d{6}[0-9A-Z]{5}$/.test(compact)) return null;
  const code = `${compact[0]}-${compact.slice(1, 7)}-${compact.slice(7)}`;
  return isSaleCode(code) ? code : null;
}

/** True when `code` contains the typed term, ignoring dashes and case. */
export function saleCodeMatches(code: string | undefined | null, term: string): boolean {
  if (!code) return false;
  const compactTerm = term.toUpperCase().replace(/[\s-]/g, "");
  return compactTerm.length > 0 && code.replace(/-/g, "").includes(compactTerm);
}
