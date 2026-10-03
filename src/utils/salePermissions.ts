// UI mirror of server/utils/saleAccess.js `saleEditDenial`. Only decides
// whether to offer the Edit action; the server enforces the same rules.
export function canEditSale(role: string | undefined, sale: { type?: string; status?: string | null }): boolean {
  if (sale.status === "voided" || sale.status === "corrected") return false;
  if (role === "admin") return true;
  if (sale.type === "reservation") {
    return sale.status === "pending" && role === "manager";
  }
  return false;
}
