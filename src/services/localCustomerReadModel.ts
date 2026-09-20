import { offlineDb } from "../lib/offlineDb.ts";

export interface LocalCustomer {
  _id: string;
  name: string;
  phone: string;
  email: string;
  totalPurchases: number;
  totalSpent: number;
  firstPurchaseDate: string;
  lastPurchaseDate: string;
  createdAt: string;
  updatedAt: string;
}

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

export async function cacheCustomers(customers: readonly LocalCustomer[]): Promise<void> {
  const cachedAt = new Date().toISOString();
  if (!customers.length) return;
  await offlineDb.cachedCustomers.bulkPut(customers.map((customer) => ({
    id: customer._id,
    phone: customer.phone,
    name: customer.name,
    cachedAt,
    customer: customer as unknown as Record<string, unknown>,
  })));
}

/** Cached server statistics plus local sales not yet represented by that cache. */
export async function getLocalCustomers(): Promise<LocalCustomer[]> {
  const [cached, localSales] = await Promise.all([
    offlineDb.cachedCustomers.toArray(),
    offlineDb.offlineSales.toArray(),
  ]);
  const result = new Map<string, LocalCustomer>();
  const cacheTimeByPhone = new Map<string, number>();
  for (const row of cached) {
    const customer = row.customer as unknown as LocalCustomer;
    result.set(row.phone, customer);
    cacheTimeByPhone.set(row.phone, new Date(row.cachedAt).getTime());
  }

  for (const sale of localSales) {
    const customer = sale.payload.customer;
    if (customer.isWalkIn || !customer.phone) continue;
    const representedAt = cacheTimeByPhone.get(customer.phone) || 0;
    const serverCouldContainSale = sale.syncState === "SYNCED" &&
      new Date(sale.syncedAt || 0).getTime() <= representedAt;
    if (serverCouldContainSale) continue;
    const current = result.get(customer.phone) || {
      _id: `local:${customer.phone}`,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      totalPurchases: 0,
      totalSpent: 0,
      firstPurchaseDate: sale.occurredAt,
      lastPurchaseDate: sale.occurredAt,
      createdAt: sale.occurredAt,
      updatedAt: sale.occurredAt,
    };
    current.totalPurchases += 1;
    current.totalSpent = roundMoney(current.totalSpent + sale.payload.total);
    if (!current.firstPurchaseDate || sale.occurredAt < current.firstPurchaseDate) current.firstPurchaseDate = sale.occurredAt;
    if (!current.lastPurchaseDate || sale.occurredAt > current.lastPurchaseDate) current.lastPurchaseDate = sale.occurredAt;
    current.updatedAt = sale.syncedAt || sale.createdAt;
    result.set(customer.phone, current);
  }
  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
}
