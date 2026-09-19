import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import { offlineDb } from "../lib/offlineDb";
import { canSellOffline } from "../services/authorizationService";

// Spec §11: "offlineReady" must reflect whether an offline sale can actually
// be completed right now, not just whether the app has ever seen data.
// `ready` is the strict gate used to block a sale (currently: a trusted
// exchange rate must have been cached at least once — never silently fall
// back to 1 USD = 1 FC). The other flags are surfaced for the readiness
// banner/messaging. Categories are deliberately outside POS readiness.
export interface OfflineReadiness {
  hasProducts: boolean;
  hasExchangeRate: boolean;
  hasWalkInCustomer: boolean;
  hasLocalAuthorization: boolean;
  ready: boolean;
}

const EMPTY: OfflineReadiness = {
  hasProducts: false,
  hasExchangeRate: false,
  hasWalkInCustomer: false,
  hasLocalAuthorization: false,
  ready: false,
};

async function computeReadiness(): Promise<OfflineReadiness> {
  const [productCount, rate, walkIn] = await Promise.all([
    offlineDb.products.count(),
    offlineDb.exchangeRateCache.get("current"),
    offlineDb.syncMeta.get("walkInCustomer"),
  ]);
  const hasProducts = productCount > 0;
  const hasExchangeRate = Boolean(rate);
  const hasWalkInCustomer = Boolean(walkIn);
  const hasLocalAuthorization = canSellOffline().allowed;
  return {
    hasProducts,
    hasExchangeRate,
    hasWalkInCustomer,
    hasLocalAuthorization,
    // The hard gate: a sale needs products to sell, a trusted rate to price
    // in FC, a customer to attach, and local authorization to submit at all.
    ready: hasProducts && hasExchangeRate && hasWalkInCustomer && hasLocalAuthorization,
  };
}

export function useOfflineReadiness(): OfflineReadiness {
  const [state, setState] = useState<OfflineReadiness>(EMPTY);
  useEffect(() => {
    const subscription = liveQuery(computeReadiness).subscribe({
      next: setState,
      error: () => setState(EMPTY),
    });
    return () => subscription.unsubscribe();
  }, []);
  return state;
}
